# ratio

一款**本地优先**的资产/负债管理小工具：用「账户」记录金额，用「分组」看资产结构，用「趋势/统计」回看变化；支持 PWA 安装与一键导入/导出备份。

## 功能

- 账户管理：流动资金 / 投资 / 固定资产 / 应收款 / 负债
- 视图：占比总览、列表明细、气泡图、趋势、统计
- 主题：多套主题色（含随机）
- 数据：仅保存在浏览器 `localStorage`，支持导出/导入 JSON 备份

## 开发

### 环境要求

- Node.js 20+（GitHub Actions 默认使用 20）

### 本地启动

```bash
npm ci
npm run dev
```

打开 `http://localhost:5173`。

### 常用命令

- `npm run dev`：启动开发服务器
- `npm run build`：类型检查 + 构建
- `npm run preview`：本地预览构建产物
- `npm run lint`：ESLint
- `npm test` / `npm run test:watch`：Vitest

## 数据与备份

- 数据默认存储在浏览器 `localStorage`，键名前缀为 `ratio.`。
- 应用内「设置 → 备份与恢复」支持：
  - 导出：下载 `ratio-backup-*.json`
  - 导入：从 JSON 恢复（会覆盖当前设备数据，并自动刷新页面）

## 部署（GitHub Pages）

本仓库内置 GitHub Pages 工作流：`.github/workflows/deploy-pages.yml`，推送到 `main` 会自动构建并发布到 Pages。

要点：

- Vite `base` 会根据 `GITHUB_REPOSITORY` 自动推导（见 `vite.config.ts`），工作流也会显式传入 `--base=/<repo>/`，确保资源路径正确。
- Pages 设置里将 Source 设为 “GitHub Actions”。

## 目录结构

- `src/screens`：页面（资产/趋势/统计/设置/引导等）
- `src/components`：可复用组件（BottomSheet、图表等）
- `src/lib`：数据模型与逻辑（accounts/ledger/snapshots/backup 等）

## 排错

常见问题与处理记录见 `TROUBLESHOOTING.md`。
