// 云端上传编排核心：从 SettingsScreen 的 uploadCloud 原样提炼，不依赖 React。
// 云 API、设置写回、toast/confirm、遥测、busy 翻转等副作用全部通过 deps 注入，
// 便于单测用 fake 云端覆盖「冲突→确认覆盖重试」「远端数据一致自动确认」等分支。
// 行为必须与提炼前逐字节一致（文案、写回时机、abort 语义、busy 翻转）。
import { isAbortError } from '../../lib/abortError'
import { CloudRequestError, type CloudBackupMeta, type CloudSyncSettings } from '../../lib/cloud'
import { sameRatioBackupData, summarizeRatioBackupDiff, type RatioBackupFile } from '../../lib/backup'
import type { ConfirmOptions, ToastOptions } from '../../lib/overlay'

export function readConflictMeta(err: unknown): CloudBackupMeta | null {
  if (!(err instanceof CloudRequestError)) return null
  if (err.code !== 'backup_conflict') return null
  const meta = err.details.meta
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return null
  const record = meta as Record<string, unknown>
  if (typeof record.updatedAt !== 'string') return null
  return {
    updatedAt: record.updatedAt,
    clientCreatedAt: typeof record.clientCreatedAt === 'string' ? record.clientCreatedAt : record.updatedAt,
    itemCount: typeof record.itemCount === 'number' ? record.itemCount : 0,
    device: typeof record.device === 'string' ? record.device : '',
  }
}

export type RunCloudUploadDeps = {
  getSettings: () => CloudSyncSettings
  // 与 SettingsScreen 的 startCloudOperation/finishCloudOperation/canUseCloudResult 同语义：
  // start 会 abort 上一个 controller 并翻起 busy；finish 只在 controller 仍是当前操作时收尾。
  startOperation: () => AbortController
  finishOperation: (controller: AbortController) => void
  canUseResult: (controller: AbortController) => boolean
  isSameTarget: (settings: CloudSyncSettings) => boolean
  notifyTargetChanged: () => void
  isMounted: () => boolean
  setBusy: (busy: boolean) => void
  uploadBackup: (
    settings: CloudSyncSettings,
    backup: RatioBackupFile,
    options: { expectedUpdatedAt?: string; force?: boolean; signal?: AbortSignal },
  ) => Promise<CloudBackupMeta>
  downloadBackup: (
    settings: CloudSyncSettings,
    options: { signal?: AbortSignal },
  ) => Promise<{ backup: RatioBackupFile | null; meta: CloudBackupMeta | null }>
  buildBackup: () => RatioBackupFile
  readDirtyToken: () => string
  markClean: (token?: string) => void
  writeSettingsPatch: (patch: Partial<CloudSyncSettings>) => void
  collapseConfig: () => void
  toast: (message: string, options?: ToastOptions) => void
  confirm: (options: ConfirmOptions) => Promise<boolean>
  track: (name: string, payload?: Record<string, unknown>) => void
  telemetryPayload: () => Record<string, unknown>
}

