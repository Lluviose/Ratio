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

### 云端后台（Docker Compose）

后台用于账号备份、云端 AI 代理和日志遥测。AI 对话端口只在后台统一配置，前端不会保存 AI Base URL、API Key 或模型参数。

```powershell
Copy-Item .env.example .env
docker compose up -d --build
```

在 `.env` 中配置：

- `RATIO_AI_CHAT_URL`：OpenAI-compatible `/v1/chat/completions` 完整地址；或使用 `RATIO_AI_BASE_URL` + `RATIO_AI_CHAT_PATH`
- `RATIO_AI_API_KEY`：后台转发 AI 请求时使用的密钥
- `RATIO_AI_MODEL` / `RATIO_AI_REASONING_EFFORT`：统一模型配置
- `RATIO_REGISTRATION_INVITE_CODE`：创建账号的邀请码；默认必须配置，否则注册关闭
- `RATIO_ALLOW_OPEN_REGISTRATION`：显式设为 `true` 才允许无邀请码开放注册，不建议公网使用
- `RATIO_AI_UPSTREAM_TIMEOUT_MS`：AI 上游请求超时时间，默认 120000
- `RATIO_AI_MAX_RESPONSE_BYTES`：AI 上游响应最大字节数，默认 2097152
- `RATIO_TELEMETRY_MAX_DAILY_BYTES`：单用户单日 telemetry 日志上限，默认 5242880
- `RATIO_AUTH_RATE_LIMIT_PER_MINUTE` / `RATIO_REGISTER_RATE_LIMIT_PER_MINUTE`：认证与注册限流
- `RATIO_ADMIN_USERNAME` / `RATIO_ADMIN_PASSWORD`：启用后端可视化控制台 `/admin`
- `RATIO_ADMIN_RATE_LIMIT_PER_MINUTE`：控制台请求限流，默认 300
- `RATIO_CORS_ORIGIN`：生产环境建议改成前端实际域名

启动后后台默认监听 `http://localhost:8787`，可访问 `GET /api/health` 检查状态。应用内进入「设置」填写服务器地址、账号、密码和可选邀请码后，可创建账号、测试连接、上传/恢复云端备份、开启自动备份和遥测。配置管理员账号后，可打开 `http://localhost:8787/admin` 查看服务健康、账号备份、AI 代理和遥测状态。

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
