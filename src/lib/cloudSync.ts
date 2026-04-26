import { buildRatioBackup } from './backup'
import {
  CLOUD_SYNC_SETTINGS_KEY,
  CloudRequestError,
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
let pendingReason: string | null = null

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
  if (syncInFlight) {
    pendingReason = reason
    return
  }

  const now = Date.now()
  const elapsed = now - lastAutoSyncAt
  if (elapsed < AUTO_SYNC_MIN_INTERVAL_MS) {
    scheduleAutoSync(reason, AUTO_SYNC_MIN_INTERVAL_MS - elapsed)
    return
  }

  lastAutoSyncAt = now
  syncInFlight = true
  pendingReason = null

  try {
    const meta = await uploadCloudBackup(settings, buildRatioBackup(), { expectedUpdatedAt: settings.lastBackupAt })
    writeCloudSyncSettingsPatch({
      lastBackupAt: meta.updatedAt,
      lastSyncAt: new Date().toISOString(),
      lastSyncStatus: 'ok',
      lastSyncMessage: `已自动上传 ${meta.itemCount} 项数据`,
    })
    window.dispatchEvent(new CustomEvent('ratio:cloud-sync', { detail: { ok: true, reason, itemCount: meta.itemCount } }))
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Cloud sync failed'
    const code = error instanceof CloudRequestError ? error.code : undefined
    const status = code === 'backup_conflict' ? 'conflict' : 'error'
    writeCloudSyncSettingsPatch({
      lastSyncAt: new Date().toISOString(),
      lastSyncStatus: status,
      lastSyncMessage: message.slice(0, 180),
    })
    window.dispatchEvent(new CustomEvent('ratio:cloud-sync', { detail: { ok: false, reason, message, code } }))
  } finally {
    syncInFlight = false
    if (pendingReason) {
      const nextReason = pendingReason
      pendingReason = null
      scheduleAutoSync(nextReason)
    }
  }
}

function scheduleAutoSync(reason: string, delay = AUTO_SYNC_DELAY_MS) {
  pendingReason = reason
  if (syncTimer !== null) window.clearTimeout(syncTimer)
  syncTimer = window.setTimeout(() => {
    syncTimer = null
    const nextReason = pendingReason ?? reason
    pendingReason = null
    void runAutoSync(nextReason)
  }, delay)
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
