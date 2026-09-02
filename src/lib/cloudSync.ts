import {
  buildRatioBackup,
  restoreRatioBackup,
  sameRatioBackupData,
  summarizeRatioBackupContent,
  summarizeRatioBackupDiff,
  RATIO_BACKUP_EXCLUDE_PREFIXES,
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
import { isDemoModeActive } from './demoMode'
import { writePreOperationLocalBackup } from './localBackups'
import { emitAppToast } from './overlay'
import { trackTelemetry } from './telemetry'

const AUTO_SYNC_DELAY_MS = 2500
const AUTO_SYNC_MIN_INTERVAL_MS = 30000
export const CLOUD_SYNC_DIRTY_KEY = 'ratio.cloudSyncDirty'
export const CLOUD_SYNC_PENDING_UPLOAD_KEY = 'ratio.cloudSync.pendingUpload'

const PENDING_UPLOAD_SCHEMA = 'ratio.cloud-pending-upload.v1'

type PendingCloudUpload = {
  schema: typeof PENDING_UPLOAD_SCHEMA
  serverUrl: string
  username: string
  expectedUpdatedAt: string
  backupCreatedAt: string
  itemCount: number
  dirtyToken: string
  stagedAt: string
}

type PendingUploadRecovery = 'none' | 'adopted' | 'discarded' | 'stale'

let initialized = false
let listenerAbort: AbortController | null = null
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
  if (RATIO_BACKUP_EXCLUDE_PREFIXES.some((prefix) => key.startsWith(prefix))) return false
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

function hasPendingCloudUpload() {
  try {
    return storageKernel.get(CLOUD_SYNC_PENDING_UPLOAD_KEY) !== null
  } catch {
    return false
  }
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
    hasPendingCloudUpload() ||
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function coercePendingCloudUpload(value: unknown): PendingCloudUpload | null {
  if (!isRecord(value) || value.schema !== PENDING_UPLOAD_SCHEMA) return null
  if (typeof value.serverUrl !== 'string' || typeof value.username !== 'string') return null
  if (typeof value.expectedUpdatedAt !== 'string' || typeof value.backupCreatedAt !== 'string') return null
  if (typeof value.itemCount !== 'number' || !Number.isInteger(value.itemCount) || value.itemCount < 0) return null
  if (typeof value.dirtyToken !== 'string' || typeof value.stagedAt !== 'string') return null
  return {
    schema: PENDING_UPLOAD_SCHEMA,
    serverUrl: value.serverUrl,
    username: value.username,
    expectedUpdatedAt: value.expectedUpdatedAt,
    backupCreatedAt: value.backupCreatedAt,
    itemCount: Number(value.itemCount),
    dirtyToken: value.dirtyToken,
    stagedAt: value.stagedAt,
  }
}

function readPendingCloudUpload(): PendingCloudUpload | null {
  try {
    const raw = storageKernel.get(CLOUD_SYNC_PENDING_UPLOAD_KEY)
    if (!raw) return null
    return coercePendingCloudUpload(JSON.parse(raw) as unknown)
  } catch {
    return null
  }
}

function pendingUploadMatches(left: PendingCloudUpload, right: PendingCloudUpload) {
  return (
    left.serverUrl === right.serverUrl &&
    left.username === right.username &&
    left.backupCreatedAt === right.backupCreatedAt &&
    left.stagedAt === right.stagedAt
  )
}

function clearPendingCloudUpload(expected?: PendingCloudUpload) {
  try {
    if (expected) {
      const current = readPendingCloudUpload()
      if (!current || !pendingUploadMatches(current, expected)) return
    }
    storageKernel.remove(CLOUD_SYNC_PENDING_UPLOAD_KEY)
    dispatchStorageWrite(CLOUD_SYNC_PENDING_UPLOAD_KEY)
  } catch {
    // 检查点清理失败可以在下次启动幂等重试，不能影响已确认的同步结果。
  }
}

function isPendingUploadForTarget(pending: PendingCloudUpload, settings: CloudSyncSettings) {
  const target = normalizeCloudTarget(settings)
  return pending.serverUrl === target.serverUrl && pending.username === target.username
}

async function stagePendingCloudUpload(
  settings: CloudSyncSettings,
  backup: RatioBackupFile,
  dirtyToken: string,
): Promise<PendingCloudUpload> {
  const target = normalizeCloudTarget(settings)
  const pending: PendingCloudUpload = {
    schema: PENDING_UPLOAD_SCHEMA,
    serverUrl: target.serverUrl,
    username: target.username,
    expectedUpdatedAt: settings.lastBackupAt || '',
    backupCreatedAt: backup.createdAt,
    itemCount: Object.keys(backup.items).length,
    dirtyToken,
    stagedAt: new Date().toISOString(),
  }
  const raw = JSON.stringify(pending)
  storageKernel.set(CLOUD_SYNC_PENDING_UPLOAD_KEY, raw)
  dispatchStorageWrite(CLOUD_SYNC_PENDING_UPLOAD_KEY, raw)

  // 必须先把检查点（以及本次备份依赖的待写数据）落盘，再发 PUT。否则 iOS 在
  // 服务端写入后杀掉页面时，重启仍然没有任何证据能认领这次上传。
  if (!(await storageKernel.flush())) throw new Error('无法安全保存云备份上传状态')
  return pending
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

/**
 * 认领上一次在页面被杀前已经发出的 PUT。
 *
 * 服务端现有 meta 会原样保存 backup.createdAt 为 clientCreatedAt；检查点又在 PUT
 * 之前强制落盘，因此跨重启后可以用「目标账号 + clientCreatedAt + itemCount」确认
 * 远端版本正是本机那次上传。认领时只清除当时的 dirtyToken：启动后若快照或账户
 * 又发生变化，新 token 会保留，随后以刚认领的 updatedAt 为基线继续上传新版本。
 */
async function tryAdoptPendingCloudUpload(
  settings: CloudSyncSettings,
  reason: string,
): Promise<PendingUploadRecovery> {
  const pending = readPendingCloudUpload()
  if (!pending) {
    if (hasPendingCloudUpload()) clearPendingCloudUpload()
    return 'none'
  }

  if (!isPendingUploadForTarget(pending, settings)) {
    clearPendingCloudUpload(pending)
    trackTelemetry('cloud_sync_auto_pending_discarded', { reason, status: 'target_changed' })
    return 'discarded'
  }

  const { meta } = await fetchCloudBackupMeta(settings)
  if (!meta || meta.updatedAt === pending.expectedUpdatedAt) {
    clearPendingCloudUpload(pending)
    trackTelemetry('cloud_sync_auto_pending_discarded', {
      reason,
      status: meta ? 'not_landed' : 'remote_missing',
    })
    return 'discarded'
  }

  if (meta.clientCreatedAt !== pending.backupCreatedAt || meta.itemCount !== pending.itemCount) {
    clearPendingCloudUpload(pending)
    trackTelemetry('cloud_sync_auto_pending_discarded', {
      reason,
      status: 'remote_mismatch',
      expectedUpdatedAt: pending.expectedUpdatedAt,
      remoteUpdatedAt: meta.updatedAt,
      expectedItemCount: pending.itemCount,
      remoteItemCount: meta.itemCount,
    })
    return 'discarded'
  }

  const applied = writeAutoSyncSuccess(
    settings,
    meta,
    reason,
    `已确认上次上传成功（${meta.itemCount} 项）`,
    pending.dirtyToken,
    'cloud_sync_auto_upload_recovered',
  )
  if (!applied) return 'stale'
  clearPendingCloudUpload(pending)
  return 'adopted'
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

/**
 * 上传「响应丢了」的当前会话兜底。
 *
 * fetch 抛 TypeError（WebKit 上就是 `Load failed`：切网、进后台被杀、代理超时）时，
 * 请求**可能已经到达服务端并写入成功**——我们只是没拿到回执。此时本机的
 * `lastBackupAt` 仍停在旧值，而远端的 updatedAt 已经前进，于是下一次自动上传必然
 * 撞 409，自动备份就此卡死在 conflict 状态，直到用户手动选择覆盖或恢复
 * （2026-08-27 线上事故，见 TROUBLESHOOTING「自动备份卡在冲突」）。
 *
 * 新上传会优先走持久化检查点；这里仍保留旧客户端/异常检查点下的窄兜底：远端
 * updatedAt 必须与本机记录的不同，且远端内容与刚发出去的那份相同。任何一条不满足
 * 就当作普通网络错误处理（脏标记还在，下次重试），绝不静默改动乐观锁基线。
 */
async function tryAdoptLostUploadResult(
  settings: CloudSyncSettings,
  uploaded: RatioBackupFile,
  reason: string,
  dirtyToken: string | undefined,
): Promise<boolean> {
  const remote = await downloadCloudBackup(settings)
  if (!remote.meta || !remote.backup) return false
  if (remote.meta.updatedAt === (settings.lastBackupAt || '')) return false
  if (!sameRatioBackupData(uploaded, remote.backup)) return false

  return writeAutoSyncSuccess(
    settings,
    remote.meta,
    reason,
    `已确认上传成功（${remote.meta.itemCount} 项，回执丢失）`,
    dirtyToken,
    'cloud_sync_auto_upload_recovered',
  )
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

async function runAutoSync(reason: string, options: { urgent?: boolean } = {}) {
  let settings = getCloudSyncSettings()
  let dirty = isCloudSyncDirty()

  if (isDemoModeActive()) return
  if (!settings.autoSync || !hasCloudCredentials(settings)) return
  if (syncInFlight) {
    pendingReason = reason
    return
  }

  const now = Date.now()
  const elapsed = now - lastAutoSyncAt
  // urgent（页面隐藏抢跑）绕过最小间隔：隐藏后定时器会被冻结，改约等于放弃
  if (!options.urgent && elapsed < AUTO_SYNC_MIN_INTERVAL_MS) {
    scheduleAutoSync(reason, AUTO_SYNC_MIN_INTERVAL_MS - elapsed)
    return
  }

  lastAutoSyncAt = now
  syncInFlight = true
  pendingReason = null

  let dirtyToken = readCloudSyncDirtyToken()
  let backup = buildRatioBackup()
  let localItemCount = Object.keys(backup.items).length

  trackTelemetry('cloud_sync_auto_start', {
    reason,
    dirty,
    hasLastBackupAt: Boolean(settings.lastBackupAt),
    lastSyncStatus: settings.lastSyncStatus || '',
    localItemCount,
  })

  // 只有真的发出过 PUT，才谈得上「回执丢了但其实写进去了」
  let uploadAttempted = false
  let stagedUpload: PendingCloudUpload | null = null

  try {
    const pendingRecovery = await tryAdoptPendingCloudUpload(settings, reason)
    if (pendingRecovery === 'stale') return
    if (pendingRecovery === 'adopted') {
      settings = getCloudSyncSettings()
      dirty = isCloudSyncDirty()
      // 检查点之后没有新写入：上次上传已经包含全部本机数据，到此结束。
      if (!dirty) return

      // 启动后生成了新快照或用户继续记账：以刚认领的远端版本为新基线，
      // 重新抓取当前数据并在本轮继续上传，不能沿用认领前的旧 backup/token。
      dirtyToken = readCloudSyncDirtyToken()
      backup = buildRatioBackup()
      localItemCount = Object.keys(backup.items).length
      trackTelemetry('cloud_sync_auto_pending_continue', {
        reason,
        expectedUpdatedAt: settings.lastBackupAt || '',
        localItemCount,
      })
    }

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

    stagedUpload = await stagePendingCloudUpload(settings, backup, dirtyToken)
    uploadAttempted = true
    const meta = await uploadCloudBackup(settings, backup, { expectedUpdatedAt: settings.lastBackupAt })
    if (writeAutoSyncSuccess(settings, meta, reason, `已自动上传 ${meta.itemCount} 项数据`, dirtyToken, 'cloud_sync_auto_upload')) {
      clearPendingCloudUpload(stagedUpload)
    }
  } catch (error) {
    if (uploadAttempted) {
      try {
        const pendingRecovery = await tryAdoptPendingCloudUpload(settings, reason)
        if (pendingRecovery === 'stale') return
        if (pendingRecovery === 'adopted') {
          // 请求在途期间若又有本地写入，认领只会清掉旧 token；安排下一轮
          // 用新基线上传当前数据。无新写入则 dirty 已清，直接结束。
          if (isCloudSyncDirty()) pendingReason = `recovered:${reason}`
          return
        }
      } catch {
        // 回查本身失败时保留检查点；下次启动会在任何新上传之前再次认领。
      }
    }

    if (error instanceof CloudRequestError && error.code === 'backup_conflict') {
      try {
        const remoteState = await reconcileRemoteBackup(settings, backup, reason, dirtyToken)
        if (remoteState !== 'missing') return
      } catch {
        // Keep the original conflict below; auto-sync must not overwrite remote data on a failed re-check.
      }
    }

    // 非 CloudRequestError = 连 HTTP 状态都没拿到（fetch 抛 TypeError / 响应体读一半断）。
    // 这种失败下服务端可能已经写入成功，先回查一次再决定是不是真的失败。
    if (uploadAttempted && !(error instanceof CloudRequestError)) {
      try {
        if (await tryAdoptLostUploadResult(settings, backup, reason, dirtyToken)) {
          if (stagedUpload) clearPendingCloudUpload(stagedUpload)
          return
        }
      } catch {
        // 回查本身也失败（多半还是没网）：照常走下面的错误分支，脏标记留着下次重试
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
  // 所有监听统一挂到一个 AbortController：disposeCloudAutoSync 一次移除。
  // 测试里 vi.resetModules 会产生多个模块副本，旧副本的监听若不移除会
  // 留在共享 window 上，把一次事件放大成 N 次同步调度。
  listenerAbort = new AbortController()
  const { signal } = listenerAbort

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
  }, { signal })

  window.addEventListener('online', () => {
    if (shouldScheduleSync({ includeRemoteProbe: true })) scheduleAutoSync('online')
  }, { signal })

  window.addEventListener('focus', () => {
    if (shouldScheduleSync({ includeRemoteProbe: true })) scheduleAutoSync('focus', 800)
  }, { signal })

  window.addEventListener('pageshow', () => {
    if (shouldScheduleSync({ includeRemoteProbe: true })) scheduleAutoSync('pageshow', 800)
  }, { signal })

  // 离场前抢跑上传：手机上「记一笔就切走」是常态，2.5s 防抖 + 30s 节流
  // 会让上传来不及发生，脏数据滞留本机直到下次打开——期间另一台设备先
  // 上传，回头就是 409 冲突。存储内核在 pagehide 抢跑 flush，云同步在此
  // 对齐：页面隐藏且有脏数据时立即同步（绕过防抖与节流）。请求被系统
  // 杀死也无害：PUT 前已持久化上传检查点，下次启动先认领已落盘的远端版本；
  // 检查点之后若又有本地写入，其新脏标记会保留并基于新版本继续上传。
  const flushDirtyOnHide = () => {
    if (!isCloudSyncDirty()) return
    if (isDemoModeActive()) return
    const settings = getCloudSyncSettings()
    if (!settings.autoSync || !hasCloudCredentials(settings)) return
    if (syncInFlight) return
    cancelPendingCloudAutoSync()
    void runAutoSync('hidden', { urgent: true })
  }

  window.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && shouldScheduleSync({ includeRemoteProbe: true })) {
      scheduleAutoSync('visible', 800)
    }
    if (document.visibilityState === 'hidden') flushDirtyOnHide()
  }, { signal })

  window.addEventListener('pagehide', flushDirtyOnHide, { signal })

  if (shouldScheduleSync({ includeRemoteProbe: true })) scheduleAutoSync('startup', 800)
}

/** 测试用：移除本模块注册的全部监听并复位调度状态（生产环境无需调用） */
export function disposeCloudAutoSync() {
  listenerAbort?.abort()
  listenerAbort = null
  cancelPendingCloudAutoSync()
  initialized = false
  lastAutoSyncAt = 0
  syncInFlight = false
  pendingReason = null
}
