# Ratio 项目地图

这份文档给 AI 代理和新维护者建立完整项目上下文：不止「文件在哪」，还包括「为什么这样设计」和「改动时会踩到什么」。面向用户的安装、部署说明以 `README.md` 为准；最短规则清单见 `AGENTS.md`；已知坑见 `TROUBLESHOOTING.md`。

## 如何使用本文档

- 改数据/金额/备份/云同步 → 读「领域模型」「本地存储：内核与键」「备份」「云同步与后端」。
- 改页面交互/动画 → 读「前端架构」全部小节，尤其「资产首页」「动效系统」。
- 改构建/PWA → 读「懒加载与分包」。
- 不确定从哪下手 → 直接查「变更导航」表。

## 一句话定位

Ratio 是一个本地优先的个人资产/负债管理 PWA。核心数据保存在浏览器本机（IndexedDB 为权威存储，localStorage 兜底，见「本地存储：内核与键」），可选配一个 Node 后端用于云备份、AI 代理、遥测和管理控制台。

三个贯穿全局的设计决策：

1. **本地优先**：无后端时功能完整；后端只做备份/代理/遥测，永远不是数据的唯一权威。
2. **快照优先于流水**：趋势和统计基于每日 `snapshots`（净资产/分组余额的时间序列），而不是逐笔交易。`accountOps` 是操作历史，`ledger` 是可选补充明细，两者都不承诺完整覆盖收支。
3. **移动端手感**：UI 按 420px 手机框架设计，动效密度高但遵守统一词汇表；系统「减弱动态」偏好被三层机制尊重（见「动效系统」）。

## 技术栈

- 前端：React 19、TypeScript、Vite/Rolldown、Tailwind CSS 4、Framer Motion 12、lucide-react。
- 图表/可视化：Recharts（趋势/统计）、Matter.js 0.20（气泡物理）。
- AI 聊天渲染：react-markdown、remark-gfm。
- 测试：Vitest + jsdom + Testing Library；Playwright 端到端（chromium / mobile-chrome / mobile-safari 三项目）。
- 后端：Node.js 20 原生 `http` 服务，无框架依赖。
- PWA：`vite-plugin-pwa`（generateSW），manifest 和图标在 `public/`。
- 部署：GitHub Pages 发布前端；Docker Compose 部署可选后端。

## 常用命令

```bash
npm ci
npm run dev        # http://localhost:5173
npm run build      # tsc -b && vite build
npm test           # Vitest --run（25 文件 / 187 用例；数字随开发漂移，量级异常时警惕环境问题）
npm run lint       # eslint .
npm run test:e2e   # Playwright（会自行 build + preview 在 127.0.0.1:4173）
```

后端本地/服务器启动：

```bash
cp .env.example .env
docker compose up -d --build   # 后端地址 http://localhost:8787
```

## 顶层目录

```text
.
├── src/                    # React 前端源码
│   ├── components/         # 共享组件（含物理引擎 hook、底部抽屉、AI 助手）
│   ├── screens/            # 页面（stats/ 子目录为统计卡片群）
│   ├── lib/                # 领域逻辑、存储、动效预设、hooks（测试与源码同目录）
│   └── test/               # Vitest 全局 setup
├── server/                 # 可选云端后台，Node 20 原生 http
├── public/                 # PWA manifest、图标和静态资源
├── e2e/                    # Playwright 端到端测试
├── .github/workflows/      # GitHub Pages 构建发布
└── docker-compose.yml      # 后端 Docker Compose 配置
```

## 前端架构

### 应用编排（src/App.tsx）

