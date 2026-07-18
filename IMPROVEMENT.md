# Ratio 优化改进计划

> 2026-07-19 由五个维度的深入分析汇总而成：前端代码质量、数据层可靠性、性能与构建、后端安全、测试与工程化。
> 总体结论：类型纪律、错误处理、分包治理、后端安全基线均高于同类项目平均水准；问题集中在**多设备云同步体验断裂、长期数据增长无治理、巨型组件抬高改动成本、部署默认值陷阱**四类。
> 完成一项就把复选框勾上并在括号里补记完成日期/提交；条目失效则划掉并注明原因。

## P0 正确性与数据安全（第一批）

改动面小、收益确定，均为"真实会丢数据或服务不可用"级别。

- [x] **P0-1 Dockerfile 数据目录陷阱**（`server/Dockerfile`）（2026-07-19 完成）
  镜像 chown 了 `/data`，但代码默认 `DATA_DIR = path.resolve('data')` = `/app/data`（容器可写层）——不显式设 `RATIO_DATA_DIR` 时容器重建即丢所有用户云备份。加 `ENV RATIO_DATA_DIR=/data RATIO_HOST=0.0.0.0` + `VOLUME /data`。
- [x] **P0-2 云同步 fast-forward**（`src/lib/cloudSync.ts:224-237`）（2026-07-19 完成）
  本地无脏标记、仅远端更新（换设备的正常场景）目前也判 conflict 并停摆自动同步，每次切设备都要手动"从云端恢复"。本地 clean 时自动应用远端是可证明安全的路径。
- [x] **P0-3 `__proto__` 用户名导致 500**（`server/src/server.js:619-620, 777, 793`）（2026-07-19 完成，读取统一 `getUserRecord`/`Object.hasOwn`，注册拉黑三个危险键）
  用户名正则 `^[\w.@-]{3,64}$` 放行 `__proto__`/`constructor`/`toString`，认证时 `users.users['__proto__']` 命中原型链属性（truthy）→ `verifyPassword` 抛 TypeError → 500，注册路径有原型赋值隐患。用户表查找改 `Object.hasOwn`，承载容器改 `Object.create(null)` 或 Map。
- [x] **P0-4 反代下限流失效**（`server/src/server.js:46, 280-284`）（2026-07-19 完成，loopback+XFF 运行时警告 + 启动日志 trustProxy 状态）
  `TRUST_PROXY` 默认关，部署在 Nginx/Caddy 后所有客户端的 `clientAddress` 都是反代 IP——全部用户共享同一个 60/分钟 auth 桶（任何人刷请求可让全站 429，防暴破意义归零）。启动日志/health 加自检提示。
- [ ] **P0-5 跨标签并发写丢更新**（`src/lib/storageKernel.ts:455-470`）——*需先评估方案*
  核心数据均为"整数组一个键"+ 键级 last-write-wins，双标签并发追加会静默丢记录。候选方案：Web Locks API 单写者选举；或广播消息带版本号、检测到并发修改同一键时从权威值 rebase 内存态。

## P1 长期可用性（数据增长治理）

互相牵扯，需一起设计；落地顺序：6（速效）→ 8（框架）→ 9 → 7（最后，牵动云同步比较机制）。

- [x] **P1-6 快照管线三重 normalize 与写放大**（`src/lib/useSnapshots.ts:16`、`snapshots.ts:137-146`、`App.tsx:527`）（2026-07-19 完成：删冗余二次 normalize，`upsertSnapshot` 只规范化新条目 + 引用不变契约测试；全量 stringify 属单键大数组模型本身，归 P1-7）
  每记一笔账对全部历史快照做三重规范化 + 全量 `JSON.stringify`（4 年数据 × 20 账户 ≈ 9 万次字段规范化，主线程）。速效：删 `useSnapshots.ts:16` 冗余二次 normalize；`upsertSnapshot` 只规范化新条目。唯一会随使用年限恶化到可感知卡顿的问题，性价比最高。
