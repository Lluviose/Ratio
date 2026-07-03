# Ratio 项目地图

这份文档给 AI 代理和新维护者快速建立项目上下文。面向用户的安装、部署说明仍以 `README.md` 为准。

## 一句话定位

Ratio 是一个本地优先的个人资产/负债管理 PWA。核心数据保存在浏览器 `localStorage`，可选配一个 Node 后端用于云备份、AI 代理、遥测和管理控制台。

## 技术栈

- 前端：React 19、TypeScript、Vite/Rolldown、Tailwind CSS、Framer Motion、lucide-react。
- 图表/可视化：Recharts、Matter.js。
- AI 聊天渲染：react-markdown、remark-gfm。
- 测试：Vitest + jsdom + Testing Library，Playwright 端到端冒烟测试。
- 后端：Node.js 20 原生 `http` 服务，无 Express/Koa。
- PWA：`vite-plugin-pwa`，manifest 和图标位于 `public/`。
- 部署：GitHub Pages 部署前端；Docker Compose 部署可选后端。

## 常用命令

```bash
npm ci
npm run dev
npm run build
npm test
npm run lint
npm run test:e2e
```

后端本地/服务器启动：

```bash
cp .env.example .env
docker compose up -d --build
```

默认前端开发地址是 `http://localhost:5173`，后端地址是 `http://localhost:8787`。

## 顶层目录

```text
.
├── src/                    # React 前端源码
├── server/                 # 可选云端后台，Node 20 原生 http 服务
├── public/                 # PWA manifest、图标和静态资源
├── e2e/                    # Playwright 端到端测试
├── .github/workflows/      # GitHub Pages 构建发布
├── README.md               # 用户向说明：运行、部署、功能概览
├── PROJECT.md              # 项目地图：给 AI 和维护者建立上下文
├── AGENTS.md               # AI 代理入口：最短规则和高风险点
├── TROUBLESHOOTING.md      # 已知问题和处理记录
└── docker-compose.yml      # 后端 Docker Compose 配置
```

## 前端入口与页面流

- `src/main.tsx`：挂载 React、加载全局样式/PWA，并处理移动端手势缩放、长按菜单和文本选择保护。
- `src/App.tsx`：应用主编排层。负责首屏引导、底部导航、页面懒加载、主题切换、每日快照同步、云同步初始化、遥测初始化和账户详情弹层。
- `src/screens/AssetsScreen.tsx`：资产首页容器，管理资产视图内的页面切换。
- `src/screens/AssetsRatioPage.tsx`：资产占比总览。
- `src/screens/AssetsListPage.tsx`：账户列表。
- `src/screens/BubbleChartPage.tsx`：资产气泡图。
- `src/screens/AddAccountScreen.tsx`：新增账户。
- `src/screens/TrendScreen.tsx`：资产趋势。
- `src/screens/StatsScreen.tsx` 与 `src/screens/stats/`：统计、储蓄目标、预测、里程碑等。
- `src/screens/SettingsScreen.tsx`：主题、备份恢复、云同步、AI、遥测等设置。
- `src/screens/TourScreen.tsx`：首次进入引导页。

`App.tsx` 会懒加载趋势、统计、设置和 AI 助手，`vite.config.ts` 中也为这些模块设置了手动分包和 PWA 缓存策略。

## 共享组件

- `src/components/AccountDetailSheet.tsx`：账户详情、改名、设余额、调整、转账和删除入口。
- `src/components/AiAssistant.tsx`：前端 AI 助手 UI、会话状态、流式响应展示。
- `src/components/LazyAiAssistant.tsx`：AI 助手懒加载包装。
- `src/components/BubbleChartPhysics.tsx`：气泡图物理布局。
- `src/components/BottomSheet.tsx`：通用底部抽屉。
- `src/components/OverlayProvider.tsx` 与 `src/lib/overlay.ts`：全局 toast/覆盖层事件。
- `src/components/SegmentedControl.tsx`、`Toggle.tsx`、`PillTabs.tsx`：基础控制组件。
- `src/components/ScreenSkeleton.tsx`、`LazyLoadBoundary.tsx`：懒加载占位和错误边界。

## 领域模型

### 账户

核心类型在 `src/lib/accounts.ts`：

