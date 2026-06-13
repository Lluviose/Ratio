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
          <span id="authState" class="muted">未登录</span>
          <span id="lastUpdated" class="muted">未刷新</span>
          <button id="refreshBtn" type="button">刷新</button>
          <button id="logoutBtn" class="secondary isHidden" type="button">退出</button>
        </div>
      </header>

      <section id="loginPanel" class="loginPanel">
        <form id="loginForm" class="loginBox">
          <div>
            <h2>管理员登录</h2>
            <p>输入后端环境变量中配置的管理员账号和密码。</p>
          </div>
          <label>
            <span>账号</span>
            <input id="adminUsername" name="username" autocomplete="username" required />
          </label>
          <label>
            <span>密码</span>
            <input id="adminPassword" name="password" type="password" autocomplete="current-password" required />
          </label>
          <div id="loginError" class="loginError" aria-live="polite"></div>
          <button type="submit">进入控制台</button>
        </form>
      </section>

      <main id="adminMain" class="isHidden">
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
          <div class="metric">
            <div class="metricLabel">遥测</div>
            <div id="telemetryToday" class="metricValue">-</div>
            <div id="telemetryMeta" class="metricMeta">-</div>
          </div>
        </section>

        <section class="chartGrid" aria-label="趋势可视化">
          <div class="panel">
            <div class="panelHeader">
              <h2>近 7 天遥测</h2>
              <span id="telemetryTrendBadge" class="badge">-</span>
            </div>
            <div id="telemetryTrendChart" class="chartBox"></div>
          </div>
          <div class="panel">
            <div class="panelHeader">
              <h2>AI 请求</h2>
              <span id="aiTrendBadge" class="badge">-</span>
            </div>
            <div id="aiTrendChart" class="chartBox"></div>
          </div>
          <div class="panel">
            <div class="panelHeader">
              <h2>Top 存储用户</h2>
              <span id="storageTrendBadge" class="badge">-</span>
            </div>
            <div id="storageTopChart" class="chartBox"></div>
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
              <h2>创建用户</h2>
              <span class="badge">Admin</span>
            </div>
            <form id="createUserForm" class="inlineForm">
              <input id="createUsername" name="username" placeholder="username" autocomplete="off" required />
              <input id="createPassword" name="password" type="password" placeholder="password" autocomplete="new-password" required />
              <button type="submit">创建</button>
            </form>
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
                  <th>备份</th>
                  <th>遥测</th>
                  <th>用户目录</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody id="usersTable"></tbody>
            </table>
          </div>
        </section>

        <section class="panel">
          <div class="panelHeader">
            <h2 id="filesTitle">用户文件</h2>
            <span id="filesBadge" class="badge">未选择</span>
          </div>
          <div class="tableWrap">
            <table>
              <thead>
                <tr>
                  <th>文件名</th>
                  <th>大小</th>
                  <th>修改时间</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody id="filesTable"></tbody>
            </table>
          </div>
        </section>

        <section class="layout">
          <div class="panel">
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
          </div>

          <div class="panel">
            <div class="panelHeader">
              <h2>管理员审计</h2>
              <div class="filters">
                <select id="auditLimit">
                  <option value="20">20 条</option>
                  <option value="50" selected>50 条</option>
                  <option value="100">100 条</option>
                  <option value="200">200 条</option>
                </select>
              </div>
            </div>
            <div id="auditList" class="eventList"></div>
          </div>
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
  --cyan: #0891b2;
  --shadow: 0 18px 50px -38px rgba(15, 23, 42, 0.55);
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}

