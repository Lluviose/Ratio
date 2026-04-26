import { buildRatioBackup } from './backup'
import {
  CLOUD_SYNC_SETTINGS_KEY,
  CloudRequestError,
  getCloudSyncSettings,
  hasCloudCredentials,
  uploadCloudBackup,
  writeCloudSyncSettingsPatch,
} from './cloud'
import { STORAGE_WRITE_EVENT, dispatchStorageWrite, type StorageWriteDetail } from './storageEvents'

const AUTO_SYNC_DELAY_MS = 2500
const AUTO_SYNC_MIN_INTERVAL_MS = 30000
export const CLOUD_SYNC_DIRTY_KEY = 'ratio.cloudSyncDirty'

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
  if (key.startsWith(CLOUD_SYNC_SETTINGS_KEY)) return false
  return true
}

export function readCloudSyncDirtyToken() {
  try {
    return localStorage.getItem(CLOUD_SYNC_DIRTY_KEY) || ''
  } catch {
    return ''
  }
}

function isCloudSyncDirty() {
  return readCloudSyncDirtyToken().length > 0
}

function setCloudSyncDirty() {
  try {
    const token = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
    localStorage.setItem(CLOUD_SYNC_DIRTY_KEY, token)
    dispatchStorageWrite(CLOUD_SYNC_DIRTY_KEY, token)
  } catch {
    // Auto-sync bookkeeping must not block the primary local write.
  }
}

function shouldScheduleSyncForSettings() {
  const settings = getCloudSyncSettings()
  if (!settings.autoSync || !hasCloudCredentials(settings)) return false
  if (settings.lastSyncStatus === 'conflict') return false
  return isCloudSyncDirty() || !settings.lastBackupAt || settings.lastSyncStatus === 'error'
}

export function markCloudSyncClean(expectedDirtyToken?: string) {
  if (typeof window === 'undefined') return
  try {
    if (expectedDirtyToken !== undefined && readCloudSyncDirtyToken() !== expectedDirtyToken) return
    localStorage.removeItem(CLOUD_SYNC_DIRTY_KEY)
    dispatchStorageWrite(CLOUD_SYNC_DIRTY_KEY)
  } catch {
    // Auto-sync bookkeeping must not block the primary local write.
  }
}

async function runAutoSync(reason: string) {
  const settings = getCloudSyncSettings()
  if (!settings.autoSync || !hasCloudCredentials(settings)) return
  if (settings.lastSyncStatus === 'conflict') return
  if (!isCloudSyncDirty() && settings.lastBackupAt && settings.lastSyncStatus !== 'error') return
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
    const dirtyToken = readCloudSyncDirtyToken()
    const backup = buildRatioBackup()
    const meta = await uploadCloudBackup(settings, backup, { expectedUpdatedAt: settings.lastBackupAt })
    markCloudSyncClean(dirtyToken)
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
    if (!detail) return
    if (detail.key === CLOUD_SYNC_SETTINGS_KEY) {
      if (!syncInFlight && shouldScheduleSyncForSettings()) scheduleAutoSync('settings')
      return
    }
    if (!shouldAutoSyncKey(detail.key)) return
    setCloudSyncDirty()
    scheduleAutoSync(`storage:${detail.key}`)
  })

  window.addEventListener('online', () => {
    if (shouldScheduleSyncForSettings()) scheduleAutoSync('online')
  })

  window.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && shouldScheduleSyncForSettings()) {
      scheduleAutoSync('visible', 800)
    }
  })

  if (shouldScheduleSyncForSettings()) scheduleAutoSync('startup', 800)
}
