import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
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
