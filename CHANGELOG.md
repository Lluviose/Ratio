# Changelog

## 2026-08-23 - iOS 系统液态玻璃真正接通 + 设置页可选网页玻璃

- **原生底部胶囊仍不是系统液态玻璃（或根本不出现）**：昨天补了 `CAPBridgedPlugin` 还不够。Capacitor 8 必须 **JS 侧 `registerPlugin('LiquidGlass')`**，只读 `window.Capacitor.Plugins.LiquidGlass` 会永远 undefined，web 按设计静默降级 CSS 毛玻璃。同时 `Main.storyboard` 仍实例化 `CAPBridgeViewController`，`SceneDelegate` 又另建一扇 window——同一 scene 两套 WKWebView，插件挂在看不见的那套上。
- **就算栏出来了，看起来也只是一块切圆角的雾面**：`GlassNavBar` 把子视图加在 effect view 而不是 `contentView`、`masksToBounds + layer.cornerRadius` 裁掉玻璃溢出去的高光、在 `init` 里直接赋 effect（WWDC 要求动画块里 materialize 才会走液态材质）。frame 还按第一次 JS 调用时的 `safeAreaInsets` 写死，启动瞬间 insets=0 时胶囊会沉到 Home Indicator 下面。
- **修复**：
  - JS：`nativeGlass.ts` 经壳注入的 `isPluginAvailable` + `registerPlugin` 拿代理（仍不静态 import `@capacitor/core`，首包不变）；新增 `isSupported()` 原生方法，**只有 iOS 26+ 才藏 CSS 栏**，避免旧系统空底。首帧默认 CSS 导航，探测完成再切。
  - 原生：storyboard 初始 VC 改为 `RatioBridgeViewController`；SceneDelegate 不再 new window；`GlassNavBar` 按 WWDC 2025 Session 284 重写（`contentView`、动画赋 `UIGlassEffect`、`isInteractive`、去掉 clip）；Auto Layout 钉在 `safeAreaLayoutGuide`；插件 `load()` 即建栏；hex 解析按 `#RRGGBB` 而不是把 AA 当红通道。
  - **网页卡片可选系统玻璃**：设置 →「系统液态玻璃」开关（默认关）。原生壳在 `webViewConfiguration` 打开 WKWebView 私有偏好 `_useSystemAppearance`，CSS `@supports (-apple-visual-effect: -apple-system-glass-material)` 才生效；打开后卡片/抽屉/导航/toast/首页快捷栏走系统材质。Safari / PWA / 桌面 `CSS.supports` 失败，属性不写，视觉基线与 e2e 不变。该偏好是私有 API，自签侧载可用，不用于 App Store。
- 验证：单测覆盖探测与开关落地；浏览器/PWA 默认关，外观不变。真机需 Xcode 26+ 重新签名安装后，在 iOS 26+ 上看原生胶囊，设置里打开「系统液态玻璃」看卡片。

## 2026-08-22 - iOS 原生液态玻璃导航栏从未生效（CAPBridgedPlugin 协议缺失）

- **iOS 26+ 真机上玻璃胶囊导航不出现，仍由 WebView 内 CSS 自绘导航接管**：根因是 `LiquidGlassPlugin` 声明为 `CAPPlugin` 但未遵循 Capacitor 8 的 `CAPBridgedPlugin`（缺 `identifier`/`jsName`/`pluginMethods` 三属性），`CapacitorBridge.registerPluginInstance` 的 guard（`CapacitorPlugin = CAPPlugin & CAPBridgedPlugin`）直接拦截——控制台仅一行 ⚡️ 警告，插件从未注册、`JSExport` 未导出，web 侧 `isNativeGlassAvailable()` 永远 false，按设计静默降级到 CSS 毛玻璃。此前几轮迭代全在编译期（Xcode 26 SDK）与 `#available` 上打转，从未验证运行时插件是否注册成功。
- **修复（先后两处断点）**：
  - ① `LiquidGlassPlugin` 对照官方 `HapticsPlugin` 模板补齐 `CAPBridgedPlugin` 三属性——`jsName = "LiquidGlass"` 与 web 侧 `window.Capacitor.Plugins.LiquidGlass` 探测点对齐；`pluginMethods` 声明 `setActiveTab`/`setSheetOpen`/`setAccentColor` 三个 Promise 方法（名称与 `@objc` 方法一致，`notifyListeners("tabSelected")` 事件通道不受影响）。
  - ② 修好注册后真机复测：**底部导航彻底消失**——`ensureNavBar()` 是死代码，从未被任何方法调用。三个方法全走 `withGlassNavBar`（仅 `glassNavBar != nil` 时生效），而 `glassNavBar` 初值 nil 且无任何入口触发它创建；web 按协议判定原生可用后隐藏 CSS 自绘栏，原生栏却建不出来 → 双空。修复：`withGlassNavBar` 改为基于 `ensureNavBar()` 惰性创建（首个方法调用即建栏挂到 WebView 之上），`refreshNavBarVisibility` 同步改用 `withGlassNavBar`。
- 已知边界：真机为 iOS 26 以下时插件仍注册成功→web 隐藏 CSS 栏，原生栏按 `#available` 不创建→同样空底；需 web 侧按 iOS 版本设门槛（待确认目标设备版本后处理）。
- 验证：Windows 本机无法编译 iOS；需 macOS（Xcode 26+）构建后在 iOS 26 模拟器/真机确认——控制台无 "must conform to CAPBridgedPlugin" 警告、`window.Capacitor.Plugins.LiquidGlass` 存在、底部原生玻璃胶囊接管、web 隐藏自绘导航。web 侧零改动，浏览器/PWA 行为逐像素不变。

## 2026-08-19 - iOS 27 顶部安全区 env 过大上报钳制

- **首页顶部多出巨大空块（iPhone 17 Pro Max / iOS 27 实机反馈）**：上一批切到 `black-translucent` 后，该系统在独立模式下把 `env(safe-area-inset-top)` 按约 2 倍上报（状态栏区实际 ~62pt，生效值 ≈124pt，按截图几何反推 148pt ≈ 124 + 24 精确吻合），标题被压到屏幕 15% 处；代码审计确认顶部避让只应用了一次，排除样式叠加。修复：`--safe-top`/`--safe-bottom` 定义处加 `min()` 钳制（上限 72px/48px = iPhone 真实最大值加余量），`index.html` 启动骨架屏同款；env 正常上报的设备数值不变（62 < 72），env 恒为 0 的反向 bug 仍由 `safeArea.ts` 兜底覆写处理（触发条件量 env 原始值，与钳制互不干扰），JS 几何计算读 `--safe-top` 生效值自动跟随。详见 TROUBLESHOOTING「iOS 27 独立模式：首页顶部多出巨大空块」。
- env() 为 0 的环境（桌面、浏览器内打开、全部 e2e 项目）钳制后逐像素不变：`min(0px, 72px)` = 0。

## 2026-08-19 - AI 助手分包环路修复 + iOS 沉浸式安全区模型