* { box-sizing: border-box; }
body { margin: 0; min-height: 100vh; background: var(--bg); color: var(--text); letter-spacing: 0; }
button, select, input { font: inherit; }
button {
  height: 34px;
  border: 1px solid #1d4ed8;
  border-radius: 8px;
  background: var(--accent);
  color: #fff;
  padding: 0 12px;
  font-weight: 850;
  cursor: pointer;
  white-space: nowrap;
}
button:disabled { opacity: 0.62; cursor: progress; }
button.secondary { border-color: var(--line); background: #fff; color: var(--text); }
button.danger { border-color: #b91c1c; background: var(--red); }
button.tiny { height: 28px; padding: 0 8px; font-size: 11px; }
select, input {
  height: 34px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: #fff;
  color: var(--text);
  padding: 0 10px;
  font-weight: 750;
}

.shell { width: min(1280px, calc(100vw - 28px)); margin: 0 auto; padding: 24px 0 40px; }
.topbar { display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; margin-bottom: 18px; }
.eyebrow { color: var(--muted); font-size: 12px; font-weight: 850; text-transform: uppercase; letter-spacing: 0.08em; }
h1 { margin: 4px 0 0; font-size: clamp(24px, 4vw, 34px); line-height: 1.05; letter-spacing: 0; }
h2 { margin: 0; font-size: 15px; letter-spacing: 0; }
.actions { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; justify-content: flex-end; }
.muted { color: var(--muted); font-size: 12px; font-weight: 750; }
.isHidden { display: none !important; }

.loginPanel { display: grid; place-items: center; min-height: 58vh; }
.loginBox {
  width: min(420px, 100%);
  display: grid;
  gap: 14px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--panel);
  box-shadow: var(--shadow);
  padding: 20px;
}
.loginBox h2 { font-size: 18px; }
.loginBox p { margin: 6px 0 0; color: var(--muted); font-size: 12px; line-height: 1.55; font-weight: 750; }
.loginBox label { display: grid; gap: 6px; color: var(--muted); font-size: 12px; font-weight: 850; }
.loginError { min-height: 18px; color: var(--red); font-size: 12px; font-weight: 850; }

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

.metricsGrid { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 12px; margin-bottom: 12px; }
.metric, .panel { border: 1px solid var(--line); border-radius: 8px; background: var(--panel); box-shadow: var(--shadow); }
.metric { padding: 14px; min-height: 108px; display: flex; flex-direction: column; justify-content: space-between; }
.metricLabel { color: var(--muted); font-size: 12px; font-weight: 850; }
.metricValue { margin-top: 8px; font-size: 25px; line-height: 1; font-weight: 950; letter-spacing: 0; }
.metricMeta { margin-top: 10px; color: var(--muted); font-size: 12px; line-height: 1.45; font-weight: 750; word-break: break-word; }
.metricValue.ok { color: var(--green); }
.metricValue.warn { color: var(--amber); }
.metricValue.bad { color: var(--red); }

.chartGrid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; margin-bottom: 12px; }
.layout { display: grid; grid-template-columns: minmax(0, 1.1fr) minmax(0, 0.9fr); gap: 12px; margin-bottom: 12px; }
.panel { padding: 14px; margin-bottom: 12px; }
.panelHeader { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 12px; }
.badge { min-height: 24px; display: inline-flex; align-items: center; border: 1px solid var(--line); border-radius: 999px; padding: 0 9px; color: var(--muted); font-size: 11px; font-weight: 850; white-space: nowrap; }
.badge.warn { border-color: rgba(183, 121, 31, 0.35); background: rgba(245, 158, 11, 0.1); color: var(--amber); }
.filters, .rowActions { display: flex; gap: 8px; flex-wrap: wrap; justify-content: flex-end; }
.inlineForm { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) auto; gap: 8px; }

