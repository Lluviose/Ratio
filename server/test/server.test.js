import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, readFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

let createServer
let server
let baseUrl
let auth
let dataDir

function iso() {
  return new Date().toISOString()
}

async function request(url, options = {}) {
  const response = await fetch(`${baseUrl}${url}`, options)
  const text = await response.text()
  let body = null
  try { body = text ? JSON.parse(text) : null } catch { body = text }
  return { response, body }
}

function jsonRequest(value, headers = {}) {
  return { headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(value) }
}

before(async () => {
  dataDir = await mkdtemp(path.join(os.tmpdir(), 'ratio-server-test-'))
  process.env.RATIO_DATA_DIR = dataDir
  process.env.RATIO_ALLOW_OPEN_REGISTRATION = 'true'
  process.env.RATIO_CORS_ORIGIN = 'http://test.local'
  // 锁定/health 行为的可测参数：3 次失败锁 2s；health 限流收紧便于触发
  process.env.RATIO_ADMIN_USERNAME = 'rootadmin'
  process.env.RATIO_ADMIN_PASSWORD = 'admin-secret-pass-123'
  process.env.RATIO_AUTH_MAX_FAILED_ATTEMPTS = '3'
  process.env.RATIO_AUTH_LOCKOUT_MS = '2000'
  process.env.RATIO_HEALTH_CACHE_TTL_MS = '60000'
  process.env.RATIO_HEALTH_RATE_LIMIT_PER_MINUTE = '6'
  const module = await import('../src/server.js')
  createServer = module.createServer
  server = await createServer()
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  baseUrl = `http://127.0.0.1:${server.address().port}`
})

after(async () => {
  await new Promise((resolve) => server.close(() => resolve()))
  await rm(dataDir, { recursive: true, force: true })
})

test('health endpoint reports writable service', async () => {
  const { response, body } = await request('/api/health')
  assert.equal(response.status, 200)
  assert.equal(body.ok, true)
  assert.equal(body.writable, true)
})

test('registers a user and authenticates /api/me', async () => {
  const registration = await request('/api/users', { method: 'POST', ...jsonRequest({ username: 'alice', password: 'correct horse battery staple' }) })
  assert.equal(registration.response.status, 201)
  auth = `Basic ${Buffer.from('alice:correct horse battery staple').toString('base64')}`
  const me = await request('/api/me', { headers: { authorization: auth } })
  assert.equal(me.response.status, 200)
  assert.equal(me.body.user.username, 'alice')
})

test('uploads/downloads backup and rejects stale expectedUpdatedAt', async () => {
  const backup = { schema: 'ratio.backup.v1', createdAt: iso(), items: { 'ratio.accounts': '[]' } }
  const first = await request('/api/backup', { method: 'PUT', ...jsonRequest({ backup, device: 'test' }, { authorization: auth }) })
  assert.equal(first.response.status, 200)
  assert.ok(first.body.updatedAt)

  const downloaded = await request('/api/backup', { headers: { authorization: auth } })
  assert.equal(downloaded.response.status, 200)
  assert.deepEqual(downloaded.body.backup, backup)

  const conflict = await request('/api/backup', { method: 'PUT', ...jsonRequest({ backup, expectedUpdatedAt: '2000-01-01T00:00:00.000Z' }, { authorization: auth }) })
  assert.equal(conflict.response.status, 409)
  assert.equal(conflict.body.error.code, 'backup_conflict')
})

