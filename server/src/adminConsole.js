export const adminHtml = `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Ratio Admin</title>
    <link rel="stylesheet" href="/admin/styles.css" />
  </head>
  <body>
    <div class="shell">
      <header class="topbar">
        <div>
          <div class="eyebrow">Ratio Server</div>
          <h1>云端后台控制台</h1>
        </div>
        <div class="actions">
          <span id="lastUpdated" class="muted">未刷新</span>
          <button id="refreshBtn" type="button">刷新</button>
        </div>
      </header>

      <main>
        <section id="statusStrip" class="statusStrip" aria-live="polite"></section>

        <section class="metricsGrid" aria-label="核心指标">
          <div class="metric">
            <div class="metricLabel">服务状态</div>
            <div id="serviceState" class="metricValue">-</div>
            <div id="serviceMeta" class="metricMeta">-</div>
          </div>
          <div class="metric">
            <div class="metricLabel">账号</div>
            <div id="userCount" class="metricValue">-</div>
            <div id="backupCount" class="metricMeta">-</div>
          </div>
          <div class="metric">
            <div class="metricLabel">存储</div>
            <div id="storageBytes" class="metricValue">-</div>
            <div id="storageFiles" class="metricMeta">-</div>
          </div>
          <div class="metric">
            <div class="metricLabel">AI 代理</div>
            <div id="aiState" class="metricValue">-</div>
            <div id="aiMeta" class="metricMeta">-</div>
          </div>
        </section>

        <section class="layout">
          <div class="panel">
            <div class="panelHeader">
              <h2>运行配置</h2>
              <span id="configBadge" class="badge">-</span>
            </div>
            <div id="configList" class="kvList"></div>
          </div>

          <div class="panel">
            <div class="panelHeader">
              <h2>遥测摘要</h2>
              <span id="telemetryBadge" class="badge">-</span>
            </div>
            <div id="telemetrySummary" class="kvList"></div>
          </div>
        </section>

        <section class="panel">
          <div class="panelHeader">
            <h2>账号与备份</h2>
            <span id="usersBadge" class="badge">-</span>
          </div>
          <div class="tableWrap">
            <table>
              <thead>
                <tr>
                  <th>账号</th>
                  <th>创建时间</th>
                  <th>最近备份</th>
                  <th>备份项目</th>
                  <th>今日遥测</th>
                  <th>用户目录</th>
                </tr>
              </thead>
              <tbody id="usersTable"></tbody>
            </table>
          </div>
        </section>

        <section class="panel">
          <div class="panelHeader">
            <h2>最近遥测</h2>
            <div class="filters">
              <select id="telemetryUser"></select>
              <select id="telemetryLimit">
                <option value="20">20 条</option>
                <option value="50" selected>50 条</option>
                <option value="100">100 条</option>
                <option value="200">200 条</option>
              </select>
            </div>
          </div>
          <div id="telemetryList" class="eventList"></div>
        </section>
      </main>
    </div>

    <script type="module" src="/admin/app.js"></script>
  </body>
</html>`

export const adminDisabledHtml = `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Ratio Admin Disabled</title>
    <style>
      :root { color-scheme: light; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
      body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #f6f7f9; color: #111827; }
      main { width: min(560px, calc(100vw - 32px)); border: 1px solid #d8dee8; border-radius: 8px; background: #fff; padding: 24px; box-shadow: 0 18px 50px -36px rgba(15, 23, 42, 0.5); }
      h1 { margin: 0; font-size: 20px; letter-spacing: 0; }
      p { margin: 12px 0 0; color: #5b6472; line-height: 1.65; font-weight: 650; }
      code { background: #f1f5f9; border: 1px solid #e2e8f0; border-radius: 6px; padding: 1px 5px; }
    </style>
  </head>
  <body>
    <main>
      <h1>控制台未启用</h1>
      <p>请在后端环境变量中配置 <code>RATIO_ADMIN_USERNAME</code> 和 <code>RATIO_ADMIN_PASSWORD</code>，然后重启服务。</p>
    </main>
  </body>
</html>`

