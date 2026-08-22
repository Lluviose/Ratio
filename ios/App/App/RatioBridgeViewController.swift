import Capacitor
import ObjectiveC
import UIKit
import WebKit

/// 自定义桥接控制器：注册应用内置原生插件，并打开 WKWebView 私有偏好，
/// 让网页 CSS `-apple-visual-effect: -apple-system-glass-material` 能被 WebKit 认。
///
/// `_setUseSystemAppearance:` 是 WebKit 私有接口，自签侧载可用；提交 App Store 会被拒。
final class RatioBridgeViewController: CAPBridgeViewController {
    override public func webViewConfiguration(for instanceConfiguration: InstanceConfiguration) -> WKWebViewConfiguration {
        let config = super.webViewConfiguration(for: instanceConfiguration)
        Self.enableSystemAppearance(on: config.preferences)
        return config
    }

    override func capacitorDidLoad() {
        super.capacitorDidLoad()
        bridge?.registerPluginInstance(LiquidGlassPlugin())
    }

    /// 打开 WKWebView 私有偏好，使 CSS `-apple-visual-effect` 生效。
    /// 必须在 WKWebView 创建前改 configuration；创建后再改会未定义甚至崩溃。
    /// 用 IMP 调 setter，不用 KVC——`setValue:forKey:` 在键不存在时抛 NSException，Swift 接不住。
    static func enableSystemAppearance(on preferences: WKPreferences?) {
        guard let preferences else { return }
        let sel = NSSelectorFromString("_setUseSystemAppearance:")
        guard preferences.responds(to: sel) else { return }
        typealias Setter = @convention(c) (AnyObject, Selector, Bool) -> Void
        unsafeBitCast(preferences.method(for: sel), to: Setter.self)(preferences, sel, true)
    }
}
