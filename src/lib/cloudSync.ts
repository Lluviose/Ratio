import {
  buildRatioBackup,
  restoreRatioBackup,
  sameRatioBackupData,
  summarizeRatioBackupContent,
  summarizeRatioBackupDiff,
  type RatioBackupFile,
  type RestoreResult,
} from './backup'
import {
  CLOUD_SYNC_SETTINGS_KEY,
  type CloudBackupMeta,
  CloudRequestError,
  type CloudSyncSettings,
  downloadCloudBackup,
  fetchCloudBackupMeta,
  getCloudSyncSettings,
  hasCloudCredentials,
  uploadCloudBackup,
  writeCloudSyncSettingsPatch,
} from './cloud'
import { STORAGE_WRITE_EVENT, dispatchStorageWrite, type StorageWriteDetail } from './storageEvents'
import { storageKernel } from './storageKernel'
import { DEMO_KEY_PREFIX, isDemoModeActive } from './demoMode'
import { writePreOperationLocalBackup } from './localBackups'
import { emitAppToast } from './overlay'
import { trackTelemetry } from './telemetry'

const AUTO_SYNC_DELAY_MS = 2500
const AUTO_SYNC_MIN_INTERVAL_MS = 30000
export const CLOUD_SYNC_DIRTY_KEY = 'ratio.cloudSyncDirty'

let initialized = false
let syncTimer: number | null = null
let lastAutoSyncAt = 0
let syncInFlight = false
let pendingReason: string | null = null
let suppressSettingsSchedule = false
// fast-forward 应用远端备份时，restoreRatioBackup 会对每个变更键广播写事件；
// 这些写入来自云端而非用户，不能被自己的监听器标脏（否则刚下载的数据会被再上传一遍）
let suppressDirtyMarking = false

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
  if (key.startsWith(DEMO_KEY_PREFIX)) return false
  // 演示模式期间的数据写入不标脏：演示数据永远不该进云端
  if (isDemoModeActive()) return false
  return true
}

export function readCloudSyncDirtyToken() {
  try {
    return storageKernel.get(CLOUD_SYNC_DIRTY_KEY) || ''
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
    storageKernel.set(CLOUD_SYNC_DIRTY_KEY, token)
    dispatchStorageWrite(CLOUD_SYNC_DIRTY_KEY, token)
  } catch {
    // Auto-sync bookkeeping must not block the primary local write.
  }
}

function shouldScheduleSync(options: { includeRemoteProbe?: boolean } = {}) {
  const settings = getCloudSyncSettings()
  if (isDemoModeActive()) return false
  if (!settings.autoSync || !hasCloudCredentials(settings)) return false
  if (
    isCloudSyncDirty() ||
    !settings.lastBackupAt ||
    settings.lastSyncStatus === 'error' ||
    settings.lastSyncStatus === 'conflict'
  ) {
    return true
  }
  return options.includeRemoteProbe === true
}

export function markCloudSyncClean(expectedDirtyToken?: string) {
  if (typeof window === 'undefined') return
  try {
    if (expectedDirtyToken !== undefined && readCloudSyncDirtyToken() !== expectedDirtyToken) return
    storageKernel.remove(CLOUD_SYNC_DIRTY_KEY)
    dispatchStorageWrite(CLOUD_SYNC_DIRTY_KEY)
  } catch {
    // Auto-sync bookkeeping must not block the primary local write.
  }
}

export function cancelPendingCloudAutoSync() {
  if (typeof window === 'undefined') return
  if (syncTimer !== null) {
    window.clearTimeout(syncTimer)
    syncTimer = null
  }
  pendingReason = null
}

function emitCloudSyncResult(detail: Record<string, unknown>) {
  window.dispatchEvent(new CustomEvent('ratio:cloud-sync', { detail }))
}

function normalizeCloudTarget(settings: CloudSyncSettings) {
  return {
    serverUrl: settings.serverUrl.trim().replace(/\/+$/, ''),
    username: settings.username.trim(),
  }
}

function isSameCloudTarget(settings: CloudSyncSettings) {
  const expected = normalizeCloudTarget(settings)
  const current = normalizeCloudTarget(getCloudSyncSettings())
  return expected.serverUrl === current.serverUrl && expected.username === current.username
}

function canApplyAutoSyncResult(settings: CloudSyncSettings, reason: string) {
  if (isSameCloudTarget(settings)) return true
  trackTelemetry('cloud_sync_auto_stale_result', { reason })
  return false
}

function writeAutoSyncSettingsPatch(patch: Partial<CloudSyncSettings>) {
  suppressSettingsSchedule = true
  try {
    writeCloudSyncSettingsPatch(patch)
  } finally {
    suppressSettingsSchedule = false
  }
}