- **AI 助手一直打不开（点击无反应/闪一下）**：真正根因不是旧 SW 旧产物，而是**当前线上构建本身已损坏**——vendor-markdown 组正则只圈了 react-markdown 依赖树的一部分，漏网的 CJS 桥（`style-to-js` 等）落进 ai-assistant 分包，vendor-markdown 顶层求值时回头调它形成跨分包 import 环，先求值一侧拿到未初始化绑定抛 `TypeError: i is not a function`，动态导入失败被 LazyLoadBoundary 吞掉、按钮闪一下复原（线上旧兜底则整页刷新）。修复：test 正则覆盖 react-markdown + remark-gfm 的完整传递依赖闭包（97 包按前缀归并）；`check:bundle` 新增 vendor 分包环路门禁（沿 dist 静态 import 图做可达性检查，`vendor-*` 能绕回自身即失败，已验证能拦截本次事故产物）；新增 `e2e/ai-assistant.spec.ts` 点按钮断言面板真的打开并捕获分包求值错误——此前全套 e2e 没有任何用例点过 AI 按钮，坏产物一路绿灯上线。诊断全文见 TROUBLESHOOTING「vendor 分包环路」。entry 体积不变（161.4/175 KiB），vendor-markdown 36.7 → 44.1 KiB（吸收闭包），ai-assistant 相应减小。
- **首页状态栏遮住「我的净资产」+ 屏幕最底部突兀色带（iPhone PWA）**：iOS 26+ 独立模式 Web App 一律沉浸式渲染（内容画到状态栏与 Home Indicator 之下），旧配置 `apple-mobile-web-app-status-bar-style: default` 下系统可能不上报 env(safe-area-inset-top)，标题被时钟压住；而壳层 `.appViewport` 整体吃安全区的旧模型又会在占比页色块/毛玻璃导航条与屏幕物理边缘之间挤出一条底色带。重构为「应用铺满整屏、贴边组件各自避让」模型：meta 切到 `black-translucent`（让 WebKit 上报真实插入值）；`.appViewport` 不再 padding 安全区，左右插入值移交 `.appFrame`；首页头部/列表页顶距/占比页标题、topBar、toastViewport、迷你导航、AI 悬浮件与面板、Tour 首尾、添加资产/类型详情吸顶头改为 `calc(var(--safe-top/bottom) + …)`；占比图表顶 `RATIO_CHART_TOP` 在 JS 侧叠加 `useSafeAreaTop()`（AssetsScreen 与 AssetsRatioPage 同一公式）。新增 `src/lib/safeArea.ts`：探针测量 + 响应转屏 + 兜底覆写——检测「iPhone + 独立模式 + 竖屏 + env 顶部为 0」组合时把 `--safe-top/--safe-bottom` 覆写为保守常量（59px/34px），env 正常上报的设备永不触发。桌面端与浏览器内打开（env 为 0）逐像素不变，视觉基线 24 张全部零漂移。
- 说明：手机上更新后若 AI 仍打不开，是旧 SW 还在服务坏产物——等「新版本已就绪」toast 点「立即更新」，或彻底关闭 PWA 再冷启动即可切到新版（上一批次已上线的 chunkRecovery 恢复通道此后也会在失败当下主动引导更新）。
- 测试：新增 `safeArea.test.ts` 4 例（兜底决策纯函数：触发组合/env 正常不覆写/横屏与非独立模式不覆写）、`e2e/ai-assistant.spec.ts` 1 例 × 3 浏览器项目。
- 已通过 `npm run lint`、`npm test`（40 文件 336 项）、`npm run build && npm run check:bundle`（含新环路门禁）、`npx playwright test`（57 项：55 通过 + 2 例 mobile-safari 启动等待超时——已知 Windows 无头 WebKit 高负载抖动，基线代码同样复现且逐次换用例，单独重跑通过；视觉 24 张零漂移）验证。

## 2026-08-02 - Pages 部署管线解耦审计 + 懒分包失败恢复通道 + 云同步离场抢跑

- **GitHub Pages 部署一劳永逸**：部署反复停摆的根因是 CI 里的 `npm audit --audit-level=high`——它的失败由上游新披露公告触发、与被推送的提交无关（fast-uri、brace-expansion 十天内两次实锤，7-23 与 8-2 的 main 提交因此全红、Pages 停在 7-24）。审计移出 CI 到独立 `audit.yml`（依赖清单变更 + 每周一定时 + 手动触发）：新公告只在审计工作流亮红、不再冻结部署；`deploy-pages.yml` 门禁的 CI 工作流恢复为纯代码健康信号。当前 brace-expansion 高危已 `npm audit fix` 清零（仅 lockfile 变更）。
- **首页 AI 助手打开失败（及所有懒屏幕的同类故障）**：根因是「部署更新后旧哈希 chunk 从服务器消失」——prompt 模式下旧 SW 继续服务旧版 index，未进运行时缓存的懒分包 404；原兜底按钮的 `location.reload()` 仍由旧 SW 接管，循环失败。新增 `src/lib/chunkRecovery.ts` 恢复通道：分包失败当下立即触发一次 SW 更新检查（绕过 5 分钟节流，新版本尽快进 waiting），兜底 UI 点「重试」优先应用 waiting 的更新（与 toast「立即更新」同一路径、接管后自动刷新进新版产物），无待应用更新才普通刷新。`pwa.ts` 注入能力，组件不触碰 `virtual:pwa-register`；`LazyAiAssistant` 兜底按钮、`LazyLoadBoundary` 默认兜底、`App.ScreenLoadError` 三处接入（后两处从纯文案升级为可操作的「重试」按钮）。
- **本地/服务器存档冲突隐患排查与修复**：全面审查同步引擎（脏标记令牌守卫、fast-forward 前二次脏检、上传乐观锁、409 后内容比对自愈、服务端 `runQueuedMutation` 原子性与单调 `updatedAt`）均无正确性缺陷；设备本地易变键（`ratio.pendingToast.v1`、`ratio.ai.chat.session.v1` 走 sessionStorage，`ratio.cloudSyncDirty` 被前缀排除）不进备份。真实的冲突制造窗口是**离场丢上传**：手机「记一笔就切走」，2.5s 防抖 + 30s 节流让上传来不及发生，脏数据滞留本机；期间另一台设备先上传，回头 409 冲突。修复：页面隐藏（visibilitychange hidden / pagehide）且有脏数据时立即抢跑上传（`runAutoSync` 新增 urgent 选项绕过防抖与节流；隐藏后定时器会被系统冻结，不绕过约等于放弃）。请求被杀死无害：脏标记与乐观锁在，下次启动重试。
- 测试基建修复：`initCloudAutoSync` 的监听改为统一挂在 AbortController 上并导出 `disposeCloudAutoSync()`——此前 `vi.resetModules` 产生的旧模块副本监听器一直留在共享 window 上，既有用例靠「后续副本降级为 probe 路径」侥幸通过，新增的同步事件路径把 14 个泄漏副本全部触发才暴露。cloudSync.test 逐用例 dispose。
- 测试：`chunkRecovery.test.ts` 4 例（未注入降级、接管/未接管、抛错兜底、失败通知触发更新检查）；`cloudSync.test.ts` 13 → 16 例（pagehide 立即上传且防抖定时器确认取消、30s 节流窗口内隐藏立即上传且乐观锁期望值正确、无脏数据隐藏零请求）。
- 已通过 `npm run lint`、`npx tsc -b`、`npm test`（39 文件 332 项）、`npm run build && npm run check:bundle`、`npx playwright test`（54 项：全矩阵 52 通过，2 例 mobile-safari 因已知 Windows 无头 WebKit 抖动在主跑报环境级错误、单独重跑通过）验证；推送后确认 CI + Audit + Pages 部署三工作流全绿、线上站点更新。

## 2026-08-02 - 账户余额更改支持选择记录时间

- 「修改余额」「期间增减」新建记录时可选记录时间（新组件 `accountDetail/RecordTimeRow`，datetime-local 本地时区分钟精度）：默认打开动作页的时刻，未改动时提交仍用精确的当前时刻（排序精度与既有行为一致）；不允许未来时间（输入框 `max` + 提交时独立复核双层拦截）。记录时间决定操作在历史列表的位置与月度流量统计的归属月份（`monthlyDisposable` 按 `op.at` 日期分桶）。
- 回溯语义与既有金融不变量对齐：所选时间早于该账户最近一次「修改余额」校准时，该笔仅作为历史记录保存、不改当前余额——后续校准已确认过那之后的真实余额（与编辑/删除历史共用 `canRollbackBalance` 语义，新建路径把「现在」换成所选时间做同一判断）。页内实时提示沿用既有文案「余额不会变（已在后续校准中固定）」（期间增减预览同步显示 +¥0.00），提交 toast「已记录（余额未变）」；该路径同时豁免「操作后余额不能为负」校验（余额不会变，delta 只是补记的期间流量）。选了自定义时间且金额等于当前余额的「修改余额」不再走无变化直接关闭——补记本身就是目的。
- 编辑历史记录时记录时间只读展示：改时间会让「差额是否已应用到余额」跨校准边界漂移（已应用状态由时间序隐式承载，没有独立字段可依据），本批不支持；转账页暂不加时间选择。数据形状无变化（`at` 字段既有），不涉及 schema 迁移与备份格式。
- 测试：新增 `AccountDetailSheet.recordTime.test.tsx` 8 例（默认时间行为不回归、过去时间写入 `op.at` 且正常应用、期间增减/修改余额回溯校准前仅记录 + 页内提示 + toast、自定义时间等值仍落记录、未来时间拒绝、编辑态只读、`toDatetimeLocalValue` 格式）。测试只假 Date 不假定时器（framer-motion 动画调度不受影响），期望值用本地时间构造与时区无关。
- 已通过 `npm run lint`、`npx tsc -b`、`npm test`（38 文件 325 项）、`npm run build && npm run check:bundle`（entry 160.5/175 KiB）、`npx playwright test`（功能 30 项全矩阵 + 视觉 24 项）验证。