- 全局包裹 `<MotionConfig reducedMotion="user">`：系统减弱动态偏好下自动禁用位移/布局动画（透明度保留）。
- 四个底部 Tab：`assets`（常驻首包）与 `trend` / `stats` / `settings`（React.lazy 懒加载，切换带方向感知的滑动过渡）。看过引导页后在空闲回调里预热三个懒加载模块。
- 主题切换：`handleThemeChange` 创建全屏 bloom 过渡覆盖层（脉冲环 + 径向扩散 + 颜色 wash），用两个定时器编排「先播动画 → 中途应用 `data-theme` 与 CSS 变量 → 结束移除覆盖层」。`SettingsScreen` 通过 `onThemeChange(id, origin)` 上报点击坐标作为扩散原点——改主题流程时不要破坏这个坐标约定。
- 账户详情 `AccountDetailSheet` 挂在 App 层：从资产列表行进入时走 `sheetMotion="morph"`（共享 `layoutId`，行卡片变形为抽屉），其他入口走 `slide`。
- 每日快照同步（`useDailySnapshotSync`）、云自动同步、遥测都在这里初始化。
- `main.tsx` 在 App 外层挂根级 `RootErrorBoundary`：渲染崩溃不再白屏，兜底界面提供「刷新 + 导出数据备份」（数据在 localStorage，渲染崩溃不伤数据）。`useLocalStorageState` 写入失败（配额满/隐私模式）默认经 `emitAppToast` 提示用户（30s 节流）；`lib/overlay.ts` 的 `emitAppToast` 是 React 树外发 toast 的统一入口（Provider 挂载前排队），toast 支持可选动作按钮。

### 资产首页：滚动驱动的形态变换（src/screens/AssetsScreen.tsx）

全项目最复杂的交互面。一个横向 snap 滚动器承载 4 个页面，同一组「分组色块」在页面间连续变形：

```text
Page 0        Page 1        Page 2        Page 3（按需挂载）
气泡图    →    占比图    →    账户列表   →   类型详情
(物理圆)      (堆叠矩形)     (卡片左侧色条)
```

关键机制：

- `scrollLeft` 是 framer `MotionValue`，除以页宽得到 `scrollIdx`（0~3 连续值）。所有形变都是 `useTransform(scrollIdx, ...)` 的纯插值，不经过 React 渲染，滚动期间零重渲染。
- `OverlayBlock`（每个分组一个）在三种几何间 lerp：气泡（圆心+半径来自物理引擎的 MotionValue）→ 占比矩形（`ratioLayout` 计算）→ 列表矩形（`measureListRects` 实测 DOM）。位置、尺寸、四角圆角、标签排版全部插值。
- 列表矩形靠 `ResizeObserver` + rAF 节流的 `measureListRects` 持续校准；色块按 `LIST_GROUP_ORDER` 顺序渲染，后者盖住前者向下延伸的部分，从而填住下一张卡片圆角处的缝隙——**渲染顺序即层叠约定，不要重排**。
- 气泡页运行态（物理开/关、碎片可见性）由 `scrollIdx` 阈值驱动且带迟滞（enable/disable 阈值不同），避免在页面边界抖动开关引擎。
- Page 3 按需挂载：`handlePickType` 挂载后滚过去，返回走「滚回列表 → `finishDetailClose` 卸载」，配 900ms 兜底定时器防止滚动事件丢失导致卡死。
- 初始化经 rAF 重试把滚动器锚定到列表页（Page 2），`skipInitialAnimation` 控制回访时不重播入场动画。

改这块的原则：几何计算（`ratioLayout`、`measureListRects`、corner 系列函数）互相咬合，动 UI 前先理解插值链路；只动 transform/opacity；e2e `ratio-breakdown.spec.ts` 覆盖占比页展开面板。

### 占比页展开面板（src/screens/AssetsRatioPage.tsx）

点击色块 → `RatioExpandedPanel` 从色块矩形弹簧生长到整个图表区，内部是分类型分段占比。两个精密约定：

- 面板收起后的首尾帧靠 `BlockLabelReplica` 与底层色块**逐像素对齐**（字号/布局分档逻辑复制自 `OverlayBlockLabels`），这是「几何敏感」的原因。
- 单一资产占满图表时，收起动画没有数值变化，framer 不触发 `onAnimationComplete`，靠 650ms 兜底定时器卸载面板——不要移除这个定时器。

### 动效系统

词汇表集中在 `src/lib/motionPresets.ts`，全局共享，禁止在页面里散落新的 magic number：

