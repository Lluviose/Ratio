import http from 'node:http'
import { mkdir, readFile, rename, stat, writeFile, appendFile, unlink, open, readdir, rm } from 'node:fs/promises'
import { createHash, pbkdf2, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'
import path from 'node:path'
import { promisify } from 'node:util'
import { adminCss, adminDisabledHtml, adminHtml, adminJs } from './adminConsole.js'

function readPositiveNumberEnv(name, fallback) {
  const value = Number(process.env[name])
  return Number.isFinite(value) && value > 0 ? value : fallback
}

function readBooleanEnv(name, fallback = false) {
  const raw = process.env[name]
  if (raw == null || raw === '') return fallback
  return /^(1|true|yes|on)$/i.test(raw.trim())
}

const PORT = Number(process.env.PORT || 8787)
const HOST = process.env.RATIO_HOST || process.env.HOST || '127.0.0.1'
const DATA_DIR = process.env.RATIO_DATA_DIR || path.resolve('data')
const CORS_ORIGIN = process.env.RATIO_CORS_ORIGIN || 'http://localhost:5173'
const MAX_BACKUP_BYTES = readPositiveNumberEnv('RATIO_MAX_BACKUP_BYTES', 2 * 1024 * 1024)
const REGISTRATION_INVITE_CODE = (process.env.RATIO_REGISTRATION_INVITE_CODE || '').trim()
const ALLOW_OPEN_REGISTRATION = readBooleanEnv('RATIO_ALLOW_OPEN_REGISTRATION', false)
const AI_RESPONSES_URL = process.env.RATIO_AI_RESPONSES_URL || ''
const AI_CHAT_URL = process.env.RATIO_AI_CHAT_URL || ''
const AI_BASE_URL = process.env.RATIO_AI_BASE_URL || ''
const AI_RESPONSES_PATH = process.env.RATIO_AI_RESPONSES_PATH || ''
const AI_CHAT_PATH = process.env.RATIO_AI_CHAT_PATH || ''
const AI_API_KEY = process.env.RATIO_AI_API_KEY || ''
const AI_MODEL = process.env.RATIO_AI_MODEL || 'gpt-5.2'
const AI_REASONING_EFFORT = process.env.RATIO_AI_REASONING_EFFORT || 'high'
const AI_UPSTREAM_TIMEOUT_MS = readPositiveNumberEnv('RATIO_AI_UPSTREAM_TIMEOUT_MS', 120000)
const AI_MAX_RESPONSE_BYTES = readPositiveNumberEnv('RATIO_AI_MAX_RESPONSE_BYTES', 2 * 1024 * 1024)
const AI_RATE_LIMIT_PER_MINUTE = readPositiveNumberEnv('RATIO_AI_RATE_LIMIT_PER_MINUTE', 30)
const AI_DAILY_REQUEST_LIMIT = readPositiveNumberEnv('RATIO_AI_DAILY_REQUEST_LIMIT', 200)
const AI_MAX_MESSAGES = readPositiveNumberEnv('RATIO_AI_MAX_MESSAGES', 30)
const AI_MAX_MESSAGE_CHARS = readPositiveNumberEnv('RATIO_AI_MAX_MESSAGE_CHARS', 12000)
const AI_MAX_TOTAL_MESSAGE_CHARS = readPositiveNumberEnv('RATIO_AI_MAX_TOTAL_MESSAGE_CHARS', 60000)
const AI_ALLOW_HTTP_UPSTREAM = readBooleanEnv('RATIO_AI_ALLOW_HTTP_UPSTREAM', false)
const AI_ALLOW_PRIVATE_UPSTREAM = readBooleanEnv('RATIO_AI_ALLOW_PRIVATE_UPSTREAM', false)
const TELEMETRY_MAX_DAILY_BYTES = readPositiveNumberEnv('RATIO_TELEMETRY_MAX_DAILY_BYTES', 5 * 1024 * 1024)
const TELEMETRY_RETENTION_DAYS = readPositiveNumberEnv('RATIO_TELEMETRY_RETENTION_DAYS', 30)
const TRUST_PROXY = readBooleanEnv('RATIO_TRUST_PROXY', false)
const AUTH_RATE_LIMIT_PER_MINUTE = readPositiveNumberEnv('RATIO_AUTH_RATE_LIMIT_PER_MINUTE', 60)
const AUTH_FAILURE_WINDOW_MS = readPositiveNumberEnv('RATIO_AUTH_FAILURE_WINDOW_MS', 15 * 60 * 1000)
const AUTH_MAX_FAILED_ATTEMPTS = readPositiveNumberEnv('RATIO_AUTH_MAX_FAILED_ATTEMPTS', 8)
const AUTH_LOCKOUT_MS = readPositiveNumberEnv('RATIO_AUTH_LOCKOUT_MS', 5 * 60 * 1000)
const AUTH_CACHE_TTL_MS = readPositiveNumberEnv('RATIO_AUTH_CACHE_TTL_MS', 5 * 60 * 1000)
const REGISTER_RATE_LIMIT_PER_MINUTE = readPositiveNumberEnv('RATIO_REGISTER_RATE_LIMIT_PER_MINUTE', 30)
const ADMIN_RATE_LIMIT_PER_MINUTE = readPositiveNumberEnv('RATIO_ADMIN_RATE_LIMIT_PER_MINUTE', 300)
const MAX_PASSWORD_CHARS = readPositiveNumberEnv('RATIO_MAX_PASSWORD_CHARS', 256)
const ADMIN_USERNAME = (process.env.RATIO_ADMIN_USERNAME || '').trim()
const ADMIN_PASSWORD = process.env.RATIO_ADMIN_PASSWORD || ''
const USERS_FILE = path.join(DATA_DIR, 'users.json')
const BACKUP_SCHEMA = 'ratio.backup.v1'
const MAX_BACKUP_ITEMS = readPositiveNumberEnv('RATIO_MAX_BACKUP_ITEMS', 1000)
const MAX_BACKUP_ITEM_KEY_CHARS = readPositiveNumberEnv('RATIO_MAX_BACKUP_ITEM_KEY_CHARS', 160)
const ISO_STAMP_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/

const mutationQueues = new Map()
const rateLimitBuckets = new Map()
const aiDailyUsage = new Map()
const failedAuthAccounts = new Map()
const authCache = new Map()
const telemetryPruneAt = new Map()
const pbkdf2Async = promisify(pbkdf2)
// OWASP 对 PBKDF2-SHA256 的当前下限（~600k）；旧记录在下次登录成功时透明重哈希升级
const PASSWORD_HASH_ITERATIONS = 600000
const DUMMY_PASSWORD_USER = {
  passwordSalt: 'cmF0aW8tYXV0aC1kdW1teS1zYWx0',
  passwordIterations: PASSWORD_HASH_ITERATIONS,
  passwordHash: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
}

function now() {
  return new Date().toISOString()
}

function isIsoStamp(value) {
  return typeof value === 'string' && value.length <= 64 && ISO_STAMP_RE.test(value) && !Number.isNaN(Date.parse(value))
}

function readSyncStamp(value) {
  return isIsoStamp(value) ? value : ''
}

function parseLimitParam(value, fallback, max) {
  const parsed = Number.parseInt(value || '', 10)
  const limit = Number.isInteger(parsed) ? parsed : fallback
  return Math.min(max, Math.max(1, limit))
}

function nextBackupUpdatedAt(previousUpdatedAt) {
  const previousMs = Date.parse(readSyncStamp(previousUpdatedAt))
  const currentMs = Date.now()
  const nextMs = Number.isFinite(previousMs) && currentMs <= previousMs ? previousMs + 1 : currentMs
  return new Date(nextMs).toISOString()
}

function securityHeaders() {
  return {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
  }
}

function jsonResponse(res, status, body) {
  const text = JSON.stringify(body)
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(text),
    'Cache-Control': 'no-store',
    ...securityHeaders(),
    ...corsHeaders(),
  })
  res.end(text)
}

function textResponse(res, status, text, contentType = 'text/plain; charset=utf-8', headers = {}) {
  res.writeHead(status, {
    'Content-Type': contentType,
    'Content-Length': Buffer.byteLength(text),
    'Cache-Control': 'no-store',
    ...securityHeaders(),
    ...headers,
  })
  res.end(text)
}

