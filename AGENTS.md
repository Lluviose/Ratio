# AI 代理入口

开始改代码前，先读 `PROJECT.md`。它包含项目结构、数据模型、存储键、后端接口和变更导航。

## 项目定位

Ratio 是本地优先的个人资产/负债管理 PWA。前端核心数据在浏览器 `localStorage`，可选 Node 后端只负责云备份、AI 代理、遥测和管理控制台。

## 常用验证

```bash
npm run build
npm test
npm run lint
npm run test:e2e
```

文档-only 变更通常不必跑完整测试，但应检查内容和命令是否准确。

## 高风险点

- 核心存储键都以 `ratio.` 开头；备份包含多数 `ratio.*`，但排除 `ratio.cloudSync` 和 `ratio.aiPrivacyAcceptedServerUrl`。
- 不要把云同步账号密码、AI API Key、AI Base URL 或模型配置写入前端备份和 AI 上下文。
- `accountOps.adjust` 是期间净变动汇总，不是单笔交易。
- `accountOps.transfer` 是内部转移，不应算作收入或支出。
- `ledger` 是可选明细，可能不完整，统计和 AI 分析不能假设它覆盖全部收支。
- 趋势和统计主要基于 `snapshots`，不是逐笔交易流水。
- 金额计算优先使用 `src/lib/money.ts`、`src/lib/accountBalance.ts`、`src/lib/format.ts` 的现有函数。
- 本项目有懒加载和手动分包，修改 `TrendScreen`、`StatsScreen`、`SettingsScreen`、`AiAssistant` 时注意不要扩大首包。

## 主要入口

- 前端编排：`src/App.tsx`
- 账户模型：`src/lib/accounts.ts`
- 账户读写：`src/lib/useAccounts.ts`
- 账户操作：`src/lib/accountOps.ts`、`src/lib/accountOpsStorage.ts`
- 快照：`src/lib/snapshots.ts`、`src/lib/useSnapshots.ts`
- 备份：`src/lib/backup.ts`
- 云端 API：`src/lib/cloud.ts`
- 自动云同步：`src/lib/cloudSync.ts`
- AI 上下文：`src/lib/ai.ts`
- AI UI：`src/components/AiAssistant.tsx`
- 后端服务：`server/src/server.js`
- 后端管理台：`server/src/adminConsole.js`
