import Capacitor
import UIKit

/// 液态玻璃探测插件（iOS 26+）。
///
/// 底部导航**不再**用原生 `GlassNavBar` / `UIGlassEffect` 覆盖。
/// 那套悬浮胶囊和改造前的网页导航不是同一套样式（首页是左下角三按钮
/// 胶囊，其它页是贴底四栏），玻璃材质还会溢到 bounds 外把页面盖住。
///
/// 系统液态玻璃改走网页：`RatioBridgeViewController` 打开 WKWebView 私有
/// 偏好后，设置页「系统液态玻璃」给原来的 `.navBar` / `.glassChrome` /
/// `.card` / `.sheet` 套 `-apple-visual-effect`。本插件只回答 `isSupported`，
/// 其余方法 no-op，保持 Capacitor 8 的 CAPBridgedPlugin 注册完整。
@objc(LiquidGlassPlugin)
public class LiquidGlassPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "LiquidGlass"
    public let jsName = "LiquidGlass"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "isSupported", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setActiveTab", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setSheetOpen", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setAccentColor", returnType: CAPPluginReturnPromise),
    ]

    @objc public func isSupported(_ call: CAPPluginCall) {
        if #available(iOS 26.0, *) {
            call.resolve(["available": true])
        } else {
            call.resolve(["available": false])
        }
    }

    @objc public func setActiveTab(_ call: CAPPluginCall) {
        call.resolve()
    }

    @objc public func setSheetOpen(_ call: CAPPluginCall) {
        call.resolve()
    }

    @objc public func setAccentColor(_ call: CAPPluginCall) {
        call.resolve()
    }
}
