# 排错与记录

本文件记录项目开发过程中遇到的典型问题与处理思路，便于后续快速定位。

## iOS 原生壳：打开即闪退

现象：点图标闪一下回桌面。底部导航消失那次修复之前没有。

原因：

- `CAPBridgeViewController.view` 就是 WKWebView。`ensureNavBar` 把 `UIGlassEffect` 加在它上面，合成器崩溃。更早 ensureNavBar 从未调用，所以「没栏也没崩」。
- storyboard `customClass=RatioBridgeViewController`：IB 启动时解析不到 Swift 类会直接杀进程。
- `setValue:forKey: "_useSystemAppearance"` 在键不存在时抛 NSException。

处理：玻璃栏挂 window、storyboard 用空 VC、SceneDelegate 代码创建桥接 VC、私有 API 走 IMP。见 CHANGELOG 2026-08-23 闪退条。

## iOS 原生壳：系统液态玻璃不出现 / 仍是 CSS 毛玻璃


现象：

- iPhone 应用底部仍是网页那条 pill，或栏在但只是一块雾面圆角，没有系统那种流动折射。
- 设置里打开「系统液态玻璃」后卡片外观完全不变。

原因：

- Capacitor 8 自定义插件必须 **原生 `registerPluginInstance` + JS `registerPlugin('LiquidGlass')`**。只读 `window.Capacitor.Plugins.LiquidGlass` 不会自动出现。
- `Main.storyboard` 若仍是 `CAPBridgeViewController`，同时 SceneDelegate 再 new 一扇 window，会出现两套 WKWebView，插件挂在看不见的那套上。
- `UIGlassEffect` 子视图必须加在 `contentView`；`masksToBounds` 会裁掉液态高光；effect 要在动画块里赋。
- 网页 `-apple-visual-effect` 默认被 WebKit 丢掉，除非原生打开私有偏好 `_useSystemAppearance`。Safari / 主屏幕 PWA 开不了。系统「降低透明度 / 增强对比度」也会把液态玻璃关掉。

处理：

- 代码侧已按上面全部接通（见 CHANGELOG 2026-08-23）。改完必须用 **Xcode 26+ 重新签名安装**；CI 的 unsigned IPA 不能装真机，旧包仍是修之前的行为。
- 网页卡片要走系统材质：在应用里打开设置 → 系统液态玻璃。浏览器里这个开关会保存，但当前环境不生效。

## Capacitor 构建：Windows 上 `cap sync` 生成的 SPM Package.swift 路径是反斜杠

现象：

- 在 Windows 上 `npx cap add/sync ios` 后，`ios/App/CapApp-SPM/Package.swift` 里插件依赖写成 `path: "..\..\..\node_modules\@capacitor\haptics"`（反斜杠）。

原因：

