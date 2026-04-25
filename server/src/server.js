import http from 'node:http'
import { mkdir, readFile, rename, stat, writeFile, appendFile } from 'node:fs/promises'
import { createHash, pbkdf2Sync, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'
import path from 'node:path'

const PORT = Number(process.env.PORT || 8787)
const DATA_DIR = process.env.RATIO_DATA_DIR || path.resolve('data')
const CORS_ORIGIN = process.env.RATIO_CORS_ORIGIN || '*'
const MAX_BACKUP_BYTES = Number(process.env.RATIO_MAX_BACKUP_BYTES || 2 * 1024 * 1024)
const AI_CHAT_URL = process.env.RATIO_AI_CHAT_URL || ''
const AI_BASE_URL = process.env.RATIO_AI_BASE_URL || ''
const AI_CHAT_PATH = process.env.RATIO_AI_CHAT_PATH || '/v1/chat/completions'
const AI_API_KEY = process.env.RATIO_AI_API_KEY || ''
const AI_MODEL = process.env.RATIO_AI_MODEL || 'gpt-5.2'
const AI_REASONING_EFFORT = process.env.RATIO_AI_REASONING_EFFORT || 'high'
const USERS_FILE = path.join(DATA_DIR, 'users.json')
const BACKUP_SCHEMA = 'ratio.backup.v1'

const mutationQueues = new Map()

function now() {
  return new Date().toISOString()
}

function jsonResponse(res, status, body) {
  const text = JSON.stringify(body)
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(text),
    'Cache-Control': 'no-store',
    ...corsHeaders(),
  })
  res.end(text)
}

function emptyResponse(res, status = 204) {
  res.writeHead(status, corsHeaders())
  res.end()
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': CORS_ORIGIN,
    'Access-Control-Allow-Headers': 'content-type, authorization',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
    'Access-Control-Max-Age': '86400',
  }
}

function fail(res, status, message, code = 'error', details = undefined) {
  jsonResponse(res, status, { error: { code, message, ...(details && typeof details === 'object' ? details : {}) } })
}

function userId(username) {
  return createHash('sha256').update(username, 'utf8').digest('hex').slice(0, 24)
}

function hashPassword(password, salt = randomBytes(16).toString('base64'), iterations = 160000) {
  const hash = pbkdf2Sync(password, salt, iterations, 32, 'sha256').toString('base64')
  return { salt, iterations, hash }
}

function verifyPassword(password, user) {
  const next = hashPassword(password, user.passwordSalt, user.passwordIterations)
  const a = Buffer.from(next.hash)
  const b = Buffer.from(user.passwordHash)
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
  const auth = readBasicAuth(req)
  if (!auth) {
    fail(res, 401, 'Missing credentials', 'auth_required')
    return null
  }

  const users = await readUsers()
  const user = users.users[auth.username]
  if (!user || !verifyPassword(auth.password, user)) {
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
  } catch {
    return 'AI chat URL is invalid'
  }
  if (!config.model) return 'AI model is not configured'
  return null
}

async function handleRegister(req, res) {
  const body = await parseBody(req, 64 * 1024)
  const username = typeof body.username === 'string' ? body.username.trim() : ''
  const password = typeof body.password === 'string' ? body.password : ''
  if (!/^[\w.@-]{3,64}$/.test(username)) return fail(res, 400, 'Username must be 3-64 letters, numbers, dot, underscore or dash')
  if (password.length < 8) return fail(res, 400, 'Password must be at least 8 characters')

  const result = await mutateUsers((data) => {
    if (data.users[username]) return { exists: true, user: data.users[username] }

    const passwordInfo = hashPassword(password)
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

async function handleAiChat(req, res) {
  const config = readAiConfig()
  const issue = getAiConfigIssue(config)
  if (issue) return fail(res, 503, issue, 'ai_config_missing')

  const body = await parseBody(req, 1024 * 1024)
  if (!Array.isArray(body.messages)) return fail(res, 400, 'messages must be an array')

  let upstream
  try {
    upstream = await fetch(config.chatUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
      },
      body: JSON.stringify({
        model: config.model,
        messages: body.messages,
        reasoning_effort: config.reasoningEffort,
      }),
    })
  } catch {
    return fail(res, 502, 'AI upstream request failed', 'ai_upstream_failed')
  }

  const text = await upstream.text()
  res.writeHead(upstream.status, {
    'Content-Type': upstream.headers.get('content-type') || 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...corsHeaders(),
  })
  res.end(text)
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

  const file = userFile(user, `telemetry-${new Date().toISOString().slice(0, 10)}.ndjson`)
  await mkdir(path.dirname(file), { recursive: true })
  await appendFile(file, `${safeEvents.map((event) => JSON.stringify(event)).join('\n')}\n`, 'utf8')
  jsonResponse(res, 200, { accepted: safeEvents.length })
}

async function handleTelemetryRecent(req, res, user) {
  const file = userFile(user, `telemetry-${new Date().toISOString().slice(0, 10)}.ndjson`)
  let text = ''
  try {
    text = await readFile(file, 'utf8')
  } catch (error) {
    if (error && error.code !== 'ENOENT') throw error
  }
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
      await stat(DATA_DIR)
    } catch {
      writable = false
    }
    return jsonResponse(res, 200, { ok: true, service: 'ratio-server', time: now(), writable })
  }

  if (req.method === 'POST' && pathname === '/api/users') return handleRegister(req, res)

  const user = await requireUser(req, res)
  if (!user) return

  if (req.method === 'GET' && pathname === '/api/me') return jsonResponse(res, 200, { user: publicUser(user) })
  if (req.method === 'GET' && pathname === '/api/backup') return handleBackupGet(res, user)
  if (req.method === 'PUT' && pathname === '/api/backup') return handleBackupPut(req, res, user)
  if (req.method === 'GET' && pathname === '/api/ai/status') return handleAiStatus(res)
  if (req.method === 'POST' && pathname === '/api/ai/chat') return handleAiChat(req, res)
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
    fail(res, status, message)
  })
})

server.listen(PORT, () => {
  console.log(`ratio-server listening on ${PORT}`)
})
