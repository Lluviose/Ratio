import Capacitor
import UIKit

/// 自定义桥接控制器：注册应用内置原生插件（液态玻璃导航栏）。
final class RatioBridgeViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        super.capacitorDidLoad()
        bridge?.registerPluginInstance(LiquidGlassPlugin())
    }
}