function downloadJsonResponse(res, filename, body) {
  const safeName = String(filename || 'download.json').replace(/["\r\n]/g, '_')
  const text = JSON.stringify(body, null, 2)
  textResponse(res, 200, `${text}\n`, 'application/json; charset=utf-8', {
    'Content-Disposition': `attachment; filename="${safeName}"`,
    ...corsHeaders(),
  })
}

function downloadBufferResponse(res, filename, buffer, contentType = 'application/octet-stream') {
  const safeName = String(filename || 'download.bin').replace(/["\r\n]/g, '_')
  res.writeHead(200, {
    'Content-Type': contentType,
    'Content-Length': buffer.length,
    'Content-Disposition': `attachment; filename="${safeName}"`,
    'Cache-Control': 'no-store',
    ...securityHeaders(),
    ...corsHeaders(),
  })
  res.end(buffer)
}

function emptyResponse(res, status = 204) {
  res.writeHead(status, { ...securityHeaders(), ...corsHeaders() })
  res.end()
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': CORS_ORIGIN,
    'Access-Control-Allow-Headers': 'content-type, authorization',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  }
}

function fail(res, status, message, code = 'error', details = undefined) {
  // 流式响应中途失败时 headers 已发出，再 writeHead 会抛 ERR_HTTP_HEADERS_SENT
  // 并沿 route().catch 变成 unhandled rejection 打挂进程；只能断开连接示错。
  if (res.headersSent) {
    res.destroy()
    return
  }
  jsonResponse(res, status, { error: { code, message, ...(details && typeof details === 'object' ? details : {}) } })
}

function isAdminConfigured() {
  return Boolean(ADMIN_USERNAME && ADMIN_PASSWORD)
}

function safeEqualString(left, right) {
  const a = createHash('sha256').update(left, 'utf8').digest()
  const b = createHash('sha256').update(right, 'utf8').digest()
  return timingSafeEqual(a, b)
}

function safeEqualConfiguredSecret(input, expected) {
  if (!expected) return false
  return safeEqualString(input, expected)
}

function adminUnauthorized(res, challenge = false) {
  textResponse(res, 401, JSON.stringify({ error: { code: 'admin_auth_required', message: 'Admin credentials required' } }), 'application/json; charset=utf-8', {
    ...(challenge ? { 'WWW-Authenticate': 'Basic realm="Ratio Admin Console", charset="UTF-8"' } : {}),
    ...corsHeaders(),
  })
}

function adminDisabled(res, html = false) {
  if (html) return textResponse(res, 503, adminDisabledHtml, 'text/html; charset=utf-8')
  return fail(res, 503, 'Admin console is disabled; configure RATIO_ADMIN_USERNAME and RATIO_ADMIN_PASSWORD', 'admin_disabled')
}

function requireAdmin(req, res, html = false) {
  if (!isAdminConfigured()) {
    adminDisabled(res, html)
    return false
  }

  if (!requestRateLimit(req, res, 'admin', ADMIN_RATE_LIMIT_PER_MINUTE)) return false

  const auth = readBasicAuth(req)
  if (
    !auth ||
    !safeEqualConfiguredSecret(auth.username, ADMIN_USERNAME) ||
    !safeEqualConfiguredSecret(auth.password, ADMIN_PASSWORD)
  ) {
    adminUnauthorized(res, html)
    return false
  }

  return true
}

function checkRateLimit(scope, key, maxRequests, windowMs = 60_000) {
  const nowMs = Date.now()
  if (rateLimitBuckets.size > 10000) {
    for (const [bucketKey, bucket] of rateLimitBuckets.entries()) {
      if (bucket.resetAt <= nowMs) rateLimitBuckets.delete(bucketKey)
    }
  }

  const bucketKey = `${scope}:${key}`
  const current = rateLimitBuckets.get(bucketKey)
  if (!current || current.resetAt <= nowMs) {
    rateLimitBuckets.set(bucketKey, { count: 1, resetAt: nowMs + windowMs })
    return true
  }
  if (current.count >= maxRequests) return false
  current.count += 1
  return true
}

function normalizeIp(value) {
  if (typeof value !== 'string') return ''
  let next = value.trim().replace(/^"|"$/g, '')
  if (!next) return ''
  if (next.startsWith('[')) {
    const end = next.indexOf(']')
    if (end > 0) next = next.slice(1, end)
  } else {
    const ipv4WithPort = /^(\d{1,3}(?:\.\d{1,3}){3}):\d+$/.exec(next)
    if (ipv4WithPort) next = ipv4WithPort[1]
  }
  return next.slice(0, 128)
}

function directRemoteAddress(req) {
  return normalizeIp(req.socket?.remoteAddress || '') || 'unknown'
}

function isTrustedProxyPeer(address) {
  const normalized = normalizeIp(address)
  if (!normalized || normalized === 'unknown') return false
  return normalized === '127.0.0.1' || normalized === '::1' || normalized === '::ffff:127.0.0.1'
}

function forwardedClientAddress(req) {
  const value = req.headers['x-forwarded-for']
  const raw = Array.isArray(value) ? value[0] : value
  if (!raw) return ''
  const first = raw.split(',').map((part) => normalizeIp(part)).find(Boolean)
  return first || ''
}

function clientAddress(req) {
  const direct = directRemoteAddress(req)
  if (!TRUST_PROXY || !isTrustedProxyPeer(direct)) return direct
  return forwardedClientAddress(req) || direct
}

function requestRateLimit(req, res, scope, maxRequests) {
  const key = clientAddress(req)
  if (checkRateLimit(scope, key, maxRequests)) return true
  fail(res, 429, 'Too many requests; try again later', 'rate_limited')
  return false
}

function checkDailyLimit(scope, key, maxRequests, increment = true) {
  const day = new Date().toISOString().slice(0, 10)
  const usageKey = `${scope}:${day}:${key}`
  if (aiDailyUsage.size > 10000) {
    for (const bucketKey of aiDailyUsage.keys()) {
      if (!bucketKey.includes(`:${day}:`)) aiDailyUsage.delete(bucketKey)
    }
  }

  const current = aiDailyUsage.get(usageKey) || 0
  if (current >= maxRequests) return false
  if (increment) aiDailyUsage.set(usageKey, current + 1)
  return true
}

function incrementDailyLimit(scope, key) {
  const day = new Date().toISOString().slice(0, 10)
  const usageKey = `${scope}:${day}:${key}`
  aiDailyUsage.set(usageKey, (aiDailyUsage.get(usageKey) || 0) + 1)
}

function isIpLiteral(hostname) {
  return /^[\d.]+$/.test(hostname) || hostname.includes(':')
}

function parseIpv4Parts(value) {
  const parts = value.split('.').map((part) => Number(part))
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return null
  return parts
}

function isPrivateIpv4Parts(parts) {
  const [a, b] = parts
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  )
}

function parseMappedIpv4Parts(normalizedIpv6) {
  if (!normalizedIpv6.startsWith('::ffff:')) return null
  const suffix = normalizedIpv6.slice('::ffff:'.length)
  if (suffix.includes('.')) return parseIpv4Parts(suffix)

  const hextets = suffix.split(':').filter(Boolean)
  if (hextets.length < 1 || hextets.length > 2) return null
  const high = hextets.length === 2 ? Number.parseInt(hextets[0], 16) : 0
  const low = Number.parseInt(hextets[hextets.length - 1], 16)
  if ([high, low].some((part) => !Number.isInteger(part) || part < 0 || part > 0xffff)) return null
  return [high >> 8, high & 255, low >> 8, low & 255]
}

function isPrivateHostname(hostname) {
  const lower = hostname.toLowerCase()
  if (lower === 'localhost' || lower.endsWith('.localhost')) return true
  if (lower === 'metadata.google.internal') return true
  if (!isIpLiteral(lower)) return false

  if (lower.includes(':')) {
    const normalized = lower.replace(/^\[|\]$/g, '')
    const mappedIpv4 = parseMappedIpv4Parts(normalized)
    if (mappedIpv4) return isPrivateIpv4Parts(mappedIpv4)
    return (
      normalized === '::1' ||
      normalized === '::' ||
      normalized.startsWith('fc') ||
      normalized.startsWith('fd') ||
      normalized.startsWith('fe80:')
    )
  }

  const parts = parseIpv4Parts(lower)
  return parts ? isPrivateIpv4Parts(parts) : false
}

function userId(username) {
  return createHash('sha256').update(username, 'utf8').digest('hex').slice(0, 24)
}

async function hashPassword(password, salt = randomBytes(16).toString('base64'), iterations = PASSWORD_HASH_ITERATIONS) {
  const hash = (await pbkdf2Async(password, salt, iterations, 32, 'sha256')).toString('base64')
  return { salt, iterations, hash }
}

async function verifyPassword(password, user) {
  const next = await hashPassword(password, user.passwordSalt, user.passwordIterations)
  const a = Buffer.from(next.hash, 'base64')
  const b = Buffer.from(user.passwordHash, 'base64')
  return a.length === b.length && timingSafeEqual(a, b)
}

// 登录成功后把低于当前迭代目标的旧哈希透明升级；失败不阻断登录，下次再试。
// 只替换哈希三元组，不动 updatedAt（这不是用户可见的资料变更）。
async function maybeUpgradePasswordHash(user, password) {
  const iterations = Number(user.passwordIterations)
  if (Number.isFinite(iterations) && iterations >= PASSWORD_HASH_ITERATIONS) return user

  try {
    const passwordInfo = await hashPassword(password)
    return await mutateUsers((data) => {
      const record = data.users[user.username]
      // 并发下记录可能已被改密/升级：仅在仍是刚校验过的那份哈希时替换，
      // 否则维持本次请求已校验的原记录语义
      if (!record || record.passwordHash !== user.passwordHash) return user
      record.passwordHash = passwordInfo.hash
      record.passwordSalt = passwordInfo.salt
      record.passwordIterations = passwordInfo.iterations
      return record
    })
  } catch {
    return user
  }
}

function authCacheKey(auth) {
  return createHash('sha256').update(`${auth.username}\0${auth.password}`, 'utf8').digest('hex')
}

function readAuthCache(key) {
  const cached = authCache.get(key)
  if (!cached) return null
  if (cached.expiresAt <= Date.now()) {
    authCache.delete(key)
    return null
  }
  return cached.user
}

function writeAuthCache(key, user) {
  const nowMs = Date.now()
  if (authCache.size > 10000) {
    for (const [cacheKey, cached] of authCache.entries()) {
      if (cached.expiresAt <= nowMs) authCache.delete(cacheKey)
    }
  }
  authCache.set(key, { user, expiresAt: nowMs + AUTH_CACHE_TTL_MS })
}

function authFailureKey(username) {
  return createHash('sha256').update(username || '', 'utf8').digest('hex')
}

function pruneFailedAuthAccounts(nowMs = Date.now()) {
  if (failedAuthAccounts.size <= 10000) return
  for (const [key, state] of failedAuthAccounts.entries()) {
    if (state.windowResetAt <= nowMs && state.lockedUntil <= nowMs) failedAuthAccounts.delete(key)
  }
}

function readFailedAuthState(username) {
  const key = authFailureKey(username)
  const state = failedAuthAccounts.get(key)
  const nowMs = Date.now()
  if (!state) return { key, state: null }
  if (state.windowResetAt <= nowMs && state.lockedUntil <= nowMs) {
    failedAuthAccounts.delete(key)
    return { key, state: null }
  }
  return { key, state }
}

function isAuthAccountLocked(username) {
  const { state } = readFailedAuthState(username)
  return Boolean(state && state.lockedUntil > Date.now())
}

function recordAuthFailure(username) {
  const nowMs = Date.now()
  pruneFailedAuthAccounts(nowMs)
  const { key, state } = readFailedAuthState(username)
  const current =
    state && state.windowResetAt > nowMs
      ? state
      : { count: 0, windowResetAt: nowMs + AUTH_FAILURE_WINDOW_MS, lockedUntil: 0 }
  current.count += 1
  if (current.count >= AUTH_MAX_FAILED_ATTEMPTS) current.lockedUntil = nowMs + AUTH_LOCKOUT_MS
  failedAuthAccounts.set(key, current)
}

function clearAuthFailure(username) {
  failedAuthAccounts.delete(authFailureKey(username))
}

async function ensureDataDir() {
  await mkdir(DATA_DIR, { recursive: true })
  await mkdir(path.join(DATA_DIR, 'users'), { recursive: true })
}

async function readJsonFile(file, fallback) {
  try {
    const text = await readFile(file, 'utf8')
    return JSON.parse(text)
  } catch (error) {
    if (error && error.code === 'ENOENT') return fallback
    throw error
  }
}

async function writeJsonFile(file, value) {
  await mkdir(path.dirname(file), { recursive: true })
  const tmp = `${file}.${process.pid}.${Date.now()}.${randomUUID()}.tmp`
  await writeFile(tmp, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
  await rename(tmp, file)
}

async function checkDirWritable(dir) {
  await stat(dir)
  const probe = path.join(dir, `.health-${process.pid}-${Date.now()}-${randomUUID()}.tmp`)
  await writeFile(probe, 'ok', 'utf8')
  await unlink(probe)
  return true
}

async function checkDataWritable() {
  await ensureDataDir()
  await checkDirWritable(DATA_DIR)
  await checkDirWritable(path.join(DATA_DIR, 'users'))
  const users = await readJsonFile(USERS_FILE, { users: {} })
  if (!users || typeof users !== 'object' || !users.users || typeof users.users !== 'object' || Array.isArray(users.users)) {
    throw new Error('Invalid users file')
  }
  return true
}

async function readUsers() {
  const data = await readJsonFile(USERS_FILE, { users: {} })
  if (!data || typeof data !== 'object' || !data.users || typeof data.users !== 'object') return { users: {} }
  return data
}

async function writeUsers(data) {
  await writeJsonFile(USERS_FILE, data)
}

async function runQueuedMutation(key, task) {
  const previous = mutationQueues.get(key) || Promise.resolve()
  const operation = previous
    .catch(() => undefined)
    .then(task)
  const next = operation.then(
    () => undefined,
    () => undefined,
  )
  mutationQueues.set(key, next)
  try {
    return await operation
  } finally {
    if (mutationQueues.get(key) === next) mutationQueues.delete(key)
  }
}

async function mutateUsers(mutator) {
  return runQueuedMutation(USERS_FILE, async () => {
    const data = await readUsers()
    const result = await mutator(data)
    await writeUsers(data)
    return result
  })
}

async function parseBody(req, maxBytes = 1024 * 1024) {
  const chunks = []
  let total = 0
  for await (const chunk of req) {
    total += chunk.length
    if (total > maxBytes) {
      const error = new Error('Request body too large')
      error.status = 413
      error.code = 'request_too_large'
      throw error
    }
    chunks.push(chunk)
  }

  const text = Buffer.concat(chunks).toString('utf8')
  if (!text.trim()) return {}
  try {
    return JSON.parse(text)
  } catch {
    const error = new Error('Invalid JSON body')
    error.status = 400
    error.code = 'invalid_json'
    throw error
  }
}

function readBasicAuth(req) {
  const header = req.headers.authorization || ''
  const match = /^Basic\s+(.+)$/i.exec(header)
  if (!match) return null
  try {
    const decoded = Buffer.from(match[1], 'base64').toString('utf8')
    const index = decoded.indexOf(':')
    if (index <= 0) return null
    return { username: decoded.slice(0, index), password: decoded.slice(index + 1) }
  } catch {
    return null
  }
}

async function requireUser(req, res) {
  if (!requestRateLimit(req, res, 'auth', AUTH_RATE_LIMIT_PER_MINUTE)) return null

  const auth = readBasicAuth(req)
  if (!auth) {
    fail(res, 401, 'Missing credentials', 'auth_required')
    return null
  }

  if (isAuthAccountLocked(auth.username)) {
    fail(res, 429, 'Too many failed attempts; try again later', 'auth_rate_limited')
    return null
  }

  const cacheKey = authCacheKey(auth)
  const cachedUser = readAuthCache(cacheKey)
  if (cachedUser) return cachedUser

  const users = await readUsers()
  const user = users.users[auth.username]
  const valid = user ? await verifyPassword(auth.password, user) : await verifyPassword(auth.password, DUMMY_PASSWORD_USER)
  if (!user || !valid) {
    recordAuthFailure(auth.username)
    fail(res, 401, 'Invalid username or password', 'auth_invalid')
    return null
  }

  clearAuthFailure(auth.username)
  const upgradedUser = await maybeUpgradePasswordHash(user, auth.password)
  writeAuthCache(cacheKey, upgradedUser)
  return upgradedUser
}

function publicUser(user) {
  return {
    id: user.id,
    username: user.username,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  }
}

function userFile(user, name) {
  return path.join(DATA_DIR, 'users', user.id, name)
}

function isBackup(value) {
  if (!value || typeof value !== 'object') return false
  if (value.schema !== BACKUP_SCHEMA) return false
  if (!isIsoStamp(value.createdAt)) return false
  if (!value.items || typeof value.items !== 'object' || Array.isArray(value.items)) return false

  const entries = Object.entries(value.items)
  if (entries.length > MAX_BACKUP_ITEMS) return false

  for (const [key, item] of entries) {
    if (key.length === 0 || key.length > MAX_BACKUP_ITEM_KEY_CHARS) return false
    if (!key.startsWith('ratio.')) return false
    if (key.startsWith('ratio.cloudSync')) return false
    if (typeof item !== 'string') return false
  }

  return true
}

function maskSecret(value) {
  if (!value) return ''
  if (value.length <= 8) return '***'
  return `${value.slice(0, 3)}***${value.slice(-3)}`
}

function trimConfig(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function migrateChatCompletionsPath(value) {
  const trimmed = trimConfig(value).replace(/\/+$/, '')
  if (!trimmed) return ''
  return trimmed.endsWith('/v1/chat/completions')
    ? `${trimmed.slice(0, -'/v1/chat/completions'.length)}/v1/responses`
    : trimmed
}

function migrateChatCompletionsUrl(value) {
  const trimmed = trimConfig(value)
  if (!trimmed) return ''
  try {
    const url = new URL(trimmed)
    const migratedPath = migrateChatCompletionsPath(url.pathname)
    if (migratedPath && migratedPath !== url.pathname.replace(/\/+$/, '')) {
      url.pathname = migratedPath
      return url.toString()
    }
  } catch {
    // Non-URL values are handled as opaque endpoint strings below.
  }
  return migrateChatCompletionsPath(trimmed)
}

function resolveAiChatUrl() {
  const direct = trimConfig(AI_RESPONSES_URL)
  if (direct) return direct
  const legacyDirect = migrateChatCompletionsUrl(AI_CHAT_URL)
  if (legacyDirect) return legacyDirect

  const baseUrl = trimConfig(AI_BASE_URL)
  if (!baseUrl) return ''

  const base = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`
  const responsesPath = trimConfig(AI_RESPONSES_PATH) || migrateChatCompletionsPath(AI_CHAT_PATH) || '/v1/responses'
  try {
    return new URL(responsesPath, base).toString()
  } catch {
    return baseUrl
  }
}

function readAiConfig() {
  return {
    chatUrl: resolveAiChatUrl(),
    apiKey: trimConfig(AI_API_KEY),
    model: trimConfig(AI_MODEL) || 'gpt-5.2',
    reasoningEffort: trimConfig(AI_REASONING_EFFORT) || 'high',
  }
}

function getAiConfigIssue(config) {
  return getAiConfigIssueInfo(config)?.message ?? null
}

function getAiConfigIssueInfo(config) {
  if (!config.chatUrl) return { code: 'ai_chat_url_missing', message: 'AI chat URL is not configured' }
  try {
    const url = new URL(config.chatUrl)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return { code: 'ai_chat_url_protocol_invalid', message: 'AI chat URL must use http or https' }
    }
    if (url.protocol === 'http:' && !AI_ALLOW_HTTP_UPSTREAM) {
      return { code: 'ai_http_upstream_blocked', message: 'AI chat URL must use https unless RATIO_AI_ALLOW_HTTP_UPSTREAM=true' }
    }
    if (isPrivateHostname(url.hostname) && !AI_ALLOW_PRIVATE_UPSTREAM) {
      return {
        code: 'ai_private_upstream_blocked',
        message: 'AI chat URL cannot target private or localhost addresses unless RATIO_AI_ALLOW_PRIVATE_UPSTREAM=true',
      }
    }
    if (url.hostname === 'example.com') return { code: 'ai_chat_url_example', message: 'AI chat URL is still the example value' }
  } catch {
    return { code: 'ai_chat_url_invalid', message: 'AI chat URL is invalid' }
  }
  if (!config.model) return { code: 'ai_model_missing', message: 'AI model is not configured' }
  return null
}

async function handleRegister(req, res) {
  if (!requestRateLimit(req, res, 'register', REGISTER_RATE_LIMIT_PER_MINUTE)) return

  const body = await parseBody(req, 64 * 1024)
  const username = typeof body.username === 'string' ? body.username.trim() : ''
  const password = typeof body.password === 'string' ? body.password : ''
  const inviteCode = typeof body.inviteCode === 'string' ? body.inviteCode.trim() : ''
  if (!/^[\w.@-]{3,64}$/.test(username)) return fail(res, 400, 'Username must be 3-64 letters, numbers, dot, underscore or dash')
  if (password.length < 8) return fail(res, 400, 'Password must be at least 8 characters')
  if (password.length > MAX_PASSWORD_CHARS) return fail(res, 400, `Password must be at most ${MAX_PASSWORD_CHARS} characters`, 'password_too_long')
  if (!REGISTRATION_INVITE_CODE && !ALLOW_OPEN_REGISTRATION) {
    return fail(
      res,
      403,
      'Registration is closed; configure RATIO_REGISTRATION_INVITE_CODE or explicitly set RATIO_ALLOW_OPEN_REGISTRATION=true',
      'registration_closed',
    )
  }
  if (REGISTRATION_INVITE_CODE && !safeEqualConfiguredSecret(inviteCode, REGISTRATION_INVITE_CODE)) {
    return fail(res, 403, 'Invalid invite code', 'invite_invalid')
  }

  const result = await mutateUsers(async (data) => {
    if (data.users[username]) {
      await hashPassword(password)
      return { exists: true, user: data.users[username] }
    }

    const passwordInfo = await hashPassword(password)
    const user = {
      id: userId(username),
      username,
      passwordHash: passwordInfo.hash,
      passwordSalt: passwordInfo.salt,
      passwordIterations: passwordInfo.iterations,
      createdAt: now(),
      updatedAt: now(),
    }

    data.users[username] = user
    return { exists: false, user }
  })

  if (result.exists) return fail(res, 409, 'Unable to create user with these credentials', 'registration_unavailable')

  const user = result.user
  await mkdir(path.join(DATA_DIR, 'users', user.id), { recursive: true })
  jsonResponse(res, 201, { user: publicUser(user) })
}

function backupMeta(payload) {
  if (!payload) return null
  return {
    updatedAt: payload.updatedAt,
    clientCreatedAt: payload.clientCreatedAt,
    itemCount: payload.itemCount,
    device: payload.device || '',
  }
}

async function handleBackupPut(req, res, user) {
  const body = await parseBody(req, MAX_BACKUP_BYTES)
  const backup = body.backup
  if (!isBackup(backup)) return fail(res, 400, 'Invalid backup payload')
  const backupFile = userFile(user, 'backup.json')

  const result = await runQueuedMutation(backupFile, async () => {
    const current = await readJsonFile(backupFile, null)
    const expectedUpdatedAt = readSyncStamp(body.expectedUpdatedAt)
    const force = body.force === true
    const remoteUpdatedAt = readSyncStamp(current?.updatedAt)

    if (!force && remoteUpdatedAt !== expectedUpdatedAt) {
      return {
        conflict: true,
        meta: backupMeta(current),
        expectedUpdatedAt,
        remoteUpdatedAt,
      }
    }

    const payload = {
      schema: 'ratio.cloud-backup.v1',
      updatedAt: nextBackupUpdatedAt(remoteUpdatedAt),
      clientCreatedAt: backup.createdAt,
      device: typeof body.device === 'string' ? body.device.slice(0, 120) : '',
      itemCount: Object.keys(backup.items).length,
      backup,
    }

    await writeJsonFile(backupFile, payload)
    return { conflict: false, meta: backupMeta(payload) }
  })

  if (result.conflict) {
    console.warn(
      `[ratio-server] backup_conflict user=${user.username} expected=${result.expectedUpdatedAt || '-'} remote=${result.remoteUpdatedAt || '-'} force=false`,
    )
    return fail(res, 409, 'Cloud backup has changed; confirm before overwriting', 'backup_conflict', {
      meta: result.meta,
      expectedUpdatedAt: result.expectedUpdatedAt,
      remoteUpdatedAt: result.remoteUpdatedAt,
    })
  }

  jsonResponse(res, 200, result.meta)
}

async function handleBackupGet(res, user) {
  const payload = await readJsonFile(userFile(user, 'backup.json'), null)
  if (!payload) return jsonResponse(res, 200, { backup: null, meta: null })
  jsonResponse(res, 200, {
    backup: payload.backup,
    meta: backupMeta(payload),
  })
}

async function handleBackupMetaGet(res, user) {
  const payload = await readJsonFile(userFile(user, 'backup.json'), null)
  jsonResponse(res, 200, { meta: backupMeta(payload) })
}

function httpError(message, status, code) {
  const error = new Error(message)
  error.status = status
  error.code = code
  return error
}

function validateAiMessages(value) {
  if (!Array.isArray(value)) throw httpError('messages must be an array', 400, 'ai_messages_invalid')
  if (value.length === 0) throw httpError('messages must not be empty', 400, 'ai_messages_empty')
  if (value.length > AI_MAX_MESSAGES) throw httpError(`messages must contain at most ${AI_MAX_MESSAGES} items`, 400, 'ai_messages_too_many')

  let totalChars = 0
  return value.map((message) => {
    if (!message || typeof message !== 'object' || Array.isArray(message)) {
      throw httpError('each message must be an object', 400, 'ai_message_invalid')
    }

    const role = message.role
    const content = message.content
    if (role !== 'system' && role !== 'user' && role !== 'assistant') {
      throw httpError('message role must be system, user or assistant', 400, 'ai_message_role_invalid')
    }
    if (typeof content !== 'string') throw httpError('message content must be a string', 400, 'ai_message_content_invalid')
    if (content.length > AI_MAX_MESSAGE_CHARS) {
      throw httpError(`message content must be at most ${AI_MAX_MESSAGE_CHARS} characters`, 400, 'ai_message_too_large')
    }

    totalChars += content.length
    if (totalChars > AI_MAX_TOTAL_MESSAGE_CHARS) {
      throw httpError(`messages must contain at most ${AI_MAX_TOTAL_MESSAGE_CHARS} characters`, 400, 'ai_messages_too_large')
    }

    return { role, content }
  })
}

function buildResponsesRequestBody(config, messages, wantsStream) {
  return {
    model: config.model,
    input: messages,
    store: false,
    ...(config.reasoningEffort ? { reasoning: { effort: config.reasoningEffort } } : {}),
    ...(wantsStream ? { stream: true } : {}),
  }
}

function checkAiLimits(req, res, user) {
  const ip = clientAddress(req)
  if (!checkRateLimit('ai-ip', ip, AI_RATE_LIMIT_PER_MINUTE)) {
    fail(res, 429, 'Too many AI requests from this network; try again later', 'ai_rate_limited')
    return false
  }
  if (!checkRateLimit('ai-user', user.id, AI_RATE_LIMIT_PER_MINUTE)) {
    fail(res, 429, 'Too many AI requests for this account; try again later', 'ai_rate_limited')
    return false
  }
  if (!checkDailyLimit('ai-user', user.id, AI_DAILY_REQUEST_LIMIT, false)) {
    fail(res, 429, 'Daily AI request limit reached', 'ai_daily_limit_reached')
    return false
  }
  return true
}

async function readUpstreamTextLimited(upstream, maxBytes) {
  const contentLength = Number(upstream.headers.get('content-length') || 0)
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    throw httpError('AI upstream response is too large', 502, 'ai_upstream_too_large')
  }

  if (!upstream.body) {
    const text = await upstream.text()
    if (Buffer.byteLength(text, 'utf8') > maxBytes) {
      throw httpError('AI upstream response is too large', 502, 'ai_upstream_too_large')
    }
    return text
  }

  const reader = upstream.body.getReader()
  const chunks = []
  let total = 0

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    const chunk = Buffer.from(value)
    total += chunk.length
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined)
      throw httpError('AI upstream response is too large', 502, 'ai_upstream_too_large')
    }
    chunks.push(chunk)
  }

  return Buffer.concat(chunks, total).toString('utf8')
}

function aiMessageCharCount(messages) {
  return messages.reduce((sum, message) => sum + (typeof message.content === 'string' ? message.content.length : 0), 0)
}

function sanitizeServerTelemetryPayload(payload) {
  const safe = {}
  for (const [key, value] of Object.entries(payload || {})) {
    if (/password|token|secret|key|content|message/i.test(key)) continue
    if (typeof value === 'string') safe[key] = value.slice(0, 300)
    else if (typeof value === 'number' || typeof value === 'boolean' || value == null) safe[key] = value
    else safe[key] = JSON.stringify(value).slice(0, 300)
  }
  return safe
}

async function logAiServerTelemetry(req, user, payload) {
  try {
    const event = {
      receivedAt: now(),
      userId: user.id,
      userAgent: req.headers['user-agent'] || '',
      event: {
        name: 'server_ai_chat',
        at: now(),
        payload: sanitizeServerTelemetryPayload(payload),
      },
    }
    const text = `${JSON.stringify(event)}\n`
    const file = telemetryFileForToday(user)
    const incomingBytes = Buffer.byteLength(text)
    if ((await fileSize(file)) + incomingBytes > TELEMETRY_MAX_DAILY_BYTES) return
    await mkdir(path.dirname(file), { recursive: true })
    await appendFile(file, text, 'utf8')
  } catch (error) {
    console.warn('[ratio-server] ai telemetry write failed', error?.message || error)
  }
}

function aiProxyHeaders(upstream) {
  return {
    'Content-Type': upstream.headers.get('content-type') || 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...securityHeaders(),
    ...corsHeaders(),
  }
}

function clientClosedError() {
  const error = new Error('Client closed connection during stream')
  error.code = 'ai_client_closed'
  return error
}

async function writeChunk(res, chunk) {
  if (res.destroyed || res.writableEnded) throw clientClosedError()
  if (res.write(chunk)) return
  // 客户端断连后 'drain' 永不触发，必须与 'close'/'error' 竞速，否则协程永久挂起。
  await new Promise((resolve, reject) => {
    const cleanup = () => {
      res.off('drain', onDrain)
      res.off('close', onClose)
      res.off('error', onError)
    }
    const onDrain = () => {
      cleanup()
      resolve()
    }
    const onClose = () => {
      cleanup()
      reject(clientClosedError())
    }
    const onError = (error) => {
      cleanup()
      reject(error)
    }
    res.once('drain', onDrain)
    res.once('close', onClose)
    res.once('error', onError)
  })
}

async function pipeUpstreamStreamLimited(upstream, res, maxBytes) {
  if (!upstream.body) {
    res.end()
    return 0
  }

  const reader = upstream.body.getReader()
  let total = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      const chunk = Buffer.from(value)
      total += chunk.length
      if (total > maxBytes) {
        await reader.cancel().catch(() => undefined)
        const errorPayload = JSON.stringify({ error: { code: 'ai_upstream_too_large', message: 'AI upstream response is too large' } })
        await writeChunk(res, `event: error\ndata: ${errorPayload}\n\n`)
        break
      }
      await writeChunk(res, chunk)
    }
  } finally {
    if (!res.destroyed && !res.writableEnded) res.end()
  }
  return total
}

function handleAiStatus(res) {
  const config = readAiConfig()
  const issue = getAiConfigIssueInfo(config)
  jsonResponse(res, 200, {
    ai: {
      configured: issue === null,
      issue: issue?.message ?? null,
      issueCode: issue?.code ?? null,
      message: issue === null ? 'AI service is configured' : issue.message,
      model: config.model,
      reasoningEffort: config.reasoningEffort,
      hasApiKey: Boolean(config.apiKey),
      apiKeyMasked: maskSecret(config.apiKey),
      chatUrlSummary: summarizeUrl(config.chatUrl),
      limits: {
        maxMessages: AI_MAX_MESSAGES,
        maxMessageChars: AI_MAX_MESSAGE_CHARS,
        maxTotalMessageChars: AI_MAX_TOTAL_MESSAGE_CHARS,
        rateLimitPerMinute: AI_RATE_LIMIT_PER_MINUTE,
        dailyRequestLimit: AI_DAILY_REQUEST_LIMIT,
        timeoutMs: AI_UPSTREAM_TIMEOUT_MS,
      },
    },
  })
}

async function handleAiChat(req, res, user) {
  const startedAt = Date.now()
  const config = readAiConfig()
  const issue = getAiConfigIssueInfo(config)
  if (issue) {
    await logAiServerTelemetry(req, user, {
      status: 503,
      ok: false,
      errorCode: issue.code,
      durationMs: Date.now() - startedAt,
    })
    return fail(res, 503, issue.message, 'ai_config_missing', { issueCode: issue.code })
  }
  if (!checkAiLimits(req, res, user)) {
    await logAiServerTelemetry(req, user, {
      status: 429,
      ok: false,
      errorCode: 'ai_rate_limited',
      durationMs: Date.now() - startedAt,
    })
    return
  }

  const body = await parseBody(req, 1024 * 1024)
  const wantsStream = body.stream === true
  let messages
  try {
    messages = validateAiMessages(body.messages)
  } catch (error) {
    await logAiServerTelemetry(req, user, {
      status: error.status || 400,
      ok: false,
      stream: wantsStream,
      errorCode: error.code || 'ai_messages_invalid',
      durationMs: Date.now() - startedAt,
    })
    return fail(res, error.status || 400, error.message, error.code || 'ai_messages_invalid')
  }
  const requestChars = aiMessageCharCount(messages)

  const controller = new AbortController()
  let timedOut = false
  let responseClosed = false
  const timeout = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, AI_UPSTREAM_TIMEOUT_MS)
  const onResponseClose = () => {
    if (responseClosed) return
    controller.abort()
  }
  res.on('close', onResponseClose)

  let upstream
  try {
    upstream = await fetch(config.chatUrl, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
      },
      body: JSON.stringify(buildResponsesRequestBody(config, messages, wantsStream)),
    })
  } catch {
    clearTimeout(timeout)
    res.off('close', onResponseClose)
    if (timedOut) {
      await logAiServerTelemetry(req, user, {
        status: 504,
        ok: false,
        stream: wantsStream,
        errorCode: 'ai_upstream_timeout',
        requestChars,
        durationMs: Date.now() - startedAt,
      })
      return fail(res, 504, 'AI upstream request timed out', 'ai_upstream_timeout')
    }
    if (controller.signal.aborted) return
    await logAiServerTelemetry(req, user, {
      status: 502,
      ok: false,
      stream: wantsStream,
      errorCode: 'ai_upstream_failed',
      requestChars,
      durationMs: Date.now() - startedAt,
    })
    return fail(res, 502, 'AI upstream request failed', 'ai_upstream_failed')
  }

  try {
    if (wantsStream && upstream.ok) {
      incrementDailyLimit('ai-user', user.id)
      res.writeHead(upstream.status, aiProxyHeaders(upstream))
      const responseBytes = await pipeUpstreamStreamLimited(upstream, res, AI_MAX_RESPONSE_BYTES)
      responseClosed = true
      clearTimeout(timeout)
      res.off('close', onResponseClose)
      await logAiServerTelemetry(req, user, {
        status: upstream.status,
        ok: true,
        stream: true,
        requestChars,
        responseBytes,
        durationMs: Date.now() - startedAt,
      })
      return
    }

    const text = await readUpstreamTextLimited(upstream, AI_MAX_RESPONSE_BYTES)
    if (upstream.ok) incrementDailyLimit('ai-user', user.id)
    responseClosed = true
    clearTimeout(timeout)
    res.off('close', onResponseClose)
    res.writeHead(upstream.status, aiProxyHeaders(upstream))
    res.end(text)
    await logAiServerTelemetry(req, user, {
      status: upstream.status,
      ok: upstream.ok,
      stream: wantsStream,
      requestChars,
      responseBytes: Buffer.byteLength(text, 'utf8'),
      errorCode: upstream.ok ? '' : 'ai_upstream_http_error',
      durationMs: Date.now() - startedAt,
    })
  } catch (error) {
    clearTimeout(timeout)
    res.off('close', onResponseClose)
    if (error && error.code === 'ai_upstream_too_large') {
      await logAiServerTelemetry(req, user, {
        status: error.status || 502,
        ok: false,
        stream: wantsStream,
        requestChars,
        errorCode: error.code,
        durationMs: Date.now() - startedAt,
      })
      return fail(res, error.status || 502, error.message, error.code)
    }
    if (timedOut) {
      await logAiServerTelemetry(req, user, {
        status: 504,
        ok: false,
        stream: wantsStream,
        requestChars,
        errorCode: 'ai_upstream_timeout',
        durationMs: Date.now() - startedAt,
      })
      return fail(res, 504, 'AI upstream response timed out', 'ai_upstream_timeout')
    }
    if (controller.signal.aborted) return
    await logAiServerTelemetry(req, user, {
      status: 502,
      ok: false,
      stream: wantsStream,
      requestChars,
      errorCode: 'ai_upstream_response_failed',
      durationMs: Date.now() - startedAt,
    })
    return fail(res, 502, 'AI upstream response failed', 'ai_upstream_failed')
  }
}

async function handleTelemetry(req, res, user) {
  await pruneTelemetryForUser(user)
  const body = await parseBody(req, 256 * 1024)
  const events = Array.isArray(body.events) ? body.events : [body]
  const safeEvents = events.slice(0, 50).map((event) => ({
    receivedAt: now(),
    userId: user.id,
    userAgent: req.headers['user-agent'] || '',
    event,
  }))
  if (safeEvents.length === 0) return jsonResponse(res, 200, { accepted: 0 })

  const file = userFile(user, `telemetry-${new Date().toISOString().slice(0, 10)}.ndjson`)
  await mkdir(path.dirname(file), { recursive: true })
  const text = `${safeEvents.map((event) => JSON.stringify(event)).join('\n')}\n`
  const incomingBytes = Buffer.byteLength(text)
  const result = await runQueuedMutation(file, async () => {
    let currentBytes = 0
    try {
      currentBytes = (await stat(file)).size
    } catch (error) {
      if (error && error.code !== 'ENOENT') throw error
    }
    if (currentBytes + incomingBytes > TELEMETRY_MAX_DAILY_BYTES) {
      return { accepted: 0, dropped: safeEvents.length, reason: 'telemetry_log_full' }
    }
    await appendFile(file, text, 'utf8')
    return { accepted: safeEvents.length }
  })
  jsonResponse(res, 200, result)
}

async function readFileTail(file, maxBytes) {
  let handle
  try {
    handle = await open(file, 'r')
  } catch (error) {
    if (error && error.code === 'ENOENT') return ''
    throw error
  }

  try {
    const info = await handle.stat()
    const length = Math.min(info.size, maxBytes)
    if (length <= 0) return ''

    const buffer = Buffer.alloc(length)
    const { bytesRead } = await handle.read(buffer, 0, length, info.size - length)
    let text = buffer.subarray(0, bytesRead).toString('utf8')
    if (info.size > length) {
      const newline = text.indexOf('\n')
      text = newline >= 0 ? text.slice(newline + 1) : ''
    }
    return text
  } finally {
    await handle.close()
  }
}

async function readJsonFileSafe(file, fallback) {
  try {
    return await readJsonFile(file, fallback)
  } catch {
    return fallback
  }
}

async function fileSize(file) {
  try {
    return (await stat(file)).size
  } catch (error) {
    if (error && error.code === 'ENOENT') return 0
    throw error
  }
}

async function directoryUsage(dir) {
  const usage = { totalBytes: 0, files: 0, directories: 0 }

  async function walk(current) {
    let entries
    try {
      entries = await readdir(current, { withFileTypes: true })
    } catch (error) {
      if (error && error.code === 'ENOENT') return
      throw error
    }

    for (const entry of entries) {
      const fullPath = path.join(current, entry.name)
      if (entry.isDirectory()) {
        usage.directories += 1
        await walk(fullPath)
        continue
      }

      if (!entry.isFile()) continue
      try {
        const info = await stat(fullPath)
        usage.files += 1
        usage.totalBytes += info.size
      } catch (error) {
        if (!error || error.code !== 'ENOENT') throw error
      }
    }
  }

  await walk(dir)
  return usage
}

function telemetryFileForToday(user) {
  return userFile(user, `telemetry-${new Date().toISOString().slice(0, 10)}.ndjson`)
}

function summarizeUrl(value) {
  if (!value) return ''
  try {
    const url = new URL(value)
    return `${url.protocol}//${url.host}${url.pathname}`
  } catch {
    return 'invalid'
  }
}

function recentDateKeys(days = 7) {
  const keys = []
  const nowMs = Date.now()
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    keys.push(new Date(nowMs - offset * 24 * 60 * 60 * 1000).toISOString().slice(0, 10))
  }
  return keys
}

function telemetryFileForDate(user, dateKey) {
  return userFile(user, `telemetry-${dateKey}.ndjson`)
}

function adminAuditFileForDate(dateKey) {
  return path.join(DATA_DIR, `admin-audit-${dateKey}.ndjson`)
}

function adminActor(req) {
  const auth = readBasicAuth(req)
  return typeof auth?.username === 'string' && auth.username.trim() ? auth.username.trim().slice(0, 64) : 'admin'
}

function isSafeUserFileName(name) {
  return (
    typeof name === 'string' &&
    name.length > 0 &&
    name.length <= 180 &&
    !name.startsWith('.') &&
    !name.includes('..') &&
    !name.includes('/') &&
    !name.includes('\\') &&
    /^[\w.-]+$/.test(name)
  )
}

function safeUserFilePath(user, filename) {
  if (!isSafeUserFileName(filename)) throw httpError('Invalid file name', 400, 'admin_file_name_invalid')
  const userDir = path.resolve(DATA_DIR, 'users', user.id)
  const file = path.resolve(userDir, filename)
  if (file !== path.join(userDir, path.basename(file))) {
    throw httpError('Invalid file path', 400, 'admin_file_path_invalid')
  }
  return file
}

function decodePathSegment(value) {
  try {
    return decodeURIComponent(value)
  } catch {
    throw httpError('Invalid URL path segment', 400, 'path_invalid')
  }
}

function validateAdminUsername(username) {
  if (!/^[\w.@-]{3,64}$/.test(username)) {
    throw httpError('Username must be 3-64 letters, numbers, dot, underscore or dash', 400, 'username_invalid')
  }
}

function validateAdminPassword(password) {
  if (typeof password !== 'string' || password.length < 8) {
    throw httpError('Password must be at least 8 characters', 400, 'password_too_short')
  }
  if (password.length > MAX_PASSWORD_CHARS) {
    throw httpError(`Password must be at most ${MAX_PASSWORD_CHARS} characters`, 400, 'password_too_long')
  }
}

async function findUserByUsername(username) {
  validateAdminUsername(username)
  const data = await readUsers()
  const user = data.users[username]
  if (!user || typeof user !== 'object') throw httpError('User not found', 404, 'user_not_found')
  return user
}

function clearUserAuthState(username) {
  failedAuthAccounts.delete(authFailureKey(username))
  for (const [cacheKey, cached] of authCache.entries()) {
    if (cached?.user?.username === username) authCache.delete(cacheKey)
  }
}

function contentTypeForFile(name) {
  if (name.endsWith('.json')) return 'application/json; charset=utf-8'
  if (name.endsWith('.ndjson')) return 'application/x-ndjson; charset=utf-8'
  if (name.endsWith('.txt') || name.endsWith('.log')) return 'text/plain; charset=utf-8'
  return 'application/octet-stream'
}

function auditDetails(details = {}) {
  const safe = {}
  for (const [key, value] of Object.entries(details || {})) {
    if (/password|token|secret|apiKey|authorization|backup|body|content/i.test(key)) continue
    if (typeof value === 'string') safe[key] = value.slice(0, 300)
    else if (typeof value === 'number' || typeof value === 'boolean' || value == null) safe[key] = value
    else safe[key] = JSON.stringify(value).slice(0, 300)
  }
  return safe
}

async function writeAdminAudit(req, actor, action, target, result, details = {}) {
  const dateKey = new Date().toISOString().slice(0, 10)
  const file = adminAuditFileForDate(dateKey)
  const event = {
    at: now(),
    admin: actor,
    action,
    target: target || '',
    result,
    code: typeof details.code === 'string' ? details.code : '',
    details: auditDetails(details),
    ip: clientAddress(req),
    userAgent: String(req.headers['user-agent'] || '').slice(0, 160),
  }
  await mkdir(path.dirname(file), { recursive: true })
  await runQueuedMutation(file, () => appendFile(file, `${JSON.stringify(event)}\n`, 'utf8'))
}

async function auditAdminAction(req, action, target, task) {
  const actor = adminActor(req)
  try {
    const result = await task(actor)
    await writeAdminAudit(req, actor, action, target, 'ok', result?.audit || {})
    return result
  } catch (error) {
    await writeAdminAudit(req, actor, action, target, 'error', {
      code: error?.code || 'error',
      message: error?.message || 'Unknown error',
    }).catch((auditError) => {
      console.warn('[ratio-server] admin audit write failed', auditError?.message || auditError)
    })
    throw error
  }
}

async function readNdjsonFile(file) {
  try {
    const text = await readFile(file, 'utf8')
    if (!text.trim()) return []
    return text.trim().split('\n').flatMap((line) => {
      try {
        return [JSON.parse(line)]
      } catch {
        return []
      }
    })
  } catch (error) {
    if (error && error.code === 'ENOENT') return []
    throw error
  }
}

function telemetryInfo(entry) {
  const event = entry && typeof entry.event === 'object' && entry.event !== null ? entry.event : entry
  const payload = event && typeof event.payload === 'object' && event.payload !== null ? event.payload : {}
  const name = typeof event?.name === 'string' ? event.name : typeof entry?.name === 'string' ? entry.name : 'event'
  const time = entry?.receivedAt || event?.at || entry?.at || ''
  return { name, payload, time }
}

function isTelemetryError(info) {
  return (
    /error|failed|failure|rejection|timeout|conflict/i.test(info.name) ||
    info.payload?.ok === false ||
    typeof info.payload?.errorCode === 'string'
  )
}

async function userTelemetryFileSummary(user) {
  let entries
  try {
    entries = await readdir(path.join(DATA_DIR, 'users', user.id), { withFileTypes: true })
  } catch (error) {
    if (error && error.code === 'ENOENT') return { files: 0, bytes: 0, latestAt: '' }
    throw error
  }

  let files = 0
  let bytes = 0
  let latestAt = ''
  for (const entry of entries) {
    if (!entry.isFile() || !/^telemetry-\d{4}-\d{2}-\d{2}\.ndjson$/.test(entry.name)) continue
    const file = userFile(user, entry.name)
    try {
      const info = await stat(file)
      files += 1
      bytes += info.size
      const stamp = info.mtime.toISOString()
      if (!latestAt || stamp > latestAt) latestAt = stamp
    } catch (error) {
      if (!error || error.code !== 'ENOENT') throw error
    }
  }
  return { files, bytes, latestAt }
}

async function listUserFiles(user) {
  let entries
  const userDir = path.join(DATA_DIR, 'users', user.id)
  try {
    entries = await readdir(userDir, { withFileTypes: true })
  } catch (error) {
    if (error && error.code === 'ENOENT') return []
    throw error
  }

  const files = []
  for (const entry of entries) {
    if (!entry.isFile()) continue
    const file = path.join(userDir, entry.name)
    try {
      const info = await stat(file)
      files.push({
        name: entry.name,
        size: info.size,
        mtime: info.mtime.toISOString(),
        safe: isSafeUserFileName(entry.name),
      })
    } catch (error) {
      if (!error || error.code !== 'ENOENT') throw error
    }
  }
  files.sort((left, right) => left.name.localeCompare(right.name))
  return files
}

async function getAdminUsers() {
  const data = await readUsers()
  const users = Object.values(data.users)
    .filter((user) => user && typeof user === 'object' && typeof user.username === 'string')
    .sort((left, right) => left.username.localeCompare(right.username))

  return Promise.all(users.map(async (user) => {
    const backupFile = userFile(user, 'backup.json')
    const backupPayload = await readJsonFileSafe(backupFile, null)
    const backup = backupMeta(backupPayload)
    const userDir = path.join(DATA_DIR, 'users', user.id)
    const usage = await directoryUsage(userDir)
    const telemetry = await userTelemetryFileSummary(user)
    const files = await listUserFiles(user)

    return {
      ...publicUser(user),
      backup,
      backupBytes: await fileSize(backupFile),
      telemetryTodayBytes: await fileSize(telemetryFileForToday(user)),
      telemetryFiles: telemetry.files,
      telemetryBytes: telemetry.bytes,
      latestTelemetryAt: telemetry.latestAt,
      directoryBytes: usage.totalBytes,
      directoryFiles: usage.files,
      files,
    }
  }))
}

async function readTelemetryEventsForUser(user, limit, dateKey = new Date().toISOString().slice(0, 10)) {
  const text = await readFileTail(telemetryFileForDate(user, dateKey), Math.min(TELEMETRY_MAX_DAILY_BYTES, 512 * 1024))
  if (!text.trim()) return []

  return text.trim().split('\n').slice(-limit).flatMap((line) => {
    try {
      const entry = JSON.parse(line)
      return [{ ...entry, username: user.username }]
    } catch {
      return []
    }
  })
}

async function readRecentTelemetryEventsForUser(user, limit) {
  const perDateLimit = Math.max(10, Math.ceil(limit / 3))
  const events = []
  for (const date of recentDateKeys(7)) {
    events.push(...await readTelemetryEventsForUser(user, perDateLimit, date))
  }
  events.sort((left, right) => {
    const a = Date.parse(left.receivedAt || left.event?.at || left.at || '')
    const b = Date.parse(right.receivedAt || right.event?.at || right.at || '')
    return (Number.isNaN(b) ? 0 : b) - (Number.isNaN(a) ? 0 : a)
  })
  return events.slice(0, limit)
}

async function buildTelemetryTrend(users, dateKeys) {
  const byDate = new Map(dateKeys.map((date) => [date, {
    date,
    events: 0,
    errors: 0,
    aiSuccess: 0,
    aiFailure: 0,
    bytes: 0,
  }]))
  const aiSummary = { total: 0, ok: 0, failed: 0, avgDurationMs: null }
  let durationTotal = 0
  let durationCount = 0

  for (const user of users) {
    for (const date of dateKeys) {
      const file = telemetryFileForDate(user, date)
      const day = byDate.get(date)
      day.bytes += await fileSize(file)
      const entries = await readNdjsonFile(file)
      for (const entry of entries) {
        const info = telemetryInfo(entry)
        day.events += 1
        if (isTelemetryError(info)) day.errors += 1
        if (info.name === 'server_ai_chat') {
          aiSummary.total += 1
          if (info.payload?.ok === true) {
            aiSummary.ok += 1
            day.aiSuccess += 1
          } else {
            aiSummary.failed += 1
            day.aiFailure += 1
          }
          if (typeof info.payload?.durationMs === 'number' && Number.isFinite(info.payload.durationMs)) {
            durationTotal += info.payload.durationMs
            durationCount += 1
          }
        }
      }
    }
  }

  if (durationCount > 0) aiSummary.avgDurationMs = Math.round(durationTotal / durationCount)
  return { trend: [...byDate.values()], aiSummary }
}

async function pruneTelemetryForUser(user) {
  const nowMs = Date.now()
  const nextPruneAt = telemetryPruneAt.get(user.id) || 0
  if (nextPruneAt > nowMs) return
  telemetryPruneAt.set(user.id, nowMs + 12 * 60 * 60 * 1000)

  const userDir = path.join(DATA_DIR, 'users', user.id)
  const cutoffDate = new Date(nowMs - TELEMETRY_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  let entries
  try {
    entries = await readdir(userDir, { withFileTypes: true })
  } catch (error) {
    if (error && error.code === 'ENOENT') return
    throw error
  }

  await Promise.all(entries.map(async (entry) => {
    if (!entry.isFile()) return
    const match = /^telemetry-(\d{4}-\d{2}-\d{2})\.ndjson$/.exec(entry.name)
    if (!match || match[1] >= cutoffDate) return
    await unlink(path.join(userDir, entry.name)).catch((error) => {
      if (!error || error.code !== 'ENOENT') throw error
    })
  }))
}

async function getAdminTelemetryEvents(username, limit) {
  const data = await readUsers()
  const users = Object.values(data.users)
    .filter((user) => user && typeof user === 'object' && typeof user.username === 'string')
    .filter((user) => !username || user.username === username)

  if (username && users.length === 0) {
    const error = new Error('User not found')
    error.status = 404
    error.code = 'user_not_found'
    throw error
  }

  const perUserLimit = username ? limit : Math.max(10, Math.ceil(limit / Math.max(users.length, 1)) + 10)
  const events = (await Promise.all(users.map((user) => readRecentTelemetryEventsForUser(user, perUserLimit)))).flat()
  events.sort((left, right) => {
    const a = Date.parse(left.receivedAt || left.at || '')
    const b = Date.parse(right.receivedAt || right.at || '')
    return (Number.isNaN(b) ? 0 : b) - (Number.isNaN(a) ? 0 : a)
  })
  return events.slice(0, limit)
}

async function getAdminAuditEvents(limit) {
  const events = []
  for (const date of recentDateKeys(7).reverse()) {
    const entries = await readNdjsonFile(adminAuditFileForDate(date))
    events.push(...entries)
    if (events.length >= limit * 2) break
  }
  events.sort((left, right) => {
    const a = Date.parse(left.at || '')
    const b = Date.parse(right.at || '')
    return (Number.isNaN(b) ? 0 : b) - (Number.isNaN(a) ? 0 : a)
  })
  return events.slice(0, limit)
}

async function handleAdminOverview(res) {
  let healthOk = true
  try {
    await checkDataWritable()
  } catch {
    healthOk = false
  }

  const users = await getAdminUsers()
  const aiConfig = readAiConfig()
  const aiIssue = getAiConfigIssue(aiConfig)
  const storage = await directoryUsage(DATA_DIR)
  const telemetryTodayBytes = users.reduce((sum, user) => sum + user.telemetryTodayBytes, 0)
  const recentEvents = await getAdminTelemetryEvents('', 100)
  const telemetryStats = await buildTelemetryTrend(users, recentDateKeys(7))
  const topStorageUsers = users
    .slice()
    .sort((left, right) => right.directoryBytes - left.directoryBytes)
    .slice(0, 5)
    .map((user) => ({ username: user.username, bytes: user.directoryBytes, files: user.directoryFiles }))

  jsonResponse(res, 200, {
    service: {
      ok: healthOk,
      name: 'ratio-server',
      time: now(),
      uptimeSeconds: process.uptime(),
      node: process.version,
    },
    config: {
      corsOrigin: CORS_ORIGIN,
      maxBackupBytes: MAX_BACKUP_BYTES,
      trustProxy: TRUST_PROXY,
      telemetryRetentionDays: TELEMETRY_RETENTION_DAYS,
    },
    registration: {
      inviteRequired: Boolean(REGISTRATION_INVITE_CODE),
      openRegistration: ALLOW_OPEN_REGISTRATION && !REGISTRATION_INVITE_CODE,
    },
    ai: {
      configured: aiIssue === null,
      issue: aiIssue,
      model: aiConfig.model,
      reasoningEffort: aiConfig.reasoningEffort,
      hasApiKey: Boolean(aiConfig.apiKey),
      apiKeyMasked: maskSecret(aiConfig.apiKey),
      chatUrl: summarizeUrl(aiConfig.chatUrl),
      timeoutMs: AI_UPSTREAM_TIMEOUT_MS,
      maxResponseBytes: AI_MAX_RESPONSE_BYTES,
    },
    telemetry: {
      todayBytes: telemetryTodayBytes,
      maxDailyBytes: TELEMETRY_MAX_DAILY_BYTES,
      recentEvents: recentEvents.length,
      trend: telemetryStats.trend,
    },
    aiSummary: telemetryStats.aiSummary,
    limits: {
      authPerMinute: AUTH_RATE_LIMIT_PER_MINUTE,
      registerPerMinute: REGISTER_RATE_LIMIT_PER_MINUTE,
      adminPerMinute: ADMIN_RATE_LIMIT_PER_MINUTE,
      authMaxFailedAttempts: AUTH_MAX_FAILED_ATTEMPTS,
      authLockoutMs: AUTH_LOCKOUT_MS,
      activeBuckets: rateLimitBuckets.size,
    },
    users: {
      total: users.length,
      withBackup: users.filter((user) => user.backup).length,
    },
    storage: {
      dataDir: DATA_DIR,
      totalBytes: storage.totalBytes,
      files: storage.files,
      directories: storage.directories,
      topUsers: topStorageUsers,
    },
  })
}

async function handleAdminUsers(res) {
  jsonResponse(res, 200, { users: await getAdminUsers() })
}

async function handleAdminTelemetryRecent(req, res) {
  const url = new URL(req.url, 'http://localhost')
  const limit = parseLimitParam(url.searchParams.get('limit'), 50, 200)
  const username = (url.searchParams.get('username') || '').trim()
  try {
    jsonResponse(res, 200, { events: await getAdminTelemetryEvents(username, limit) })
  } catch (error) {
    if (error && error.status === 404) return fail(res, 404, error.message, error.code || 'not_found')
    throw error
  }
}

async function handleAdminAuditRecent(req, res) {
  const url = new URL(req.url, 'http://localhost')
  const limit = parseLimitParam(url.searchParams.get('limit'), 50, 300)
  jsonResponse(res, 200, { events: await getAdminAuditEvents(limit) })
}

async function handleAdminUserCreate(req, res) {
  const body = await parseBody(req, 64 * 1024)
  const username = typeof body.username === 'string' ? body.username.trim() : ''
  const password = typeof body.password === 'string' ? body.password : ''
  const result = await auditAdminAction(req, 'user.create', username, async () => {
    validateAdminUsername(username)
    validateAdminPassword(password)
    const mutation = await mutateUsers(async (data) => {
      if (data.users[username]) throw httpError('User already exists', 409, 'user_exists')
      const passwordInfo = await hashPassword(password)
      const user = {
        id: userId(username),
        username,
        passwordHash: passwordInfo.hash,
        passwordSalt: passwordInfo.salt,
        passwordIterations: passwordInfo.iterations,
        createdAt: now(),
        updatedAt: now(),
      }
      data.users[username] = user
      return user
    })
    await mkdir(path.join(DATA_DIR, 'users', mutation.id), { recursive: true })
    return { user: publicUser(mutation), audit: { username } }
  })
  jsonResponse(res, 201, { user: result.user })
}

async function handleAdminPasswordReset(req, res, username) {
  const body = await parseBody(req, 64 * 1024)
  const password = typeof body.password === 'string' ? body.password : ''
  const result = await auditAdminAction(req, 'user.password_reset', username, async () => {
    validateAdminUsername(username)
    validateAdminPassword(password)
    const user = await mutateUsers(async (data) => {
      const current = data.users[username]
      if (!current) throw httpError('User not found', 404, 'user_not_found')
      const passwordInfo = await hashPassword(password)
      current.passwordHash = passwordInfo.hash
      current.passwordSalt = passwordInfo.salt
      current.passwordIterations = passwordInfo.iterations
      current.updatedAt = now()
      return current
    })
    clearUserAuthState(username)
    return { user: publicUser(user), audit: { username } }
  })
  jsonResponse(res, 200, { user: result.user })
}

async function handleAdminUserDelete(req, res, username) {
  const result = await auditAdminAction(req, 'user.delete', username, async () => {
    validateAdminUsername(username)
    const user = await mutateUsers(async (data) => {
      const current = data.users[username]
      if (!current) throw httpError('User not found', 404, 'user_not_found')
      delete data.users[username]
      return current
    })
    clearUserAuthState(username)
    await rm(path.join(DATA_DIR, 'users', user.id), { recursive: true, force: true })
    return { audit: { username, userId: user.id } }
  })
  jsonResponse(res, 200, { ok: true, audit: result.audit })
}

async function handleAdminBackupDelete(req, res, username) {
  const result = await auditAdminAction(req, 'backup.delete', username, async () => {
    const user = await findUserByUsername(username)
    const file = userFile(user, 'backup.json')
    const bytes = await fileSize(file)
    await unlink(file).catch((error) => {
      if (!error || error.code !== 'ENOENT') throw error
    })
    return { audit: { username, bytes } }
  })
  jsonResponse(res, 200, { ok: true, ...result.audit })
}

async function handleAdminTelemetryClear(req, res, username) {
  const result = await auditAdminAction(req, 'telemetry.clear', username, async () => {
    const user = await findUserByUsername(username)
    const files = await listUserFiles(user)
    let deleted = 0
    let bytes = 0
    for (const file of files) {
      if (!/^telemetry-\d{4}-\d{2}-\d{2}\.ndjson$/.test(file.name)) continue
      bytes += file.size
      await unlink(safeUserFilePath(user, file.name)).catch((error) => {
        if (!error || error.code !== 'ENOENT') throw error
      })
      deleted += 1
    }
    telemetryPruneAt.delete(user.id)
    return { audit: { username, deleted, bytes } }
  })
  jsonResponse(res, 200, { ok: true, ...result.audit })
}

async function handleAdminUserFiles(res, username) {
  const user = await findUserByUsername(username)
  jsonResponse(res, 200, { user: publicUser(user), files: await listUserFiles(user) })
}

async function handleAdminUserFileDownload(req, res, username, filename) {
  const result = await auditAdminAction(req, 'file.download', `${username}/${filename}`, async () => {
    const user = await findUserByUsername(username)
    const file = safeUserFilePath(user, filename)
    const buffer = await readFile(file)
    return { buffer, audit: { username, filename, bytes: buffer.length } }
  })
  downloadBufferResponse(res, filename, result.buffer, contentTypeForFile(filename))
}

async function handleAdminUserFileDelete(req, res, username, filename) {
  const result = await auditAdminAction(req, 'file.delete', `${username}/${filename}`, async () => {
    const user = await findUserByUsername(username)
    const file = safeUserFilePath(user, filename)
    const bytes = await fileSize(file)
    await unlink(file)
    return { audit: { username, filename, bytes } }
  })
  jsonResponse(res, 200, { ok: true, ...result.audit })
}

async function handleAdminUserExport(req, res, username) {
  const result = await auditAdminAction(req, 'user.export', username, async () => {
    const user = await findUserByUsername(username)
    const files = []
    for (const file of await listUserFiles(user)) {
      if (!file.safe) continue
      const content = await readFile(safeUserFilePath(user, file.name), 'utf8')
      files.push({
        name: file.name,
        size: file.size,
        mtime: file.mtime,
        encoding: 'utf8',
        content,
      })
    }
    return {
      package: {
        schema: 'ratio.admin.user-files.v1',
        exportedAt: now(),
        user: publicUser(user),
        files,
      },
      audit: { username, files: files.length },
    }
  })
  downloadJsonResponse(res, `ratio-user-${username}-files.json`, result.package)
}

function adminAssetHeaders() {
  return {
    'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  }
}

function handleAdminAsset(req, res, pathname) {
  if (req.method !== 'GET') return textResponse(res, 405, 'Method not allowed')

  if (pathname === '/admin') {
    if (!isAdminConfigured()) return adminDisabled(res, true)
    return textResponse(res, 200, adminHtml, 'text/html; charset=utf-8', adminAssetHeaders())
  }
  if (pathname === '/admin/styles.css') {
    return textResponse(res, 200, adminCss, 'text/css; charset=utf-8', adminAssetHeaders())
  }
  if (pathname === '/admin/app.js') {
    return textResponse(res, 200, adminJs, 'text/javascript; charset=utf-8', adminAssetHeaders())
  }

  return textResponse(res, 404, 'Not found')
}

async function handleAdminApi(req, res, pathname) {
  if (!requireAdmin(req, res)) return

  const parts = pathname.split('/').filter(Boolean).map(decodePathSegment)
  if (req.method === 'GET' && (pathname === '/api/admin' || pathname === '/api/admin/overview')) return handleAdminOverview(res)
  if (req.method === 'GET' && pathname === '/api/admin/users') return handleAdminUsers(res)
  if (req.method === 'GET' && pathname === '/api/admin/telemetry/recent') return handleAdminTelemetryRecent(req, res)
  if (req.method === 'GET' && pathname === '/api/admin/audit/recent') return handleAdminAuditRecent(req, res)

  if (parts[0] === 'api' && parts[1] === 'admin' && parts[2] === 'users') {
    if (parts.length === 3 && req.method === 'POST') return handleAdminUserCreate(req, res)

    const username = parts[3]
    if (!username) return fail(res, 404, 'Not found', 'not_found')
    if (parts.length === 4 && req.method === 'DELETE') return handleAdminUserDelete(req, res, username)
    if (parts.length === 5 && parts[4] === 'password' && req.method === 'POST') {
      return handleAdminPasswordReset(req, res, username)
    }
    if (parts.length === 5 && parts[4] === 'backup' && req.method === 'DELETE') {
      return handleAdminBackupDelete(req, res, username)
    }
    if (parts.length === 5 && parts[4] === 'telemetry' && req.method === 'DELETE') {
      return handleAdminTelemetryClear(req, res, username)
    }
    if (parts.length === 5 && parts[4] === 'files' && req.method === 'GET') {
      return handleAdminUserFiles(res, username)
    }
    if (parts.length === 5 && parts[4] === 'export' && req.method === 'GET') {
      return handleAdminUserExport(req, res, username)
    }
    if (parts.length === 6 && parts[4] === 'files' && req.method === 'DELETE') {
      return handleAdminUserFileDelete(req, res, username, parts[5])
    }
    if (parts.length === 7 && parts[4] === 'files' && parts[6] === 'download' && req.method === 'GET') {
      return handleAdminUserFileDownload(req, res, username, parts[5])
    }
  }

  if (req.method !== 'GET' && req.method !== 'POST' && req.method !== 'DELETE') {
    return fail(res, 405, 'Method not allowed', 'method_not_allowed')
  }

  return fail(res, 404, 'Not found', 'not_found')
}

async function handleTelemetryRecent(req, res, user) {
  const file = userFile(user, `telemetry-${new Date().toISOString().slice(0, 10)}.ndjson`)
  const text = await readFileTail(file, Math.min(TELEMETRY_MAX_DAILY_BYTES, 512 * 1024))
  const limit = parseLimitParam(new URL(req.url, 'http://x').searchParams.get('limit'), 20, 100)
  const entries = text.trim()
    ? text.trim().split('\n').slice(-limit).flatMap((line) => {
        try {
          return [JSON.parse(line)]
        } catch {
          return []
        }
      })
    : []
  jsonResponse(res, 200, { events: entries })
}

async function route(req, res) {
  if (req.method === 'OPTIONS') return emptyResponse(res)
  const url = new URL(req.url, 'http://localhost')
  const pathname = url.pathname.replace(/\/+$/, '') || '/'

  if (req.method === 'GET' && pathname === '/api/health') {
    let writable = true
    try {
      await checkDataWritable()
    } catch {
      writable = false
    }
    return jsonResponse(res, writable ? 200 : 503, { ok: writable, service: 'ratio-server', time: now(), writable })
  }

  if (pathname === '/admin' || pathname.startsWith('/admin/')) return handleAdminAsset(req, res, pathname)
  if (pathname === '/api/admin' || pathname.startsWith('/api/admin/')) return handleAdminApi(req, res, pathname)

  if (req.method === 'POST' && pathname === '/api/users') return handleRegister(req, res)

  const user = await requireUser(req, res)
  if (!user) return

  if (req.method === 'GET' && pathname === '/api/me') return jsonResponse(res, 200, { user: publicUser(user) })
  if (req.method === 'GET' && pathname === '/api/backup/meta') return handleBackupMetaGet(res, user)
  if (req.method === 'GET' && pathname === '/api/backup') return handleBackupGet(res, user)
  if (req.method === 'PUT' && pathname === '/api/backup') return handleBackupPut(req, res, user)
  if (req.method === 'GET' && pathname === '/api/ai/status') return handleAiStatus(res)
  if (req.method === 'POST' && pathname === '/api/ai/chat') return handleAiChat(req, res, user)
  if (req.method === 'POST' && pathname === '/api/telemetry') return handleTelemetry(req, res, user)
  if (req.method === 'GET' && pathname === '/api/telemetry/recent') return handleTelemetryRecent(req, res, user)

  fail(res, 404, 'Not found', 'not_found')
}

await ensureDataDir()

const server = http.createServer((req, res) => {
  route(req, res).catch((error) => {
    // 兜底处理器自身绝不能再抛：这里抛出会成为 unhandled rejection 并终止进程。
    try {
      const status = error && Number.isFinite(error.status) ? error.status : 500
      const message = status >= 500 ? 'Internal server error' : error.message
      if (status >= 500) console.error(error)
      fail(res, status, message, error?.code || 'error')
    } catch (failError) {
      console.error('[ratio-server] failed to send error response', failError)
      res.destroy()
    }
  })
})

server.listen(PORT, HOST, () => {
  console.log(`ratio-server listening on ${HOST}:${PORT}`)
})