- Capacitor CLI 用 Node 的 `path.join` 拼路径，在 Windows 上产出反斜杠；SwiftPM 在 macOS 上不会把 `\` 当分隔符，按字面量找目录，解析失败。

处理：

- 已把仓库内的 `Package.swift` 手工修正为正斜杠（`../../node_modules/@capacitor/haptics`）。CI 的 macOS runner 上 `cap sync` 会按平台重写，无影响；仓库版本保证 Mac 上 clone 后不跑 sync 也能直接开 Xcode 构建。
- 今后在 Windows 上跑过 `cap add` 或重装插件后，检查该文件是否有反斜杠回归，有则改回正斜杠再提交。

## Capacitor iOS：`npm run check:bundle` 在 CAPACITOR_BUILD=1 模式下红灯

现象：

- `CAPACITOR_BUILD=1 npm run build && npm run check:bundle` 报「missing dist/sw.js」。

原因：

- `scripts/check-bundle-budget.mjs` 末尾强制断言 `dist/sw.js` 存在——那是 Web 产物（PWA SW 服务版本产物）的防回归门禁；Capacitor 模式有意禁用 SW（原生 app 更新走 App Store，SW 提示/缓存无意义），不产 sw.js。

处理：

- 该模式不跑 `check:bundle`。Web 构建（默认 `npm run build`）的 SW 门禁保持不变，不要改成「有 sw.js 也行」——那会削弱 Web 模式防回归价值。

## Capacitor iOS：unsigned IPA 无法安装到真机

现象：

- GitHub Actions 产出的 unsigned IPA 在 iPhone 上安装失败。

原因：

- iOS 要求应用至少 ad-hoc 签名才能安装；`CODE_SIGNING_ALLOWED=NO` 归档的包没有任何签名，仅能归档留档、给以后补签名，或在模拟器里跑（模拟器不校验签名）。

处理：

- unsigned 流水线用于验证构建链路与归档。真机安装需要签名：本地 Mac + 免费 Apple ID（Xcode 里自动签名，7 天有效期）或付费开发者账号（CI 签名，见 `.github/workflows/build-ios.yml` 的「签名切换」注释）。

## iOS 27 独立模式：首页顶部多出巨大空块（env 顶部过大上报）

现象：

- 换用 `black-translucent` 状态栏样式并部署后，iPhone 17 Pro Max（iOS 27）主屏 PWA 首页顶部出现一大块空白，「我的净资产」标题被压到屏幕约 15% 高度处（~148pt）；底部安全区表现正常。
- 代码审计确认顶部避让只应用了一次（首页头部 `pt-[calc(var(--safe-top)+24px)]`，壳层不 pad），排除样式叠加。

原因：

- 该设备状态栏区实际高度 ~62pt，按截图反推 `env(safe-area-inset-top)` 实际生效值 ≈124pt（62+24 应得 86pt，实测 148pt ≈ 124+24）——iOS 27 独立模式 + `black-translucent` 下 env 顶部按约 2 倍上报。
- 同机 `default` 状态栏样式则是反向 bug：内容照样画到状态栏下（沉浸式），env 顶部却恒为 0（标题被时钟遮住的原始事故）。两个方向的错误上报都存在，env() 不可裸信。

处理（2026-08-19）：

- `src/index.css` 的 `--safe-top`/`--safe-bottom` 定义处加钳制：`min(env(safe-area-inset-top, 0px), 72px)` / `min(env(safe-area-inset-bottom, 0px), 48px)`。上限 = iPhone 真实最大值（状态栏区 ~62pt / Home Indicator ~34pt）加余量，正常设备不受影响，过大上报被封顶。`index.html` 启动骨架屏的 padding-top 同款钳制。
- env 恒为 0 的反向 bug 仍由 `src/lib/safeArea.ts` 的兜底覆写处理（触发条件量 env 原始值，与钳制互不干扰）；JS 几何计算读 `--safe-top` 生效值，自动跟随钳制。

## AI 助手点击无反应/闪一下（vendor 分包 import 环路，TypeError: i is not a function）

现象：

- 线上与本地 build 一致：点 AI 按钮只闪一下又变回按钮，面板永远打不开；无任何 UI 报错。
- 控制台：`TypeError: i is not a function at vendor-markdown-*.js:1`，发生在懒分包**顶层求值**阶段，动态 import reject 被 `LazyLoadBoundary` 捕获、渲染回兜底按钮——旧版兜底是 `location.reload()`，表现为「点一下整页闪一下」。
- 全套 e2e 绿灯照发：当时没有任何用例点过 AI 按钮，坏产物一路上线。

原因：

- `advancedChunks` 的 vendor-markdown 组正则只圈了 react-markdown 依赖树的一部分（`includeDependenciesRecursively: false` 下漏网模块不会被吸附进组）。漏掉的 CJS 桥（如 `style-to-js`）被 rolldown 放进了消费它的 `ai-assistant`/`AiAssistant` 分包；而 vendor-markdown 的顶层代码（hast-util-to-jsx-runtime 的 `__toESM(require_styleToJs(), 1)`）要在**模块求值时**回头调它——两个分包互相 import 成环，作为依赖先求值的 vendor-markdown 拿到的是对方尚未初始化的 `var` 绑定（undefined），直接 TypeError。
- 环路是否炸取决于「跨分包引用是否在顶层求值期被调用」，纯运行期互调不会炸——所以这个结构性缺陷可以长期潜伏，直到某次依赖升级/重排把一个 init-time 调用挪到环上。

处理（2026-08-19）：

- vendor-markdown 的 test 正则覆盖 react-markdown + remark-gfm 的**完整**传递依赖闭包（97 包，按前缀归并；用 `node -e` 沿 package.json dependencies 递归可重新生成名单）。
- `check:bundle` 新增 vendor 分包环路门禁：沿 dist 产物的静态 import 图做可达性检查，任何 `vendor-*` chunk 能绕回自身即判失败——依赖升级引入新漏网包时构建期直接拦截。
- 新增 `e2e/ai-assistant.spec.ts`：点按钮断言面板真的打开 + 捕获分包求值错误，堵住「懒加载链路零覆盖」的洞。

## PWA 首次安装后数秒自动整页刷新（并连带 CI e2e 失败）

现象：

- CI（ubuntu 双核）上 `app-smoke.spec.ts` 两个聚焦用例失败，本地 Windows 全绿；本地用 CDP `Emulation.setCPUThrottlingRate` 3x 节流可复现。
- 失败形态诡异且不定点：元素先可见后「消失」、`dispatchEvent` 的事件在 document 捕获层完全无踪、页内探针日志整体丢失、expect 调用日志出现 `navigated to …/Ratio/`。
- 真机侧对应体验：新用户首次打开（或清数据后首开）几秒后应用无故整页刷新一次。

原因：

- `src/pwa.ts` 在 `controllerchange` 上无条件 `location.reload()`。SW 配置了 `clientsClaim: true`，**首次安装**激活后接管未受控页面同样会触发一次 `controllerchange`——此时页面本就是最新版本，刷新纯属打断。快机器上 SW 安装极快，刷新落在测试早期的等待里无人察觉；慢机（CI/节流/低端真机）上 SW 安装需数秒，刷新正好砸进交互中段：React 状态清零（展开态、详情页），`addInitScript` 重跑换掉页内日志数组，一切「灵异现象」由此而来。
- 排查此类「元素先在后无」时，优先怀疑整页刷新：在 `addInitScript` 里挂 document 捕获层 click 记录器 + MutationObserver，若最终读回的日志缺少早期标记，即页面中途重载。

处理：

- `src/pwa.ts`：仅当页面加载时已存在 `navigator.serviceWorker.controller`（即本次 `controllerchange` 是新版本替换）才刷新；首次接管静默消费，之后再武装真正的更新重载监听。更新路径行为不变。
- e2e 帮助函数改为确定性写法（`e2e/app-smoke.spec.ts`）：等待首页真实初始化（fallback 首页换乘完成、`aria-hidden` 解除后「展开流动资金占比详情」才对 `getByRole` 可见）再交互；`openAccountDetail` 逐步断言目的地状态、按展开态幂等；分组卡新增稳定 `aria-label="account group ${id}"` 取代按金额文本的模糊过滤。
- 观测补强：`playwright.config.ts` CI 上 `retries: 1`（首个重试自动带 trace），CI 工作流失败时上传 `playwright-report/` 与 `test-results/` 工件，避免再出现「CI 独有失败无日志可查」。
- 有意不在 e2e 里屏蔽 Service Worker（`serviceWorkers: 'block'`）：这次正是 e2e 逮住了真实 PWA 缺陷，保留 SW 让这类回归继续可见。

后续（2026-07-05）：

- PWA 更新流程已重做为 prompt 模式（`registerType: 'prompt'` + toast 确认更新，见 CHANGELOG 与 PROJECT.md「懒加载与分包」），`src/pwa.ts` 的 `controllerchange` 重载逻辑整体删除——上面「处理」第 1 点已被该重构取代；本条保留是因为诊断方法（捕获层日志 + MutationObserver 判定页面中途重载）仍然适用。

## GitHub Pages 部署偶发「Deployment failed, try again later」

现象：

- `Deploy to GitHub Pages` 工作流 build 成功，`actions/deploy-pages` 的 Deploy 步骤在创建部署后首次轮询即失败，注解只有「Deployment failed, try again later」；近几次推送约一半概率出现，与提交内容无关。

原因：

- Pages 服务端瞬时错误（部署创建成功但状态机立刻报失败），非仓库配置问题：同一工作流、同一配置在相邻提交上成功/失败交替，失败运行重跑即成功。

处理：

- 用 `POST /repos/{owner}/{repo}/actions/runs/{run_id}/rerun-failed-jobs` 重跑失败的 deploy job（或在 Actions 页面点 Re-run failed jobs）即可，无需改动工作流。
- 若未来失败率明显升高再考虑在 deploy job 里加自动重试循环；当前保持简单。

## iOS PWA 首开：占比页展开动画丢帧/跳帧

现象：

- 冷启动 PWA 后立刻滑到占比页点开分类详情，展开弹簧动画偶发直接跳到终态；先访问一次趋势/统计再回来就流畅。

原因：

- 首开后台会预热懒加载分包（趋势/统计/设置/AI，共 700KB+ 原始体积），`requestIdleCallback` 只知道「当前帧有空闲」，不知道一个手势驱动的动画正要开始——用户点开详情的瞬间恰是 rIC 眼里的空闲点，此时解析 300KB+ 脚本会阻塞主线程数百毫秒，而展开动画按几何约束只能动 x/y/width/height（JS rAF 驱动，主线程受阻即跳帧）。访问过趋势/统计后分包已解析完毕，故恢复流畅。

处理（`src/App.tsx` 的 `scheduleBackgroundTabPreloads`）：

- 预热链从小到大逐块串行（settings → stats → trend → AI），块间留 1.2s 空隙。
- 交互静默门控：距最近一次 `pointerdown`/`touchmove` 不足 1.6s 时不启动任何分包解析，改为重排稍后再试，保证手势后的动画窗口不被解析打断。
- AI 分包也纳入链尾统一治理，顺带消除「首次点 AI 按钮时面板动画被解析卡住」的同类问题（唯一动态导入点在 `src/components/aiAssistantLoader.ts`）。

## 单测卡死：vitest fork 池在本机高负载下全体冻结

现象：

- `npm test` 长时间无输出不结束；所有 vitest worker（node 进程）CPU 累积到 ~50s 后完全停止增长（用 `Get-Process node | Select Id,CPU` 间隔 60s 采样两次对比确认），既不推进也不超时。
- 同一套测试用 `npx vitest --run --no-file-parallelism` 串行跑全部通过，单个文件单独跑也正常——排除代码死锁。

原因：

- 本机（开发机常驻安卓模拟器与大量 node 常驻进程）高负载时，默认 fork 池并行拉起 8 个 jsdom 环境（每个启动约 20s）出现进程间死锁；与测试内容无关。
- 判定「慢」还是「卡死」看 CPU 增量而不是等待时长：增量为零即卡死，重跑无意义。

处理：

- `vitest.config.ts` 已固定 `maxWorkers: 2`，默认 `npm test` 直接走稳定配置；当前全量约 2-3 分钟。
- 若极端高负载下仍冻结，用 `npx vitest --run --no-file-parallelism` 串行验证（环境启动占大头，总时长会明显增加），并先关闭模拟器等大户。

## E2E 不稳定：Windows 无头 WebKit 下 `toBeHidden` 偶发超时

现象：

- `ratio-breakdown.spec.ts` 在 `mobile-safari` 项目下偶发（负载相关，可到 3/3 复现）在“收起面板”断言超时；chromium / mobile-chrome 稳定通过。
- 页面内日志证明应用状态机完全正确：`requestClose → 兜底定时器 → onClosed → setExpanded(null)` 全部按时执行，但 DOM 节点在断言窗口内迟迟不消失。
- 任何从 Node 侧发起的 `page.evaluate` 都会“泵”事件循环，节点随即被移除——因此加了探针/trace 就必现通过（海森 bug）。

原因：

- Windows 无头 WebKit 在页面空闲时会节流渲染管线，`expect(locator).toBeHidden()` 的页内轮询依赖 rAF，被一起饿死；应用代码本身没有问题。

处理：

- 对“面板已卸载”类断言改用 `expect.poll(() => locator.count()).toBe(0)`：每次轮询都是 Node 侧发起的新求值，不受页面节流影响（本 spec 的 `gotoRatioPage` 早已用同样手法等待滚动位置）。
- 不要为此改动应用侧交互代码；真实 iOS Safari 不受影响。

## 构建失败：使用 `motion` 但未导入

现象：

- `npm run build` 在 `tsc -b` 阶段报错，提示 `motion`（或 `AnimatePresence`）未定义。

处理：

- 确认组件文件已从 `framer-motion` 显式导入对应符号，例如：
  - `import { motion, AnimatePresence } from 'framer-motion'`

## Lint 阻断：React Hooks 相关规则

### `react-hooks/rules-of-hooks`

现象：

- Hook（如 `useMemo` / `useEffect`）在条件分支后调用，导致 “Hook 调用顺序不一致”。

处理：

- 保证所有 Hook 始终在组件顶层按固定顺序调用；分支逻辑放到 Hook 内部（例如在 `useMemo` 里 `return` 不同值），或把 early return 放在所有 Hook 之后。

### `react-hooks/static-components`

现象：

- 在 render 过程中动态创建/切换组件引用（例如 `const Icon = getIcon(type)`），被判定为“每次渲染创建新组件”。

处理：

- 使用稳定的组件引用或直接 `createElement(Component, props)`。

### `react-hooks/exhaustive-deps`

现象：

- `useEffect` 依赖数组不完整导致警告/错误。

处理：

- 补全依赖项；必要时重构以减少对闭包变量的隐式依赖。

