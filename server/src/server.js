import http from 'node:http'
import { mkdir, readFile, rename, stat, writeFile, appendFile, unlink, open, readdir } from 'node:fs/promises'
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
const DATA_DIR = process.env.RATIO_DATA_DIR || path.resolve('data')
const CORS_ORIGIN = process.env.RATIO_CORS_ORIGIN || 'http://localhost:5173'
const MAX_BACKUP_BYTES = readPositiveNumberEnv('RATIO_MAX_BACKUP_BYTES', 2 * 1024 * 1024)
const REGISTRATION_INVITE_CODE = (process.env.RATIO_REGISTRATION_INVITE_CODE || '').trim()
const ALLOW_OPEN_REGISTRATION = readBooleanEnv('RATIO_ALLOW_OPEN_REGISTRATION', false)
const AI_CHAT_URL = process.env.RATIO_AI_CHAT_URL || ''
const AI_BASE_URL = process.env.RATIO_AI_BASE_URL || ''
const AI_CHAT_PATH = process.env.RATIO_AI_CHAT_PATH || '/v1/chat/completions'
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
const AUTH_RATE_LIMIT_PER_MINUTE = readPositiveNumberEnv('RATIO_AUTH_RATE_LIMIT_PER_MINUTE', 600)
const REGISTER_RATE_LIMIT_PER_MINUTE = readPositiveNumberEnv('RATIO_REGISTER_RATE_LIMIT_PER_MINUTE', 30)
const ADMIN_RATE_LIMIT_PER_MINUTE = readPositiveNumberEnv('RATIO_ADMIN_RATE_LIMIT_PER_MINUTE', 300)
const MAX_PASSWORD_CHARS = readPositiveNumberEnv('RATIO_MAX_PASSWORD_CHARS', 256)
const ADMIN_USERNAME = (process.env.RATIO_ADMIN_USERNAME || '').trim()
const ADMIN_PASSWORD = process.env.RATIO_ADMIN_PASSWORD || ''
const USERS_FILE = path.join(DATA_DIR, 'users.json')
const BACKUP_SCHEMA = 'ratio.backup.v1'

const mutationQueues = new Map()
const rateLimitBuckets = new Map()
const aiDailyUsage = new Map()
const pbkdf2Async = promisify(pbkdf2)