| 类别 | 导出 | 用途 |
| --- | --- | --- |
| 缓动 | `standardEase` / `expressiveEase` / `emphasizedEase` / `silkEase` / `exitEase` / `overshootEase` | 入场默认 / 大面积强调 / 屏幕级编排 / 微淡入 / 加速离场 / 回弹点缀 |
| 时长过渡 | `microTransition`(0.14) / `quickFade`(0.18) / `screenTransition`(0.3) / `cardEntranceTransition`(0.38) / `smoothTransition`(0.34) / `progressFillTransition`(0.7) / `exitTransition`(0.16) | 按语义选，不按喜好选 |
| 弹簧 | `softSpring` / `navSpring` / `snappySpring` / `gentleSpring` / `bouncySpring` / `sheetSpring` | 通用 / 底部导航 / 小控件 / 大表面 / 庆祝 / 抽屉（近临界阻尼） |
| 原语 | `fadeUp*` / `cardEntrance*` / `scaleIn*` / `subtleLift` / `tooltipExit` / `fadeCollapseExit` | initial/animate 配对 |
| 触感 | `tapPress` / `tapPressSoft` / `tapPressIcon` / `hoverLift` | whileTap / whileHover |
| 编排 | `staggerContainer` + `staggerItem`、`staggerDelay(i)`、`cardEntranceAt(i)` | 错峰入场，延迟封顶防长列表拖尾 |

硬性规范：

1. 只动 transform/opacity（box-shadow/filter 仅限一次性短促点缀）；列表增删用 `layout` 属性而不是动 width/height/top/left。
2. 离场必须快于入场（`exitTransition`/`exitEase`）。
3. `layoutId` 按实例唯一：`SegmentedControl`/`PillTabs` 用 `useId()` 隔离；跨组件 morph 用 `src/lib/layoutIds.ts` 的工厂（如 `accountDetailSheetLayoutId(accountId)`，列表行 → 详情抽屉共享）。
4. 反映持久化状态的控件加 `initial={false}`，避免挂载时误播动画。
5. 无限/环境动画必须被减弱动态偏好关闭。三层机制：App 层 `MotionConfig reducedMotion="user"`（framer 位移动画）、`index.css` 的 `prefers-reduced-motion` 全局守卫（CSS 动画/过渡）、`src/lib/useReducedMotion.ts`（JS 驱动的逻辑，如物理漂移、面板兜底时长）。新增动画归类到对应层。
6. CSS 侧缓动变量在 `index.css`（`--ease-out/-spring/-emphasized/-silk/-bounce-soft`）；骨架屏是流光扫过（`shimmerSweep`）+ 容器脉冲。

### 气泡物理（src/components/BubbleChartPhysics.tsx）

`useBubblePhysics(nodes, width, height, isActive, keepBurstsVisible)` 返回位置 MotionValue 映射与 `flick`/`burst` 交互：

- 引擎生命周期以 `nodesConfigHash`（id+半径集合）为键：数据金额变化不重建引擎，只有气泡集合/半径变化才重建，且重建时保留旧位置。matter-js 模块本身按需加载（`vendor-matter` 分包），加载完成前气泡停在初始位置、flick/burst 静默忽略。
- Runner 固定 60Hz 步长 + `maxFrameTime` 封顶：高刷屏和后台切换回来表现一致；`positionIterations: 8, velocityIterations: 6` 换取更平滑的圆形碰撞。
- 力场：漫游的中心吸引 + 微弱旋涡 + 每球随机相位漂移（减弱动态偏好下漂移归零，仅保留聚拢）。
- 交互：`flick` 甩动（速度钳制 + 邻域冲击波 + 聚拢加成），三连击 `burst` 炸成碎片、延时后自动合并回原球。
- 新气泡按黄金角环绕中心生成并向外轻推（绽放入场）；`afterUpdate` 里有 NaN/越界位置兜底，异常直接归位画面中心。
- `isActive=false` 时 Runner 停转（滑离气泡页即省电），但碎片存在时可由 `keepBurstsVisible` 维持运行到合并完成。

### 懒加载与分包（vite.config.ts）

