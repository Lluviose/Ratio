const DEFAULT_ALLOWED_METHODS = 'GET,PUT,MKCOL,OPTIONS'
const DEFAULT_ALLOWED_HEADERS = 'Authorization,Content-Type,X-WebDAV-Target-Url'

function corsHeaders(request, env) {
  const origin = request.headers.get('Origin') || ''
  const allowedOrigin = env.ALLOWED_ORIGIN?.trim()
  const allowOrigin = allowedOrigin ? (origin === allowedOrigin ? origin : '') : '*'

  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': env.ALLOWED_METHODS?.trim() || DEFAULT_ALLOWED_METHODS,
    'Access-Control-Allow-Headers': env.ALLOWED_HEADERS?.trim() || DEFAULT_ALLOWED_HEADERS,
    'Access-Control-Max-Age': '86400',
  }
}

function withCors(response, cors) {
  const headers = new Headers(response.headers)
  for (const [k, v] of Object.entries(cors)) {
    if (v) headers.set(k, v)
  }
  headers.set('Access-Control-Expose-Headers', '*')
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers })
}

export default {
  async fetch(request, env) {
    const cors = corsHeaders(request, env)

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })

    if (cors['Access-Control-Allow-Origin'] === '') {
      return new Response('Forbidden origin', { status: 403, headers: cors })
    }

    const target = request.headers.get('X-WebDAV-Target-Url')
    if (!target) return new Response('Missing X-WebDAV-Target-Url', { status: 400, headers: cors })

    let targetUrl
    try {
      targetUrl = new URL(target)
    } catch {
      return new Response('Invalid target url', { status: 400, headers: cors })
    }

    if (targetUrl.hostname !== 'dav.jianguoyun.com') {
      return new Response('Forbidden host', { status: 403, headers: cors })
    }

    const method = request.method.toUpperCase()
    const headers = new Headers(request.headers)
    headers.delete('X-WebDAV-Target-Url')
    headers.delete('Origin')
    headers.delete('Referer')
    headers.delete('Host')

    const body = method === 'GET' || method === 'HEAD' || method === 'MKCOL' ? undefined : request.body

    try {
      const res = await fetch(targetUrl.toString(), { method, headers, body })
      return withCors(res, cors)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return new Response(`Upstream fetch failed: ${msg}`, { status: 502, headers: cors })
    }
  },
}
