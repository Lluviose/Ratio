import UIKit

/// 原生液态玻璃导航栏（iOS 26+ UIGlassEffect）。
///
/// 悬浮胶囊：左右 8pt、底部安全区上 6pt、高 72pt。默认胶囊圆角由
/// UIGlassEffect 自己决定，不要用 layer.cornerRadius / masksToBounds——
/// 那会裁掉玻璃溢到 bounds 外的高光和折射（WWDC 2025 Session 284）。
///
/// 挂在 **window** 上（不要当 WKWebView 的 subview）。按钮必须加在
/// `contentView` 上才会走系统 vibrancy。四个 tab 与 web 侧一致：
/// 资产 / 趋势 / 统计 / 设置。
final class GlassNavBar: UIView {
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

    private let effectView = UIVisualEffectView()
    private var buttons: [UIButton] = []
    private var activeTab = "assets"
    private var accentColor = UIColor.systemBlue
    private var glassMaterialized = false

    init() {
        super.init(frame: .zero)
        backgroundColor = .clear
        isUserInteractionEnabled = true
        clipsToBounds = false
        translatesAutoresizingMaskIntoConstraints = false

        effectView.translatesAutoresizingMaskIntoConstraints = false
        effectView.clipsToBounds = false
        addSubview(effectView)
        NSLayoutConstraint.activate([
            effectView.topAnchor.constraint(equalTo: topAnchor),
            effectView.bottomAnchor.constraint(equalTo: bottomAnchor),
            effectView.leadingAnchor.constraint(equalTo: leadingAnchor),
            effectView.trailingAnchor.constraint(equalTo: trailingAnchor),
        ])

        configureButtons()
        setActiveTab(activeTab)
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    /// 等进了 window 再 materialize。init 里赋 UIGlassEffect 时视图还不在
    /// 层级里，合成器采样会崩（表现为打开即闪退）。
    override func didMoveToWindow() {
        super.didMoveToWindow()
        if window != nil {
            materializeGlass()
        }
    }

    /// WWDC：在动画块里赋 effect 才会走液态玻璃的 materialize；
    /// init 里直接 `UIVisualEffectView(effect:)` 经常只剩一块雾面。
    private func materializeGlass() {
        guard !glassMaterialized else { return }
        guard #available(iOS 26.0, *) else { return }
        glassMaterialized = true
        let glass = UIGlassEffect()
        glass.isInteractive = true
        UIView.animate(withDuration: 0.35) {
            self.effectView.effect = glass
        }
    }

    private func configureButtons() {
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

        // 必须加到 contentView，系统才会给标签/图标做 vibrancy。
        effectView.contentView.addSubview(stack)
        NSLayoutConstraint.activate([
            stack.topAnchor.constraint(equalTo: effectView.contentView.topAnchor),
            stack.bottomAnchor.constraint(equalTo: effectView.contentView.bottomAnchor),
            stack.leadingAnchor.constraint(equalTo: effectView.contentView.leadingAnchor),
            stack.trailingAnchor.constraint(equalTo: effectView.contentView.trailingAnchor),
        ])
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