export const adminCss = `:root {
  color-scheme: light;
  --bg: #f5f7fb;
  --panel: #ffffff;
  --text: #111827;
  --muted: #647084;
  --line: #dbe2ec;
  --line-soft: #edf1f6;
  --accent: #2563eb;
  --green: #0f8a5f;
  --amber: #b7791f;
  --red: #c2413a;
  --shadow: 0 18px 50px -38px rgba(15, 23, 42, 0.55);
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}

* { box-sizing: border-box; }
body { margin: 0; min-height: 100vh; background: var(--bg); color: var(--text); letter-spacing: 0; }
button, select { font: inherit; }
button {
  height: 36px;
  border: 1px solid #1d4ed8;
  border-radius: 8px;
  background: var(--accent);
  color: #fff;
  padding: 0 14px;
  font-weight: 850;
  cursor: pointer;
}
button:disabled { opacity: 0.62; cursor: progress; }
select {
  height: 34px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: #fff;
  color: var(--text);
  padding: 0 10px;
  font-weight: 750;
}

.shell { width: min(1180px, calc(100vw - 28px)); margin: 0 auto; padding: 24px 0 40px; }
.topbar { display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; margin-bottom: 18px; }
.eyebrow { color: var(--muted); font-size: 12px; font-weight: 850; text-transform: uppercase; letter-spacing: 0.08em; }
h1 { margin: 4px 0 0; font-size: clamp(24px, 4vw, 34px); line-height: 1.05; letter-spacing: 0; }
h2 { margin: 0; font-size: 15px; letter-spacing: 0; }
.actions { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; justify-content: flex-end; }
.muted { color: var(--muted); font-size: 12px; font-weight: 750; }

.statusStrip {
  min-height: 38px;
  display: flex;
  align-items: center;
  gap: 10px;
  border: 1px solid var(--line);
  background: #fff;
  border-radius: 8px;
  padding: 9px 12px;
  margin-bottom: 12px;
  color: var(--muted);
  font-weight: 800;
}
.dot { width: 8px; height: 8px; border-radius: 50%; background: var(--muted); flex: 0 0 auto; }
.dot.ok { background: var(--green); }
.dot.warn { background: var(--amber); }
.dot.bad { background: var(--red); }

.metricsGrid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; margin-bottom: 12px; }
.metric, .panel {
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--panel);
  box-shadow: var(--shadow);
}
.metric { padding: 14px; min-height: 116px; display: flex; flex-direction: column; justify-content: space-between; }
.metricLabel { color: var(--muted); font-size: 12px; font-weight: 850; }
.metricValue { margin-top: 8px; font-size: 26px; line-height: 1; font-weight: 950; letter-spacing: 0; }
.metricMeta { margin-top: 10px; color: var(--muted); font-size: 12px; line-height: 1.45; font-weight: 750; word-break: break-word; }
.metricValue.ok { color: var(--green); }
.metricValue.warn { color: var(--amber); }
.metricValue.bad { color: var(--red); }

.layout { display: grid; grid-template-columns: minmax(0, 1.25fr) minmax(0, 0.75fr); gap: 12px; margin-bottom: 12px; }
.panel { padding: 14px; margin-bottom: 12px; }
.panelHeader { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 12px; }
.badge { min-height: 24px; display: inline-flex; align-items: center; border: 1px solid var(--line); border-radius: 999px; padding: 0 9px; color: var(--muted); font-size: 11px; font-weight: 850; white-space: nowrap; }
.filters { display: flex; gap: 8px; flex-wrap: wrap; justify-content: flex-end; }

.kvList { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
.kv { border-top: 1px solid var(--line-soft); padding-top: 9px; min-width: 0; }
.kvKey { color: var(--muted); font-size: 11px; font-weight: 850; }
.kvValue { margin-top: 4px; font-size: 13px; font-weight: 850; line-height: 1.35; word-break: break-word; }

.tableWrap { overflow: auto; border: 1px solid var(--line-soft); border-radius: 8px; }
table { width: 100%; border-collapse: collapse; min-width: 760px; }
th, td { padding: 11px 12px; border-bottom: 1px solid var(--line-soft); text-align: left; font-size: 12px; vertical-align: top; }
th { color: var(--muted); font-weight: 900; background: #f8fafc; }
td { font-weight: 750; }
tbody tr:last-child td { border-bottom: 0; }
.userName { font-weight: 950; }
.subtle { display: block; margin-top: 3px; color: var(--muted); font-size: 11px; font-weight: 750; }

.eventList { display: grid; gap: 8px; }
.event {
  border: 1px solid var(--line-soft);
  border-radius: 8px;
  padding: 10px;
  background: #fbfdff;
}
.eventTop { display: flex; justify-content: space-between; gap: 12px; margin-bottom: 6px; }
.eventName { font-size: 13px; font-weight: 950; }
.eventTime { color: var(--muted); font-size: 11px; font-weight: 800; white-space: nowrap; }
pre {
  margin: 0;
  max-height: 180px;
  overflow: auto;
  white-space: pre-wrap;
  word-break: break-word;
  color: #334155;
  font-size: 11px;
  line-height: 1.45;
  background: #f1f5f9;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  padding: 8px;
}
.empty { color: var(--muted); font-size: 13px; font-weight: 800; padding: 12px 0; }

@media (max-width: 860px) {
  .shell { width: min(100% - 20px, 1180px); padding-top: 14px; }
  .topbar { align-items: flex-start; flex-direction: column; }
  .actions { justify-content: flex-start; }
  .metricsGrid, .layout, .kvList { grid-template-columns: 1fr; }
  .metric { min-height: 96px; }
}`

