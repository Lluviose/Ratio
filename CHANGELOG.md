# Changelog

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