- [ ] **P1-7 快照/流水降采样与归档**
  snapshots/accountOps/ledger 无限增长且无任何清理机制；>1 年快照收敛为周/月粒度并剥离内嵌 accounts 明细，流水按年分键。⚠ 与"云同步以 canonicalize 后字符串相等判冲突"（`backup.ts:129-133`）互相牵制，需一并设计。
- [x] **P1-8 显式 schema 版本与迁移框架**（`backup.ts:137`、`storageKernel.ts:38`）（2026-07-19 完成：`src/lib/schemaVersion.ts`——`ratio.schemaVersion` 键随备份/云同步流动、挂载前跑迁移管道、恢复拒绝更新版本备份且旧版本备份恢复后就地迁移）
  目前仅 `ratio.backup.v1` + coerce 隐式兼容，做不了破坏性变更。降采样、多币种、账户归档都依赖它先落地。
- [ ] **P1-9 配额耗尽主动处理**（`storageKernel.ts:297-330`）
  flush 持续失败只有 30s 节流 toast，无主动重试调度、无 `navigator.storage.estimate()` 检查、无引导清理路径。把"静默丢写"变成可操作告警。

## P2 性能与体验

- [ ] **P2-10 OpsHistoryList 全量渲染**（`src/components/accountDetail/OpsHistoryList.tsx:47-188`）
  每条都是 layout+drag motion 节点且无上限，几百条操作时最先卡的 UI。初始截断 30-50 条 + 加载更多；长列表下移除逐项 `layout`。
- [ ] **P2-11 启动骨架屏**（`main.tsx:84`）
  渲染门控在 `storageKernel.ready`，WebKit IDB open 挂死时最坏 5 秒纯白屏。门控期先渲染静态 shell（可内联 index.html）；顺带把 `initCloudAutoSync`/`initTelemetry` 改为空闲期动态 import。
- [ ] **P2-12 framer-motion 瘦身**
  全量进首包（估 40-50KB gz，entry 158KB 里最后一块大头）。`LazyMotion` + `m` 迁移，注意急加载路径用了 `Reorder`（AssetsListPage）、drag（OpsHistoryList）、layout（App），需 strict 模式逐个迁移，工程量不小；可与迁移 `motion` 包名同批。
- [ ] **P2-13 升级 vite-plugin-pwa 0.21 → 1.x**
  当前 peer 不含 Vite 7，靠 override 硬扛属未受支持组合。顺手把懒屏幕依赖 chunk（`TrendScreen-*`、`StatsScreen-*`、`SettingsScreen-*`、`AiAssistant-*`（13.6KB gz）、`savingsGoal-*`）加入 `globIgnores`，统一预缓存口径。升级后回归 prompt 更新全流程。
- [ ] **P2-14 AI 流式回复合帧**（`src/components/AiAssistant.tsx:291-295`）
  每个 SSE delta 一次 setState + react-markdown 全量重解析（O(len²) 累计），用 rAF/定时器合帧提交。

## P3 可维护性重构（不改行为）

- [ ] **P3-15 拆 SettingsScreen.tsx（1308 行）**
  抽 `useCloudSyncActions()` hook + 每卡片一个组件（CloudSyncCard/ThemeCard/BackupCard/LocalSnapshotsCard…）。147 行的 `uploadCloud` 递归重试（L464-610）是全库最需要单测却因耦合 UI 无法单测的代码——拆完顺手补测。
- [ ] **P3-16 拆 AssetsScreen.tsx（1400 行）**
  抽 `useHomeScrollSync`/`useDetailPageState`/`useListRectMeasure` 三个 hook + `HomeHeader`/`HomeMiniNav`/`CloudStatusBadge` 组件；互相"押韵"的 700/800/900ms 动画时长常量（`AssetsScreen.tsx:452,746`、`App.tsx:548`）收进 `motionPresets.ts` 统一命名；压缩 L1102-1150 的自辩式注释块。