## 2026-07-24 - P3-15 拆分 SettingsScreen 与 uploadCloud 可测化 + P2-11 启动骨架屏

- SettingsScreen 1308 → 350 行（不改任何行为，可见文本/aria/弹窗文案逐字节保留）：新目录 `src/screens/settings/` 承载九个卡片组件（外观/演示/主题/账户排序/统计月起始/云同步/云端 AI/备份/本机快照）与 `localSnapshotFormat.ts` 共享格式化；SettingsScreen 保留为状态提升与组合的编排层。`react-compiler.shared.ts` 编译范围与 vite screen-settings 分包 test 同步纳入 `settings/` 目录（新卡片组件全部进入 React Compiler 编译，分包边界不变）。
- `uploadCloud` 可测化（全库最需要单测却因耦合 UI 无法单测的代码）：147 行递归重试提炼为不依赖 React 的 `runCloudUpload(deps)`——云 API、设置写回、toast/confirm、遥测、busy 翻转全部经依赖注入；`useCloudSyncActions` hook 只做接线（mountedRef StrictMode 复位样板、abort、demo 守卫原样保留）。新增 `runCloudUpload.test.ts` 6 例：成功上传、409 冲突→确认覆盖→force 重试成功（busy 序列与 controller 收尾语义）、force 重试预算耗尽走 error 不再二次询问、远端与本地一致时 reconcile 不重传、用户取消覆盖、非冲突错误分支。
- 启动骨架屏（P2-11）：React 挂载门控在 `storageKernel.ready` 上，WebKit IDB open 挂死时最坏 5s 纯白屏。骨架内联 index.html（脚本加载前即有内容），配色跟随 `color-mode-boot.js` 写入的 `html[data-mode]` 与应用首帧一致，`createRoot.render` 挂载时整体替换；减弱动态偏好下脉冲动画关闭。已核实并放弃原计划的「initCloudAutoSync/initTelemetry 空闲动态 import」半项：两者只是挂事件监听器（微秒级开销），延迟反而丢启动期错误遥测与早期写入的云同步脏标记。
- 已通过 `npm run lint`、`npx tsc -b`、`npm test`（37 文件 317 项）、`npm run build && npm run check:bundle`（entry 160.1/175 KiB，screen-settings 11.5/17）、`npx playwright test`（功能 30 项全矩阵 + 视觉 24 项，设置页基线逐像素不变）验证。

## 2026-07-23 - P4-21 服务端安全三项：管理员失败锁定、锁定 DoS 缓解、health 写放大

- 管理员失败锁定与审计（`requireAdmin`）：管理台此前只有宽松的 300/分请求限流，防暴破弱于普通用户。现在凭据错误按来源 IP 记失败（与普通用户同一套阈值：默认 15 分钟窗口 8 次、锁 5 分钟），锁定期间正确密码也 429；每次失败写入当日管理审计 ndjson（`admin.login_failed`，fire-and-forget 不阻塞响应）。浏览器 Basic 认证的首次无凭据挑战不计失败。
- 账号锁定 DoS 缓解（`requireUser`）：锁定键从「仅用户名」改为「用户名 + 来源 IP」——攻击者对着受害者用户名刷错误密码只会锁住自己；同时把 authCache 命中检查移到锁定检查之前——缓存命中等价于近期用正确密码认证过，真用户的活跃会话不再被攻击者填满的失败桶挡在门外。管理台删号/改密的 `clearUserAuthState` 相应按用户名前缀清理全部 IP 维度的失败记录。
- `/api/health` 写放大治理：未认证端点此前每次请求都做磁盘写探测（写删临时文件）。现在加独立 IP 限流（默认 60/分，`RATIO_HEALTH_RATE_LIMIT_PER_MINUTE`）+ 探测结果短 TTL 缓存（默认 15s，`RATIO_HEALTH_CACHE_TTL_MS`），刷 health 不再放大成磁盘写。
- 集成测试 5 → 8 例：缓存命中在锁定期间存活（DoS 缓解语义）、管理员三连败→正确密码 429→锁定过期恢复→审计落盘、health 限流触发。测试经环境变量注入小阈值（3 次/2s 锁定）保证确定性。
- 已通过 `npm run lint`、`npm --prefix server run check`（8 项）验证。

## 2026-07-23 - P0-5 跨标签单实例守卫（Web Locks）

- 消灭跨标签并发写丢更新：核心数据都是「整个数组存一个键」+ 键级 last-write-wins，两个标签页并发记账会静默丢记录（P0 最后一项遗留）。方案取「结构性消灭并发」而非「正确合并并发」——个人记账应用没有真实的多标签同时编辑需求，与版本号 + rebase 的复杂度相比，单实例是更小且更稳的答案。
- 机制（`src/lib/instanceGuard.ts` + `main.tsx` 编排 + `InstanceGateScreens.tsx`）：首个标签页持有一把永不释放的 Web Locks 排他锁；后开标签拿不到锁停在拦截页（「Ratio 已在其他标签页打开」），点「在此标签页继续」以 steal 抢占接管；原持有者经 request promise 的 AbortError 感知被接管，抢跑 `storageKernel.flush()` 后整页冻结（独立 root 覆盖层阻断一切交互，提示已保存 + 可刷新回拦截页）。接管无需刷新：拦截期间内核照常经 BroadcastChannel 同步内存，挂载时数据已是最新。
- 降级：`navigator.locks` 不存在（老浏览器/jsdom）按获得锁处理，行为与守卫之前完全一致；锁随页面关闭自动释放，无死锁面。Playwright 各测试用独立 context（Web Locks 按 origin + profile 隔离），既有 e2e 不受影响。
- 测试：新增 `instanceGuard.test.ts` 7 例（获取/占用/steal 抢占回调恰一次/二次抢占链/无 API 降级/同步与异步失败容错，fake LockManager 模拟 AbortError 语义）；新增 `e2e/instance-guard.spec.ts` 双标签用例 × 3 浏览器项目（第二页被拦截→接管→第一页冻结→刷新回拦截页），mobile-safari 走真实 WebKit Web Locks。
- 已通过 `npm run lint`、`npx tsc -b`、`npm test`（36 文件 311 项）、`npx playwright test`（功能 30 项全矩阵 + 视觉 24 项）验证。

## 2026-07-19 - P4-19 写路径 e2e 与构建可复现性

- 新增 `e2e/write-paths.spec.ts` 3 例 × 3 项目（chromium / mobile-chrome / mobile-safari）：此前全部 e2e 用例只读不写，「曾真实丢过数据」的路径只有单测在守。覆盖：①新建账户→录初始余额→转账→期间增减→整页刷新后数据与操作历史完整（IndexedDB 落盘持久性的真浏览器验证）；②备份导出→改数据→导入导出文件，断言数据回滚到导出时点（含内容预检确认弹窗）；③演示模式进入→退出，断言真实数据完整回归。
- e2e 经验沉淀进用例注释：`getByRole` name 默认子串匹配（「完成」会撞上设置页「连接配置 未完成」，需 `exact: true`）；动作页切换动画期间新旧两个「完成」并存（取 `.last()`）；首页 mini bar 及其弹出菜单在滚动层之下，真实 click 被拦截需 `dispatchEvent('click')`。
- 构建可复现（P4-22 部分）：本地 buildId 从时间戳改为 git 短 SHA（工作区脏时 `-dirty` 后缀，无 git 时退 'dev'）——此前零改动重新构建也会因 `__APP_BUILD__` 注入值变化导致全部产物 hash 变化，产物 diff 与视觉回归基线失真。CI 继续用 GITHUB_SHA。package.json 版本号 0.0.0 → 1.0.0。
- 已通过 `npm run lint`、`npx tsc -b`、`npm test`（35 文件 304 项）、`npx playwright test`（功能 27 项全矩阵 + 视觉 24 项）验证。

