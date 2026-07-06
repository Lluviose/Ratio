# Changelog

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