function writeAutoSyncSuccess(
  settings: CloudSyncSettings,
  meta: CloudBackupMeta,
  reason: string,
  message: string,
  dirtyToken: string | undefined,
  telemetryEvent: string,
) {
  if (!canApplyAutoSyncResult(settings, reason)) return false
  markCloudSyncClean(dirtyToken)
  writeAutoSyncSettingsPatch({
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
  return true
}

function writeAutoSyncConflict(
  settings: CloudSyncSettings,
  reason: string,
  message: string,
  payload: {
    expectedUpdatedAt?: string
    remoteUpdatedAt?: string
    localItemCount?: number
    remoteItemCount?: number
    hasLastBackupAt?: boolean
    localOnlyCount?: number
    remoteOnlyCount?: number
    changedCount?: number
    differentEntryCount?: number
    diffSampleNames?: string[]
  } = {},
) {
  if (!canApplyAutoSyncResult(settings, reason)) return false
  writeAutoSyncSettingsPatch({
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
  return true
}

/**
 * fast-forward：本地自上次同步后无任何修改（无脏标记）而云端有更新时，
 * 自动把远端备份应用到本机。该场景下远端是唯一有新内容的一方（典型：换设备），
 * 覆盖本机不会丢数据；其余场景一律维持人工冲突流程。
 * 返回 false 表示不满足安全条件或应用失败，调用方回落到 conflict 分支。
 */
function tryAutoFastForward(
  settings: CloudSyncSettings,
  remote: { meta: CloudBackupMeta; backup: RatioBackupFile },
  reason: string,
): boolean {
  if (isDemoModeActive()) return false
  // 网络往返期间用户可能写入了新数据：此刻再查一次脏标记，非空即放弃
  if (isCloudSyncDirty()) return false
  if (!canApplyAutoSyncResult(settings, reason)) return false

  // 与手动「从云端恢复」同等的内容预检：空/损坏的远端备份不允许静默覆盖本机
  const summary = summarizeRatioBackupContent(remote.backup)
  if (summary.looksEmpty || summary.corruptKeys.length > 0) {
    trackTelemetry('cloud_sync_auto_fast_forward_rejected', {
      reason,
      looksEmpty: summary.looksEmpty,
      corruptKeys: summary.corruptKeys.length,
    })
    return false
  }

  // 覆盖前抢一代本机快照（失败不阻断，与手动恢复口径一致）
  writePreOperationLocalBackup()

  let restore: RestoreResult
  suppressDirtyMarking = true
  try {
    restore = restoreRatioBackup(remote.backup)
  } catch (error) {
    // restoreRatioBackup 内部已尝试回滚本地数据；这里放弃 fast-forward 走冲突流程
    trackTelemetry('cloud_sync_auto_fast_forward_failed', {
      reason,
      message: error instanceof Error ? error.message : 'restore failed',
    })
    return false
  } finally {
    suppressDirtyMarking = false
  }

  const now = new Date().toISOString()
  markCloudSyncClean()
  writeAutoSyncSettingsPatch({
    lastBackupAt: remote.meta.updatedAt,
    lastRestoreAt: now,
    lastSyncAt: now,
    lastSyncStatus: 'ok',
    lastSyncMessage: `已自动同步云端更新（${restore.restoredKeys.length} 项）`,
  })
  emitCloudSyncResult({
    ok: true,
    reason,
    fastForward: true,
    itemCount: remote.meta.itemCount,
    remoteUpdatedAt: remote.meta.updatedAt,
  })
  emitAppToast('已同步来自其他设备的云端更新', { tone: 'success' })
  trackTelemetry('cloud_sync_auto_fast_forward', {
    reason,
    itemCount: remote.meta.itemCount,
    remoteUpdatedAt: remote.meta.updatedAt,
    restoredKeys: restore.restoredKeys.length,
  })
  return true
}

async function reconcileRemoteBackup(
  settings: CloudSyncSettings,
  backup: RatioBackupFile,
  reason: string,
  dirtyToken: string | undefined,
  options: { allowFastForward?: boolean } = {},
): Promise<'matched' | 'fast_forwarded' | 'conflict' | 'missing' | 'stale'> {
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
    const applied = writeAutoSyncSuccess(
      settings,
      remote.meta,
      reason,
      `已确认云端现有备份 ${remote.meta.itemCount} 项数据`,
      dirtyToken,
      'cloud_sync_auto_reconciled',
    )
    return applied ? 'matched' : 'stale'
  }

  if (options.allowFastForward && tryAutoFastForward(settings, { meta: remote.meta, backup: remote.backup }, reason)) {
    return 'fast_forwarded'
  }

  const diff = summarizeRatioBackupDiff(backup, remote.backup)
  const applied = writeAutoSyncConflict(settings, reason, `云端备份已更新：${remote.meta.updatedAt}`, {
    expectedUpdatedAt: settings.lastBackupAt || '',
    remoteUpdatedAt: remote.meta.updatedAt,
    localItemCount,
    remoteItemCount: remote.meta.itemCount,
    hasLastBackupAt: Boolean(settings.lastBackupAt),
    localOnlyCount: diff.localOnlyCount,
    remoteOnlyCount: diff.remoteOnlyCount,
    changedCount: diff.changedCount,
    differentEntryCount: diff.differentKeyCount,
    diffSampleNames: diff.sampleKeys,
  })
  return applied ? 'conflict' : 'stale'
}

async function probeRemoteFreshness(
  settings: CloudSyncSettings,
  backup: RatioBackupFile,
  reason: string,
  dirtyToken: string | undefined,
): Promise<'current' | 'matched' | 'fast_forwarded' | 'conflict' | 'missing' | 'stale'> {
  const localItemCount = Object.keys(backup.items).length
  const { meta } = await fetchCloudBackupMeta(settings)

  if (!meta) {
    trackTelemetry('cloud_sync_auto_probe', {
      reason,
      status: 'missing',
      expectedUpdatedAt: settings.lastBackupAt || '',
      hasLastBackupAt: Boolean(settings.lastBackupAt),
      localItemCount,
    })
    const applied = writeAutoSyncConflict(settings, reason, '云端备份不存在或已被清除', {
      expectedUpdatedAt: settings.lastBackupAt || '',
      localItemCount,
      hasLastBackupAt: Boolean(settings.lastBackupAt),
    })
    return applied ? 'missing' : 'stale'
  }

  if (meta.updatedAt === settings.lastBackupAt) {
    trackTelemetry('cloud_sync_auto_probe', {
      reason,
      status: 'current',
      expectedUpdatedAt: settings.lastBackupAt || '',
      remoteUpdatedAt: meta.updatedAt,
      localItemCount,
      remoteItemCount: meta.itemCount,
    })

    if (settings.lastSyncStatus === 'error') {
      const applied = writeAutoSyncSuccess(
        settings,
        meta,
        reason,
        `云端备份状态正常：${meta.itemCount} 项数据`,
        dirtyToken,
        'cloud_sync_auto_current',
      )
      return applied ? 'current' : 'stale'
    }

    return 'current'
  }

  trackTelemetry('cloud_sync_auto_probe', {
    reason,
    status: 'changed',
    expectedUpdatedAt: settings.lastBackupAt || '',
    remoteUpdatedAt: meta.updatedAt,
    localItemCount,
    remoteItemCount: meta.itemCount,
  })

  // probe 路径的前提是本地 clean（无脏标记）：远端更新时允许 fast-forward 自动应用
  return reconcileRemoteBackup(settings, backup, reason, dirtyToken, { allowFastForward: true })
}

async function runAutoSync(reason: string) {
  const settings = getCloudSyncSettings()
  const dirty = isCloudSyncDirty()

  if (isDemoModeActive()) return
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
    if (!dirty && settings.lastBackupAt && settings.lastSyncStatus !== 'conflict') {
      await probeRemoteFreshness(settings, backup, reason, dirtyToken)
      return
    }

    const shouldTryReconcile = !settings.lastBackupAt || settings.lastSyncStatus === 'conflict'
    if (shouldTryReconcile) {
      const remoteState = await reconcileRemoteBackup(settings, backup, reason, dirtyToken)
      if (remoteState !== 'missing') return
      if (settings.lastSyncStatus === 'conflict') return
    }

    const meta = await uploadCloudBackup(settings, backup, { expectedUpdatedAt: settings.lastBackupAt })
    writeAutoSyncSuccess(settings, meta, reason, `已自动上传 ${meta.itemCount} 项数据`, dirtyToken, 'cloud_sync_auto_upload')
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
    if (canApplyAutoSyncResult(settings, reason)) {
      writeAutoSyncSettingsPatch({
        lastSyncAt: new Date().toISOString(),
        lastSyncStatus: status,
        lastSyncMessage: message.slice(0, 180),
      })
      emitCloudSyncResult({ ok: false, reason, message, code })
    }

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
      if (suppressSettingsSchedule) return
      if (!shouldScheduleSync({ includeRemoteProbe: true })) return
      if (syncInFlight) {
        pendingReason = 'settings'
        return
      }
      scheduleAutoSync('settings')
      return
    }
    if (!shouldAutoSyncKey(detail.key)) return
    if (suppressDirtyMarking) return
    setCloudSyncDirty()
    scheduleAutoSync(`storage:${detail.key}`)
  })

  window.addEventListener('online', () => {
    if (shouldScheduleSync({ includeRemoteProbe: true })) scheduleAutoSync('online')
  })

  window.addEventListener('focus', () => {
    if (shouldScheduleSync({ includeRemoteProbe: true })) scheduleAutoSync('focus', 800)
  })

  window.addEventListener('pageshow', () => {
    if (shouldScheduleSync({ includeRemoteProbe: true })) scheduleAutoSync('pageshow', 800)
  })

  window.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && shouldScheduleSync({ includeRemoteProbe: true })) {
      scheduleAutoSync('visible', 800)
    }
  })

  if (shouldScheduleSync({ includeRemoteProbe: true })) scheduleAutoSync('startup', 800)
}
