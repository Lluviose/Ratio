import UIKit
import Capacitor

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        // 必须在这里挂 RatioBridgeViewController。Main.storyboard 只放空
        // UIViewController，避免 IB 找不到 Swift 类导致启动即崩，也避免再
        // 实例化一套 CAPBridgeViewController / WKWebView。
        let window = self.window ?? UIWindow(windowScene: windowScene)
        if !(window.rootViewController is RatioBridgeViewController) {
            window.rootViewController = RatioBridgeViewController()
        }
        window.makeKeyAndVisible()
        self.window = window

        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts)
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }
}