- manualChunks：`ai-assistant`、`screen-trend`、`screen-stats`（含 `screens/stats/`）、`screen-settings`、`vendor-charts`（recharts）、`vendor-markdown`（react-markdown 全家桶）、`vendor-matter`（matter-js，物理引擎按需加载）。
- SW 更新采用 prompt 模式（`registerType: 'prompt'`，`skipWaiting: false`，`clientsClaim: true`）：新版本先 waiting，`src/pwa.ts` 弹「新版本已就绪」toast，用户点「立即更新」才接管并刷新；忽略则下次冷启动自然生效。更新检查在回到前台时触发（5 分钟节流 + 30 分钟兜底定时器），没有固定轮询。**不要改回 autoUpdate/skipWaiting**——那会在部署瞬间强刷正在输入的用户，也会复活首装 controllerchange 一类缺陷（见 TROUBLESHOOTING）。
- `modulePreload.resolveDependencies` 把这些懒块从预加载里过滤掉；Service Worker 对它们 `globIgnores` + `CacheFirst` 运行时缓存（`ratio-lazy-chunks-v1`）。
- 后台预热链（`App.tsx` 的 `scheduleBackgroundTabPreloads`）：settings → stats → trend → AI 从小到大串行预热，带 1.6s 交互静默门控——用户刚触摸过就不启动解析，避免大块脚本解析打断手势后的动画（诊断见 TROUBLESHOOTING.md「iOS PWA 首开」条目）。AI 分包唯一动态导入点在 `src/components/aiAssistantLoader.ts`。
- **纪律**：不要从首包代码（App/Assets 系列/共享组件）静态 import 上述模块或 recharts/react-markdown/matter-js，否则分包与预加载策略同时失效。`src/lib/motionPresets.ts` 体积极小，任意引用无妨。

### React Compiler（作用域限定）

`babel-plugin-react-compiler` 已启用，但**只编译懒加载屏幕树**（TrendScreen / StatsScreen / SettingsScreen / `screens/stats/` / AiAssistant）：

- 范围与理由集中在根目录 `react-compiler.shared.ts`：首包热路径是 MotionValue 驱动且已手工记忆化，整包编译会让首包 gzip +≈20KB（违反首包纪律）而收益甚微；懒屏幕（尤其统计卡片群，切区间/拖滑杆整树重渲染）收益真实，体积增长由 SW 缓存吸收。
- `vite.config.ts` 与 `vitest.config.ts` **必须共用** `reactCompilerBabelConfig`——单测跑的转换结果要与产物一致；调整范围只改 `react-compiler.shared.ts`。
- 逐文件编译/跳过审计：`node scripts/compiler-report.mjs`。已知跳过（安全，保持原样运行）：含 `try/finally` 的组件（编译器 v1 限制）与带内联 eslint-disable 的 `useBubblePhysics`（渲染期惰性初始化 Map，本就不该编译）。
- 逃生舱：文件内 `'use no memo'` 指令可让单个组件退出编译；产物验证可 grep `react.memo_cache_sentinel`（注意 React 运行时自身也含该符号，以体积增量为准）。
- 手写的 `useMemo`/`useCallback` 一律保留：被跳过的函数依赖它们，编译器也能理解它们。

## 领域模型

### 账户（src/lib/accounts.ts）

- `AccountGroupId`：`liquid` 流动资金、`invest` 投资、`fixed` 固定资产、`receivable` 应收款、`debt` 负债。
- `AccountTypeId`：现金、银行卡、基金、股票、房产、信用卡、贷款等具体类型，每个类型归属一个分组并带图标。
- `Account`：`id`、`type`、`name`、`balance`、`updatedAt`。余额一律非负；负债账户的 `balance` 表示欠款额度本身。

读写入口 `src/lib/useAccounts.ts`：从 `ratio.accounts` 读取并容错迁移旧数据；新增、改名、设余额、调余额、转账、删除；按分组汇总资产/负债/净资产。

金额规则集中在 `src/lib/money.ts`（规范化/加减）、`src/lib/moneyExpression.ts`（输入框内 `+`/`-` 表达式）、`src/lib/accountBalance.ts`（流向应用与负余额校验）、`src/lib/format.ts`（展示格式化）。不要在界面层新写金额算术。

### 账户操作（src/lib/accountOps.ts）

| kind | 语义 | 统计口径注意 |
| --- | --- | --- |
| `rename` | 改名 | 无金额影响 |
| `set_balance` | 余额校准/覆盖（before → after） | 差额不是收支 |
| `adjust` | **期间净变动汇总** | 不是单笔交易 |
| `transfer` | 账户间内部转移 | 不改变净资产，绝不能算收入/支出 |

存储与规范化在 `src/lib/accountOpsStorage.ts`，Hook 在 `src/lib/useAccountOps.ts`。编辑/删除历史操作时有「回滚」语义：只有当该账户此后没有更晚的 `set_balance` 校准时才回滚余额（`canRollbackBalance` 模式，详见 `AccountDetailSheet`）。