export async function runCloudUpload(
  deps: RunCloudUploadDeps,
  force = false,
  requestSettings: CloudSyncSettings = deps.getSettings(),
): Promise<void> {
  let retrying = false
  const controller = deps.startOperation()
  const dirtyToken = deps.readDirtyToken()
  const backup = deps.buildBackup()
  try {
    const meta = await deps.uploadBackup(requestSettings, backup, {
      expectedUpdatedAt: requestSettings.lastBackupAt,
      force,
      signal: controller.signal,
    })
    if (!deps.canUseResult(controller)) return
    if (!deps.isSameTarget(requestSettings)) {
      deps.notifyTargetChanged()
      return
    }
    const syncedAt = new Date().toISOString()
    deps.markClean(dirtyToken)
    deps.writeSettingsPatch({
      lastBackupAt: meta.updatedAt,
      lastConnectionAt: syncedAt,
      lastSyncAt: syncedAt,
      lastSyncStatus: 'ok',
      lastSyncMessage: `已上传 ${meta.itemCount} 项数据`,
    })
    deps.collapseConfig()
    deps.toast(`已上传 ${meta.itemCount} 项数据`, { tone: 'success' })
    deps.track('cloud_backup_upload', {
      itemCount: meta.itemCount,
      force,
      remoteUpdatedAt: meta.updatedAt,
      ...deps.telemetryPayload(),
    })
  } catch (err) {
    if (isAbortError(err)) return
    let conflictMeta = readConflictMeta(err)
    if (err instanceof CloudRequestError && err.code === 'backup_conflict' && !force) {
      let diffSummary:
        | {
            localOnlyCount: number
            remoteOnlyCount: number
            changedCount: number
            differentKeyCount: number
            sampleKeys: string[]
          }
        | undefined
      try {
        const remote = await deps.downloadBackup(requestSettings, { signal: controller.signal })
        if (remote.meta) conflictMeta = remote.meta
        if (remote.meta && remote.backup) {
          if (sameRatioBackupData(backup, remote.backup)) {
            if (!deps.canUseResult(controller)) return
            if (!deps.isSameTarget(requestSettings)) {
              deps.notifyTargetChanged()
              return
            }
            const syncedAt = new Date().toISOString()
            deps.markClean(dirtyToken)
            deps.writeSettingsPatch({
              lastBackupAt: remote.meta.updatedAt,
              lastConnectionAt: syncedAt,
              lastSyncAt: syncedAt,
              lastSyncStatus: 'ok',
              lastSyncMessage: `已确认云端现有备份 ${remote.meta.itemCount} 项数据`,
            })
            deps.collapseConfig()
            deps.toast(`已确认云端现有备份 ${remote.meta.itemCount} 项数据`, { tone: 'success' })
            deps.track('cloud_backup_upload_reconciled', {
              force,
              remoteUpdatedAt: remote.meta.updatedAt,
              itemCount: remote.meta.itemCount,
              ...deps.telemetryPayload(),
            })
            return
          }
          diffSummary = summarizeRatioBackupDiff(backup, remote.backup)
        }
      } catch {
        // Keep the original conflict flow below if the verification request fails.
      }

      if (!deps.canUseResult(controller)) return
      const conflictMessage = conflictMeta ? `云端备份已更新：${conflictMeta.updatedAt}` : '云端备份状态已变化'
      if (deps.isSameTarget(requestSettings)) {
        deps.writeSettingsPatch({
          lastSyncAt: new Date().toISOString(),
          lastSyncStatus: 'conflict',
          lastSyncMessage: conflictMessage,
        })
      }
      deps.track('cloud_backup_upload_conflict', {
        force,
        expectedUpdatedAt: requestSettings.lastBackupAt || '',
        remoteUpdatedAt: conflictMeta?.updatedAt || '',
        remoteItemCount: conflictMeta?.itemCount ?? 0,
        localOnlyCount: diffSummary?.localOnlyCount ?? 0,
        remoteOnlyCount: diffSummary?.remoteOnlyCount ?? 0,
        changedCount: diffSummary?.changedCount ?? 0,
        differentEntryCount: diffSummary?.differentKeyCount ?? 0,
        diffSampleNames: diffSummary?.sampleKeys ?? [],
        ...deps.telemetryPayload(),
      })
      if (deps.isMounted()) deps.setBusy(false)
      const ok = await deps.confirm({
        title: '云端备份已更新',
        message: conflictMeta
          ? `云端已有更新的备份（${conflictMeta.updatedAt}）。继续上传会覆盖云端数据。`
          : '云端备份状态已变化。继续上传会覆盖当前云端状态。',
        confirmText: '覆盖云端备份',
        cancelText: '取消',
        tone: 'danger',
      })
      if (!deps.canUseResult(controller)) return
      if (ok) {
        if (!deps.isSameTarget(requestSettings)) {
          deps.notifyTargetChanged()
          return
        }
        retrying = true
        return runCloudUpload(deps, true, requestSettings)
      }
      return
    }
    if (!deps.isMounted()) return
    const msg = err instanceof Error ? err.message : 'Cloud upload failed'
    if (deps.isSameTarget(requestSettings)) {
      deps.writeSettingsPatch({
        lastSyncAt: new Date().toISOString(),
        lastSyncStatus: 'error',
        lastSyncMessage: msg,
      })
    }
    deps.track('cloud_backup_upload_error', {
      force,
      message: msg,
      code: err instanceof CloudRequestError ? err.code : '',
      ...deps.telemetryPayload(),
    })
    deps.toast(msg, { tone: 'danger' })
  } finally {
    if (!retrying) deps.finishOperation(controller)
  }
}