## 2026-07-19 - P2-13 vite-plugin-pwa 升级 1.3.0 与预缓存口径统一

- vite-plugin-pwa `0.21 → 1.3.0`：0.21 的 peer 不含 Vite 7，此前靠 override 硬扛属未受支持组合；1.3.0 官方支持 Vite 7 + workbox 7.3。`registerSW` 回调式 API 与 prompt 模式语义不变（sw.js 产物结构与升级前同构：`SKIP_WAITING` 消息监听 + `clientsClaim` + precacheAndRoute），`src/pwa.ts` 零改动。
- 预缓存口径统一：五个只被懒屏幕共享的依赖 chunk（`TrendScreen-*`/`StatsScreen-*`/`SettingsScreen-*`/`AiAssistant-*`/`savingsGoal-*`，由 rolldown 自动拆出）此前仍在 SW precache 里——安装 SW 时就预下载可能从不打开的屏幕依赖，且随每次发版重新下载。现在与六个显式懒分组同口径：`globIgnores` 排除预缓存 + 运行时 `CacheFirst` 按需缓存。懒边界名单收敛为 `vite.config.ts` 的单一 `lazyChunkNames` 数组，modulePreload 过滤 / precache 排除 / 运行时缓存三处消费同一份，运行时缓存 `maxEntries` 24 → 32（11 个懒块新旧版本并存的余量）。precache 从 23 项 661.71KiB 降为 18 项 598.90KiB。
- 门禁升级（`scripts/check-bundle-budget.mjs`）：新增 sw.js precache 清单校验——任何懒边界 chunk 出现在预缓存里即失败（已用注入违规项做过反向验证），generateSW 输出格式变化导致解析不到清单同样报错，防止升级类改动静默破坏口径。
- 已通过 `npm run lint`、`npm test`（35 文件 304 项）、`npm run build && npm run check:bundle`（entry 159.3/175 KiB）、`npx playwright test` 验证。

## 2026-07-19 - P2 小型性能双项：操作历史分页渲染、AI 流式合帧

- 操作历史分页渲染（`OpsHistoryList.tsx`，P2-10）：每条操作记录都是 layout+drag motion 节点且此前无渲染上限，几百条历史时是账户详情页最先卡的部分。现在初始只渲染最近 40 条，「加载更多」按钮每次补 60 条并显示剩余条数；超过 60 条的列表关闭逐项 `layout` 重排动画（删除时其余条目瞬时补位），不再为每条维持布局测量。余额回推从当前余额沿倒序历史累计，只渲染前缀不影响任何已渲染条目的余额展示，分页揭示的条目接续之前的累计而非从头算。切换账户时分页量复位。
- AI 流式回复合帧（`AiAssistant.tsx`，P2-14）：每个 SSE delta 此前直接 setState，react-markdown 对越来越长的全文重解析（累计 O(len²)，长回答肉眼可见地拖慢流式渲染）。现在 delta 先入缓冲，`requestAnimationFrame` 每帧最多提交一次；请求成功后以 `fetchAiChatCompletion` 的返回值（恒为全部 delta 之和）整体覆盖一次作为最终帧，合帧中未提交的残留一并作废，中止/错误路径同样先取消挂起帧。
- 测试：新增 `OpsHistoryList.test.tsx` 3 例（初始截断与剩余计数、加载更多补齐 + 分页边界余额连续、短历史无按钮），该组件此前零测试；`AiAssistant.test.tsx` 既有 2 例在合帧语义下不变通过。
- 已通过 `npm run lint`、`npx tsc -b`、`npm test`（35 文件 304 项）验证。

## 2026-07-19 - P1-9 落盘失败主动重试与配额自救

- 失败退避重试（`storageKernel.ts`）：落盘失败此前只被动等下一次用户写入才碰运气重试——用户停完手，失败批次会一直悬在内存里直到页面关闭丢失。现在失败后按退避主动重试（1s 起步、翻倍、封顶 30s，任一次成功即复位）；`scheduleFlush` 支持延迟调度且新写入的 0 延迟可抢占退避长延迟。
- 配额错误分级（`QuotaExceededError`）：普通落盘失败与配额耗尽此前是同一句提示。配额耗尽有明确自救路径，提示升级为可操作引导——「本机存储空间不足…建议先导出一份备份」+「清理本机快照」动作按钮，一键清空 `__backup.*` 滚动快照代际（占用大头，最多 11 代全量副本；主数据落不了盘时优先保主数据）并立即重试落盘；同时经 `navigator.storage.estimate()` 把用量比例写入诊断日志。
- 启动配额水位检查：IDB 模式 ready 后火后不管地查一次 estimate，用量 >90% 提前告警（带同款清理动作），不等第一次写失败才发现。
- 顺手修复一个真实分类缺陷：`writeBatch` 的同步抛错路径把非 `Error` 实例归一成泛型 Error——DOMException 在部分环境（含 jsdom）不继承 Error，配额错误的 name 会在这里丢失导致永远走不到分级提示；改为保留原始异常对象。
- 测试：`storageKernel.test.ts` 17 → 19 例（故障恢复后无需任何调用方动作、退避定时器自行完成落盘；配额错误 toast 携带清理动作、动作清空 `__backup.*` 并重试成功、重启后数据在而快照清空）；`makeFlakyFactory` 支持注入错误类型，退避起步毫秒可测试注入（`flushRetryBaseMs`）。
- 已通过 `npm run lint`、`npx tsc -b`、`npm test`（34 文件 301 项）验证。

## 2026-07-19 - P1-8 显式数据 schema 版本与迁移框架

- 新增 `src/lib/schemaVersion.ts`：整份 ratio.* 数据获得显式版本号（`ratio.schemaVersion` 键，当前 v1），为快照降采样、多币种、账户归档等破坏性数据形状变更预留安全通道。关键决策：版本号就是一个普通 ratio.* 键——自然进入备份文件与云端备份，备份版本协商因此**不需要改动 `ratio.backup.v1` 文件格式**（老备份缺键即视为 v1），服务端校验也无需变更。
- 迁移管道：`runDataSchemaMigrations` 在 `main.tsx` 挂载 React 之前执行（storageKernel.ready 之后），组件树读到的一定是当前版本形状的数据。逐级推进（from 连续，每级成功立即落版本号）；任何一级失败停在已完成级、toast 提示并以 coerce 兼容模式继续运行——本地优先应用绝不因迁移失败白屏。数据被更新版本应用写过（版本超前）时不动数据不回写版本，仅提示建议升级。演示模式跳过（临时数据，退出后真实数据下次启动再迁移）。
- 备份版本协商（`backup.ts`）：`restoreRatioBackup` 拒绝 schema 版本高于当前应用的备份（明确报错提示先升级，本机数据不被触碰），覆盖导入备份/云端恢复/本机快照/云同步 fast-forward 全部恢复路径（fast-forward 遇更新版本远端自动回落人工冲突流程）；恢复旧版本备份后就地跑迁移，覆盖不整页刷新的 fast-forward 路径。
- 首次启动为存量数据补章版本号（一次性写入，随后随云同步流动）。
- 测试：新增 `schemaVersion.test.ts` 9 例（空库=当前版本、缺键有数据=v1、非法值容错、补章、演示跳过、版本超前不触碰数据、乱序迁移列表按级执行、中途抛错停级、缺失步骤干净失败）；`backup.test.ts` +2 例（拒绝 v99 备份且本机数据不动、当前/缺失版本键正常恢复）。
- 文档：PROJECT.md 键表、「备份」「本地存储」小节同步。
- 已通过 `npm run lint`、`npx tsc -b`、`npm test`（34 文件 299 项）、`npm run build && npm run check:bundle`（entry 158.8/175 KiB）验证。

## 2026-07-19 - P1-6 快照管线速效修复：消除三重规范化写放大