function now() {
  return new Date().toISOString()
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

function adminUnauthorized(res) {
  textResponse(res, 401, JSON.stringify({ error: { code: 'admin_auth_required', message: 'Admin credentials required' } }), 'application/json; charset=utf-8', {
    'WWW-Authenticate': 'Basic realm="Ratio Admin Console", charset="UTF-8"',
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
    adminUnauthorized(res)
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

function requestRateLimit(req, res, scope, maxRequests) {
  const key = req.socket?.remoteAddress || 'unknown'
  if (checkRateLimit(scope, key, maxRequests)) return true
  fail(res, 429, 'Too many requests; try again later', 'rate_limited')
  return false
}

function checkDailyLimit(scope, key, maxRequests) {
  const day = new Date().toISOString().slice(0, 10)
  const usageKey = `${scope}:${day}:${key}`
  if (aiDailyUsage.size > 10000) {
    for (const bucketKey of aiDailyUsage.keys()) {
      if (!bucketKey.includes(`:${day}:`)) aiDailyUsage.delete(bucketKey)
    }
  }

  const current = aiDailyUsage.get(usageKey) || 0
  if (current >= maxRequests) return false
  aiDailyUsage.set(usageKey, current + 1)
  return true
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

async function hashPassword(password, salt = randomBytes(16).toString('base64'), iterations = 160000) {
  const hash = (await pbkdf2Async(password, salt, iterations, 32, 'sha256')).toString('base64')
  return { salt, iterations, hash }
}

async function verifyPassword(password, user) {
  const next = await hashPassword(password, user.passwordSalt, user.passwordIterations)
  const a = Buffer.from(next.hash, 'base64')
  const b = Buffer.from(user.passwordHash, 'base64')
  return a.length === b.length && timingSafeEqual(a, b)
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

  const users = await readUsers()
  const user = users.users[auth.username]
  if (!user || !(await verifyPassword(auth.password, user))) {
    fail(res, 401, 'Invalid username or password', 'auth_invalid')
    return null
  }

  return user
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
  return (
    value &&
    typeof value === 'object' &&
    value.schema === BACKUP_SCHEMA &&
    typeof value.createdAt === 'string' &&
    value.items &&
    typeof value.items === 'object' &&
    !Array.isArray(value.items)
  )
}

function maskSecret(value) {
  if (!value) return ''
  if (value.length <= 8) return '***'
  return `${value.slice(0, 3)}***${value.slice(-3)}`
}

function trimConfig(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function resolveAiChatUrl() {
  const direct = trimConfig(AI_CHAT_URL)
  if (direct) return direct

  const baseUrl = trimConfig(AI_BASE_URL)
  if (!baseUrl) return ''

  const base = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`
  try {
    return new URL(AI_CHAT_PATH || '/v1/chat/completions', base).toString()
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
  if (!config.chatUrl) return 'AI chat URL is not configured'
  try {
    const url = new URL(config.chatUrl)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return 'AI chat URL must use http or https'
    if (url.protocol === 'http:' && !AI_ALLOW_HTTP_UPSTREAM) return 'AI chat URL must use https unless RATIO_AI_ALLOW_HTTP_UPSTREAM=true'
    if (isPrivateHostname(url.hostname) && !AI_ALLOW_PRIVATE_UPSTREAM) {
      return 'AI chat URL cannot target private or localhost addresses unless RATIO_AI_ALLOW_PRIVATE_UPSTREAM=true'
    }
    if (url.hostname === 'example.com') return 'AI chat URL is still the example value'
  } catch {
    return 'AI chat URL is invalid'
  }
  if (!config.model) return 'AI model is not configured'
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
    if (data.users[username]) return { exists: true, user: data.users[username] }

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

  if (result.exists) return fail(res, 409, 'User already exists', 'user_exists')

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
    const expectedUpdatedAt = typeof body.expectedUpdatedAt === 'string' ? body.expectedUpdatedAt : ''
    const force = body.force === true
    const remoteUpdatedAt = typeof current?.updatedAt === 'string' ? current.updatedAt : ''

    if (!force && remoteUpdatedAt !== expectedUpdatedAt) {
      return { conflict: true, meta: backupMeta(current) }
    }

    const payload = {
      schema: 'ratio.cloud-backup.v1',
      updatedAt: now(),
      clientCreatedAt: backup.createdAt,
      device: typeof body.device === 'string' ? body.device.slice(0, 120) : '',
      itemCount: Object.keys(backup.items).length,
      backup,
    }

    await writeJsonFile(backupFile, payload)
    return { conflict: false, meta: backupMeta(payload) }
  })

  if (result.conflict) {
    return fail(res, 409, 'Cloud backup has changed; confirm before overwriting', 'backup_conflict', {
      meta: result.meta,
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

function checkAiLimits(req, res, user) {
  const ip = req.socket?.remoteAddress || 'unknown'
  if (!checkRateLimit('ai-ip', ip, AI_RATE_LIMIT_PER_MINUTE)) {
    fail(res, 429, 'Too many AI requests from this network; try again later', 'ai_rate_limited')
    return false
  }
  if (!checkRateLimit('ai-user', user.id, AI_RATE_LIMIT_PER_MINUTE)) {
    fail(res, 429, 'Too many AI requests for this account; try again later', 'ai_rate_limited')
    return false
  }
  if (!checkDailyLimit('ai-user', user.id, AI_DAILY_REQUEST_LIMIT)) {
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

function handleAiStatus(res) {
  const config = readAiConfig()
  const issue = getAiConfigIssue(config)
  jsonResponse(res, 200, {
    ai: {
      configured: issue === null,
      model: config.model,
      reasoningEffort: config.reasoningEffort,
      hasApiKey: Boolean(config.apiKey),
      apiKeyMasked: maskSecret(config.apiKey),
      issue,
    },
  })
}

async function handleAiChat(req, res, user) {
  const config = readAiConfig()
  const issue = getAiConfigIssue(config)
  if (issue) return fail(res, 503, issue, 'ai_config_missing')
  if (!checkAiLimits(req, res, user)) return

  const body = await parseBody(req, 1024 * 1024)
  let messages
  try {
    messages = validateAiMessages(body.messages)
  } catch (error) {
    return fail(res, error.status || 400, error.message, error.code || 'ai_messages_invalid')
  }

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
      body: JSON.stringify({
        model: config.model,
        messages,
        reasoning_effort: config.reasoningEffort,
      }),
    })
  } catch {
    clearTimeout(timeout)
    res.off('close', onResponseClose)
    if (timedOut) return fail(res, 504, 'AI upstream request timed out', 'ai_upstream_timeout')
    if (controller.signal.aborted) return
    return fail(res, 502, 'AI upstream request failed', 'ai_upstream_failed')
  }

  try {
    const text = await readUpstreamTextLimited(upstream, AI_MAX_RESPONSE_BYTES)
    responseClosed = true
    clearTimeout(timeout)
    res.off('close', onResponseClose)
    res.writeHead(upstream.status, {
      'Content-Type': upstream.headers.get('content-type') || 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...securityHeaders(),
      ...corsHeaders(),
    })
    res.end(text)
  } catch (error) {
    clearTimeout(timeout)
    res.off('close', onResponseClose)
    if (error && error.code === 'ai_upstream_too_large') {
      return fail(res, error.status || 502, error.message, error.code)
    }
    if (timedOut) return fail(res, 504, 'AI upstream response timed out', 'ai_upstream_timeout')
    if (controller.signal.aborted) return
    return fail(res, 502, 'AI upstream response failed', 'ai_upstream_failed')
  }
}

async function handleTelemetry(req, res, user) {
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

    return {
      ...publicUser(user),
      backup,
      backupBytes: await fileSize(backupFile),
      telemetryTodayBytes: await fileSize(telemetryFileForToday(user)),
      directoryBytes: usage.totalBytes,
      directoryFiles: usage.files,
    }
  }))
}

async function readTelemetryEventsForUser(user, limit) {
  const text = await readFileTail(telemetryFileForToday(user), Math.min(TELEMETRY_MAX_DAILY_BYTES, 512 * 1024))
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
  const events = (await Promise.all(users.map((user) => readTelemetryEventsForUser(user, perUserLimit)))).flat()
  events.sort((left, right) => {
    const a = Date.parse(left.receivedAt || left.at || '')
    const b = Date.parse(right.receivedAt || right.at || '')
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
    },
    limits: {
      authPerMinute: AUTH_RATE_LIMIT_PER_MINUTE,
      registerPerMinute: REGISTER_RATE_LIMIT_PER_MINUTE,
      adminPerMinute: ADMIN_RATE_LIMIT_PER_MINUTE,
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
    },
  })
}

async function handleAdminUsers(res) {
  jsonResponse(res, 200, { users: await getAdminUsers() })
}

async function handleAdminTelemetryRecent(req, res) {
  const url = new URL(req.url, 'http://localhost')
  const limit = Math.min(200, Math.max(1, Number(url.searchParams.get('limit') || 50)))
  const username = (url.searchParams.get('username') || '').trim()
  try {
    jsonResponse(res, 200, { events: await getAdminTelemetryEvents(username, limit) })
  } catch (error) {
    if (error && error.status === 404) return fail(res, 404, error.message, error.code || 'not_found')
    throw error
  }
}

function adminAssetHeaders() {
  return {
    'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  }
}

function handleAdminAsset(req, res, pathname) {
  if (req.method !== 'GET') return textResponse(res, 405, 'Method not allowed')
  if (!requireAdmin(req, res, true)) return

  if (pathname === '/admin') {
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
  if (req.method !== 'GET') return fail(res, 405, 'Method not allowed', 'method_not_allowed')
  if (!requireAdmin(req, res)) return

  if (pathname === '/api/admin' || pathname === '/api/admin/overview') return handleAdminOverview(res)
  if (pathname === '/api/admin/users') return handleAdminUsers(res)
  if (pathname === '/api/admin/telemetry/recent') return handleAdminTelemetryRecent(req, res)

  return fail(res, 404, 'Not found', 'not_found')
}

async function handleTelemetryRecent(req, res, user) {
  const file = userFile(user, `telemetry-${new Date().toISOString().slice(0, 10)}.ndjson`)
  const text = await readFileTail(file, Math.min(TELEMETRY_MAX_DAILY_BYTES, 512 * 1024))
  const limit = Math.min(100, Math.max(1, Number(new URL(req.url, 'http://x').searchParams.get('limit') || 20)))
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
    const status = error && Number.isFinite(error.status) ? error.status : 500
    const message = status >= 500 ? 'Internal server error' : error.message
    if (status >= 500) console.error(error)
    fail(res, status, message, error?.code || 'error')
  })
})

server.listen(PORT, () => {
  console.log(`ratio-server listening on ${PORT}`)
})
