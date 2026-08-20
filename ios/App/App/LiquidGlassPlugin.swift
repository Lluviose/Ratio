import Capacitor
import UIKit

/// 原生液态玻璃导航栏插件（iOS 26+）。
///
/// web 侧经 `window.Capacitor.Plugins.LiquidGlass` 调用：
/// - `setActiveTab({ tab })`：同步当前激活 tab
/// - `setSheetOpen({ open })`：抽屉开合时隐藏/恢复导航栏
/// - `setAccentColor({ color })`：同步主题强调色（hex #RRGGBB）
/// - 原生按钮点击经 `tabSelected` 事件回传 web
///
/// iOS 25 及以下：`#available` 保护下不创建玻璃视图，所有方法 no-op，
/// web 侧保留自绘 CSS 导航栏（`isNativeGlassAvailable()` 返回 false）。
@objc(LiquidGlassPlugin)
public class LiquidGlassPlugin: CAPPlugin {
    /// 非 iOS 26 环境保持 nil（ensureNavBar 有 #available 守卫），所有方法 no-op。
    private var glassNavBar: GlassNavBar?

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
    }

    deinit {
        keyboardObservers.forEach { NotificationCenter.default.removeObserver($0) }
    }

    /// 访问玻璃导航栏（未创建/非 iOS 26 则忽略）。
    private func withGlassNavBar(_ body: (GlassNavBar) -> Void) {
        if let bar = glassNavBar { body(bar) }
    }

    /// 惰性创建玻璃导航栏并挂到 WebView 容器之上（首次调用时）。
    private func ensureNavBar() -> GlassNavBar? {
        guard #available(iOS 26.0, *) else { return nil }
        if let glassNavBar { return glassNavBar }
        guard let view = bridge?.viewController?.view else { return nil }

        let bar = GlassNavBar()
        bar.onTabSelected = { [weak self] tab in
            self?.notifyListeners("tabSelected", data: ["tab": tab])
        }
        bar.autoresizingMask = [.flexibleWidth, .flexibleTopMargin]
        let safeBottom = view.safeAreaInsets.bottom
        let height: CGFloat = 72
        bar.frame = CGRect(
            x: 8,
            y: view.bounds.height - safeBottom - height - 6,
            width: view.bounds.width - 16,
            height: height
        )
        view.addSubview(bar)
        view.bringSubviewToFront(bar)
        glassNavBar = bar
        return bar
    }

    private func refreshNavBarVisibility() {
        glassNavBar?.setVisible(!sheetOpen, animated: true)
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
    /// 解析 #RRGGBB / #AARRGGBB（web 侧传 hex，如 #5a5fd8）。
    convenience init?(hexString: String) {
        var hex = hexString.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
        if hex.count == 6 { hex = "FF" + hex }
        guard hex.count == 8, let value = UInt64(hex, radix: 16) else { return nil }
        self.init(
            red: CGFloat((value >> 24) & 0xFF) / 255,
            green: CGFloat((value >> 16) & 0xFF) / 255,
            blue: CGFloat((value >> 8) & 0xFF) / 255,
            alpha: CGFloat(value & 0xFF) / 255
        )
    }
}