- 每次记账的快照管线此前对全部历史快照做三遍完整规范化：coerce 读取一遍（必要，保留）、`useSnapshots` 的 `normalized` useMemo 再 map 一遍（纯冗余，已删除）、`upsertSnapshot` 对历史逐条 normalize 第三遍（已改为信任输入只规范化新条目，保留轻量日期过滤兜底）。生产两个调用方（useSnapshots 状态、App `liveSnapshots`）的输入恒为 coerce 后的规范化数据，语义不变；4 年日更 × 20 账户规模下每次记账从约 9 万次字段规范化降为单条。
- 新增契约测试：`withAccountSnapshot` 未涉及的历史条目保持引用不变（`toBe` 断言），防止未来无意恢复全量重建。
- 已通过 `npm run lint`、`npx tsc -b`、`npm test`（33 文件 288 项）验证。

## 2026-07-19 - P0 止血批次：Docker 数据卷兜底、云同步 fast-forward、原型链用户名、反代自检

- 全维度体检产出 `IMPROVEMENT.md` 改进计划（前端质量/数据层/性能/后端安全/测试工程化五路并行分析汇总），本批为其中 P0 四项。
- Docker 数据卷兜底（`server/Dockerfile`）：镜像内显式 `ENV RATIO_DATA_DIR=/data RATIO_HOST=0.0.0.0` + `VOLUME /data`——此前这两项只在 docker-compose.yml 配置，绕过 compose 直接 `docker run` 时数据默认写进容器可写层（`/app/data`），容器重建即丢全部用户云备份，且 `127.0.0.1` 监听导致端口映射后不可达。
- 云同步 fast-forward（`cloudSync.ts`）：本地 clean（无脏标记）而云端有更新时——换设备的正常场景——自动应用远端备份，不再标 conflict 停摆自动同步逼用户手动「从云端恢复」。安全约束：仅 probe 路径（本地确认 clean）允许；应用前二查脏标记（网络往返期间用户写入即放弃）、内容预检（空/损坏远端不静默覆盖，与手动恢复同口径）、先抢一代 pre 本机快照；恢复写入以 `suppressDirtyMarking` 抑制自家监听器标脏，避免刚下载的数据被回传上传。应用后 toast 告知「已同步来自其他设备的云端更新」。首次连接（无 `lastBackupAt`）与真冲突（双方都有修改）维持原人工流程。
- 服务端原型链用户名（`server.js`）：用户名正则放行 `__proto__`/`toString` 等 `Object.prototype` 属性名，认证读 `users.users[username]` 命中继承属性后 `verifyPassword` 抛 TypeError → 500，注册路径存在 `__proto__` 原型赋值隐患。用户表读取统一走 `getUserRecord()`（`Object.hasOwn` 只认自有属性，覆盖认证/重哈希/注册/管理台查改删 9 处），注册与管理台建号额外拉黑 `__proto__`/`constructor`/`prototype`。
- 反代自检（`server.js`）：未开 `RATIO_TRUST_PROXY` 时若发现来自 loopback 的请求携带 `x-forwarded-for`（反代部署特征），console.warn 一次性提示「全部客户端共享同一限流/锁定桶」；启动日志追加 `trustProxy` 状态。
- 测试：`cloudSync.test.ts` 12 → 13 例（原「clean 设备遇远端更新 → conflict」改为断言 fast-forward 语义 + 恢复写入不标脏不回传；新增空备份拒绝 fast-forward 维持冲突流程）；server 集成测试 4 → 5 例（原型链用户名注册 400、认证 401 而非 500、正常用户不受影响）。
- 已通过 `npm run lint`、`npx tsc -b`、`npm test`（33 文件 287 项）、`npm --prefix server run check`（5 项）验证。

## 2026-07-15 - 工程门禁升级：服务端集成测试、真实懒加载审计、移动 CI、依赖清零

- 服务端建立可测试入口：`server/src/server.js` 新增 `createServer()` / `startServer()`，被测试导入时不再自动占用端口，`node src/server.js` 的生产启动行为保持不变。新增 Node `node:test` 真实 HTTP 集成测试，使用临时数据目录和随机端口覆盖健康检查、注册/认证、备份上传下载、`expectedUpdatedAt` 冲突、缺失凭据与损坏 JSON；`npm --prefix server run check` 同时执行语法检查和 4 项集成测试。
- ESLint 扩展到 `server/**/*.js` 与 `scripts/**/*.mjs`（Node ESM globals），服务端不再处于零规则状态。CI 新增服务端检查、`npm audit --audit-level=high`、构建分包门禁，并把 Playwright 从仅 desktop chromium 扩为 desktop chromium + mobile-chrome；Windows WebKit 继续按已知节流问题留在本地全矩阵。
- 依赖安全升级：Vitest `4.0.16 → 4.1.10`、PostCSS `8.5.6 → 8.5.19`，并刷新可安全升级的传递依赖；`npm audit` 从 18 项（1 critical / 10 high / 6 moderate / 1 low）降为 0。新增每周 Dependabot，minor/patch 合并分组以控制 PR 噪音。
- 新增 `scripts/check-bundle-budget.mjs`：从 `dist/index.html` 精确定位入口，校验 AI/趋势/统计/设置/markdown/matter 六类懒块存在且非空，检查各块 gzip 预算，并拒绝入口对懒块的静态 import。
- 门禁在建立基线时发现一个真实分包回归：`advancedChunks` 注释声称关闭递归吸附，但实际遗漏 `includeDependenciesRecursively: false`；Rolldown 默认值为 true，导致入口静态 import AI/趋势/统计/设置/markdown 五个“懒块”，首开实际下载约 276 KiB gzip。补上显式 false 后入口只静态依赖 0.4 KiB runtime，真实首开闭包约 159 KiB gzip，六类懒块恢复按需加载；构建预算以修正后的真实依赖边界为基线。
- Vitest 默认限制为 2 workers，并排除独立的 `server/` Node 测试，避免 Windows 高负载下 fork worker 启动超时。验证通过：`npm run lint`、`npm --prefix server run check`、`npm test`（33 文件 / 286 项）、`npm run build && npm run check:bundle`、Playwright desktop/mobile Chromium 12 项与 mobile-safari 6 项。

## 2026-07-08 - 月度可支配修正：发薪后收入双计、手动月支出、口径统一

- 修复可支配头图的收入双重计入：对账公式此前假设收入随日历线性到账（`剩余预期收入 = 收入 × 未过天数比`），发薪日落账并记录后净值差额已含全额收入、剩余预期却仍近乎全额——把统计月起始日设为发薪日的用户整个上半月头图 ≈ 2×收入 − 目标。改为**收入确认制**：本期已记录的流动账户流入优先确认收入（工资一记录、剩余预期立刻归零），无流水记录时保留日历比例作下界（快照型用户月末仍收敛到与储蓄目标卡一致的缺口）。期初纯预测、期末对齐缺口这两个端点行为不变，只修正中段。
- 流量分类收窄到 liquid 组：对应收款账户的正向 adjust（应收增加 = 钱借出去了）此前被计为收入流入，方向反了；回款的流动侧照常计入，信号不丢。
- 新增手动月支出（`ratio.monthlyEstimatedExpense`）：支出阶梯变为手动 → 近月净流出中位数，卡片折叠表单扩为收入/支出两栏「收支基准」；手动支出同步作用于现金覆盖月数与净值反推收入。只对账不记明细的用户（收支都会被净额化低估）从此有校准入口。
- 口径与文案：surplus 模式头图标签「本月净结余」→「月均结余」（值本就是净资产月均增速）；说明面板第一条改为面向用户的表述，并补充净额化对账会低估收支的提示。
- 测试：`monthlyDisposable.test.ts` 17 → 25 例（发薪双计回归、部分到账确认、快照型用户日历下界、手动支出阶梯与下游联动、receivable 剔除、支出 coerce 边界；原「本期已有大额流入」用例改为断言确认制新语义）。
- 已通过 `npm run lint`、`npm test`、`npm run build` 和 `npx playwright test` 验证。

## 2026-07-08 - 分包修复与图表瘦身：vendor 分包在 rolldown 下失效、recharts → 自绘 SVG

