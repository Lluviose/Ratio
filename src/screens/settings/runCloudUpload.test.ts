import { describe, expect, it, vi } from 'vitest'
import { CloudRequestError, DEFAULT_CLOUD_SYNC_SETTINGS, type CloudBackupMeta, type CloudSyncSettings } from '../../lib/cloud'
import type { RatioBackupFile } from '../../lib/backup'
import { runCloudUpload, type RunCloudUploadDeps } from './runCloudUpload'

const localBackup: RatioBackupFile = {
  schema: 'ratio.backup.v1',
  createdAt: '2026-05-01T00:00:00.000Z',
  items: {
    'ratio.accounts': '["local"]',
  },
}

const settings: CloudSyncSettings = {
  ...DEFAULT_CLOUD_SYNC_SETTINGS,
  serverUrl: 'https://example.com',
  username: 'shinonome',
  password: 'secret',
  lastBackupAt: '2026-04-29T13:03:54.267Z',
}

const remoteMeta: CloudBackupMeta = {
  updatedAt: '2026-05-08T00:10:00.000Z',
  clientCreatedAt: '2026-05-08T00:09:00.000Z',
  itemCount: 1,
  device: 'Mac',
}

function conflictError(meta: CloudBackupMeta = remoteMeta) {
  return new CloudRequestError({
    status: 409,
    code: 'backup_conflict',
    message: 'Cloud backup has changed; confirm before overwriting',
    details: { meta, expectedUpdatedAt: settings.lastBackupAt, remoteUpdatedAt: meta.updatedAt },
  })
}

type Harness = {
  deps: RunCloudUploadDeps
  patches: Partial<CloudSyncSettings>[]
  toasts: { message: string; tone?: string }[]
  events: { name: string; payload?: Record<string, unknown> }[]
  cleanedTokens: (string | undefined)[]
  busyStates: boolean[]
  controllers: AbortController[]
  finished: AbortController[]
  uploadBackup: ReturnType<typeof vi.fn>
  downloadBackup: ReturnType<typeof vi.fn>
  confirm: ReturnType<typeof vi.fn>
  collapseConfig: ReturnType<typeof vi.fn>
}

function createHarness(overrides: Partial<RunCloudUploadDeps> = {}): Harness {
  const patches: Partial<CloudSyncSettings>[] = []
  const toasts: { message: string; tone?: string }[] = []
  const events: { name: string; payload?: Record<string, unknown> }[] = []
  const cleanedTokens: (string | undefined)[] = []
  const busyStates: boolean[] = []
  const controllers: AbortController[] = []
  const finished: AbortController[] = []
  const uploadBackup = vi.fn()
  const downloadBackup = vi.fn()
  const confirm = vi.fn().mockResolvedValue(true)
  const collapseConfig = vi.fn()

  const deps: RunCloudUploadDeps = {
    getSettings: () => settings,
    startOperation: () => {
      const controller = new AbortController()
      controllers.push(controller)
      busyStates.push(true)
      return controller
    },
    finishOperation: (controller) => {
      finished.push(controller)
      busyStates.push(false)
    },
    canUseResult: (controller) => !controller.signal.aborted,
    isSameTarget: () => true,
    notifyTargetChanged: vi.fn(),
    isMounted: () => true,
    setBusy: (busy) => busyStates.push(busy),
    uploadBackup,
    downloadBackup,
    buildBackup: () => localBackup,
    readDirtyToken: () => 'dirty-token-1',
    markClean: (token) => cleanedTokens.push(token),
    writeSettingsPatch: (patch) => patches.push(patch),
    collapseConfig,
    toast: (message, options) => toasts.push({ message, tone: options?.tone }),
    confirm,
    track: (name, payload) => events.push({ name, payload }),
    telemetryPayload: () => ({ autoSync: false }),
    ...overrides,
  }

  return { deps, patches, toasts, events, cleanedTokens, busyStates, controllers, finished, uploadBackup, downloadBackup, confirm, collapseConfig }
}

