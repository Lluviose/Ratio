import Capacitor
import UIKit
import WebKit

/// 自定义桥接控制器：注册应用内置原生插件，并打开 WKWebView 私有偏好，
/// 让网页 CSS `-apple-visual-effect: -apple-system-glass-material` 能被 WebKit 认。
///
/// `_useSystemAppearance` 是 WebKit 私有接口，自签侧载可用；提交 App Store 会被拒。
final class RatioBridgeViewController: CAPBridgeViewController {
    override public func webViewConfiguration(for instanceConfiguration: InstanceConfiguration) -> WKWebViewConfiguration {
        let config = super.webViewConfiguration(for: instanceConfiguration)
        Self.enableSystemAppearance(on: config.preferences)
        return config
    }

    override func capacitorDidLoad() {
        super.capacitorDidLoad()
        bridge?.registerPluginInstance(LiquidGlassPlugin())
        // 再写一次：个别 Capacitor 版本会在 super 里换掉 preferences。
        Self.enableSystemAppearance(on: bridge?.webView?.configuration.preferences)
    }

    /// 打开 WKWebView 私有偏好，使 CSS `-apple-visual-effect` 生效。
    /// 失败则静默——网页继续用 CSS 毛玻璃，设置页开关会显示「当前环境不支持」。
    static func enableSystemAppearance(on preferences: WKPreferences?) {
        guard let preferences else { return }
        let sel = NSSelectorFromString("_setUseSystemAppearance:")
        guard preferences.responds(to: sel) else { return }
        preferences.setValue(true, forKey: "_useSystemAppearance")
    }
}