- [ ] **P3-17 收敛 AccountDetailSheet 的 17 个 props**
  其中 9 个是 `useAccounts()`/`useAccountOps()` 方法转发（数据在 storage 层天然同步，Sheet 可直接消费）；4 个 `submit*`（L451-687）的差额回滚逻辑抽成可单测的 `applyOpEdit()` 纯函数 + `useAccountOpForm` reducer。
- [ ] **P3-18 统一重复工具**
  `toDateKey` 5 份（trendView/savingsGoal/snapshots/demoData/localBackups）收敛进 `dateSeries.ts`；中文日期格式化 4 份变体合并为 `formatChineseDate(iso, { withTime })`；`createId` 3 份、hex 解析 2 份（App.tsx/SettingsScreen → `themes.ts`）；`mountedRef`+abort+StrictMode 复位样板 2 份（SettingsScreen/AiAssistant）抽 `useAbortableOperation()`，同时把 `react-hooks/set-state-in-effect` 从全局关闭（`eslint.config.js:23`）改为逐行 disable。

## P4 测试与工程化

- [ ] **P4-19 补"写路径" e2e**
  现有 6 个功能用例未提交过任何写操作。优先：备份导出→导入 roundtrip、新建账户→转账→调整完整旅程、演示模式进出（CHANGELOG 记载曾有真实丢数据风险）。
- [ ] **P4-20 Vitest coverage 进 CI**（`@vitest/coverage-v8`）
  先出报告再对 `src/lib` 设阈值；顺手给裸奔纯函数补测：`accountOps`/`accountOpsStorage`、`accountBalance`、`robustStats`、`accountDetail/opDisplay.ts`、`accountDetail/format.ts`。
- [ ] **P4-21 补 server 测试 + 管理员失败锁定**
  4 用例守 3100 行后端；`adminConsole.js`（899 行）零测试。同批：管理员登录加失败锁定与失败审计（`server.js:208-227`，当前防暴破弱于普通用户）、账号锁定 DoS 缓解（锁定键加 IP 维度或对 authCache 命中豁免，`server.js:466-477, 609`）、`/api/health` 限流或缓存探测结果（`server.js:2133-2141`，未认证却每次触发磁盘写）。
- [ ] **P4-22 版本化发布**
  package.json 0.0.0、git 无 tag，部署产物无法对应 CHANGELOG 批次；本地构建 buildId 用时间戳（`vite.config.ts:11`）导致零改动也变 hash，改为 git describe 或固定值。
- [ ] **P4-23 工程化小项**
  独立 `typecheck` 脚本（从 build 拆出）；Prettier + lint-staged pre-commit；视觉回归基线迁 Linux 容器进 CI；README:89 的 Pages 部署说明已过时（实际经 `workflow_run` 门禁）；PROJECT.md 漏记视觉回归套件（`test:visual`、24 张基线）。

## 功能能力缺口（按需排期，依赖 P1-8 版本框架）

- [ ] 多币种（数据模型无 currency 概念）
- [ ] 账户归档（目前只能物理删除；且 `deleteAccount` 不强制记 op，删除会造成快照与操作记录口径脱节——`useAccounts.ts:169-174`）
- [ ] CSV 导出（流水无法进 Excel/其他记账工具）
- [ ] 云备份端到端加密（当前服务器可读全部财务数据明文；`ratio.cloudSync` 密码明文存 IDB）

## 已核实无需处理（避免重复排查）

- lucide-react 已全部具名导入，tree-shaking 生效，无优化空间。
- 快照派生计算（snapshotDerived/monthlyDisposable/savingsGoal/StatsScreen memo 链）无 O(n²)，设计良好。
- 账户列表条目数受账户类型总数约束（≤14）且已 memo，不需要虚拟化。
- 后端认证核心（timingSafeEqual、dummy hash 防枚举、PBKDF2 600k + 透明重哈希）、路径处理（ID 化目录 + 双重白名单）、管理台 XSS（全量转义 + 严格 CSP）、文件原子写 + 路径级串行化，均已达标。
- 错误处理体系（RootErrorBoundary + toast + 降级 + 逃生通道）完整；空 `catch {}` 约 50 处经抽查均为合理场景。
