import { buildRatioBackup } from './backup'
import {
  CLOUD_SYNC_SETTINGS_KEY,
  getCloudSyncSettings,
  hasCloudCredentials,
  uploadCloudBackup,
  writeCloudSyncSettingsPatch,
} from './cloud'
import { STORAGE_WRITE_EVENT, type StorageWriteDetail } from './storageEvents'

const AUTO_SYNC_DELAY_MS = 2500
const AUTO_SYNC_MIN_INTERVAL_MS = 30000

let initialized = false
let syncTimer: number | null = null
let lastAutoSyncAt = 0
let syncInFlight = false

function getWriteDetail(event: Event): StorageWriteDetail | null {
  if (!(event instanceof CustomEvent)) return null
  const detail = event.detail
  if (!detail || typeof detail !== 'object') return null
  const key = Reflect.get(detail, 'key')
  if (typeof key !== 'string') return null
  return { key }
}

function shouldAutoSyncKey(key: string) {
  if (!key.startsWith('ratio.')) return false
  if (key === CLOUD_SYNC_SETTINGS_KEY) return false
  return true
}

async function runAutoSync(reason: string) {
  const settings = getCloudSyncSettings()
  if (!settings.autoSync || !hasCloudCredentials(settings)) return
  if (syncInFlight) return

  const now = Date.now()
  if (now - lastAutoSyncAt < AUTO_SYNC_MIN_INTERVAL_MS) return
  lastAutoSyncAt = now
  syncInFlight = true

  try {
    await uploadCloudBackup(settings, buildRatioBackup())
    writeCloudSyncSettingsPatch({ lastBackupAt: new Date().toISOString() })
    window.dispatchEvent(new CustomEvent('ratio:cloud-sync', { detail: { ok: true, reason } }))
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Cloud sync failed'
    window.dispatchEvent(new CustomEvent('ratio:cloud-sync', { detail: { ok: false, reason, message } }))
  } finally {
    syncInFlight = false
  }
}

function scheduleAutoSync(reason: string) {
  if (syncTimer !== null) window.clearTimeout(syncTimer)
  syncTimer = window.setTimeout(() => {
    syncTimer = null
    void runAutoSync(reason)
  }, AUTO_SYNC_DELAY_MS)
}

export function initCloudAutoSync() {
  if (initialized || typeof window === 'undefined') return
  initialized = true

  window.addEventListener(STORAGE_WRITE_EVENT, (event) => {
    const detail = getWriteDetail(event)
    if (!detail || !shouldAutoSyncKey(detail.key)) return
    scheduleAutoSync(`storage:${detail.key}`)
  })

  window.addEventListener('online', () => scheduleAutoSync('online'))
}