- `AccountGroupId`：`liquid` 流动资金、`invest` 投资、`fixed` 固定资产、`receivable` 应收款、`debt` 负债。
- `AccountTypeId`：现金、银行卡、基金、股票、房产、信用卡、贷款等具体账户类型。
- `Account`：`id`、`type`、`name`、`balance`、`updatedAt`。

账户读写入口在 `src/lib/useAccounts.ts`。它负责：

- 从 `ratio.accounts` 读取并容错迁移旧数据。
- 新增、改名、设余额、调余额、转账、删除账户。
- 按分组汇总资产总额、负债总额和净资产。

金额相关逻辑集中在 `src/lib/money.ts`、`src/lib/moneyExpression.ts`、`src/lib/accountBalance.ts`，不要在界面里散落新的金额规则。

### 账户操作

账户操作类型在 `src/lib/accountOps.ts`：

- `rename`：改名。
- `set_balance`：余额校准/覆盖。
- `adjust`：期间净变动汇总。
- `transfer`：账户间内部转移。

存储和容错规范化在 `src/lib/accountOpsStorage.ts`，Hook 在 `src/lib/useAccountOps.ts`。注意 `transfer` 不改变净资产，AI 或统计逻辑不应把它当收入/支出。

### 快照

快照类型和构建逻辑在 `src/lib/snapshots.ts`：

- `Snapshot.date` 使用 `YYYY-MM-DD`。
- 每条快照包含 `net`、`debt`、`cash`、`invest`、`fixed`、`receivable`，可附带当日账户列表。
- `buildSnapshot()` 从账户余额汇总出当日快照。
- `upsertSnapshot()` 按日期覆盖并排序。
- `withAccountSnapshot()` 用当前账户补齐今日实时快照。

`src/lib/useDailySnapshotSync.ts` 会在存储可用时维护每日快照。趋势和统计页面优先使用快照，而不是直接把所有账户变动当作逐笔交易。

### Ledger 明细

`src/lib/ledger.ts` 和 `src/lib/ledgerStorage.ts` 是可选明细账：

- `Transaction.type` 是 `income` 或 `expense`。
- 支出金额会规范化为负数，收入为正数。
- 这个 ledger 可能不完整，只能作为辅助证据。

### 储蓄目标和统计

- `src/lib/savingsGoal.ts`：储蓄目标、目标日期、进度、预测算法。
- `src/lib/savingsGoalSimulation.ts`：目标模拟。
- `src/lib/snapshotDerived.ts`：从快照派生统计区间、增长、覆盖率等。
- `src/lib/monthStart.ts`：统计月起始日设置。
- `src/lib/monthlyDisposable.ts`：月可支配估算设置。

## 本地存储键

主要键都以 `ratio.` 开头。备份会默认包含 `ratio.*`，但排除云同步账号配置和 AI 隐私确认键。

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
| `ratio.theme` | 当前主题 |
| `ratio.tourSeen` | 是否看过引导 |
| `ratio.hideAmounts` | 是否隐藏金额 |
| `ratio.accountSort.*` | 账户排序偏好 |
| `ratio.cloudSync` | 云同步设置，包含服务器、用户名、密码和开关 |
| `ratio.cloudSyncDirty` | 自动云同步脏标记 |
| `ratio.aiPrivacyAcceptedServerUrl` | 用户已确认 AI 隐私提示的服务器地址 |
| `ratio.pendingToast.v1` | 页面刷新后待展示 toast |

备份逻辑在 `src/lib/backup.ts`：

- schema 是 `ratio.backup.v1`。
- `ratio.cloudSync` 和 `ratio.aiPrivacyAcceptedServerUrl` 不进入备份。
- 恢复失败会尝试回滚原本地数据。
- 比较备份时会规范化 `ratio.accountOps` 和 `ratio.ledger`，避免自动生成的 id 造成误判。

## 云同步与后端

前端云端 API 封装在 `src/lib/cloud.ts`，自动同步编排在 `src/lib/cloudSync.ts`。

后端位于 `server/src/server.js`，使用 Node 原生 `http`：