### 快照（src/lib/snapshots.ts）

- `Snapshot.date` 用 `YYYY-MM-DD`；每条含 `net`、`debt`、`cash`、`invest`、`fixed`、`receivable`，可附带当日账户列表（供「Top 变动账户」对比）。
- `buildSnapshot()` 从账户汇总当日快照；`upsertSnapshot()` 按日期覆盖并排序；`withAccountSnapshot()` 用当前账户补齐今日实时快照。
- `src/lib/useDailySnapshotSync.ts` 在存储可用时维护每日快照。**趋势/统计页面的数据源是快照**，不是操作流水。

### Ledger 明细（src/lib/ledger.ts、ledgerStorage.ts）

可选明细账：`Transaction.type` 为 `income`/`expense`，支出规范化为负数。可能不完整，只能作辅助证据——统计和 AI 分析不得假设它覆盖全部收支。

### 储蓄目标与统计派生

- `src/lib/savingsGoal.ts`：目标、目标日期、进度、多算法速度估算（recent-window / monthly-close / monthly-smoothed / long-window，`smart` 自动选择）。
- `src/lib/savingsGoalSimulation.ts`：目标模拟。
- `src/lib/snapshotDerived.ts`：从快照派生统计区间、增长、覆盖率。
- `src/lib/monthStart.ts`：统计月起始日；`src/lib/monthlyDisposable.ts`：月可支配估算。
- `src/lib/robustStats.ts`：稳健统计工具。

## 本地存储：内核与键

持久层是 `src/lib/storageKernel.ts`（**改存储行为前必读文件头注释**）：IndexedDB 为权威存储，启动时全量水合进内存、同步读写内存、异步批量落盘；IDB 不可用时整体回退为 localStorage 直读直写。要点：

- `main.tsx` 等 `storageKernel.ready` 后才挂载 React，组件树内的同步读一定读到权威数据。
- 首次以 IDB 模式启动时把 localStorage 的 `ratio.*` 全量导入 IDB 并写迁移标记；localStorage 旧副本冻结保留（旧版本回滚可用），此后不再更新——例外是 `ratio.colorMode`/`ratio.theme`（`BOOT_MIRROR_KEYS`）持续镜像回 localStorage，供 `public/color-mode-boot.js` 首帧同步读取。
- 跨标签同步走 BroadcastChannel（IDB 写不触发 `storage` 事件），收到广播后派发既有 storageEvents 自定义事件，hooks 无感知；localStorage 回退模式下仍靠原生 `storage` 事件。
- **写入后要整页刷新的路径（恢复备份、进出演示模式）必须先 `await storageKernel.flush()`**，否则最后一批写入可能未落盘就被刷新丢弃。页面隐藏（pagehide/visibilitychange）时内核会自动抢跑 flush。
- 按 `Storage` 接口消费的模块（backup/ai/demo/cloud）默认存储是 `appStorage` 适配器；jsdom 单测环境无 indexedDB，全局内核自动回退 localStorage 语义，测试无需感知。内核自身的测试（`storageKernel.test.ts`）用 `fake-indexeddb` 注入覆盖 IDB 模式。

主要键都以 `ratio.` 开头。备份默认包含 `ratio.*`，但**排除**云同步账号配置和 AI 隐私确认键。

| 键 | 用途 |
| --- | --- |
| `ratio.accounts` | 账户数组 |
| `ratio.accountOps` | 账户操作历史 |
| `ratio.snapshots` | 每日资产快照 |
| `ratio.ledger` | 可选收入/支出明细 |
| `ratio.savingsGoal` | 储蓄目标 |
| `ratio.savingsPaceAlgorithm` | 储蓄目标预测算法 |
| `ratio.monthStartDay` | 统计月起始日 |
| `ratio.monthlyEstimatedIncome` | 月收入估算 |
| `ratio.theme` | 当前主题（`matisse`/`matisse2`/`macke`/`mondrian`/`kandinsky`/`miro`/`random`） |
| `ratio.tourSeen` | 是否看过引导 |
| `ratio.hideAmounts` | 是否隐藏金额 |
| `ratio.accountSort.*` | 账户排序偏好（模式 + 各分组手动顺序） |
| `ratio.cloudSync` | 云同步设置（服务器、用户名、密码、开关）——不进备份 |
| `ratio.cloudSyncDirty` | 自动云同步脏标记 |
| `ratio.aiPrivacyAcceptedServerUrl` | 已确认 AI 隐私提示的服务器地址——不进备份 |
| `ratio.pendingToast.v1` | 页面刷新后待展示 toast |

