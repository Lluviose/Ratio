// 云同步动作编排 hook：从 SettingsScreen 原样迁出（P3-15），行为必须与迁出前一致。
// busy 状态在这里持有并回传给设置页，供演示/备份等非云动作共用同一个互斥位。
import { useEffect, useRef, useState, type Dispatch, type MutableRefObject, type SetStateAction } from 'react'
import { isAbortError } from '../../lib/abortError'
import { buildRatioBackup, restoreRatioBackup, summarizeRatioBackupContent } from '../../lib/backup'
import { writePreOperationLocalBackup } from '../../lib/localBackups'
import {
  CloudRequestError,
  createCloudUser,
  downloadCloudBackup,
  fetchCloudAiStatus,
  fetchCloudMe,
  uploadCloudBackup,
  writeCloudSyncSettingsPatch,
  type CloudSyncSettings,
} from '../../lib/cloud'
import { cancelPendingCloudAutoSync, markCloudSyncClean, readCloudSyncDirtyToken } from '../../lib/cloudSync'
import { queueToastAfterReload, useOverlay } from '../../lib/overlay'
import { storageKernel } from '../../lib/storageKernel'
import { trackTelemetry } from '../../lib/telemetry'
import { runCloudUpload, type RunCloudUploadDeps } from './runCloudUpload'

function cloudSyncTelemetryPayload(settings: CloudSyncSettings) {
  return {
    autoSync: settings.autoSync,
    telemetryEnabled: settings.telemetryEnabled,
    useCloudAi: settings.useCloudAi,
    hasLastBackupAt: Boolean(settings.lastBackupAt),
    lastBackupAt: settings.lastBackupAt || '',
    lastSyncStatus: settings.lastSyncStatus || '',
    lastSyncAt: settings.lastSyncAt || '',
    dirty: readCloudSyncDirtyToken().length > 0,
  }
}