export const adminJs = `const els = {
  refreshBtn: document.getElementById('refreshBtn'),
  lastUpdated: document.getElementById('lastUpdated'),
  statusStrip: document.getElementById('statusStrip'),
  serviceState: document.getElementById('serviceState'),
  serviceMeta: document.getElementById('serviceMeta'),
  userCount: document.getElementById('userCount'),
  backupCount: document.getElementById('backupCount'),
  storageBytes: document.getElementById('storageBytes'),
  storageFiles: document.getElementById('storageFiles'),
  aiState: document.getElementById('aiState'),
  aiMeta: document.getElementById('aiMeta'),
  configBadge: document.getElementById('configBadge'),
  configList: document.getElementById('configList'),
  telemetryBadge: document.getElementById('telemetryBadge'),
  telemetrySummary: document.getElementById('telemetrySummary'),
  usersBadge: document.getElementById('usersBadge'),
  usersTable: document.getElementById('usersTable'),
  telemetryUser: document.getElementById('telemetryUser'),
  telemetryLimit: document.getElementById('telemetryLimit'),
  telemetryList: document.getElementById('telemetryList'),
}

const state = { users: [], selectedUser: '' }

function fmtBytes(value) {
  const bytes = Number(value || 0)
  if (bytes < 1024) return bytes + ' B'
  const units = ['KB', 'MB', 'GB', 'TB']
  let next = bytes / 1024
  let unit = 0
  while (next >= 1024 && unit < units.length - 1) {
    next /= 1024
    unit += 1
  }
  return next.toFixed(next >= 10 ? 1 : 2) + ' ' + units[unit]
}

function fmtDate(value) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('zh-CN', { hour12: false })
}

function setStatus(kind, text) {
  const cls = kind === 'ok' ? 'ok' : kind === 'bad' ? 'bad' : 'warn'
  els.statusStrip.innerHTML = '<span class="dot ' + cls + '"></span><span>' + escapeHtml(text) + '</span>'
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[ch])
}

async function api(path) {
  const res = await fetch(path, { credentials: 'same-origin', cache: 'no-store' })
  if (!res.ok) {
    let message = res.status + ' ' + res.statusText
    try {
      const body = await res.json()
      message = body?.error?.message || message
    } catch {}
    throw new Error(message)
  }
  return res.json()
}

function renderMetric(el, value, tone) {
  el.classList.remove('ok', 'warn', 'bad')
  if (tone) el.classList.add(tone)
  el.textContent = value
}

function renderKv(container, rows) {
  container.innerHTML = rows.map((row) => (
    '<div class="kv"><div class="kvKey">' + escapeHtml(row[0]) + '</div><div class="kvValue">' + escapeHtml(row[1]) + '</div></div>'
  )).join('')
}

function renderOverview(data) {
  const serviceTone = data.service.ok ? 'ok' : 'bad'
  renderMetric(els.serviceState, data.service.ok ? '正常' : '异常', serviceTone)
  els.serviceMeta.textContent = '运行 ' + Math.round(data.service.uptimeSeconds || 0) + ' 秒 · ' + fmtDate(data.service.time)

  renderMetric(els.userCount, String(data.users.total), null)
  els.backupCount.textContent = data.users.withBackup + ' 个账号已有备份'

  renderMetric(els.storageBytes, fmtBytes(data.storage.totalBytes), null)
  els.storageFiles.textContent = data.storage.files + ' 个文件 · ' + data.storage.directories + ' 个目录'

  renderMetric(els.aiState, data.ai.configured ? '已配置' : '未配置', data.ai.configured ? 'ok' : 'warn')
  els.aiMeta.textContent = data.ai.issue || (data.ai.model + ' · ' + data.ai.reasoningEffort)

  els.configBadge.textContent = data.registration.inviteRequired ? '邀请码注册' : '开放注册'
  renderKv(els.configList, [
    ['注册策略', data.registration.inviteRequired ? '需要邀请码' : '允许无邀请码注册'],
    ['CORS', data.config.corsOrigin],
    ['最大备份体积', fmtBytes(data.config.maxBackupBytes)],
    ['认证限流', data.limits.authPerMinute + ' / 分钟'],
    ['注册限流', data.limits.registerPerMinute + ' / 分钟'],
    ['管理员限流', data.limits.adminPerMinute + ' / 分钟'],
    ['AI 上游超时', data.ai.timeoutMs + ' ms'],
    ['AI 响应上限', fmtBytes(data.ai.maxResponseBytes)],
    ['AI Key', data.ai.hasApiKey ? data.ai.apiKeyMasked : '未配置'],
    ['活跃限流桶', String(data.limits.activeBuckets)],
  ])

  els.telemetryBadge.textContent = fmtBytes(data.telemetry.todayBytes) + ' today'
  renderKv(els.telemetrySummary, [
    ['今日日志', fmtBytes(data.telemetry.todayBytes)],
    ['单日上限', fmtBytes(data.telemetry.maxDailyBytes)],
    ['最近事件', String(data.telemetry.recentEvents)],
    ['数据目录', data.storage.dataDir],
  ])
}

function renderUsers(users) {
  state.users = users
  els.usersBadge.textContent = users.length + ' users'
  els.usersTable.innerHTML = users.length ? users.map((user) => {
    const backupAt = user.backup?.updatedAt ? fmtDate(user.backup.updatedAt) : '-'
    const itemCount = user.backup?.itemCount ?? '-'
    return '<tr>' +
      '<td><span class="userName">' + escapeHtml(user.username) + '</span><span class="subtle">' + escapeHtml(user.id) + '</span></td>' +
      '<td>' + escapeHtml(fmtDate(user.createdAt)) + '<span class="subtle">updated ' + escapeHtml(fmtDate(user.updatedAt)) + '</span></td>' +
      '<td>' + escapeHtml(backupAt) + '<span class="subtle">' + escapeHtml(user.backup?.device || '') + '</span></td>' +
      '<td>' + escapeHtml(itemCount) + '<span class="subtle">' + escapeHtml(fmtBytes(user.backupBytes)) + '</span></td>' +
      '<td>' + escapeHtml(fmtBytes(user.telemetryTodayBytes)) + '</td>' +
      '<td>' + escapeHtml(fmtBytes(user.directoryBytes)) + '<span class="subtle">' + escapeHtml(user.directoryFiles + ' files') + '</span></td>' +
      '</tr>'
  }).join('') : '<tr><td colspan="6"><div class="empty">暂无账号</div></td></tr>'

  const previous = state.selectedUser
  els.telemetryUser.innerHTML = '<option value="">全部账号</option>' + users.map((user) => (
    '<option value="' + escapeHtml(user.username) + '">' + escapeHtml(user.username) + '</option>'
  )).join('')
  if (users.some((user) => user.username === previous)) els.telemetryUser.value = previous
}

function eventTitle(entry) {
  const event = entry.event || {}
  if (event.name) return event.name
  if (entry.name) return entry.name
  return 'event'
}

function renderTelemetry(events) {
  els.telemetryList.innerHTML = events.length ? events.map((entry) => {
    const time = entry.receivedAt || entry.at
    const payload = entry.event || entry
    return '<article class="event">' +
      '<div class="eventTop"><div><div class="eventName">' + escapeHtml(eventTitle(entry)) + '</div><span class="subtle">' + escapeHtml(entry.username || entry.userId || '-') + '</span></div>' +
      '<div class="eventTime">' + escapeHtml(fmtDate(time)) + '</div></div>' +
      '<pre>' + escapeHtml(JSON.stringify(payload, null, 2)) + '</pre>' +
      '</article>'
  }).join('') : '<div class="empty">暂无遥测事件</div>'
}

async function loadTelemetry() {
  state.selectedUser = els.telemetryUser.value
  const limit = els.telemetryLimit.value || '50'
  const params = new URLSearchParams({ limit })
  if (state.selectedUser) params.set('username', state.selectedUser)
  const data = await api('/api/admin/telemetry/recent?' + params.toString())
  renderTelemetry(data.events || [])
}

async function loadAll() {
  els.refreshBtn.disabled = true
  setStatus('warn', '正在刷新控制台数据')
  try {
    const overview = await api('/api/admin/overview')
    const users = await api('/api/admin/users')
    renderOverview(overview)
    renderUsers(users.users || [])
    await loadTelemetry()
    els.lastUpdated.textContent = '更新于 ' + new Date().toLocaleTimeString('zh-CN', { hour12: false })
    setStatus(overview.service.ok ? 'ok' : 'bad', overview.service.ok ? '后端运行正常' : '后端健康检查异常')
  } catch (error) {
    setStatus('bad', error instanceof Error ? error.message : '刷新失败')
  } finally {
    els.refreshBtn.disabled = false
  }
}

els.refreshBtn.addEventListener('click', () => void loadAll())
els.telemetryUser.addEventListener('change', () => void loadTelemetry())
els.telemetryLimit.addEventListener('change', () => void loadTelemetry())

void loadAll()`
