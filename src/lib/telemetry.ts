import { getCloudSyncSettings, hasCloudCredentials, sendCloudTelemetry } from './cloud'

type TelemetryEvent = {
  name: string
  at: string
  payload?: Record<string, unknown>
}

const queue: TelemetryEvent[] = []
let initialized = false
let flushTimer: number | null = null

function enabled() {
  const settings = getCloudSyncSettings()
  return settings.telemetryEnabled && hasCloudCredentials(settings)
}

function sanitizePayload(payload?: Record<string, unknown>) {
  if (!payload) return undefined
  const next: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(payload)) {
    if (/password|token|secret|key/i.test(key)) continue
    if (typeof value === 'string') next[key] = value.slice(0, 300)
    else if (typeof value === 'number' || typeof value === 'boolean' || value == null) next[key] = value
    else next[key] = JSON.stringify(value).slice(0, 300)
  }
  return next
}

async function flushTelemetry() {
  flushTimer = null
  if (!enabled() || queue.length === 0) {
    queue.length = 0
    return
  }

  const batch = queue.splice(0, 20)
  try {
    await sendCloudTelemetry(getCloudSyncSettings(), batch)
  } catch {
    // Telemetry must never affect app behavior.
  } finally {
    if (queue.length > 0) scheduleFlush()
  }
}

function scheduleFlush() {
  if (flushTimer !== null) return
  flushTimer = window.setTimeout(() => void flushTelemetry(), 1800)
}

function readCustomEventDetail(event: Event): Record<string, unknown> | undefined {
  if (!(event instanceof CustomEvent)) return undefined
  const detail = event.detail
  if (!detail || typeof detail !== 'object' || Array.isArray(detail)) return undefined
  return detail as Record<string, unknown>
}

export function trackTelemetry(name: string, payload?: Record<string, unknown>) {
  if (typeof window === 'undefined') return
  if (!enabled()) return

  queue.push({
    name,
    at: new Date().toISOString(),
    payload: sanitizePayload(payload),
  })
  scheduleFlush()
}

export function initTelemetry() {
  if (initialized || typeof window === 'undefined') return
  initialized = true

  window.addEventListener('error', (event) => {
    trackTelemetry('client_error', {
      message: event.message,
      source: event.filename,
      line: event.lineno,
      column: event.colno,
    })
  })

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason instanceof Error ? event.reason.message : String(event.reason)
    trackTelemetry('unhandled_rejection', { reason })
  })

  window.addEventListener('ratio:cloud-sync', (event) => {
    trackTelemetry('cloud_sync_result', readCustomEventDetail(event))
  })

  trackTelemetry('app_loaded', {
    path: window.location.pathname,
    online: navigator.onLine,
  })
}