- 修复 vendor 分包静默失效：rolldown 把函数式 `manualChunks` 转成 `includeDependenciesRecursively: true` 的 advancedChunks——被匹配模块的整棵依赖树并入该组，vendor 组永远抢不到已被屏幕组吞掉的 recharts/markdown，`vendor-charts`/`vendor-markdown` 分包名义存在实际为空（recharts 全量坐在 screen-trend 里 105KB gzip、markdown 全家桶坐在 ai-assistant 里 111KB，两者一起随屏幕代码每次发版重新下载）。改为显式 `advancedChunks` groups 且 vendor 组 priority 高于屏幕组（先抢依赖树），分包恢复、首包逐字节不变。
- recharts → 自绘 SVG（新 `src/screens/TrendChart.tsx` + 纯几何模块 `trendChartMath.ts`）：趋势页是 recharts 唯一消费者，整库（含 d3 依赖树，~99KB gzip）只画一张折线图。自绘实现对齐原视觉语汇——d3 curveMonotoneX 同款 Fritsch–Carlson 单调插值（曲线不过冲出数据外的鼓包）、1/2/2.5/5×10ᵏ 整步长 y 刻度、横向虚线网格、预测参考区/分界线、按 x 最近点点选 + 虚线 cursor + 系列高亮点、描线入场动画（clipPath 揭示，减弱动态偏好下跳过）。x 轴刻度按绘图区宽度自适应数量，首尾标签锚点内收不再溢出。`recharts` 依赖删除，screen-trend 分包 105.34 → 12.32KB gzip（−88%），趋势页冷加载体积降一个量级；recharts accessibilityLayer 的焦点环 CSS 补丁一并移除（结构性消失）。
- 测试：新增 `TrendChart.test.tsx` 8 例（y 刻度步长/覆盖域/退化、monotone 路径过点与不过冲、connectNulls 不断线、点选最近点回调、cursor/高亮点/网格/参考区渲染、0 基线刻度）；`TrendScreen.render.test.tsx` 从 mock recharts 改为 mock TrendChart，原语义断言（目标路径起点、connectNulls 约定）不变；视觉回归新增 trend 基线 2 张（matisse2 浅色 + 暗色，共 24 张），录制后逐张目检。
- 文档：PROJECT.md 技术栈/「懒加载与分包」（显式 advancedChunks 纪律与 rolldown 递归吸附陷阱）/变更导航/不变量更新，AGENTS.md 体积纪律同步。
- 已通过 `npm run lint`、`npm test`（33 文件 280 项）、`npm run build` 和 `npx playwright test`（功能 18 项全矩阵 + 视觉 24 项）验证；mobile-safari 的占比页 scrim 用例首跑抖动、单独复跑通过（TROUBLESHOOTING 已知项）。

## 2026-07-08 - 数据可靠性批次：落盘失败不再静默、本机滚动快照、iOS 连接防护、恢复预检

- 存储内核落盘可靠性重做（`storageKernel.ts`）：失败的写入批次不再被丢弃——此前 `runFlush` 在事务提交前就清空队列、错误被吞、`flush()` 恒成功，「恢复备份/退出演示」可以假成功（刷新后读回旧数据且成功 toast 照常显示）。现在条目在提交成功前留在队列、由后续任意 flush 自动重试；写失败先重开一次连接再试；`flush()` 返回布尔，六处「写入后整页刷新」路径（导入备份/云端恢复/本机快照恢复/设置页进出演示/引导页进演示/演示徽章退出）在 false 时中止刷新并明确提示，进演示失败还会回滚内存态避免「界面演示、磁盘真实」分裂。
- iOS/WebKit 连接防护：挂 `db.onclose`（系统挂起后单方面断开连接 → 置空由写入路径惰性重连）；`openDb` 加 5s 超时（WebKit open 永不回调的已知缺陷 → 回退 local 而不是 ready 悬挂白屏），超时后迟到的成功连接会被主动关闭。
- 迁移安全：首启迁移中 localStorage 读取失败不再写迁移标记——此前按「空数据」盖章，几年的旧数据会被永久遗弃；现在整体放弃本次迁移，下次启动自动重试导入。
- **本机滚动快照**（新模块 `src/lib/localBackups.ts`）：IDB 模式下自动保留近期全量数据副本——每日一代保 7 代（App 启动空闲 3.5s 后写，演示模式/空数据跳过）、危险操作前抢一代保 3 代（导入备份/云端恢复/进入演示统一接线）、降级会话抢救保 1 代。键以 `__backup.` 开头（非 `ratio.*`）：不进备份文件、不被恢复/清空触碰、不触发云同步脏标记、不出现在 appStorage 视图（内核新增 `internalKeys()`）。设置页新增「本机快照」卡片，可一键恢复到任一代（恢复前同样先抢一代）。**未配云同步的用户从此有本机恢复手段**——上次审计的最高优先遗留项。
- 降级会话警示与抢救：IDB 存在却打开失败时 toast 明确警示（此前静默跑在冻结于迁移日的旧副本上，用户在旧账本上无感记账）；降级会话的写入在 localStorage 打标（`FALLBACK_WRITES_MARKER_KEY`），下次 IDB 正常启动自动把降级期间数据另存为 fallback 快照并提示，不再「将来被静默抛弃」。
- 恢复预检（`summarizeRatioBackupContent`）：导入备份的确认弹窗展示内容计数（账户/快照/操作记录），「合法 JSON 但内容退化」的空备份与解析失败的损坏键触发加重警告——此前 coerce 只校验文件结构，坏备份会静默恢复成空账本；云端恢复同样预检，异常时二次确认后才覆盖本机。
- 测试：storageKernel 11→17 例（flaky 工厂模拟连接失效：失败回灌+稍后重试、单次瞬时失败透明重开；open 超时回退；迁移读取失败不盖章；降级标记打/不打；internalKeys 视图隔离），新增 `localBackups.test.ts` 5 例（每日幂等与超额裁剪、操作前代际恢复 roundtrip、演示/空数据/回退模式停用、降级抢救与标记消费、零数据消费标记），backup +3 例（内容预检三态）。
- 文档：PROJECT.md「本地存储:内核与键」「备份」更新（flush 布尔约定、滚动快照、迁移与降级语义、openDb 超时），AGENTS.md 高风险点同步（flush 检查返回值 + 覆盖前抢快照）。
- 已通过 `npm run lint`、`npm test`（32 文件 272 项）、`npm run build` 和 `npx playwright test`（功能 18 项全矩阵 + 视觉 22 项）验证。

## 2026-07-08 - 止血批次：StrictMode 挂载守卫失效、演示模式重入防护、部署门禁、暗色底色块

- 修复 mountedRef 模式在 StrictMode 下永久失效（dev/prod 行为分裂）：`useRef(true)` 只在 cleanup 置 false、effect body 不复位，dev 环境（main.tsx 开启 StrictMode）首次模拟卸载后 ref 恒为 false——AI 助手的流式回填/错误提示/发送态复位与设置页全部云操作的结果处理（toast、busy 翻转、设置写回）在 dev 下实际失效；生产构建无 StrictMode 不受影响。两处 effect body 补复位；顺带把三份实现不一致的 `isAbortError` 收敛为 `lib/abortError.ts` 单一实现（按 name 判定，是 `instanceof DOMException` 的更宽安全集合）。
- 演示模式重入守卫（多标签数据丢失风险）：`enterDemoMode` 在演示已激活时拒绝执行——此前另一标签已进入演示、本标签旧按钮再点会用**演示数据**覆盖真实数据暂存 stash，真实数据永久丢失；`exitDemoMode` 在非演示态时 no-op——此前 stash 已被另一标签消费的重放退出会落入 `clearRatioStorage()` 分支清掉刚恢复的真实数据。UI 挂载时读一次标记的行为不变（进出必然整页刷新），守卫在编排层以实时存储态兜底。新增 3 例进出编排测试（roundtrip 逐字节一致 / 重入拒绝且 stash 完好 / 非演示态退出 no-op），此前该路径零测试。
- 部署门禁：deploy-pages 从「push main 直接触发」（与 CI 并行赛跑，测试失败的提交照样发布）改为 `workflow_run` 监听 CI 成功后触发，并 checkout CI 实际验证过的 `head_sha`；`workflow_dispatch` 保留为手动逃生通道。
- 暗色残留：资产首页占比页的负债上方/资产底部填充块此前是字面 `'white'`（暗色下是刺眼纯白块），改为 `var(--card)`——浅色 `--card` 恰为 `#ffffff`，六主题浅色基线逐像素不变；视觉回归补录 `dark-ratio` 基线（此前暗色抽样恰好漏掉该屏，共 22 张）。
- 依赖卫生：删除 `tailwind-merge`（全库零引用）与 `autoprefixer`（postcss 链未引用，Tailwind 4 内建前缀处理）；`@tailwindcss/postcss` 移至 devDependencies（纯构建期依赖）；browserslist 数据更新。
- 死代码：删除 `useAccounts` 的 `liquidAccounts`（零消费者，每次账户变化空算一次 memo）。
- 已通过 `npm run lint`、`npm test`（31 文件 258 项）、`npm run build` 和 `npx playwright test`（功能 18 项全矩阵 + 视觉 22 项，含新基线复跑）验证。

