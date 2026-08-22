import UIKit

/// 已停用。原生 `UIGlassEffect` 胶囊导航不再挂到 window 上。
///
/// 真机上它和改造前的网页导航不是同一套 layout（首页左下角三按钮胶囊、
/// 其它页贴底四栏），`isInteractive` 高光和玻璃溢到 bounds 外会把页面
/// 盖住。系统材质改由网页 CSS `-apple-visual-effect` 套在原来的 `.navBar`
/// / `.glassChrome` 上。文件留在工程里以免 pbxproj 来回改；不要再实例化。
final class GlassNavBar: UIView {
    override init(frame: CGRect) {
        super.init(frame: frame)
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }
}
