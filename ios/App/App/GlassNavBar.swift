import UIKit

/// 原生液态玻璃导航栏（iOS 26+ UIGlassEffect）。
///
/// 悬浮胶囊：左右留 8pt、底部安全区上 6pt、高 72pt、圆角 24。
/// 效果视图盖在 WKWebView 之上，滚动内容穿过玻璃由系统实时折射——
/// 这是 web CSS 无法达到的真液态玻璃（Metal shader）。
/// 四个 tab 与 web 侧一致：资产 / 趋势 / 统计 / 设置。
///
/// 注意：类本身不标注 @available（stored property 无法引用受限类型），
/// UIGlassEffect 只在 init 的 #available 分支内使用；iOS 26 以下
/// effect 为 nil（空材质面板），插件侧 ensureNavBar 也不会创建它。
final class GlassNavBar: UIVisualEffectView {
    var onTabSelected: ((String) -> Void)?

    struct Tab {
        let id: String
        let symbol: String
        let title: String
    }

    private let tabs: [Tab] = [
        Tab(id: "assets", symbol: "wallet.pass", title: "资产"),
        Tab(id: "trend", symbol: "chart.line.uptrend.xyaxis", title: "趋势"),
        Tab(id: "stats", symbol: "chart.bar", title: "统计"),
        Tab(id: "settings", symbol: "gearshape", title: "设置"),
    ]

    private var buttons: [UIButton] = []
    private var activeTab = "assets"
    private var accentColor = UIColor.systemBlue

    init() {
        if #available(iOS 26.0, *) {
            super.init(effect: UIGlassEffect())
        } else {
            super.init(effect: nil)
        }
        backgroundColor = .clear
        layer.cornerRadius = 24
        layer.masksToBounds = true
        isUserInteractionEnabled = true
        configureLayout()
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    private func configureLayout() {
        let stack = UIStackView()
        stack.axis = .horizontal
        stack.distribution = .fillEqually
        stack.spacing = 0
        stack.translatesAutoresizingMaskIntoConstraints = false

        for tab in tabs {
            let button = UIButton(configuration: makeConfiguration(for: tab), primaryAction: UIAction { [weak self] _ in
                self?.onTabSelected?(tab.id)
            })
            button.translatesAutoresizingMaskIntoConstraints = false
            buttons.append(button)
            stack.addArrangedSubview(button)
        }

        addSubview(stack)
        NSLayoutConstraint.activate([
            stack.topAnchor.constraint(equalTo: topAnchor),
            stack.bottomAnchor.constraint(equalTo: bottomAnchor),
            stack.leadingAnchor.constraint(equalTo: leadingAnchor),
            stack.trailingAnchor.constraint(equalTo: trailingAnchor),
        ])

        setActiveTab(activeTab)
    }

    private func makeConfiguration(for tab: Tab) -> UIButton.Configuration {
        var config = UIButton.Configuration.plain()
        config.image = UIImage(systemName: tab.symbol)
        config.title = tab.title
        config.imagePlacement = .top
        config.imagePadding = 4
        config.titleTextAttributesTransformer = UIConfigurationTextAttributesTransformer { incoming in
            var out = incoming
            out.font = UIFont.systemFont(ofSize: 11, weight: .medium)
            return out
        }
        return config
    }

    /// 更新选中 tab 的高亮（圆角胶囊底 + 强调色 tint）。
    func setActiveTab(_ tab: String) {
        activeTab = tab
        for (index, button) in buttons.enumerated() {
            let selected = tabs[index].id == tab
            var config = button.configuration ?? UIButton.Configuration.plain()
            var background = UIBackgroundConfiguration.clear()
            background.cornerRadius = 16
            background.backgroundColor = selected ? accentColor.withAlphaComponent(0.16) : .clear
            config.background = background
            config.baseForegroundColor = selected ? accentColor : .secondaryLabel
            button.configuration = config
        }
    }

    func setAccentColor(_ color: UIColor) {
        accentColor = color
        setActiveTab(activeTab)
    }

    /// 隐藏时透明且不拦截触摸（WebView 全屏可交互）。
    func setVisible(_ visible: Bool, animated: Bool) {
        let apply = {
            self.alpha = visible ? 1 : 0
            self.isUserInteractionEnabled = visible
        }
        if animated {
            UIView.animate(withDuration: 0.22, delay: 0, options: [.curveEaseInOut], animations: apply)
        } else {
            apply()
        }
    }
}