## 2026-07-06 - 存储层全量迁移 IndexedDB（storageKernel 内核）

- 新增存储内核 `src/lib/storageKernel.ts`（文件头注释是改动前必读的约定清单），接管全部应用数据持久化：IndexedDB 为权威存储（配额远大于 localStorage 的 ~5MB，且启动即申请 `navigator.storage.persist()` 豁免驱逐），启动时全量水合进内存，之后同步读内存、写走 `setTimeout(0)` 合批异步落盘；IndexedDB 不可用（隐私模式禁开/老浏览器/jsdom）时整体回退 localStorage 直读直写，读写异常向上透传，语义与迁移前逐项对齐。`main.tsx` await `storageKernel.ready` 后才挂载 React，组件树内的同步读保证命中权威数据，没有读写空窗。
- 无感迁移：首次以 IDB 模式启动把 localStorage 的 `ratio.*` 全量导入 IndexedDB 并写迁移标记（标记存 IDB、不带 `ratio.` 前缀，永不进备份/清理，「清空数据后重启」不会把旧副本导回）；localStorage 旧副本冻结保留，回滚到旧版本仍有近期数据可用。例外：`ratio.colorMode`/`ratio.theme` 持续镜像回 localStorage，`color-mode-boot.js` 首帧防闪白的同步读不受影响。
- 跨标签同步改走 BroadcastChannel（IDB 写不触发原生 `storage` 事件），收到广播后同步内存并重放为既有 storageEvents 自定义事件，hooks 层无感知；回退模式保留原生 `storage` 事件路径。
- 落盘可靠性：恢复备份/云端恢复/进出演示模式等 6 处「写完即整页刷新」路径刷新前统一 `await storageKernel.flush()`（否则最后一批合批写入可能未提交就被刷新丢弃）；页面隐藏（pagehide/visibilitychange）自动抢跑 flush，缩短移动端切后台的未落盘窗口；IDB 写失败 console.error + 30s 节流 toast。
- 调用方迁移：useLocalStorageState / backup / cloud / cloudSync / ai / demoData / demoMode / telemetry / 里程碑庆祝的默认存储全部改为 `appStorage`（Storage 形状适配器，只暴露 `ratio.*` 键）或 storageKernel 直连，源码中不再有对 `localStorage` 的业务直引。
- 测试：新增 `storageKernel.test.ts` 11 例，用 fake-indexeddb 按用例注入覆盖 IDB 模式（首启迁移/标记防重导/boot 镜像/落盘持久性/预 ready 写重放/Storage 适配器/回退与异常透传）；jsdom 无 indexedDB，既有单测自动运行在回退模式、无需感知内核。首包增量 +0.1KB gzip（内核注释在产物中剥离，代码高度可压缩）。
- 文档：PROJECT.md「本地存储键」升级为「本地存储：内核与键」，AGENTS.md 高风险点补 flush 不变量，README 数据描述更新；TROUBLESHOOTING 新增「vitest fork 池本机高负载卡死」条目（判定卡死看 worker CPU 增量为零，串行 `--no-file-parallelism` 可绕过）。
- 已通过 `npm run lint`、`npm test`（31 文件 255 项，本机以串行模式验证）、`npm run build` 和 `npx playwright test`（功能 18 项全矩阵，真实 Chromium/WebKit IndexedDB 路径）验证。

## 2026-07-05 - 止血批次：服务端流式崩溃、PWA 更新不再强刷、暗色残留、根级错误兜底

- 修复服务端严重缺陷：AI 流式转发中途失败/超时会打挂整个后端进程——流式响应 headers 已发出后，错误路径再调 `fail()` → `writeHead` 抛 `ERR_HTTP_HEADERS_SENT` → unhandled rejection → Node 20 默认退出。`fail()` 加 `headersSent` 守护（改为断开连接示错），全局兜底处理器自身包 try/catch；`writeChunk` 的 `drain` 等待与 `close`/`error` 竞速，客户端断连不再永久挂起协程。已用真实服务进程 + 「永不结束的模拟上游」冒烟验证：1.2s 流式超时触发后进程存活、`/api/health` 200。
- PWA 更新流程重做：`autoUpdate`（skipWaiting + 无预警整页强刷，可能丢掉用户正在输入的内容）改为 `prompt` 模式——新版本先 waiting，toast「新版本已就绪 / 立即更新」征得同意后才接管刷新，忽略则下次冷启动自然生效；60s 固定轮询改为回前台时检查（5 分钟节流 + 30 分钟兜底）。首装 controllerchange 一类缺陷从结构上消失（相应逻辑已删除，TROUBLESHOOTING 对应条目已加注）。toast 组件新增动作按钮；`lib/overlay.ts` 新增 `emitAppToast` 模块级入口（Provider 挂载前排队补发）。
- 暗色模式字面色残留清理（暗色新用户第一屏即引导页，此前是浅底白字）：引导页页面层跟随明暗（`.tourRoot` 变量组 + CSS 过渡），手机 mockup 经 `.tourPhoneLock` 钉回浅色值、锁定「浅色截图」质感；趋势页目标路径/记录延伸虚线、图例虚线、详情面板数值、负债圆点、点选 cursor 全部换 `--ink-rgb`（浅色渲染逐像素不变）；统计页指标瓦片标签/副文案换 `--muted-text`、InfoDot 与 StatusChip 底色换 `--glass-rgb`；桌面端 `.appViewport` 背景补暗色对。
- 顺手修复一处既有缺陷：recharts v3 `accessibilityLayer` 让图表元素可聚焦，点选趋势数据点后浏览器默认焦点环会框住预测区域（浅色下是黑框、暗色下是刺眼白框，两种模式均存在）。按 `:focus:not(:focus-visible)` 只消鼠标路径焦点环，键盘焦点环保留。
- 健壮性兜底：`main.tsx` 新增根级 `RootErrorBoundary`，渲染崩溃不再白屏，兜底界面提供「刷新 + 导出数据备份」；`useLocalStorageState` 写入失败（配额满/隐私模式禁写）从仅 console 升级为 toast 提示（30s 节流防刷屏）；引导页「先看看演示数据」入口补 try/catch——stash 是全应用最大单次写入，此前配额不足会带着异常直接刷新。
- 视觉基线：statsUi 令牌化使 7 张 stats 基线有意更新（6 主题 + 暗色），其余 14 张字节不变。经验记录：`--update-snapshots`（changed 模式）不会重录容差内的真实变化，令牌类改动重录基线需 `--update-snapshots=all`。
- 首包 gzip 103.3 → 105.3KB（+2KB：错误边界 + 更新提示 + overlay 桥接，均为首包职责内的健壮性代码）。
- 已通过 `npm run lint`、`npm test`（244 项）、`npm run build` 和 `npx playwright test`（功能 18 项全矩阵 + 视觉 21 项）验证；暗色引导页/趋势/统计另经逐屏截图目检。

## 2026-07-04 - 修复 PWA 首装自刷新（并稳定 CI e2e）

