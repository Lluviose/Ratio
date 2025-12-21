export type WebDavClient = {
  baseUrl: string
  authorization: string
  proxyUrl?: string
}

function normalizeBaseUrl(input: string) {
  const trimmed = input.trim()
  if (!trimmed) throw new Error('WebDAV 地址不能为空')
  const url = new URL(trimmed)
  const href = url.toString()
  return href.endsWith('/') ? href : `${href}/`
}

function base64FromBytes(bytes: Uint8Array) {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

function buildBasicAuth(username: string, password: string) {
  const user = username.trim()
  const pass = password
  if (!user) throw new Error('WebDAV 用户名不能为空')
  if (!pass) throw new Error('WebDAV 密码不能为空')
  const bytes = new TextEncoder().encode(`${user}:${pass}`)
  return `Basic ${base64FromBytes(bytes)}`
}

function normalizePath(input: string) {
  const trimmed = input.trim().replace(/\\/g, '/')
  return trimmed.replace(/^\/+/, '')
}

function encodePath(path: string) {
  return path
    .split('/')
    .filter((seg) => seg.length > 0)
    .map((seg) => encodeURIComponent(seg))
    .join('/')
}

function joinUrl(baseUrl: string, path: string) {
  const normalized = normalizePath(path)
  const encoded = encodePath(normalized)
  return new URL(encoded, baseUrl).toString()
}

export function createWebDavClient(config: {
  baseUrl: string
  username: string
  password: string
  proxyUrl?: string
}): WebDavClient {
  const proxyUrl = config.proxyUrl?.trim()
  if (proxyUrl) new URL(proxyUrl)
  return {
    baseUrl: normalizeBaseUrl(config.baseUrl),
    authorization: buildBasicAuth(config.username, config.password),
    proxyUrl: proxyUrl || undefined,
  }
}

async function request(client: WebDavClient, url: string, init: RequestInit) {
  const directUrl = url
  const res = await fetch(client.proxyUrl || directUrl, {
    ...init,
    headers: {
      ...(client.proxyUrl ? { 'X-WebDAV-Target-Url': directUrl } : {}),
      Authorization: client.authorization,
      ...(init.headers || {}),
    },
  })
  return res
}

export async function webdavPutText(
  client: WebDavClient,
  path: string,
  text: string,
  contentType: string = 'application/json',
) {
  const url = joinUrl(client.baseUrl, path)
  const res = await request(client, url, {
    method: 'PUT',
    headers: { 'Content-Type': contentType },
    body: text,
  })
  if (res.ok) return
  throw new Error(`WebDAV 上传失败：${res.status} ${res.statusText}`.trim())
}

export async function webdavGetText(client: WebDavClient, path: string) {
  const url = joinUrl(client.baseUrl, path)
  const res = await request(client, url, { method: 'GET' })
  if (!res.ok) throw new Error(`WebDAV 下载失败：${res.status} ${res.statusText}`.trim())
  return res.text()
}

export async function webdavMkcol(client: WebDavClient, dirPath: string) {
  const normalized = normalizePath(dirPath)
  const url = joinUrl(client.baseUrl, normalized.endsWith('/') ? normalized : `${normalized}/`)
  const res = await request(client, url, { method: 'MKCOL' })
  if (res.status === 201) return
  if (res.status === 405) return
  if (res.ok) return
  throw new Error(`WebDAV 创建目录失败：${res.status} ${res.statusText}`.trim())
}

export async function ensureWebDavParentDirs(client: WebDavClient, filePath: string) {
  const normalized = normalizePath(filePath)
  const parts = normalized.split('/').filter((p) => p.length > 0)
  if (parts.length <= 1) return

  const dirs = parts.slice(0, -1)
  let current = ''
  for (const seg of dirs) {
    current = current ? `${current}/${seg}` : seg
    await webdavMkcol(client, `${current}/`)
  }
}
