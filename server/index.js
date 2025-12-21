import 'dotenv/config'
import bcrypt from 'bcryptjs'
import cors from 'cors'
import express from 'express'
import jwt from 'jsonwebtoken'
import { Pool } from 'pg'

const PORT = Number(process.env.PORT || 3000)
const DATABASE_URL = process.env.DATABASE_URL
const JWT_SECRET = process.env.JWT_SECRET

if (!DATABASE_URL) throw new Error('Missing env: DATABASE_URL')
if (!JWT_SECRET) throw new Error('Missing env: JWT_SECRET')

const sslEnabled =
  String(process.env.PGSSL || '').toLowerCase() === 'true' ||
  String(process.env.PGSSL || '') === '1' ||
  process.env.NODE_ENV === 'production'

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: sslEnabled ? { rejectUnauthorized: false } : false,
})

function splitAllowedOrigins(value) {
  const raw = String(value || '').trim()
  if (!raw) return null
  if (raw === '*') return '*'
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

const allowedOrigins = splitAllowedOrigins(process.env.CORS_ORIGIN)

const app = express()
app.use(
  cors({
    origin:
      allowedOrigins == null || allowedOrigins === '*'
        ? true
        : (origin, callback) => {
            if (!origin) return callback(null, true)
            const ok = allowedOrigins.includes(origin)
            return callback(ok ? null : new Error('CORS blocked'), ok)
          },
  }),
)
app.use(express.json({ limit: '5mb' }))

function jsonError(res, status, error) {
  return res.status(status).json({ error })
}

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function canonicalEmail(input) {
  return String(input || '').trim().toLowerCase()
}

function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

function validatePassword(password) {
  return typeof password === 'string' && password.length >= 6
}

function signToken(user) {
  return jwt.sign({ sub: String(user.id), email: user.email }, JWT_SECRET, { expiresIn: '30d' })
}

function requireAuth(req, res, next) {
  const header = String(req.headers.authorization || '')
  const match = header.match(/^Bearer\s+(.+)$/i)
  if (!match) return jsonError(res, 401, 'Missing token')
  try {
    const payload = jwt.verify(match[1], JWT_SECRET)
    const sub = payload && typeof payload === 'object' ? payload.sub : null
    const userId = Number(sub)
    if (!Number.isFinite(userId)) return jsonError(res, 401, 'Invalid token')
    req.user = { id: userId }
    return next()
  } catch {
    return jsonError(res, 401, 'Invalid token')
  }
}

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id BIGSERIAL PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS backups (
      user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      data_json JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `)
}

app.get('/api/health', (_req, res) => res.json({ ok: true }))

app.post('/api/register', async (req, res) => {
  if (!isPlainObject(req.body)) return jsonError(res, 400, 'Invalid JSON body')
  const email = canonicalEmail(req.body.email)
  const password = req.body.password
  if (!validateEmail(email)) return jsonError(res, 400, 'Invalid email')
  if (!validatePassword(password)) return jsonError(res, 400, 'Password must be at least 6 characters')

  try {
    const passwordHash = await bcrypt.hash(password, 10)
    const result = await pool.query('INSERT INTO users(email, password_hash) VALUES ($1, $2) RETURNING id', [
      email,
      passwordHash,
    ])
    const user = { id: result.rows[0].id, email }
    return res.json({ token: signToken(user) })
  } catch (err) {
    if (err && typeof err === 'object' && err.code === '23505') return jsonError(res, 409, 'Email already registered')
    console.error(err)
    return jsonError(res, 500, 'Internal error')
  }
})

app.post('/api/login', async (req, res) => {
  if (!isPlainObject(req.body)) return jsonError(res, 400, 'Invalid JSON body')
  const email = canonicalEmail(req.body.email)
  const password = req.body.password
  if (!validateEmail(email)) return jsonError(res, 400, 'Invalid email')
  if (typeof password !== 'string') return jsonError(res, 400, 'Invalid password')

  try {
    const result = await pool.query('SELECT id, password_hash FROM users WHERE email = $1 LIMIT 1', [email])
    const row = result.rows[0]
    if (!row) return jsonError(res, 401, 'Invalid email or password')
    const ok = await bcrypt.compare(password, row.password_hash)
    if (!ok) return jsonError(res, 401, 'Invalid email or password')
    return res.json({ token: signToken({ id: row.id, email }) })
  } catch (err) {
    console.error(err)
    return jsonError(res, 500, 'Internal error')
  }
})

app.post('/api/logout', requireAuth, (_req, res) => res.json({ ok: true }))

app.get('/api/backup', requireAuth, async (req, res) => {
  try {
    const result = await pool.query('SELECT data_json FROM backups WHERE user_id = $1 LIMIT 1', [req.user.id])
    const row = result.rows[0]
    if (!row) return jsonError(res, 404, 'No backup yet')
    return res.json(row.data_json)
  } catch (err) {
    console.error(err)
    return jsonError(res, 500, 'Internal error')
  }
})

function isValidBackupPayload(value) {
  if (!isPlainObject(value)) return false
  if (value.schema !== 'ratio.backup.v1') return false
  if (typeof value.createdAt !== 'string') return false
  return isPlainObject(value.items)
}

app.put('/api/backup', requireAuth, async (req, res) => {
  if (!isValidBackupPayload(req.body)) return jsonError(res, 400, 'Invalid backup payload')
  try {
    await pool.query(
      `
        INSERT INTO backups(user_id, data_json, updated_at)
        VALUES ($1, $2::jsonb, NOW())
        ON CONFLICT (user_id) DO UPDATE SET data_json = EXCLUDED.data_json, updated_at = NOW();
      `,
      [req.user.id, JSON.stringify(req.body)],
    )
    return res.json({ ok: true })
  } catch (err) {
    console.error(err)
    return jsonError(res, 500, 'Internal error')
  }
})

app.use((_req, res) => jsonError(res, 404, 'Not found'))
app.use((err, _req, res, _next) => {
  console.error(err)
  return jsonError(res, 500, 'Internal error')
})

await initDb()

app.listen(PORT, () => {
  console.log(`ratio-backup-api listening on :${PORT}`)
})