- 修复真实缺陷：Service Worker 首次安装后 `clientsClaim` 接管页面触发 `controllerchange`，旧逻辑无条件整页刷新——新用户首开数秒后会被硬刷新一次（慢设备/iOS PWA 尤其明显）。现在仅当页面加载时已受控（即真正的版本更新替换）才刷新，更新路径行为不变。
- 该缺陷在 CI 双核慢机上正好砸进 e2e 交互中段，是首个 CI 运行两用例失败的根因；本地用 CDP CPU 节流 3x 复现并验证，修复后 3x/4x/6x × 3 全绿（此前同矩阵 1 失败 + 5 侥幸重试）。
- e2e 确定性加固：`openAccountDetail` 等待首页初始化完成、逐步断言、按展开态幂等；分组卡新增稳定 `aria-label="account group ${id}"`；CI 上 Playwright `retries: 1` + 失败自动上传 report/trace 工件。
- GitHub Pages 偶发「Deployment failed, try again later」确认为服务端瞬时错误，重跑即可；诊断与处置全文见 TROUBLESHOOTING.md 前两节。
- 已通过 `npm run lint`、`npm test`（197 项）、`npm run build` 和 `npx playwright test`（18 项全矩阵）验证。

## 2026-07-04 - 快速见效批次：首开流畅度、首包瘦身、安全与工程基础

- 修复 iOS PWA 首开「占比页展开动画丢帧」：后台分包预热与首次交互争抢主线程所致；预热链加 1.6s 交互静默门控并把 AI 大分包纳入链尾统一治理（诊断全文见 TROUBLESHOOTING.md）。
- matter-js 移出首包按需加载（`vendor-matter` 分包 26.3KB gzip）：首包 gzip 128.7 → 102.6KB（−20%）；加载完成前气泡停在初始位置，flick/burst 静默忽略。
- 服务端 PBKDF2-SHA256 迭代 160k → 600k（OWASP 当前下限），旧记录在下次登录成功时透明重哈希升级（不动 updatedAt，并发改密安全）；已用真实服务进程冒烟验证注册/降级种子/升级/错误密码全路径。
- 新增 CI 工作流：PR 与 main push 上跑 lint + 单测 + 构建 + Playwright chromium。
- 启用 fast-check 首批性质测试（+10 项）：整数百分比分配「总和恒 100、正额≥1%、对抗性输入不越界」、金额运算「分域交换/结合/可逆、非有限数归零」、分段高度「段数不变、非负、恰好填满、保底退化均分」。
- 空状态插画：趋势页/统计区间/操作历史的裸文案升级为主题色线稿 + 行动提示（共享 `EmptyState` 组件，原文案保留）。
- 已通过 `npm run lint`、`npm test`（197 项）、`npm run build` 和 `npm run test:e2e`（18 项）验证。

## 2026-07-04 - 启用 React Compiler（作用域限定于懒加载屏幕）

- 引入 `babel-plugin-react-compiler` 1.0，经 `react-compiler.shared.ts` 统一配置，vite 构建与 vitest 单测共用同一转换。
- 范围策略：只编译懒加载屏幕树（TrendScreen / StatsScreen / SettingsScreen / `screens/stats/` / AiAssistant）。整包编译实测会使首包 gzip +≈20KB 而热路径（MotionValue 驱动 + 手工记忆化）几乎无收益，故首包保持不编译；懒屏幕的自动记忆化让统计卡片群在切区间/改算法/拖滑杆时跳过未变子树的重渲染。
- 实测体积：首包 128.72KB gzip（基线 128.58，+0.1%），screen-stats +13.0KB gzip（SW 缓存吸收），trend/AI/settings 基本不变。
- 新增 `scripts/compiler-report.mjs` 逐文件审计编译/跳过：当前 65 编译 / 11 跳过；跳过均为安全回退（`try/finally` 的编译器 v1 限制、`useBubblePhysics` 因内联 eslint-disable 被有意排除）。
- 手写 `useMemo`/`useCallback` 全部保留；文档补充范围调整方式与 `'use no memo'` 逃生舱（PROJECT.md / AGENTS.md）。
- 已通过 `npm run lint`、`npm test`（187 项，跑编译后代码）、`npm run build` 和 `npm run test:e2e`（18 项，含编译后的 stats/trend 实机路径）验证。

## 2026-07-04 - 重设计主题配色（Macke 除外）

- 五套主题按画家视觉语汇重新设计调色板：Matisse（柠檬黄/韦罗内塞绿/钴蓝/灰玫瑰/纸灰）、Matisse 2（祖母绿/靛蓝/深海军/青瓷蓝/雾靛灰）、Mondrian（镉黄/深胭脂红/群青/画廊灰/格线黑）、Kandinsky（橙/紫红/石油蓝/玫瑰粉/淡丁香灰）、Miro（明黄/天青/朱红/草绿/墨黑）；Macke 保持不变。
- 修复原配色的三处结构问题：Mondrian 与 Kandinsky 共用同一强调色（#ef4444）、Matisse 强调色与 Macke 珊瑚色近乎重复、部分 receivable 色过浅在气泡/图表中发虚。
- 六套主题强调色（invest，即 `--primary`）现分属六个色相族：viridian 绿 / 靛蓝 / 珊瑚 / 胭脂红 / 紫红 / 天青，主题间辨识度显著提升。
- 全部配色经脚本校验：按应用自身亮度阈值（0.62）确认每个色块的前景文字色，主题内与主题间强调色两两距离达标（仅保留 Macke 原有的一处既有近似对）。
- 同步 `index.css` 六个 `[data-theme]` 的 `--primary` 首屏回退值（此前全部与实际主题色脱节），`:root` 基础值对齐默认主题 Matisse 2。
- 已通过 `npm run lint`、`npm test`、`npm run build` 和 `npm run test:e2e`（18 项）验证。

## 2026-07-04 - 全局动效精细化与流畅度优化

- 动效词汇表（`src/lib/motionPresets.ts`）全面扩充：新增 emphasized/silk/exit/overshoot 缓动、snappy/gentle/bouncy/sheet 弹簧、tap 触感预设与 stagger 编排工具（`staggerDelay`、`cardEntranceAt` 等），所有旧导出保持兼容。
- 全局稳定性：App 外层包裹 `MotionConfig reducedMotion="user"`，配合 CSS `prefers-reduced-motion` 守卫，系统级减弱动态偏好下自动禁用位移动画；SegmentedControl/PillTabs 的 layoutId 改为按实例隔离，修复同屏多控件指示器互相飞行的隐患。
- 组件触感升级：底部抽屉改弹簧入场、加速离场；开关按钮加入挤压回弹；Toast 支持弹簧入场、layout 重排与上滑手势关闭；骨架屏改为流光扫过并按序浮现。
- 屏幕级编排：统计页卡片瀑布式入场，里程碑庆祝重做为徽章弹跳 + 辐射圆环 + 彩带粒子的一次性序列；引导页文案方向感知滑入、指示点弹簧变形；AI 助手消息气泡弹入并新增打字指示动画；资产列表/详情/新增账户各级列表统一弹簧错峰入场，弹出菜单统一弹簧展开、快速收起。
- 气泡物理优化：固定 60Hz 步长并限制追帧时间（高刷屏/后台切换后表现一致），提高碰撞解算迭代，新气泡按黄金角环绕中心绽放入场，新增 NaN/越界位置兜底；减弱动态偏好下环境漂移自动归零。
- E2E 稳定性：修复 Windows 无头 WebKit 下 `toBeHidden` 轮询被页面节流饿死导致的偶发失败（详见 TROUBLESHOOTING.md），断言改用 `expect.poll` 计数。
- 已通过 `npm run lint`、`npm test`（187 项）、`npm run build` 和 `npm run test:e2e`（18 项）验证。

## 2026-04-25 - 金额输入内置加减计算

- 修改余额和转账金额页面支持通过 `+`、`-`、`AC` 按键录入计算过程。
- 金额输入框保留计算过程，并在下方实时显示最终计算结果。
- 保存业务数据时仍只写入计算后的金额，历史记录结构不变。
- 新增金额表达式解析和单元测试，避免使用通用脚本执行。
- 已通过 `npm run lint`、`npm test` 和 `npm run build` 验证。

## 2026-04-25 - 账户详情页展开动画平滑处理

- 来源账户卡片改为完整共享布局变形，让详情页展开时从卡片过渡得更连续。
- 来源卡片内容在打开详情页时稍微延后淡出，避免过渡中出现空白帧。
- 详情页头部和主体内容更早淡入，减少外壳展开完成后内容突然出现的感觉。
- morph 打开时不再播放背景模糊动画，并降低布局弹簧强度，减少 PWA 和移动端渲染路径下的闪动。
- 已通过 `npm run lint`、`npm test` 和 `npm run build` 验证。