组件读写统一走 `src/lib/useLocalStorageState.ts`（带 coerce 容错，底层已接内核）；跨组件同步靠 `src/lib/storageEvents.ts` 的自定义写事件。新增键必须提供 coerce/迁移，并检查是否应进备份与 AI 上下文。

## 备份（src/lib/backup.ts）

- schema 为 `ratio.backup.v1`。
- `ratio.cloudSync` 与 `ratio.aiPrivacyAcceptedServerUrl` 永不进入备份。
- 恢复失败会尝试回滚原本地数据。
- 比较备份时会规范化 `ratio.accountOps` 和 `ratio.ledger`，避免自动生成的 id 造成「内容相同却判不同」。

## 云同步与后端

前端云端 API 封装在 `src/lib/cloud.ts`，自动同步编排在 `src/lib/cloudSync.ts`（脏标记 + 最短间隔 30s + 冲突时暂停并提示）。

后端 `server/src/server.js`（Node 原生 `http`）：

| 端点 | 用途 |
| --- | --- |
| `GET /api/health` | 健康检查 |
| `POST /api/users` | 注册账号，可受邀请码限制 |
| `GET /api/me` | 认证检查 |
| `GET /api/backup/meta` | 云备份元信息 |
| `GET /api/backup` | 下载云备份 |
| `PUT /api/backup` | 上传云备份，带 `expectedUpdatedAt` 冲突检测 |
| `GET /api/ai/status` | AI 代理配置状态 |
| `POST /api/ai/chat` | AI 代理，支持非流式与流式转发 |
| `POST /api/telemetry` | 提交遥测 |
| `GET /api/telemetry/recent` | 当前用户近期遥测 |
| `/admin`、`/api/admin/*` | 管理控制台（`RATIO_ADMIN_USERNAME`/`RATIO_ADMIN_PASSWORD`） |

数据写到 `RATIO_DATA_DIR`（Compose 映射 `/data` 卷）；密码 PBKDF2-SHA256 600k 迭代，旧记录（如 160k）在下次登录成功时透明重哈希升级；备份按用户目录保存。管理台实现在 `server/src/adminConsole.js`。

## AI 助手数据口径

上下文构建在 `src/lib/ai.ts`：

- 默认只发送派生财务摘要、最近快照、最近账户操作和最近 ledger 明细。
- 永不发送云同步账号密码；前端不保存 AI Base URL、API Key 或模型参数（全部由后端统一配置）。
- 聊天历史在 `sessionStorage` 的 `ratio.ai.chat.session.v1`，不进云备份。
- 系统提示要求 AI 只基于 JSON 证据回答，并区分「数据确认」和「推测」。

修改 AI 相关功能时同步检查：`src/lib/ai.ts`（上下文/流式解析）、`src/components/AiAssistant.tsx`（对话 UI/隐私确认）、`src/lib/cloud.ts`（API 封装）、`server/src/server.js`（上游 URL 安全检查、限流、流式透传）。

## 测试布局

单元/组件测试（Vitest + jsdom）：

- 与源码同目录，命名 `*.test.ts(x)`；全局 setup 在 `src/test/setup.ts`；`vitest.config.ts` 排除 `e2e/`。
- 组件测试通过可见文本、role/aria 查询 DOM——改文案或语义属性会直接打破测试。
- 纯函数不变量用 fast-check 性质测试（`percent`、`money`、`ratioBreakdown` 已有首批），新增分配/金额类算法时优先补性质而非枚举用例。

持续集成（`.github/workflows/ci.yml`）：PR 与 main push 上跑 lint + 单测 + 构建 + Playwright chromium 项目；mobile-safari 只在本地跑（原因见 TROUBLESHOOTING.md）。

端到端（Playwright）：