- `GET /api/health`：健康检查。
- `POST /api/users`：注册账号，可受邀请码限制。
- `GET /api/me`：认证检查。
- `GET /api/backup/meta`：读取云备份元信息。
- `GET /api/backup`：下载云备份。
- `PUT /api/backup`：上传云备份，带冲突检测。
- `GET /api/ai/status`：AI 代理配置状态。
- `POST /api/ai/chat`：AI 代理，支持非流式和流式转发。
- `POST /api/telemetry`：提交遥测。
- `GET /api/telemetry/recent`：读取当前用户近期遥测。
- `/admin` 和 `/api/admin/*`：后端管理控制台，需 `RATIO_ADMIN_USERNAME`/`RATIO_ADMIN_PASSWORD`。

后端数据默认写到 `RATIO_DATA_DIR`，Docker Compose 中映射到 `/data` 卷。用户密码使用 PBKDF2，备份按用户目录保存。

## AI 助手数据口径

AI 上下文构建在 `src/lib/ai.ts`：

- 默认只发送派生财务摘要、最近快照、最近账户操作和最近 ledger 明细。
- 不发送云同步账号密码。
- 聊天历史保存在 `sessionStorage` 的 `ratio.ai.chat.session.v1`，关闭会话后自然清除，不进入云备份。
- 系统提示明确要求 AI 只基于 JSON 证据回答，并区分“数据确认”和“推测”。
- 前端只通过云端 AI 代理调用模型，不在浏览器保存 AI Base URL、API Key 或模型参数。

修改 AI 相关功能时，要同时检查：

- `src/lib/ai.ts`：上下文、系统提示、响应解析、流式读取。
- `src/components/AiAssistant.tsx`：对话 UI、隐私确认、会话存储。
- `src/lib/cloud.ts`：AI 代理 API 封装。
- `server/src/server.js`：上游 URL 安全检查、限流、请求体限制、流式透传。

## 测试布局

- 单元/组件测试和源码放在一起，命名为 `*.test.ts` 或 `*.test.tsx`。
- `src/test/setup.ts`：Vitest/jsdom 全局测试设置。
- `e2e/app-smoke.spec.ts`：Playwright 冒烟测试。
- `vitest.config.ts`：jsdom 环境，排除 `e2e/`。
- `playwright.config.ts`：端到端测试配置。

变更建议：

- 改金额、账户、快照、备份、云同步、AI 上下文时，优先补或跑对应 `src/lib/*.test.ts`。
- 改页面交互时，至少跑相关组件测试；影响主路径时跑 Playwright 冒烟。
- 文档-only 变更通常不需要跑完整测试，但应检查 Markdown 链接和命令是否仍准确。

## 变更导航

按需求类型优先看这些文件：

- 新增账户类型或分组：`src/lib/accounts.ts`、相关图标/UI、统计/AI 汇总是否需要同步。
- 改金额计算：`src/lib/money.ts`、`src/lib/accountBalance.ts`、`src/lib/format.ts`。
- 改资产页：`src/screens/AssetsScreen.tsx`、`AssetsRatioPage.tsx`、`AssetsListPage.tsx`、`BubbleChartPage.tsx`。
- 改趋势/统计：`src/screens/TrendScreen.tsx`、`src/screens/StatsScreen.tsx`、`src/screens/stats/`、`src/lib/snapshotDerived.ts`。
- 改设置/备份：`src/screens/SettingsScreen.tsx`、`src/lib/backup.ts`、`src/lib/cloud.ts`。
- 改云同步：`src/lib/cloudSync.ts`、`src/lib/cloud.ts`、`server/src/server.js`。
- 改 AI 助手：`src/lib/ai.ts`、`src/components/AiAssistant.tsx`、`server/src/server.js`。
- 改 PWA/构建：`vite.config.ts`、`src/pwa.ts`、`public/manifest.webmanifest`。
- 改后端管理台：`server/src/server.js`、`server/src/adminConsole.js`。

## 维护原则

- 保持本地优先：核心资产数据必须在无后端时可用。
- 不把云同步凭据、AI 密钥、模型配置放到前端备份或 AI 请求上下文。
- 不把 `accountOps.adjust` 当单笔交易，不把 `transfer` 当收入/支出。
- `localStorage` 读写要保留容错和旧数据迁移，优先使用已有 coerce/normalize 函数。
- 金额写入前要规范化，避免浮点误差和非法负余额。
- 修改共享数据结构时同步更新备份、AI 上下文、统计和测试。
- 尊重懒加载分包：趋势、统计、设置、AI 助手体积较大，不要无意改回首包。
- UI 面向移动端 PWA，注意安全区、底部导航、触摸手势和 reduced motion。
