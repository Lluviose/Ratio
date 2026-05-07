import { buildRatioBackup, sameRatioBackupData, type RatioBackupFile } from './backup'
import {
  CLOUD_SYNC_SETTINGS_KEY,
  type CloudBackupMeta,
  CloudRequestError,
  type CloudSyncSettings,
  downloadCloudBackup,
  getCloudSyncSettings,
  hasCloudCredentials,
  uploadCloudBackup,
  writeCloudSyncSettingsPatch,
} from './cloud'
import { STORAGE_WRITE_EVENT, dispatchStorageWrite, type StorageWriteDetail } from './storageEvents'
import { trackTelemetry } from './telemetry'

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
  return (
    isCloudSyncDirty() ||
    !settings.lastBackupAt ||
    settings.lastSyncStatus === 'error' ||
    settings.lastSyncStatus === 'conflict'
  )
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

function emitCloudSyncResult(detail: Record<string, unknown>) {
  window.dispatchEvent(new CustomEvent('ratio:cloud-sync', { detail }))
}

function writeAutoSyncSuccess(
  meta: CloudBackupMeta,
  reason: string,
  message: string,
  dirtyToken: string | undefined,
  telemetryEvent: string,
) {
  markCloudSyncClean(dirtyToken)
  writeCloudSyncSettingsPatch({
    lastBackupAt: meta.updatedAt,
    lastSyncAt: new Date().toISOString(),
    lastSyncStatus: 'ok',
    lastSyncMessage: message,
  })
  emitCloudSyncResult({ ok: true, reason, itemCount: meta.itemCount, remoteUpdatedAt: meta.updatedAt })
  trackTelemetry(telemetryEvent, {
    reason,
    itemCount: meta.itemCount,
    remoteUpdatedAt: meta.updatedAt,
  })
}

function writeAutoSyncConflict(
  reason: string,
  message: string,
  payload: {
    expectedUpdatedAt?: string
    remoteUpdatedAt?: string
    localItemCount?: number
    remoteItemCount?: number
    hasLastBackupAt?: boolean
  } = {},
) {
  writeCloudSyncSettingsPatch({
    lastSyncAt: new Date().toISOString(),
    lastSyncStatus: 'conflict',
    lastSyncMessage: message.slice(0, 180),
  })
  emitCloudSyncResult({ ok: false, reason, message, code: 'backup_conflict', ...payload })
  trackTelemetry('cloud_sync_auto_conflict', {
    reason,
    message,
    ...payload,
  })
}

async function reconcileRemoteBackup(
  settings: CloudSyncSettings,
  backup: RatioBackupFile,
  reason: string,
  dirtyToken: string | undefined,
): Promise<'matched' | 'conflict' | 'missing'> {
  const remote = await downloadCloudBackup(settings)
  const localItemCount = Object.keys(backup.items).length

  if (!remote.meta || !remote.backup) {
    trackTelemetry('cloud_sync_auto_remote_missing', {
      reason,
      localItemCount,
      hasLastBackupAt: Boolean(settings.lastBackupAt),
    })
    return 'missing'
  }

  if (sameRatioBackupData(backup, remote.backup)) {
    writeAutoSyncSuccess(
      remote.meta,
      reason,
      `已确认云端现有备份 ${remote.meta.itemCount} 项数据`,
      dirtyToken,
      'cloud_sync_auto_reconciled',
    )
    return 'matched'
  }

  writeAutoSyncConflict(reason, `云端备份已更新：${remote.meta.updatedAt}`, {
    expectedUpdatedAt: settings.lastBackupAt || '',
    remoteUpdatedAt: remote.meta.updatedAt,
    localItemCount,
    remoteItemCount: remote.meta.itemCount,
    hasLastBackupAt: Boolean(settings.lastBackupAt),
  })
  return 'conflict'
}

async function runAutoSync(reason: string) {
  const settings = getCloudSyncSettings()
  const dirty = isCloudSyncDirty()

  if (!settings.autoSync || !hasCloudCredentials(settings)) return
  if (!dirty && settings.lastBackupAt && settings.lastSyncStatus !== 'error') return
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

  const dirtyToken = readCloudSyncDirtyToken()
  const backup = buildRatioBackup()
  const localItemCount = Object.keys(backup.items).length

  trackTelemetry('cloud_sync_auto_start', {
    reason,
    dirty,
    hasLastBackupAt: Boolean(settings.lastBackupAt),
    lastSyncStatus: settings.lastSyncStatus || '',
    localItemCount,
  })

  try {
    const shouldTryReconcile = !settings.lastBackupAt || settings.lastSyncStatus === 'conflict'
    if (shouldTryReconcile) {
      const remoteState = await reconcileRemoteBackup(settings, backup, reason, dirtyToken)
      if (remoteState !== 'missing') return
      if (settings.lastSyncStatus === 'conflict') return
    }

    const meta = await uploadCloudBackup(settings, backup, { expectedUpdatedAt: settings.lastBackupAt })
    writeAutoSyncSuccess(meta, reason, `已自动上传 ${meta.itemCount} 项数据`, dirtyToken, 'cloud_sync_auto_upload')
  } catch (error) {
    if (error instanceof CloudRequestError && error.code === 'backup_conflict') {
      try {
        const remoteState = await reconcileRemoteBackup(settings, backup, reason, dirtyToken)
        if (remoteState !== 'missing') return
      } catch {
        // Keep the original conflict below; auto-sync must not overwrite remote data on a failed re-check.
      }
    }

    const message = error instanceof Error ? error.message : 'Cloud sync failed'
    const code = error instanceof CloudRequestError ? error.code : undefined
    const status = code === 'backup_conflict' ? 'conflict' : 'error'
    writeCloudSyncSettingsPatch({
      lastSyncAt: new Date().toISOString(),
      lastSyncStatus: status,
      lastSyncMessage: message.slice(0, 180),
    })
    emitCloudSyncResult({ ok: false, reason, message, code })

    if (status === 'conflict') {
      trackTelemetry('cloud_sync_auto_conflict', {
        reason,
        message,
        expectedUpdatedAt: settings.lastBackupAt || '',
        hasLastBackupAt: Boolean(settings.lastBackupAt),
        localItemCount,
      })
    } else {
      trackTelemetry('cloud_sync_auto_error', {
        reason,
        code: code || '',
        message,
        hasLastBackupAt: Boolean(settings.lastBackupAt),
        localItemCount,
      })
    }
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
