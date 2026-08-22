import Capacitor
import UIKit

/// 原生液态玻璃导航栏插件（iOS 26+）。
///
/// web 侧经 `window.Capacitor.registerPlugin('LiquidGlass')` 调用：
/// - `isSupported()`：是否真正能创建 UIGlassEffect（iOS 26+）
/// - `setActiveTab({ tab })`：同步当前激活 tab
/// - `setSheetOpen({ open })`：抽屉开合时隐藏/恢复导航栏
/// - `setAccentColor({ color })`：同步主题强调色（hex #RRGGBB）
/// - 原生按钮点击经 `tabSelected` 事件回传 web
///
/// iOS 25 及以下：插件仍注册（否则 Capacitor 报 unimplemented），但
/// `isSupported` 返回 false，web 保留自绘 CSS 导航栏。
@objc(LiquidGlassPlugin)
public class LiquidGlassPlugin: CAPPlugin, CAPBridgedPlugin {
    // CAPBridgedPlugin 必填三属性（identifier/jsName/pluginMethods）：
    // 缺任一则 CapacitorBridge.registerPluginInstance 的 guard
    // （CapacitorPlugin = CAPPlugin & CAPBridgedPlugin）直接拦截、插件永不注册。
    public let identifier = "LiquidGlass"
    public let jsName = "LiquidGlass"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "isSupported", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setActiveTab", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setSheetOpen", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setAccentColor", returnType: CAPPluginReturnPromise),
    ]

    /// 非 iOS 26 环境保持 nil（ensureNavBar 有 #available 守卫），所有方法 no-op。
    private var glassNavBar: GlassNavBar?
    private var navBarConstraints: [NSLayoutConstraint] = []

    private var sheetOpen = false
    private var keyboardObservers: [NSObjectProtocol] = []

    public override func load() {
        let center = NotificationCenter.default
        // 键盘弹出时导航栏让位（底部被键盘占据）；收起后按抽屉状态恢复
        keyboardObservers.append(center.addObserver(
            forName: UIResponder.keyboardWillShowNotification, object: nil, queue: .main
        ) { [weak self] _ in
            self?.withGlassNavBar { $0.setVisible(false, animated: true) }
        })
        keyboardObservers.append(center.addObserver(
            forName: UIResponder.keyboardWillHideNotification, object: nil, queue: .main
        ) { [weak self] _ in
            self?.refreshNavBarVisibility()
        })

        // 进主线程下一拍再挂栏：此时 view 已在窗口里，safeArea 有效。
        // 不等 JS 首个方法——JS 探测是异步的，先把栏建好避免空窗。
        DispatchQueue.main.async { [weak self] in
            _ = self?.ensureNavBar()
        }
    }

    deinit {
        keyboardObservers.forEach { NotificationCenter.default.removeObserver($0) }
    }

    /// 访问玻璃导航栏：首次即惰性创建（见 ensureNavBar），
    /// 非 iOS 26 / view 未就绪时返回 nil、body 不执行。
    private func withGlassNavBar(_ body: (GlassNavBar) -> Void) {
        guard let bar = ensureNavBar() else { return }
        body(bar)
    }

    /// 创建玻璃导航栏并钉在安全区上（Auto Layout，转屏/动态岛会跟着走）。
    private func ensureNavBar() -> GlassNavBar? {
        guard #available(iOS 26.0, *) else { return nil }
        if let glassNavBar { return glassNavBar }
        guard let view = bridge?.viewController?.view else { return nil }

        let bar = GlassNavBar()
        bar.onTabSelected = { [weak self] tab in
            self?.notifyListeners("tabSelected", data: ["tab": tab])
        }
        view.addSubview(bar)
        view.bringSubviewToFront(bar)
        let constraints = [
            bar.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 8),
            bar.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -8),
            bar.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor, constant: -6),
            bar.heightAnchor.constraint(equalToConstant: 72),
        ]
        NSLayoutConstraint.activate(constraints)
        navBarConstraints = constraints
        glassNavBar = bar
        return bar
    }

    private func refreshNavBarVisibility() {
        withGlassNavBar { $0.setVisible(!sheetOpen, animated: true) }
    }

    @objc public func isSupported(_ call: CAPPluginCall) {
        if #available(iOS 26.0, *) {
            call.resolve(["available": true])
        } else {
            call.resolve(["available": false])
        }
    }

    @objc public func setActiveTab(_ call: CAPPluginCall) {
        let tab = call.getString("tab") ?? "assets"
        DispatchQueue.main.async { [weak self] in
            self?.withGlassNavBar { $0.setActiveTab(tab) }
            call.resolve()
        }
    }

    @objc public func setSheetOpen(_ call: CAPPluginCall) {
        let open = call.getBool("open") ?? false
        DispatchQueue.main.async { [weak self] in
            self?.sheetOpen = open
            self?.refreshNavBarVisibility()
            call.resolve()
        }
    }

    @objc public func setAccentColor(_ call: CAPPluginCall) {
        let hex = call.getString("color") ?? ""
        DispatchQueue.main.async { [weak self] in
            if let color = UIColor(hexString: hex) {
                self?.withGlassNavBar { $0.setAccentColor(color) }
            }
            call.resolve()
        }
    }
}

private extension UIColor {
    /// 解析 web 侧 `getComputedStyle` 给的 #RRGGBB / #RRGGBBAA。
    convenience init?(hexString: String) {
        var hex = hexString.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
        if hex.count == 3 {
            hex = hex.map { "\($0)\($0)" }.joined()
        }
        guard hex.count == 6 || hex.count == 8, let value = UInt64(hex, radix: 16) else { return nil }
        let hasAlpha = hex.count == 8
        let rShift: UInt64 = hasAlpha ? 24 : 16
        let gShift: UInt64 = hasAlpha ? 16 : 8
        let bShift: UInt64 = hasAlpha ? 8 : 0
        self.init(
            red: CGFloat((value >> rShift) & 0xFF) / 255,
            green: CGFloat((value >> gShift) & 0xFF) / 255,
            blue: CGFloat((value >> bShift) & 0xFF) / 255,
            alpha: hasAlpha ? CGFloat(value & 0xFF) / 255 : 1
        )
    }
}
