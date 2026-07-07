# AI 代理入口

这是 AI 代理进入本仓库的第一站。60 秒内建立安全上下文，然后按需深入。

## 阅读顺序

1. 本文件 —— 规则、验证、风险点。
2. `PROJECT.md` —— 项目地图：架构深读、领域模型、存储键、变更导航。改代码前必读相关章节。
3. `TROUBLESHOOTING.md` —— 已知坑（构建、Hooks 规则、Windows WebKit e2e 抖动）。遇到诡异现象先查这里。
4. `README.md` —— 面向用户的安装/部署，通常无需通读。

## 项目定位

Ratio 是本地优先的个人资产/负债管理 PWA。前端核心数据在浏览器本机存储内核（IndexedDB 权威 + localStorage 回退，见 `src/lib/storageKernel.ts` 文件头），可选 Node 后端只负责云备份、AI 代理、遥测和管理控制台。核心原则：**没有后端时应用必须完整可用**。

## 常用验证

```bash
npm run build      # tsc -b + vite build，约 5-10s，产物分包见 PROJECT.md「懒加载与分包」
npm test           # Vitest 单测，当前 25 个文件 / 187 个用例，约 40-50s（jsdom 环境启动占大头）
npm run lint       # eslint .，应零输出通过
npm run test:e2e   # Playwright，2 个 spec × 3 浏览器项目 = 18 例，约 2 分钟；首次运行会 build + preview
```

- 文档-only 变更通常不必跑完整测试，但应检查内容和命令是否准确。
- e2e 的 webServer 端口是 4173 且 `reuseExistingServer` 开启：若有残留 preview 进程，会拿旧 dist 跑新测试。改前端代码后 e2e 结果可疑时，先杀掉 4173 上的进程或手动 `npm run build`。
- 断言面板消失用 `expect.poll(() => locator.count())`，不要用 `toBeHidden()`（Windows 无头 WebKit 会饿死页内轮询，见 TROUBLESHOOTING.md）。

## 高风险点（改动前自查）

数据与隐私：

- 核心存储键都以 `ratio.` 开头；备份包含多数 `ratio.*`，但排除 `ratio.cloudSync` 和 `ratio.aiPrivacyAcceptedServerUrl`。
- 存储读写走 `storageKernel`/`appStorage`（IndexedDB 异步落盘），**写入后要整页刷新的路径必须先 `await storageKernel.flush()` 并检查返回值——false 时中止刷新并提示**；覆盖式恢复（导入备份/云端恢复/进入演示）前先 `writePreOperationLocalBackup()` 抢一代本机快照。新增此类路径时对照 `src/lib/storageKernel.ts` 文件头约定。
- 不要把云同步账号密码、AI API Key、AI Base URL 或模型配置写入前端备份和 AI 上下文。
- `accountOps.adjust` 是期间净变动汇总，不是单笔交易；`accountOps.transfer` 是内部转移，不算收入/支出。
- `ledger` 是可选明细，可能不完整；趋势和统计以 `snapshots` 为准。
- 金额计算优先使用 `src/lib/money.ts`、`src/lib/accountBalance.ts`、`src/lib/format.ts` 的现有函数；写入前规范化，禁止负余额。

体积与性能：

- 趋势、统计、设置、AI 助手是懒加载分包（`vite.config.ts` manualChunks），不要从首包代码新增对它们的静态 import。
- React Compiler 只编译懒屏幕树，范围集中在 `react-compiler.shared.ts`（vite 与 vitest 共用，不要在两处分别改）；审计工具 `node scripts/compiler-report.mjs`。详见 PROJECT.md「React Compiler」。
- 动画只动 transform/opacity；离场要快于入场；`layoutId` 必须按实例/条目唯一。规范见 PROJECT.md「动效系统」。

几何敏感文件（测试覆盖、逐像素对齐，微调需谨慎）：

- `src/screens/AssetsRatioPage.tsx`：展开面板与底层色块靠标签复刻逐像素衔接。
- `src/screens/AssetsScreen.tsx`：四页滚动形态变换的插值几何（见 PROJECT.md「资产首页」）。

测试兼容：

- 单测/e2e 依赖可见文本、role/aria 和 `data-testid`；改交互时保持这些不变，或同步更新测试。

## 主要入口

| 关注点 | 文件 |
| --- | --- |
| 前端编排 | `src/App.tsx` |
| 资产首页形态变换 | `src/screens/AssetsScreen.tsx` |
| 动效词汇表 | `src/lib/motionPresets.ts` |
| 气泡物理 | `src/components/BubbleChartPhysics.tsx` |
| 账户模型 / 读写 | `src/lib/accounts.ts`、`src/lib/useAccounts.ts` |
| 账户操作 | `src/lib/accountOps.ts`、`src/lib/accountOpsStorage.ts` |
| 快照 | `src/lib/snapshots.ts`、`src/lib/useSnapshots.ts` |
| 备份 | `src/lib/backup.ts` |
| 云端 API / 自动同步 | `src/lib/cloud.ts`、`src/lib/cloudSync.ts` |
| AI 上下文 / UI | `src/lib/ai.ts`、`src/components/AiAssistant.tsx` |
| 后端服务 / 管理台 | `server/src/server.js`、`server/src/adminConsole.js` |