.kvList { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
.kv { border-top: 1px solid var(--line-soft); padding-top: 9px; min-width: 0; }
.kvKey { color: var(--muted); font-size: 11px; font-weight: 850; }
.kvValue { margin-top: 4px; font-size: 13px; font-weight: 850; line-height: 1.35; word-break: break-word; }

.chartBox { min-height: 184px; }
.chartSvg { width: 100%; height: 184px; display: block; }
.chartAxis { fill: #647084; font-size: 10px; font-weight: 800; }
.chartLabel { fill: #334155; font-size: 11px; font-weight: 900; }
.chartLine { stroke: #e2e8f0; stroke-width: 1; }
.barPrimary { fill: var(--accent); }
.barGood { fill: var(--green); }
.barBad { fill: var(--red); }
.barCyan { fill: var(--cyan); }
.barMuted { fill: #94a3b8; }

.tableWrap { overflow: auto; border: 1px solid var(--line-soft); border-radius: 8px; }
table { width: 100%; border-collapse: collapse; min-width: 900px; }
th, td { padding: 11px 12px; border-bottom: 1px solid var(--line-soft); text-align: left; font-size: 12px; vertical-align: top; }
th { color: var(--muted); font-weight: 900; background: #f8fafc; }
td { font-weight: 750; }
tbody tr:last-child td { border-bottom: 0; }
.userName { font-weight: 950; }
.subtle { display: block; margin-top: 3px; color: var(--muted); font-size: 11px; font-weight: 750; }

.eventList { display: grid; gap: 8px; }
.event { border: 1px solid var(--line-soft); border-radius: 8px; padding: 10px; background: #fbfdff; }
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

@media (max-width: 1100px) {
  .metricsGrid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .chartGrid, .layout { grid-template-columns: 1fr; }
}

@media (max-width: 680px) {
  .shell { width: min(100% - 20px, 1280px); padding-top: 14px; }
  .topbar { align-items: flex-start; flex-direction: column; }
  .actions { justify-content: flex-start; }
  .metricsGrid, .kvList, .inlineForm { grid-template-columns: 1fr; }
  .metric { min-height: 96px; }
}`

export const adminJs = `const els = {
  adminMain: document.getElementById('adminMain'),
  loginPanel: document.getElementById('loginPanel'),
  loginForm: document.getElementById('loginForm'),
  adminUsername: document.getElementById('adminUsername'),
  adminPassword: document.getElementById('adminPassword'),
  loginError: document.getElementById('loginError'),
  authState: document.getElementById('authState'),
  logoutBtn: document.getElementById('logoutBtn'),
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
  telemetryToday: document.getElementById('telemetryToday'),
  telemetryMeta: document.getElementById('telemetryMeta'),
  telemetryTrendBadge: document.getElementById('telemetryTrendBadge'),
  telemetryTrendChart: document.getElementById('telemetryTrendChart'),
  aiTrendBadge: document.getElementById('aiTrendBadge'),
  aiTrendChart: document.getElementById('aiTrendChart'),
  storageTrendBadge: document.getElementById('storageTrendBadge'),
  storageTopChart: document.getElementById('storageTopChart'),
  configBadge: document.getElementById('configBadge'),
  configList: document.getElementById('configList'),
  createUserForm: document.getElementById('createUserForm'),
  createUsername: document.getElementById('createUsername'),
  createPassword: document.getElementById('createPassword'),
  usersBadge: document.getElementById('usersBadge'),
  usersTable: document.getElementById('usersTable'),
  filesTitle: document.getElementById('filesTitle'),
  filesBadge: document.getElementById('filesBadge'),
  filesTable: document.getElementById('filesTable'),
  telemetryUser: document.getElementById('telemetryUser'),
  telemetryLimit: document.getElementById('telemetryLimit'),
  telemetryList: document.getElementById('telemetryList'),
  auditLimit: document.getElementById('auditLimit'),
  auditList: document.getElementById('auditList'),
}

const AUTH_STORAGE_KEY = 'ratio.admin.basicAuth'
const state = { users: [], selectedUser: '', auth: sessionStorage.getItem(AUTH_STORAGE_KEY) || '' }

function toBase64Utf8(value) {
  const bytes = new TextEncoder().encode(value)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

function setLoggedIn(loggedIn) {
  els.loginPanel.classList.toggle('isHidden', loggedIn)
  els.adminMain.classList.toggle('isHidden', !loggedIn)
  els.refreshBtn.disabled = !loggedIn
  els.logoutBtn.classList.toggle('isHidden', !loggedIn)
  els.authState.textContent = loggedIn ? '已登录' : '未登录'
  if (!loggedIn) els.lastUpdated.textContent = '未刷新'
}

function clearAuth(message = '') {
  state.auth = ''
  sessionStorage.removeItem(AUTH_STORAGE_KEY)
  setLoggedIn(false)
  els.loginError.textContent = message
  window.setTimeout(() => els.adminUsername.focus(), 0)
}

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

function fmtDay(value) {
  if (!value) return '-'
  return String(value).slice(5)
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

function setStatus(kind, text) {
  const cls = kind === 'ok' ? 'ok' : kind === 'bad' ? 'bad' : 'warn'
  els.statusStrip.innerHTML = '<span class="dot ' + cls + '"></span><span>' + escapeHtml(text) + '</span>'
}

async function api(path, options = {}) {
  if (!state.auth) throw new Error('请先登录')
  const headers = new Headers(options.headers || {})
  headers.set('Authorization', state.auth)
  if (options.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
  const res = await fetch(path, {
    ...options,
    credentials: 'omit',
    cache: 'no-store',
    headers,
  })
  if (!res.ok) {
    let message = res.status + ' ' + res.statusText
    try {
      const body = await res.json()
      message = body?.error?.message || message
    } catch {}
    if (res.status === 401) {
      clearAuth('账号或密码不正确')
      throw new Error('账号或密码不正确')
    }
    throw new Error(message)
  }
  const type = res.headers.get('content-type') || ''
  if (type.includes('application/json')) return res.json()
  return res.text()
}

async function download(path, fallbackName) {
  if (!state.auth) throw new Error('请先登录')
  const res = await fetch(path, {
    credentials: 'omit',
    cache: 'no-store',
    headers: { Authorization: state.auth },
  })
  if (!res.ok) throw new Error(res.status + ' ' + res.statusText)
  const blob = await res.blob()
  const header = res.headers.get('content-disposition') || ''
  const match = /filename="([^"]+)"/.exec(header)
  const name = match ? match[1] : fallbackName
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = name
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
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

function emptyChart(text) {
  return '<div class="empty">' + escapeHtml(text) + '</div>'
}

function barChart(items, valueKey, colorClass) {
  if (!items || !items.length) return emptyChart('暂无数据')
  const max = Math.max(1, ...items.map((item) => Number(item[valueKey] || 0)))
  const width = 420
  const height = 180
  const left = 28
  const bottom = 34
  const top = 16
  const plotW = width - left - 12
  const plotH = height - top - bottom
  const gap = 10
  const barW = Math.max(12, (plotW - gap * (items.length - 1)) / items.length)
  let svg = '<svg class="chartSvg" viewBox="0 0 ' + width + ' ' + height + '" role="img">'
  svg += '<line class="chartLine" x1="' + left + '" y1="' + (top + plotH) + '" x2="' + (left + plotW) + '" y2="' + (top + plotH) + '"></line>'
  items.forEach((item, index) => {
    const value = Number(item[valueKey] || 0)
    const h = Math.round((value / max) * plotH)
    const x = left + index * (barW + gap)
    const y = top + plotH - h
    svg += '<rect class="' + colorClass + '" x="' + x.toFixed(1) + '" y="' + y + '" width="' + barW.toFixed(1) + '" height="' + h + '" rx="4"></rect>'
    svg += '<text class="chartLabel" x="' + (x + barW / 2).toFixed(1) + '" y="' + (y - 4) + '" text-anchor="middle">' + escapeHtml(value) + '</text>'
    svg += '<text class="chartAxis" x="' + (x + barW / 2).toFixed(1) + '" y="' + (height - 10) + '" text-anchor="middle">' + escapeHtml(fmtDay(item.date)) + '</text>'
  })
  svg += '</svg>'
  return svg
}

function aiChart(items) {
  if (!items || !items.length) return emptyChart('暂无数据')
  const max = Math.max(1, ...items.map((item) => Number(item.aiSuccess || 0) + Number(item.aiFailure || 0)))
  const width = 420
  const height = 180
  const left = 28
  const bottom = 34
  const top = 16
  const plotW = width - left - 12
  const plotH = height - top - bottom
  const gap = 10
  const barW = Math.max(12, (plotW - gap * (items.length - 1)) / items.length)
  let svg = '<svg class="chartSvg" viewBox="0 0 ' + width + ' ' + height + '" role="img">'
  svg += '<line class="chartLine" x1="' + left + '" y1="' + (top + plotH) + '" x2="' + (left + plotW) + '" y2="' + (top + plotH) + '"></line>'
  items.forEach((item, index) => {
    const ok = Number(item.aiSuccess || 0)
    const bad = Number(item.aiFailure || 0)
    const okH = Math.round((ok / max) * plotH)
    const badH = Math.round((bad / max) * plotH)
    const x = left + index * (barW + gap)
    const yOk = top + plotH - okH
    const yBad = yOk - badH
    svg += '<rect class="barGood" x="' + x.toFixed(1) + '" y="' + yOk + '" width="' + barW.toFixed(1) + '" height="' + okH + '" rx="4"></rect>'
    svg += '<rect class="barBad" x="' + x.toFixed(1) + '" y="' + yBad + '" width="' + barW.toFixed(1) + '" height="' + badH + '" rx="4"></rect>'
    svg += '<text class="chartLabel" x="' + (x + barW / 2).toFixed(1) + '" y="' + (Math.min(yBad, yOk) - 4) + '" text-anchor="middle">' + escapeHtml(ok + bad) + '</text>'
    svg += '<text class="chartAxis" x="' + (x + barW / 2).toFixed(1) + '" y="' + (height - 10) + '" text-anchor="middle">' + escapeHtml(fmtDay(item.date)) + '</text>'
  })
  svg += '</svg>'
  return svg
}

function horizontalBars(items) {
  if (!items || !items.length) return emptyChart('暂无数据')
  const max = Math.max(1, ...items.map((item) => Number(item.bytes || 0)))
  const width = 420
  const height = Math.max(150, items.length * 30 + 24)
  const labelW = 116
  const barW = width - labelW - 24
  let svg = '<svg class="chartSvg" viewBox="0 0 ' + width + ' ' + height + '" role="img">'
  items.forEach((item, index) => {
    const y = 18 + index * 30
    const valueW = Math.max(4, Math.round((Number(item.bytes || 0) / max) * barW))
    svg += '<text class="chartAxis" x="8" y="' + (y + 9) + '">' + escapeHtml(item.username) + '</text>'
    svg += '<rect class="barMuted" x="' + labelW + '" y="' + y + '" width="' + barW + '" height="12" rx="6"></rect>'
    svg += '<rect class="barCyan" x="' + labelW + '" y="' + y + '" width="' + valueW + '" height="12" rx="6"></rect>'
    svg += '<text class="chartLabel" x="' + (labelW + valueW + 6) + '" y="' + (y + 10) + '">' + escapeHtml(fmtBytes(item.bytes)) + '</text>'
  })
  svg += '</svg>'
  return svg
}

function renderOverview(data) {
  const registrationLabel = data.registration.inviteRequired
    ? '邀请码注册'
    : data.registration.openRegistration
      ? '开放注册'
      : '注册关闭'
  const registrationTone = data.registration.inviteRequired || data.registration.openRegistration ? '' : 'warn'
  renderMetric(els.serviceState, data.service.ok ? '正常' : '异常', data.service.ok ? 'ok' : 'bad')
  els.serviceMeta.textContent = '运行 ' + Math.round(data.service.uptimeSeconds || 0) + ' 秒 · ' + fmtDate(data.service.time)

  renderMetric(els.userCount, String(data.users.total), null)
  els.backupCount.textContent = data.users.withBackup + ' 个账号已有备份'

  renderMetric(els.storageBytes, fmtBytes(data.storage.totalBytes), null)
  els.storageFiles.textContent = data.storage.files + ' 个文件 · ' + data.storage.directories + ' 个目录'

  renderMetric(els.aiState, data.ai.configured ? '已配置' : '未配置', data.ai.configured ? 'ok' : 'warn')
  els.aiMeta.textContent = data.ai.issue || (data.ai.model + ' · ' + data.ai.reasoningEffort)

  renderMetric(els.telemetryToday, fmtBytes(data.telemetry.todayBytes), null)
  els.telemetryMeta.textContent = data.telemetry.recentEvents + ' recent · limit ' + fmtBytes(data.telemetry.maxDailyBytes)

  els.telemetryTrendBadge.textContent = (data.telemetry.trend || []).reduce((sum, day) => sum + Number(day.events || 0), 0) + ' events'
  els.telemetryTrendChart.innerHTML = barChart(data.telemetry.trend || [], 'events', 'barPrimary')
  els.aiTrendBadge.textContent = (data.aiSummary?.ok || 0) + ' ok / ' + (data.aiSummary?.failed || 0) + ' failed'
  els.aiTrendChart.innerHTML = aiChart(data.telemetry.trend || [])
  els.storageTrendBadge.textContent = (data.storage.topUsers || []).length + ' users'
  els.storageTopChart.innerHTML = horizontalBars(data.storage.topUsers || [])

  els.configBadge.textContent = registrationLabel
  els.configBadge.classList.toggle('warn', registrationTone === 'warn')
  renderKv(els.configList, [
    ['注册策略', registrationLabel],
    ['CORS', data.config.corsOrigin],
    ['最大备份体积', fmtBytes(data.config.maxBackupBytes)],
    ['认证限流', data.limits.authPerMinute + ' / 分钟'],
    ['注册限流', data.limits.registerPerMinute + ' / 分钟'],
    ['管理员限流', data.limits.adminPerMinute + ' / 分钟'],
    ['AI 上游超时', data.ai.timeoutMs + ' ms'],
    ['AI 响应上限', fmtBytes(data.ai.maxResponseBytes)],
    ['AI Key', data.ai.hasApiKey ? data.ai.apiKeyMasked : '未配置'],
    ['AI 平均耗时', data.aiSummary?.avgDurationMs ? data.aiSummary.avgDurationMs + ' ms' : '-'],
    ['活跃限流桶', String(data.limits.activeBuckets)],
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
      '<td>' + escapeHtml(backupAt) + '<span class="subtle">' + escapeHtml(itemCount) + ' items · ' + escapeHtml(fmtBytes(user.backupBytes)) + '</span></td>' +
      '<td>' + escapeHtml(fmtBytes(user.telemetryBytes || 0)) + '<span class="subtle">' + escapeHtml(user.telemetryFiles || 0) + ' files · ' + escapeHtml(fmtDate(user.latestTelemetryAt)) + '</span></td>' +
      '<td>' + escapeHtml(fmtBytes(user.directoryBytes)) + '<span class="subtle">' + escapeHtml(user.directoryFiles + ' files') + '</span></td>' +
      '<td><div class="rowActions">' +
        '<button class="tiny secondary" data-action="files" data-user="' + escapeHtml(user.username) + '">文件</button>' +
        '<button class="tiny secondary" data-action="export" data-user="' + escapeHtml(user.username) + '">导出</button>' +
        '<button class="tiny secondary" data-action="reset" data-user="' + escapeHtml(user.username) + '">重置密码</button>' +
        '<button class="tiny secondary" data-action="deleteBackup" data-user="' + escapeHtml(user.username) + '">删备份</button>' +
        '<button class="tiny secondary" data-action="clearTelemetry" data-user="' + escapeHtml(user.username) + '">清遥测</button>' +
        '<button class="tiny danger" data-action="deleteUser" data-user="' + escapeHtml(user.username) + '">删除用户</button>' +
      '</div></td>' +
      '</tr>'
  }).join('') : '<tr><td colspan="5"><div class="empty">暂无账号</div></td></tr>'

  const previous = state.selectedUser
  els.telemetryUser.innerHTML = '<option value="">全部账号</option>' + users.map((user) => (
    '<option value="' + escapeHtml(user.username) + '">' + escapeHtml(user.username) + '</option>'
  )).join('')
  if (users.some((user) => user.username === previous)) els.telemetryUser.value = previous
}

function eventTitle(entry) {
  const event = entry.event || {}
  if (event.name) return event.name
  if (entry.action) return entry.action
  if (entry.name) return entry.name
  return 'event'
}

function renderEventList(container, events, emptyText) {
  container.innerHTML = events.length ? events.map((entry) => {
    const time = entry.receivedAt || entry.at
    const payload = entry.event || entry
    return '<article class="event">' +
      '<div class="eventTop"><div><div class="eventName">' + escapeHtml(eventTitle(entry)) + '</div><span class="subtle">' + escapeHtml(entry.username || entry.admin || entry.userId || entry.target || '-') + '</span></div>' +
      '<div class="eventTime">' + escapeHtml(fmtDate(time)) + '</div></div>' +
      '<pre>' + escapeHtml(JSON.stringify(payload, null, 2)) + '</pre>' +
      '</article>'
  }).join('') : '<div class="empty">' + escapeHtml(emptyText) + '</div>'
}

function renderFiles(user, files) {
  state.selectedUser = user
  els.filesTitle.textContent = user ? '用户文件 · ' + user : '用户文件'
  els.filesBadge.textContent = files.length + ' files'
  els.filesTable.innerHTML = files.length ? files.map((file) => (
    '<tr>' +
      '<td><span class="userName">' + escapeHtml(file.name) + '</span><span class="subtle">' + (file.safe ? 'safe' : 'locked') + '</span></td>' +
      '<td>' + escapeHtml(fmtBytes(file.size)) + '</td>' +
      '<td>' + escapeHtml(fmtDate(file.mtime)) + '</td>' +
      '<td><div class="rowActions">' +
        '<button class="tiny secondary" data-file-action="download" data-file="' + escapeHtml(file.name) + '"' + (file.safe ? '' : ' disabled') + '>下载</button>' +
        '<button class="tiny danger" data-file-action="delete" data-file="' + escapeHtml(file.name) + '"' + (file.safe ? '' : ' disabled') + '>删除</button>' +
      '</div></td>' +
    '</tr>'
  )).join('') : '<tr><td colspan="4"><div class="empty">暂无文件</div></td></tr>'
}

async function loadTelemetry() {
  state.selectedUser = els.telemetryUser.value
  const limit = els.telemetryLimit.value || '50'
  const params = new URLSearchParams({ limit })
  if (state.selectedUser) params.set('username', state.selectedUser)
  const data = await api('/api/admin/telemetry/recent?' + params.toString())
  renderEventList(els.telemetryList, data.events || [], '暂无遥测事件')
}

async function loadAudit() {
  const limit = els.auditLimit.value || '50'
  const data = await api('/api/admin/audit/recent?limit=' + encodeURIComponent(limit))
  renderEventList(els.auditList, data.events || [], '暂无审计事件')
}

async function loadFiles(username) {
  const data = await api('/api/admin/users/' + encodeURIComponent(username) + '/files')
  renderFiles(username, data.files || [])
}

async function loadAll() {
  if (!state.auth) {
    setLoggedIn(false)
    return
  }
  els.refreshBtn.disabled = true
  setStatus('warn', '正在刷新控制台数据')
  try {
    const overview = await api('/api/admin/overview')
    const users = await api('/api/admin/users')
    renderOverview(overview)
    renderUsers(users.users || [])
    if (state.selectedUser && (users.users || []).some((user) => user.username === state.selectedUser)) {
      await loadFiles(state.selectedUser)
    } else {
      renderFiles('', [])
    }
    await loadTelemetry()
    await loadAudit()
    els.lastUpdated.textContent = '更新于 ' + new Date().toLocaleTimeString('zh-CN', { hour12: false })
    setStatus(overview.service.ok ? 'ok' : 'bad', overview.service.ok ? '后端运行正常' : '后端健康检查异常')
  } catch (error) {
    setStatus('bad', error instanceof Error ? error.message : '刷新失败')
  } finally {
    els.refreshBtn.disabled = !state.auth
  }
}

async function userAction(action, username) {
  try {
    if (action === 'files') return loadFiles(username)
    if (action === 'export') return download('/api/admin/users/' + encodeURIComponent(username) + '/export', 'ratio-user-' + username + '-files.json')
    if (action === 'reset') {
      const password = window.prompt('输入新密码，至少 8 位')
      if (!password) return
      await api('/api/admin/users/' + encodeURIComponent(username) + '/password', { method: 'POST', body: JSON.stringify({ password }) })
    } else if (action === 'deleteBackup') {
      if (!window.confirm('确认删除用户 ' + username + ' 的云端备份？')) return
      await api('/api/admin/users/' + encodeURIComponent(username) + '/backup', { method: 'DELETE' })
    } else if (action === 'clearTelemetry') {
      if (!window.confirm('确认清理用户 ' + username + ' 的遥测文件？')) return
      await api('/api/admin/users/' + encodeURIComponent(username) + '/telemetry', { method: 'DELETE' })
    } else if (action === 'deleteUser') {
      if (!window.confirm('确认删除用户 ' + username + ' 及其全部云端文件？')) return
      await api('/api/admin/users/' + encodeURIComponent(username), { method: 'DELETE' })
      if (state.selectedUser === username) state.selectedUser = ''
    }
    await loadAll()
  } catch (error) {
    setStatus('bad', error instanceof Error ? error.message : '操作失败')
  }
}

async function fileAction(action, filename) {
  if (!state.selectedUser || !filename) return
  try {
    const base = '/api/admin/users/' + encodeURIComponent(state.selectedUser) + '/files/' + encodeURIComponent(filename)
    if (action === 'download') {
      await download(base + '/download', filename)
    } else if (action === 'delete') {
      if (!window.confirm('确认删除文件 ' + filename + '？')) return
      await api(base, { method: 'DELETE' })
      await loadFiles(state.selectedUser)
      await loadAudit()
    }
  } catch (error) {
    setStatus('bad', error instanceof Error ? error.message : '文件操作失败')
  }
}

els.loginForm.addEventListener('submit', (event) => {
  event.preventDefault()
  const username = els.adminUsername.value.trim()
  const password = els.adminPassword.value
  if (!username || !password) {
    els.loginError.textContent = '请输入账号和密码'
    return
  }
  state.auth = 'Basic ' + toBase64Utf8(username + ':' + password)
  sessionStorage.setItem(AUTH_STORAGE_KEY, state.auth)
  els.loginError.textContent = ''
  setLoggedIn(true)
  void loadAll()
})

els.createUserForm.addEventListener('submit', async (event) => {
  event.preventDefault()
  const username = els.createUsername.value.trim()
  const password = els.createPassword.value
  if (!username || !password) return
  try {
    await api('/api/admin/users', { method: 'POST', body: JSON.stringify({ username, password }) })
    els.createUsername.value = ''
    els.createPassword.value = ''
    await loadAll()
  } catch (error) {
    setStatus('bad', error instanceof Error ? error.message : '创建失败')
  }
})

els.logoutBtn.addEventListener('click', () => {
  els.adminPassword.value = ''
  clearAuth('')
})

els.refreshBtn.addEventListener('click', () => void loadAll())
els.telemetryUser.addEventListener('change', () => void loadTelemetry())
els.telemetryLimit.addEventListener('change', () => void loadTelemetry())
els.auditLimit.addEventListener('change', () => void loadAudit())
els.usersTable.addEventListener('click', (event) => {
  const button = event.target.closest('button[data-action]')
  if (!button) return
  void userAction(button.dataset.action, button.dataset.user)
})
els.filesTable.addEventListener('click', (event) => {
  const button = event.target.closest('button[data-file-action]')
  if (!button) return
  void fileAction(button.dataset.fileAction, button.dataset.file)
})

setLoggedIn(Boolean(state.auth))
void loadAll()`