- `e2e/app-smoke.spec.ts` 主路径冒烟；`e2e/ratio-breakdown.spec.ts` 占比页展开面板全流程。
- 3 个项目（chromium / mobile-chrome / mobile-safari）× 全部用例；数据种子通过 `addInitScript` 直写 `localStorage`，并阻止 Service Worker 注册（其激活自刷新会打断动画断言）。
- webServer：`npm run build && npm run preview`，端口 4173，`reuseExistingServer` 本地开启——**残留的 preview 进程会让新代码跑旧产物**，结果可疑先清端口。
- Windows 无头 WebKit 会节流空闲页面，`toBeHidden()` 的页内 rAF 轮询会被饿死；等待卸载一律用 `expect.poll(() => locator.count()).toBe(0)`。完整分析见 `TROUBLESHOOTING.md`。

变更时的测试策略：

- 改金额、账户、快照、备份、云同步、AI 上下文 → 优先补/跑对应 `src/lib/*.test.ts`。
- 改页面交互 → 跑相关组件测试；影响主路径或占比页 → 跑 Playwright。
- 改动画 → 保证 lint + 单测 + e2e 全绿即可，动画本身无专项断言，但测试对文本/结构敏感。

## 变更导航

| 需求类型 | 优先查看 |
| --- | --- |
| 新增账户类型/分组 | `src/lib/accounts.ts`、图标/UI、统计与 AI 汇总是否同步 |
| 金额计算 | `src/lib/money.ts`、`accountBalance.ts`、`format.ts`、`moneyExpression.ts` |
| 资产页视图 | `src/screens/AssetsScreen.tsx`、`AssetsRatioPage.tsx`、`AssetsListPage.tsx`、`AssetsTypeDetailPage.tsx`、`BubbleChartPage.tsx` |
| 账户详情/操作历史 | `src/components/AccountDetailSheet.tsx`（回滚语义在这里） |
| 趋势/统计 | `src/screens/TrendScreen.tsx`、`StatsScreen.tsx`、`src/screens/stats/`、`src/lib/snapshotDerived.ts`、`savingsGoal.ts` |
| 全局动效/手感 | `src/lib/motionPresets.ts`、`src/index.css`、`src/lib/useReducedMotion.ts`，规范见「动效系统」 |
| 气泡物理 | `src/components/BubbleChartPhysics.tsx`、`src/screens/BubbleChartPage.tsx` |
| 设置/备份 | `src/screens/SettingsScreen.tsx`、`src/lib/backup.ts`、`src/lib/cloud.ts` |
| 云同步 | `src/lib/cloudSync.ts`、`cloud.ts`、`server/src/server.js` |
| AI 助手 | `src/lib/ai.ts`、`src/components/AiAssistant.tsx`、`server/src/server.js` |
| PWA/构建/分包 | `vite.config.ts`、`src/pwa.ts`、`public/manifest.webmanifest` |
| 后端管理台 | `server/src/server.js`、`server/src/adminConsole.js` |
| 引导页 | `src/screens/TourScreen.tsx` |
| Toast/确认框 | `src/components/OverlayProvider.tsx`、`src/lib/overlay.ts` |

## 不变量与危险区

改动前逐条对照：

1. 本地优先：核心资产数据必须在无后端时可用。
2. 凭据与密钥（云同步账号密码、AI Key/Base URL/模型配置）不进前端备份、不进 AI 请求上下文。
3. `adjust` ≠ 单笔交易；`transfer` ≠ 收入/支出；统计与 AI 口径以快照为准。
4. 金额写入前经 `money.ts` 规范化；任何路径都不允许产生负余额（`accountBalance.ts` 校验）。
5. `localStorage` 读写保留 coerce/迁移；修改共享数据结构时同步更新备份、AI 上下文、统计和测试。
6. 懒加载分包纪律：不把 trend/stats/settings/AI/recharts/markdown 拉回首包。
7. 动效规范：只动 transform/opacity、离场快于入场、`layoutId` 按实例唯一、无限动画受减弱动态约束（三层机制见「动效系统」）。
8. 几何敏感：`AssetsScreen` 插值链与 `AssetsRatioPage` 标签复刻是逐像素咬合的，微调前先读「前端架构」对应小节；`RatioExpandedPanel` 的 650ms 兜底定时器不可移除。
9. 测试兼容：可见文本、role/aria、`data-testid` 是测试 API 的一部分。
10. UI 面向移动端 PWA：注意安全区（`--safe-*`）、底部导航高度（`--bottom-nav-height`）、触摸手势与 `touch-action` 声明。