test('rejects missing credentials and malformed JSON safely', async () => {
  const missing = await request('/api/me')
  assert.equal(missing.response.status, 401)
  assert.equal(missing.body.error.code, 'auth_required')
  const malformed = await request('/api/users', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{' })
  assert.equal(malformed.response.status, 400)
  assert.equal(malformed.body.error.code, 'invalid_json')
})

test('prototype-property usernames cannot register and fail auth as 401, not 500', async () => {
  // __proto__/constructor/prototype：注册直接 400
  for (const username of ['__proto__', 'constructor', 'prototype']) {
    const registration = await request('/api/users', { method: 'POST', ...jsonRequest({ username, password: 'correct horse battery staple' }) })
    assert.equal(registration.response.status, 400, `register ${username}`)
  }

  // 认证读取用户表时命中 Object.prototype 继承属性（toString 等）必须走
  // 「用户不存在」分支返回 401，而不是对着继承函数取 passwordHash 抛 500
  for (const username of ['__proto__', 'toString', 'hasOwnProperty']) {
    const header = `Basic ${Buffer.from(`${username}:whatever-password`).toString('base64')}`
    const me = await request('/api/me', { headers: { authorization: header } })
    assert.equal(me.response.status, 401, `auth ${username}`)
    assert.equal(me.body.error.code, 'auth_invalid', `auth code ${username}`)
  }

  // 正常用户不受影响
  const me = await request('/api/me', { headers: { authorization: auth } })
  assert.equal(me.response.status, 200)
})

test('cached valid credentials survive an attacker filling the lockout bucket', async () => {
  const registration = await request('/api/users', { method: 'POST', ...jsonRequest({ username: 'bob', password: 'another correct horse staple' }) })
  assert.equal(registration.response.status, 201)
  const bobAuth = `Basic ${Buffer.from('bob:another correct horse staple').toString('base64')}`
  const wrongAuth = `Basic ${Buffer.from('bob:attacker-guess').toString('base64')}`

  // bob 先正常认证一次（写入 authCache）
  const primed = await request('/api/me', { headers: { authorization: bobAuth } })
  assert.equal(primed.response.status, 200)

  // 攻击者用错误密码刷满失败额度（3 次）触发锁定
  for (let i = 0; i < 3; i += 1) {
    const attempt = await request('/api/me', { headers: { authorization: wrongAuth } })
    assert.equal(attempt.response.status, 401)
  }
  const lockedOut = await request('/api/me', { headers: { authorization: wrongAuth } })
  assert.equal(lockedOut.response.status, 429)
  assert.equal(lockedOut.body.error.code, 'auth_rate_limited')

  // 锁定期间 bob 的正确凭据经缓存命中不受影响（锁定 DoS 缓解）
  const during = await request('/api/me', { headers: { authorization: bobAuth } })
  assert.equal(during.response.status, 200)
})

test('admin login failures lock the source ip and are audited', async () => {
  const goodAuth = `Basic ${Buffer.from('rootadmin:admin-secret-pass-123').toString('base64')}`
  const wrongAuth = `Basic ${Buffer.from('rootadmin:wrong-password').toString('base64')}`

  for (let i = 0; i < 3; i += 1) {
    const attempt = await request('/api/admin/overview', { headers: { authorization: wrongAuth } })
    assert.equal(attempt.response.status, 401)
  }

  // 锁定生效：正确密码也被 429（按来源 IP 锁定）
  const locked = await request('/api/admin/overview', { headers: { authorization: goodAuth } })
  assert.equal(locked.response.status, 429)
  assert.equal(locked.body.error.code, 'admin_rate_limited')

  // 无凭据的浏览器首次挑战不计失败、不受锁定影响之外的额外惩罚
  const challenge = await request('/api/admin/overview')
  assert.equal(challenge.response.status, 401)

  // 锁定过期后正确密码恢复访问
  await new Promise((resolve) => setTimeout(resolve, 2200))
  const recovered = await request('/api/admin/overview', { headers: { authorization: goodAuth } })
  assert.equal(recovered.response.status, 200)

  // 失败审计已写入当日 ndjson
  const day = new Date().toISOString().slice(0, 10)
  const auditText = await readFile(path.join(dataDir, `admin-audit-${day}.ndjson`), 'utf8')
  assert.ok(auditText.includes('admin.login_failed'))
})

test('health endpoint is rate limited', async () => {
  let sawLimited = false
  for (let i = 0; i < 10; i += 1) {
    const { response } = await request('/api/health')
    if (response.status === 429) {
      sawLimited = true
      break
    }
    assert.equal(response.status, 200)
  }
  assert.equal(sawLimited, true)
})