describe('runCloudUpload', () => {
  it('uploads once and writes back ok status with the remote updatedAt', async () => {
    const h = createHarness()
    const meta: CloudBackupMeta = { ...remoteMeta, itemCount: 3 }
    h.uploadBackup.mockResolvedValue(meta)

    await runCloudUpload(h.deps)

    expect(h.uploadBackup).toHaveBeenCalledOnce()
    const [calledSettings, calledBackup, options] = h.uploadBackup.mock.calls[0]
    expect(calledSettings).toBe(settings)
    expect(calledBackup).toBe(localBackup)
    // 首次上传以本地记录的 lastBackupAt 作为乐观锁，且不强制覆盖
    expect(options.expectedUpdatedAt).toBe(settings.lastBackupAt)
    expect(options.force).toBe(false)

    expect(h.cleanedTokens).toEqual(['dirty-token-1'])
    expect(h.patches).toHaveLength(1)
    expect(h.patches[0]).toMatchObject({
      lastBackupAt: meta.updatedAt,
      lastSyncStatus: 'ok',
      lastSyncMessage: '已上传 3 项数据',
    })
    expect(h.collapseConfig).toHaveBeenCalledOnce()
    expect(h.toasts).toEqual([{ message: '已上传 3 项数据', tone: 'success' }])
    expect(h.events.map((e) => e.name)).toEqual(['cloud_backup_upload'])
    expect(h.confirm).not.toHaveBeenCalled()
    expect(h.finished).toEqual([h.controllers[0]])
  })

  it('retries with force after a confirmed 409 conflict and succeeds', async () => {
    const h = createHarness()
    const forcedMeta: CloudBackupMeta = { ...remoteMeta, updatedAt: '2026-05-08T00:20:00.000Z', itemCount: 2 }
    h.uploadBackup.mockRejectedValueOnce(conflictError()).mockResolvedValueOnce(forcedMeta)
    // 远端数据与本地不同：不能走 reconcile 分支，必须弹确认
    h.downloadBackup.mockResolvedValue({
      backup: { schema: 'ratio.backup.v1', createdAt: remoteMeta.clientCreatedAt, items: { 'ratio.accounts': '["remote"]' } },
      meta: remoteMeta,
    })

    await runCloudUpload(h.deps)

    expect(h.uploadBackup).toHaveBeenCalledTimes(2)
    // 重试仍以本地 lastBackupAt 为 expectedUpdatedAt，但 force 覆盖远端
    expect(h.uploadBackup.mock.calls[1][2]).toMatchObject({ expectedUpdatedAt: settings.lastBackupAt, force: true })

    // 冲突先写回 conflict 状态（含远端 updatedAt），成功后推进 lastBackupAt 到强制上传结果
    expect(h.patches).toHaveLength(2)
    expect(h.patches[0]).toMatchObject({
      lastSyncStatus: 'conflict',
      lastSyncMessage: `云端备份已更新：${remoteMeta.updatedAt}`,
    })
    expect(h.patches[1]).toMatchObject({ lastBackupAt: forcedMeta.updatedAt, lastSyncStatus: 'ok' })

    expect(h.confirm).toHaveBeenCalledOnce()
    expect(h.confirm.mock.calls[0][0]).toMatchObject({
      title: '云端备份已更新',
      message: `云端已有更新的备份（${remoteMeta.updatedAt}）。继续上传会覆盖云端数据。`,
      confirmText: '覆盖云端备份',
      tone: 'danger',
    })
    // 弹确认前先放开 busy（true → false），重试再翻起（true），成功后收尾（false）
    expect(h.busyStates).toEqual([true, false, true, false])
    expect(h.events.map((e) => e.name)).toEqual(['cloud_backup_upload_conflict', 'cloud_backup_upload'])
    // 第一次操作因重试跳过收尾，只有重试的 controller 被 finish
    expect(h.controllers).toHaveLength(2)
    expect(h.finished).toEqual([h.controllers[1]])
    expect(h.cleanedTokens).toEqual(['dirty-token-1'])
  })

  it('reports an error when the forced retry hits another conflict (retry budget exhausted)', async () => {
    const h = createHarness()
    h.uploadBackup.mockRejectedValue(conflictError())
    h.downloadBackup.mockResolvedValue({
      backup: { schema: 'ratio.backup.v1', createdAt: remoteMeta.clientCreatedAt, items: { 'ratio.accounts': '["remote"]' } },
      meta: remoteMeta,
    })

    await runCloudUpload(h.deps)

    // 只允许一次 force 重试：第二次仍冲突时不再询问，直接走错误分支
    expect(h.uploadBackup).toHaveBeenCalledTimes(2)
    expect(h.confirm).toHaveBeenCalledOnce()
    expect(h.patches).toHaveLength(2)
    expect(h.patches[0]).toMatchObject({ lastSyncStatus: 'conflict' })
    expect(h.patches[1]).toMatchObject({
      lastSyncStatus: 'error',
      lastSyncMessage: 'Cloud backup has changed; confirm before overwriting',
    })
    expect(h.toasts).toEqual([
      { message: 'Cloud backup has changed; confirm before overwriting', tone: 'danger' },
    ])
    expect(h.events.map((e) => e.name)).toEqual(['cloud_backup_upload_conflict', 'cloud_backup_upload_error'])
    expect(h.events[1]?.payload).toMatchObject({ force: true, code: 'backup_conflict' })
    expect(h.cleanedTokens).toEqual([])
  })

  it('reconciles a 409 conflict without confirm when the remote backup data matches local', async () => {
    const h = createHarness()
    h.uploadBackup.mockRejectedValue(conflictError())
    // 远端与本地数据一致（createdAt 不参与比较）：视为已同步，直接确认远端 meta
    h.downloadBackup.mockResolvedValue({
      backup: { ...localBackup, createdAt: remoteMeta.clientCreatedAt },
      meta: remoteMeta,
    })

    await runCloudUpload(h.deps)

    expect(h.uploadBackup).toHaveBeenCalledOnce()
    expect(h.confirm).not.toHaveBeenCalled()
    expect(h.cleanedTokens).toEqual(['dirty-token-1'])
    expect(h.patches).toHaveLength(1)
    expect(h.patches[0]).toMatchObject({
      lastBackupAt: remoteMeta.updatedAt,
      lastSyncStatus: 'ok',
      lastSyncMessage: `已确认云端现有备份 ${remoteMeta.itemCount} 项数据`,
    })
    expect(h.collapseConfig).toHaveBeenCalledOnce()
    expect(h.toasts).toEqual([{ message: `已确认云端现有备份 ${remoteMeta.itemCount} 项数据`, tone: 'success' }])
    expect(h.events.map((e) => e.name)).toEqual(['cloud_backup_upload_reconciled'])
    expect(h.finished).toEqual([h.controllers[0]])
  })

  it('keeps the conflict status and skips upload when the user cancels overwriting', async () => {
    const h = createHarness()
    h.uploadBackup.mockRejectedValue(conflictError())
    h.downloadBackup.mockResolvedValue({
      backup: { schema: 'ratio.backup.v1', createdAt: remoteMeta.clientCreatedAt, items: { 'ratio.accounts': '["remote"]' } },
      meta: remoteMeta,
    })
    h.confirm.mockResolvedValue(false)

    await runCloudUpload(h.deps)

    expect(h.uploadBackup).toHaveBeenCalledOnce()
    expect(h.patches).toHaveLength(1)
    expect(h.patches[0]).toMatchObject({
      lastSyncStatus: 'conflict',
      lastSyncMessage: `云端备份已更新：${remoteMeta.updatedAt}`,
    })
    expect(h.toasts).toEqual([])
    expect(h.cleanedTokens).toEqual([])
    expect(h.events.map((e) => e.name)).toEqual(['cloud_backup_upload_conflict'])
    expect(h.finished).toEqual([h.controllers[0]])
  })

  it('writes back an error status and toast for a non-conflict failure', async () => {
    const h = createHarness()
    h.uploadBackup.mockRejectedValue(new Error('Network unreachable'))

    await runCloudUpload(h.deps)

    expect(h.downloadBackup).not.toHaveBeenCalled()
    expect(h.confirm).not.toHaveBeenCalled()
    expect(h.patches).toHaveLength(1)
    expect(h.patches[0]).toMatchObject({ lastSyncStatus: 'error', lastSyncMessage: 'Network unreachable' })
    expect(h.toasts).toEqual([{ message: 'Network unreachable', tone: 'danger' }])
    expect(h.events.map((e) => e.name)).toEqual(['cloud_backup_upload_error'])
    expect(h.finished).toEqual([h.controllers[0]])
  })
})