export function useCloudSyncActions(args: {
  cloudSyncRef: MutableRefObject<CloudSyncSettings>
  demoActive: boolean
  setCloudAiStatus: Dispatch<SetStateAction<string>>
  setCloudConfigExpanded: Dispatch<SetStateAction<boolean>>
}) {
  const { cloudSyncRef, demoActive, setCloudAiStatus, setCloudConfigExpanded } = args

  const mountedRef = useRef(true)
  const cloudAbortRef = useRef<AbortController | null>(null)
  const [busy, setBusy] = useState(false)
  const { toast, confirm } = useOverlay()

  useEffect(() => {
    // StrictMode 下 effect 会 setup→cleanup→setup：必须在 body 里复位，
    // 否则首次模拟卸载后 mountedRef 永远为 false，云操作结果全被丢弃
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      cloudAbortRef.current?.abort()
    }
  }, [])

  const isSameCloudTarget = (settings: CloudSyncSettings) => {
    const current = cloudSyncRef.current
    return (
      current.serverUrl.trim() === settings.serverUrl.trim() &&
      current.username.trim() === settings.username.trim() &&
      current.password === settings.password
    )
  }

  const notifyCloudTargetChanged = () => {
    if (!mountedRef.current) return
    toast('云同步配置已变更，请重新操作', { tone: 'neutral' })
  }

  const startCloudOperation = () => {
    cloudAbortRef.current?.abort()
    const controller = new AbortController()
    cloudAbortRef.current = controller
    if (mountedRef.current) setBusy(true)
    return controller
  }

  const finishCloudOperation = (controller: AbortController) => {
    if (cloudAbortRef.current !== controller) return
    cloudAbortRef.current = null
    if (mountedRef.current) setBusy(false)
  }

  const canUseCloudResult = (controller: AbortController) => mountedRef.current && !controller.signal.aborted

  const registerCloud = async () => {
    const requestSettings = cloudSyncRef.current
    const controller = startCloudOperation()
    try {
      const res = await createCloudUser(requestSettings, { signal: controller.signal })
      if (!canUseCloudResult(controller)) return
      if (!isSameCloudTarget(requestSettings)) {
        notifyCloudTargetChanged()
        return
      }
      writeCloudSyncSettingsPatch({ registrationInvite: '', lastConnectionAt: new Date().toISOString() })
      toast(`云账号已创建：${res.user.username}`, { tone: 'success' })
      trackTelemetry('cloud_register')
    } catch (err) {
      if (isAbortError(err)) return
      if (!mountedRef.current) return
      const msg = err instanceof Error ? err.message : 'Cloud register failed'
      toast(msg, { tone: 'danger' })
    } finally {
      finishCloudOperation(controller)
    }
  }

  const testCloud = async () => {
    const requestSettings = cloudSyncRef.current
    const controller = startCloudOperation()
    try {
      const res = await fetchCloudMe(requestSettings, { signal: controller.signal })
      if (!canUseCloudResult(controller)) return
      if (!isSameCloudTarget(requestSettings)) {
        notifyCloudTargetChanged()
        return
      }
      writeCloudSyncSettingsPatch({ lastConnectionAt: new Date().toISOString() })
      toast(`已连接：${res.user.username}`, { tone: 'success' })
      trackTelemetry('cloud_connect_test', {
        username: res.user.username,
        ...cloudSyncTelemetryPayload(cloudSyncRef.current),
      })
    } catch (err) {
      if (isAbortError(err)) return
      if (!mountedRef.current) return
      const msg = err instanceof Error ? err.message : 'Cloud connection failed'
      toast(msg, { tone: 'danger' })
    } finally {
      finishCloudOperation(controller)
    }
  }

  const uploadCloud = async (force = false, requestSettings: CloudSyncSettings = cloudSyncRef.current): Promise<void> => {
    if (demoActive) {
      toast('演示模式下不可上传云端，请先退出演示', { tone: 'danger' })
      return
    }
    const deps: RunCloudUploadDeps = {
      getSettings: () => cloudSyncRef.current,
      startOperation: startCloudOperation,
      finishOperation: finishCloudOperation,
      canUseResult: canUseCloudResult,
      isSameTarget: isSameCloudTarget,
      notifyTargetChanged: notifyCloudTargetChanged,
      isMounted: () => mountedRef.current,
      setBusy,
      uploadBackup: uploadCloudBackup,
      downloadBackup: downloadCloudBackup,
      buildBackup: buildRatioBackup,
      readDirtyToken: readCloudSyncDirtyToken,
      markClean: markCloudSyncClean,
      writeSettingsPatch: writeCloudSyncSettingsPatch,
      collapseConfig: () => setCloudConfigExpanded(false),
      toast,
      confirm,
      track: trackTelemetry,
      telemetryPayload: () => cloudSyncTelemetryPayload(cloudSyncRef.current),
    }
    return runCloudUpload(deps, force, requestSettings)
  }

  const restoreCloud = async () => {
    if (demoActive) {
      toast('演示模式下不可从云端恢复，请先退出演示', { tone: 'danger' })
      return
    }
    const ok = await confirm({
      title: '从云端恢复',
      message: '云端备份会覆盖当前设备上的 Ratio 数据。继续前建议先导出一个本地备份。',
      confirmText: '恢复云端备份',
      cancelText: '取消',
      tone: 'danger',
    })
    if (!ok || !mountedRef.current) return

    const requestSettings = cloudSyncRef.current
    const controller = startCloudOperation()
    try {
      const res = await downloadCloudBackup(requestSettings, { signal: controller.signal })
      if (!canUseCloudResult(controller)) return
      if (!isSameCloudTarget(requestSettings)) {
        notifyCloudTargetChanged()
        return
      }
      if (!res.backup) {
        toast('云端还没有备份', { tone: 'neutral' })
        return
      }
      // 云端内容预检：空/损坏的备份要在覆盖本机前拿到用户的二次确认
      const summary = summarizeRatioBackupContent(res.backup)
      if (summary.looksEmpty || summary.corruptKeys.length > 0) {
        if (mountedRef.current) setBusy(false)
        const proceed = await confirm({
          title: '云端备份可能有问题',
          message: summary.looksEmpty
            ? '云端备份看起来是空的（0 账户 / 0 快照 / 0 操作记录），继续恢复会清空本机数据！'
            : `云端备份中 ${summary.corruptKeys.join('、')} 无法解析，可能已损坏。确定继续覆盖本机数据？`,
          confirmText: '仍然恢复',
          cancelText: '取消',
          tone: 'danger',
        })
        if (!proceed || !canUseCloudResult(controller)) return
        if (mountedRef.current) setBusy(true)
      }
      // 覆盖前抢一代本机快照
      writePreOperationLocalBackup()
      const restore = restoreRatioBackup(res.backup)
      const restoredAt = new Date().toISOString()
      cancelPendingCloudAutoSync()
      markCloudSyncClean()
      writeCloudSyncSettingsPatch({
        lastRestoreAt: restoredAt,
        lastConnectionAt: restoredAt,
        lastBackupAt: res.meta?.updatedAt ?? requestSettings.lastBackupAt,
        lastSyncAt: restoredAt,
        lastSyncStatus: 'ok',
        lastSyncMessage: `已从云端恢复 ${restore.restoredKeys.length} 项数据`,
      })
      trackTelemetry('cloud_backup_restore', {
        restoredKeys: restore.restoredKeys.length,
        remoteUpdatedAt: res.meta?.updatedAt || '',
        ...cloudSyncTelemetryPayload(cloudSyncRef.current),
      })
      if (!(await storageKernel.flush())) {
        toast('数据未能写入本机存储，已取消刷新；可稍后重试或从本机快照恢复', { tone: 'danger' })
        return
      }
      queueToastAfterReload(`已从云端恢复 ${restore.restoredKeys.length} 项数据`, { tone: 'success' })
      window.location.reload()
    } catch (err) {
      if (isAbortError(err)) return
      if (!mountedRef.current) return
      const msg = err instanceof Error ? err.message : 'Cloud restore failed'
      if (isSameCloudTarget(requestSettings)) {
        writeCloudSyncSettingsPatch({
          lastSyncAt: new Date().toISOString(),
          lastSyncStatus: 'error',
          lastSyncMessage: msg,
        })
      }
      trackTelemetry('cloud_backup_restore_error', {
        message: msg,
        code: err instanceof CloudRequestError ? err.code : '',
        ...cloudSyncTelemetryPayload(cloudSyncRef.current),
      })
      toast(msg, { tone: 'danger' })
    } finally {
      finishCloudOperation(controller)
    }
  }

  const checkCloudAiStatus = async () => {
    const requestSettings = cloudSyncRef.current
    const controller = startCloudOperation()
    try {
      const res = await fetchCloudAiStatus(requestSettings, { signal: controller.signal })
      if (!canUseCloudResult(controller)) return
      if (!isSameCloudTarget(requestSettings)) {
        notifyCloudTargetChanged()
        return
      }
      if (!res.ai.configured) {
        const message = res.ai.issue ? `云端 AI 不可用：${res.ai.issue}` : '云端 AI 未配置'
        setCloudAiStatus(message)
        toast(message, { tone: 'neutral' })
        trackTelemetry('cloud_ai_status_check', {
          configured: false,
          issueCode: res.ai.issueCode || '',
        })
        return
      }
      const details = [
        '云端 AI 可用',
        res.ai.model ? `模型 ${res.ai.model}` : '',
        res.ai.reasoningEffort ? `推理 ${res.ai.reasoningEffort}` : '',
        res.ai.chatUrlSummary || '',
      ].filter(Boolean)
      const message = details.join(' · ')
      setCloudAiStatus(message)
      toast('云端 AI 可用', { tone: 'success' })
      trackTelemetry('cloud_ai_status_check', {
        configured: true,
        model: res.ai.model || '',
        reasoningEffort: res.ai.reasoningEffort || '',
      })
    } catch (err) {
      if (isAbortError(err)) return
      if (!mountedRef.current) return
      const msg = err instanceof Error ? err.message : 'Check AI status failed'
      toast(msg, { tone: 'danger' })
    } finally {
      finishCloudOperation(controller)
    }
  }

  return { busy, setBusy, registerCloud, testCloud, uploadCloud, restoreCloud, checkCloudAiStatus }
}
