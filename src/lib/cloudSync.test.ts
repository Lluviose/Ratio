import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const cloudMocks = vi.hoisted(() => ({
  downloadCloudBackup: vi.fn(),
  fetchCloudBackupMeta: vi.fn(),
  uploadCloudBackup: vi.fn(),
}))

vi.mock('./cloud', async () => {
  const actual = await vi.importActual<typeof import('./cloud')>('./cloud')
  return {
    ...actual,
    downloadCloudBackup: cloudMocks.downloadCloudBackup,
    fetchCloudBackupMeta: cloudMocks.fetchCloudBackupMeta,
    uploadCloudBackup: cloudMocks.uploadCloudBackup,
  }
})

beforeEach(() => {
  vi.resetModules()
  vi.useFakeTimers()
  localStorage.clear()
  sessionStorage.clear()
  cloudMocks.downloadCloudBackup.mockReset()
  cloudMocks.fetchCloudBackupMeta.mockReset()
  cloudMocks.uploadCloudBackup.mockReset()
})

afterEach(async () => {
  // 移除本用例模块副本挂在共享 window 上的监听：vi.resetModules 只重置模块
  // 注册表，不会摘掉旧副本的监听器，不清理会把一次事件放大成 N 次调度
  const { disposeCloudAutoSync } = await import('./cloudSync')
  disposeCloudAutoSync()
  vi.clearAllTimers()
  vi.useRealTimers()
  // 恢复被单测覆写的 document.visibilityState（own property 遮蔽原型 getter）
  delete (document as { visibilityState?: unknown }).visibilityState
})

function setVisibilityState(state: DocumentVisibilityState) {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state })
}

describe('initCloudAutoSync', () => {
  it('probes remote metadata on startup when local data is clean', async () => {
    const { CLOUD_SYNC_SETTINGS_KEY, DEFAULT_CLOUD_SYNC_SETTINGS, getCloudSyncSettings } = await import('./cloud')
    const { initCloudAutoSync } = await import('./cloudSync')

    const remoteMeta = {
      updatedAt: '2026-04-29T13:03:54.267Z',
      clientCreatedAt: '2026-04-29T12:49:43.758Z',
      itemCount: 1,
      device: 'iPhone',
    }
    cloudMocks.fetchCloudBackupMeta.mockResolvedValue({ meta: remoteMeta })

    localStorage.setItem(
      CLOUD_SYNC_SETTINGS_KEY,
      JSON.stringify({
        ...DEFAULT_CLOUD_SYNC_SETTINGS,
        serverUrl: 'https://example.com',
        username: 'shinonome',
        password: 'secret',
        autoSync: true,
        lastBackupAt: remoteMeta.updatedAt,
        lastSyncStatus: 'ok',
      }),
    )

    initCloudAutoSync()
    await vi.advanceTimersByTimeAsync(800)

    expect(cloudMocks.fetchCloudBackupMeta).toHaveBeenCalledOnce()
    expect(cloudMocks.downloadCloudBackup).not.toHaveBeenCalled()
    expect(cloudMocks.uploadCloudBackup).not.toHaveBeenCalled()

    const settings = getCloudSyncSettings()
    expect(settings.lastBackupAt).toBe(remoteMeta.updatedAt)
    expect(settings.lastSyncStatus).toBe('ok')
  })

  it('reconciles clean local metadata when another device uploaded identical data', async () => {
    const { buildRatioBackup } = await import('./backup')
    const { CLOUD_SYNC_SETTINGS_KEY, DEFAULT_CLOUD_SYNC_SETTINGS, getCloudSyncSettings } = await import('./cloud')
    const { CLOUD_SYNC_DIRTY_KEY, initCloudAutoSync } = await import('./cloudSync')

    localStorage.setItem('ratio.accounts', '["wallet"]')
    const localBackup = buildRatioBackup()
    const remoteMeta = {
      updatedAt: '2026-05-08T00:10:00.000Z',
      clientCreatedAt: '2026-04-29T12:49:43.758Z',
      itemCount: Object.keys(localBackup.items).length,
      device: 'Mac',
    }

    cloudMocks.fetchCloudBackupMeta.mockResolvedValue({ meta: remoteMeta })
    cloudMocks.downloadCloudBackup.mockResolvedValue({
      backup: { ...localBackup, createdAt: remoteMeta.clientCreatedAt },
      meta: remoteMeta,
    })

    localStorage.setItem(
      CLOUD_SYNC_SETTINGS_KEY,
      JSON.stringify({
        ...DEFAULT_CLOUD_SYNC_SETTINGS,
        serverUrl: 'https://example.com',
        username: 'shinonome',
        password: 'secret',
        autoSync: true,
        lastBackupAt: '2026-04-29T13:03:54.267Z',
        lastSyncStatus: 'ok',
      }),
    )

    initCloudAutoSync()
    await vi.advanceTimersByTimeAsync(800)

    expect(cloudMocks.fetchCloudBackupMeta).toHaveBeenCalledOnce()
    expect(cloudMocks.downloadCloudBackup).toHaveBeenCalledOnce()
    expect(cloudMocks.uploadCloudBackup).not.toHaveBeenCalled()

    const settings = getCloudSyncSettings()
    expect(settings.lastBackupAt).toBe(remoteMeta.updatedAt)
    expect(settings.lastSyncStatus).toBe('ok')
    expect(localStorage.getItem(CLOUD_SYNC_DIRTY_KEY)).toBeNull()
  })

  it('reconciles clean local metadata when account ops differ only by legacy ids', async () => {
    const { CLOUD_SYNC_SETTINGS_KEY, DEFAULT_CLOUD_SYNC_SETTINGS, getCloudSyncSettings } = await import('./cloud')
    const { initCloudAutoSync } = await import('./cloudSync')

    localStorage.setItem(
      'ratio.accountOps',
      JSON.stringify([
        {
          id: 'local-op-id',
          kind: 'rename',
          at: '2025-01-01T00:00:00.000Z',
          accountType: 'cash',
          accountId: 'a1',
          beforeName: 'Cash',
          afterName: 'Wallet',
        },
      ]),
    )
    const remoteMeta = {
      updatedAt: '2026-05-08T00:10:00.000Z',
      clientCreatedAt: '2026-04-29T12:49:43.758Z',
      itemCount: 1,
      device: 'Mac',
    }

    cloudMocks.fetchCloudBackupMeta.mockResolvedValue({ meta: remoteMeta })
    cloudMocks.downloadCloudBackup.mockResolvedValue({
      backup: {
        schema: 'ratio.backup.v1',
        createdAt: remoteMeta.clientCreatedAt,
        items: {
          'ratio.accountOps': JSON.stringify([
            {
              kind: 'rename',
              at: '2025-01-01T00:00:00.000Z',
              accountType: 'cash',
              accountId: 'a1',
              beforeName: 'Cash',
              afterName: 'Wallet',
              note: '  ',
            },
          ]),
        },
      },
      meta: remoteMeta,
    })

    localStorage.setItem(
      CLOUD_SYNC_SETTINGS_KEY,
      JSON.stringify({
        ...DEFAULT_CLOUD_SYNC_SETTINGS,
        serverUrl: 'https://example.com',
        username: 'shinonome',
        password: 'secret',
        autoSync: true,
        lastBackupAt: '2026-04-29T13:03:54.267Z',
        lastSyncStatus: 'ok',
      }),
    )

    initCloudAutoSync()
    await vi.advanceTimersByTimeAsync(800)

    expect(cloudMocks.fetchCloudBackupMeta).toHaveBeenCalledOnce()
    expect(cloudMocks.downloadCloudBackup).toHaveBeenCalledOnce()
    expect(cloudMocks.uploadCloudBackup).not.toHaveBeenCalled()

    const settings = getCloudSyncSettings()
    expect(settings.lastBackupAt).toBe(remoteMeta.updatedAt)
    expect(settings.lastSyncStatus).toBe('ok')
  })

  it('fast-forwards a clean device when remote metadata changed to different data', async () => {
    const { CLOUD_SYNC_SETTINGS_KEY, DEFAULT_CLOUD_SYNC_SETTINGS, getCloudSyncSettings } = await import('./cloud')
    const { CLOUD_SYNC_DIRTY_KEY, initCloudAutoSync } = await import('./cloudSync')

    localStorage.setItem('ratio.accounts', '["local"]')
    const remoteMeta = {
      updatedAt: '2026-05-08T00:10:00.000Z',
      clientCreatedAt: '2026-05-08T00:09:00.000Z',
      itemCount: 1,
      device: 'Mac',
    }

    cloudMocks.fetchCloudBackupMeta.mockResolvedValue({ meta: remoteMeta })
    cloudMocks.downloadCloudBackup.mockResolvedValue({
      backup: {
        schema: 'ratio.backup.v1',
        createdAt: remoteMeta.clientCreatedAt,
        items: {
          'ratio.accounts': '["remote"]',
        },
      },
      meta: remoteMeta,
    })

    localStorage.setItem(
      CLOUD_SYNC_SETTINGS_KEY,
      JSON.stringify({
        ...DEFAULT_CLOUD_SYNC_SETTINGS,
        serverUrl: 'https://example.com',
        username: 'shinonome',
        password: 'secret',
        autoSync: true,
        lastBackupAt: '2026-04-29T13:03:54.267Z',
        lastSyncStatus: 'ok',
      }),
    )

    initCloudAutoSync()
    await vi.advanceTimersByTimeAsync(800)

    expect(cloudMocks.fetchCloudBackupMeta).toHaveBeenCalledOnce()
    expect(cloudMocks.downloadCloudBackup).toHaveBeenCalledOnce()
    expect(cloudMocks.uploadCloudBackup).not.toHaveBeenCalled()

    // 本地 clean + 远端更新：自动应用远端数据，不再要求人工介入
    expect(localStorage.getItem('ratio.accounts')).toBe('["remote"]')
    const settings = getCloudSyncSettings()
    expect(settings.lastBackupAt).toBe(remoteMeta.updatedAt)
    expect(settings.lastSyncStatus).toBe('ok')
    expect(settings.lastSyncMessage).toContain('已自动同步云端更新')

    // fast-forward 的恢复写入不得标脏，否则刚下载的数据会被回传上传
    expect(localStorage.getItem(CLOUD_SYNC_DIRTY_KEY)).toBeNull()
    await vi.advanceTimersByTimeAsync(60000)
    expect(cloudMocks.uploadCloudBackup).not.toHaveBeenCalled()
  })

  it('keeps the conflict flow when the changed remote backup looks empty', async () => {
    const { CLOUD_SYNC_SETTINGS_KEY, DEFAULT_CLOUD_SYNC_SETTINGS, getCloudSyncSettings } = await import('./cloud')
    const { initCloudAutoSync } = await import('./cloudSync')

    localStorage.setItem('ratio.accounts', '["local"]')
    const remoteMeta = {
      updatedAt: '2026-05-08T00:10:00.000Z',
      clientCreatedAt: '2026-05-08T00:09:00.000Z',
      itemCount: 1,
      device: 'Mac',
    }

    cloudMocks.fetchCloudBackupMeta.mockResolvedValue({ meta: remoteMeta })
    cloudMocks.downloadCloudBackup.mockResolvedValue({
      backup: {
        schema: 'ratio.backup.v1',
        createdAt: remoteMeta.clientCreatedAt,
        // 空账本备份：不允许被 fast-forward 静默覆盖本机数据
        items: {
          'ratio.accounts': '[]',
        },
      },
      meta: remoteMeta,
    })

    localStorage.setItem(
      CLOUD_SYNC_SETTINGS_KEY,
      JSON.stringify({
        ...DEFAULT_CLOUD_SYNC_SETTINGS,
        serverUrl: 'https://example.com',
        username: 'shinonome',
        password: 'secret',
        autoSync: true,
        lastBackupAt: '2026-04-29T13:03:54.267Z',
        lastSyncStatus: 'ok',
      }),
    )

    initCloudAutoSync()
    await vi.advanceTimersByTimeAsync(800)

    expect(cloudMocks.uploadCloudBackup).not.toHaveBeenCalled()
    expect(localStorage.getItem('ratio.accounts')).toBe('["local"]')
    const settings = getCloudSyncSettings()
    expect(settings.lastBackupAt).toBe('2026-04-29T13:03:54.267Z')
    expect(settings.lastSyncStatus).toBe('conflict')
    expect(settings.lastSyncMessage).toContain(remoteMeta.updatedAt)
  })

  it('marks a clean device as conflicted when the known remote backup disappeared', async () => {
    const { CLOUD_SYNC_SETTINGS_KEY, DEFAULT_CLOUD_SYNC_SETTINGS, getCloudSyncSettings } = await import('./cloud')
    const { initCloudAutoSync } = await import('./cloudSync')

    cloudMocks.fetchCloudBackupMeta.mockResolvedValue({ meta: null })

    localStorage.setItem(
      CLOUD_SYNC_SETTINGS_KEY,
      JSON.stringify({
        ...DEFAULT_CLOUD_SYNC_SETTINGS,
        serverUrl: 'https://example.com',
        username: 'shinonome',
        password: 'secret',
        autoSync: true,
        lastBackupAt: '2026-04-29T13:03:54.267Z',
        lastSyncStatus: 'ok',
      }),
    )

    initCloudAutoSync()
    await vi.advanceTimersByTimeAsync(800)

    expect(cloudMocks.fetchCloudBackupMeta).toHaveBeenCalledOnce()
    expect(cloudMocks.downloadCloudBackup).not.toHaveBeenCalled()
    expect(cloudMocks.uploadCloudBackup).not.toHaveBeenCalled()

    const settings = getCloudSyncSettings()
    expect(settings.lastBackupAt).toBe('2026-04-29T13:03:54.267Z')
    expect(settings.lastSyncStatus).toBe('conflict')
    expect(settings.lastSyncMessage).toContain('云端备份不存在')
  })

  it('recovers an error status without uploading when remote metadata is current', async () => {
    const { CLOUD_SYNC_SETTINGS_KEY, DEFAULT_CLOUD_SYNC_SETTINGS, getCloudSyncSettings } = await import('./cloud')
    const { initCloudAutoSync } = await import('./cloudSync')

    const remoteMeta = {
      updatedAt: '2026-04-29T13:03:54.267Z',
      clientCreatedAt: '2026-04-29T12:49:43.758Z',
      itemCount: 1,
      device: 'iPhone',
    }
    cloudMocks.fetchCloudBackupMeta.mockResolvedValue({ meta: remoteMeta })

    localStorage.setItem(
      CLOUD_SYNC_SETTINGS_KEY,
      JSON.stringify({
        ...DEFAULT_CLOUD_SYNC_SETTINGS,
        serverUrl: 'https://example.com',
        username: 'shinonome',
        password: 'secret',
        autoSync: true,
        lastBackupAt: remoteMeta.updatedAt,
        lastSyncStatus: 'error',
      }),
    )

    initCloudAutoSync()
    await vi.advanceTimersByTimeAsync(800)

    expect(cloudMocks.fetchCloudBackupMeta).toHaveBeenCalledOnce()
    expect(cloudMocks.downloadCloudBackup).not.toHaveBeenCalled()
    expect(cloudMocks.uploadCloudBackup).not.toHaveBeenCalled()

    const settings = getCloudSyncSettings()
    expect(settings.lastBackupAt).toBe(remoteMeta.updatedAt)
    expect(settings.lastSyncStatus).toBe('ok')
    expect(settings.lastSyncMessage).toContain('云端备份状态正常')
  })

  it('recovers sync metadata from a matching remote backup when lastBackupAt is missing', async () => {
    const { buildRatioBackup } = await import('./backup')
    const { DEFAULT_CLOUD_SYNC_SETTINGS, CLOUD_SYNC_SETTINGS_KEY, getCloudSyncSettings } = await import('./cloud')
    const { CLOUD_SYNC_DIRTY_KEY, initCloudAutoSync } = await import('./cloudSync')

    localStorage.setItem('ratio.accounts', '["wallet"]')
    const localBackup = buildRatioBackup()
    const remoteMeta = {
      updatedAt: '2026-04-29T13:03:54.267Z',
      clientCreatedAt: '2026-04-29T12:49:43.758Z',
      itemCount: Object.keys(localBackup.items).length,
      device: 'iPhone',
    }

    cloudMocks.downloadCloudBackup.mockResolvedValue({
      backup: { ...localBackup, createdAt: remoteMeta.clientCreatedAt },
      meta: remoteMeta,
    })

    localStorage.setItem(
      CLOUD_SYNC_SETTINGS_KEY,
      JSON.stringify({
        ...DEFAULT_CLOUD_SYNC_SETTINGS,
        serverUrl: 'https://example.com',
        username: 'shinonome',
        password: 'secret',
        autoSync: true,
      }),
    )

    initCloudAutoSync()
    await vi.advanceTimersByTimeAsync(800)

    expect(cloudMocks.downloadCloudBackup).toHaveBeenCalledOnce()
    expect(cloudMocks.uploadCloudBackup).not.toHaveBeenCalled()

    const settings = getCloudSyncSettings()
    expect(settings.lastBackupAt).toBe(remoteMeta.updatedAt)
    expect(settings.lastSyncStatus).toBe('ok')
    expect(localStorage.getItem(CLOUD_SYNC_DIRTY_KEY)).toBeNull()
  })

  it('reconciles a backup_conflict when the remote backup data is unchanged', async () => {
    const { buildRatioBackup } = await import('./backup')
    const { CLOUD_SYNC_SETTINGS_KEY, CloudRequestError, DEFAULT_CLOUD_SYNC_SETTINGS, getCloudSyncSettings } =
      await import('./cloud')
    const { CLOUD_SYNC_DIRTY_KEY, initCloudAutoSync } = await import('./cloudSync')

    localStorage.setItem('ratio.accounts', '["wallet"]')
    const localBackup = buildRatioBackup()
    const remoteMeta = {
      updatedAt: '2026-05-08T00:10:00.000Z',
      clientCreatedAt: '2026-04-29T12:49:43.758Z',
      itemCount: Object.keys(localBackup.items).length,
      device: 'iPhone',
    }

    cloudMocks.uploadCloudBackup.mockRejectedValue(
      new CloudRequestError({
        status: 409,
        code: 'backup_conflict',
        message: 'Cloud backup has changed; confirm before overwriting',
        details: {
          meta: remoteMeta,
          expectedUpdatedAt: '2026-04-29T13:03:54.267Z',
          remoteUpdatedAt: remoteMeta.updatedAt,
        },
      }),
    )
    cloudMocks.downloadCloudBackup.mockResolvedValue({
      backup: { ...localBackup, createdAt: remoteMeta.clientCreatedAt },
      meta: remoteMeta,
    })

    localStorage.setItem(
      CLOUD_SYNC_SETTINGS_KEY,
      JSON.stringify({
        ...DEFAULT_CLOUD_SYNC_SETTINGS,
        serverUrl: 'https://example.com',
        username: 'shinonome',
        password: 'secret',
        autoSync: true,
        lastBackupAt: '2026-04-29T13:03:54.267Z',
      }),
    )

    initCloudAutoSync()
    window.dispatchEvent(
      new CustomEvent('ratio:storage-write', {
        detail: { key: 'ratio.accounts', raw: '["wallet"]' },
      }),
    )
    await vi.advanceTimersByTimeAsync(2500)

    expect(cloudMocks.uploadCloudBackup).toHaveBeenCalledOnce()
    expect(cloudMocks.downloadCloudBackup).toHaveBeenCalledOnce()

    const settings = getCloudSyncSettings()
    expect(settings.lastBackupAt).toBe(remoteMeta.updatedAt)
    expect(settings.lastSyncStatus).toBe('ok')
    expect(localStorage.getItem(CLOUD_SYNC_DIRTY_KEY)).toBeNull()
  })

  it('reconciles a persisted conflict with matching remote data on startup', async () => {
    const { buildRatioBackup } = await import('./backup')
    const { CLOUD_SYNC_SETTINGS_KEY, DEFAULT_CLOUD_SYNC_SETTINGS, getCloudSyncSettings } = await import('./cloud')
    const { CLOUD_SYNC_DIRTY_KEY, initCloudAutoSync } = await import('./cloudSync')

    localStorage.setItem('ratio.accounts', '["wallet"]')
    localStorage.setItem(CLOUD_SYNC_DIRTY_KEY, 'dirty-token')
    const localBackup = buildRatioBackup()
    const remoteMeta = {
      updatedAt: '2026-04-29T13:03:54.267Z',
      clientCreatedAt: '2026-04-29T12:49:43.758Z',
      itemCount: Object.keys(localBackup.items).length,
      device: 'iPhone',
    }

    cloudMocks.downloadCloudBackup.mockResolvedValue({
      backup: { ...localBackup, createdAt: remoteMeta.clientCreatedAt },
      meta: remoteMeta,
    })

    localStorage.setItem(
      CLOUD_SYNC_SETTINGS_KEY,
      JSON.stringify({
        ...DEFAULT_CLOUD_SYNC_SETTINGS,
        serverUrl: 'https://example.com',
        username: 'shinonome',
        password: 'secret',
        autoSync: true,
        lastBackupAt: '2026-04-28T02:42:46.844Z',
        lastSyncStatus: 'conflict',
        lastSyncAt: '2026-05-07T19:28:50.197Z',
      }),
    )

    initCloudAutoSync()
    await vi.advanceTimersByTimeAsync(800)

    expect(cloudMocks.downloadCloudBackup).toHaveBeenCalledOnce()
    expect(cloudMocks.uploadCloudBackup).not.toHaveBeenCalled()

    const settings = getCloudSyncSettings()
    expect(settings.lastBackupAt).toBe(remoteMeta.updatedAt)
    expect(settings.lastSyncStatus).toBe('ok')
    expect(localStorage.getItem(CLOUD_SYNC_DIRTY_KEY)).toBeNull()
  })

  it('keeps a conflict when the remote backup differs from local data', async () => {
    const { CLOUD_SYNC_SETTINGS_KEY, DEFAULT_CLOUD_SYNC_SETTINGS, getCloudSyncSettings } = await import('./cloud')
    const { initCloudAutoSync } = await import('./cloudSync')

    localStorage.setItem('ratio.accounts', '["local"]')

    cloudMocks.downloadCloudBackup.mockResolvedValue({
      backup: {
        schema: 'ratio.backup.v1',
        createdAt: '2026-04-29T12:49:43.758Z',
        items: {
          'ratio.accounts': '["remote"]',
        },
      },
      meta: {
        updatedAt: '2026-04-29T13:03:54.267Z',
        clientCreatedAt: '2026-04-29T12:49:43.758Z',
        itemCount: 1,
        device: 'iPhone',
      },
    })

    localStorage.setItem(
      CLOUD_SYNC_SETTINGS_KEY,
      JSON.stringify({
        ...DEFAULT_CLOUD_SYNC_SETTINGS,
        serverUrl: 'https://example.com',
        username: 'shinonome',
        password: 'secret',
        autoSync: true,
      }),
    )

    initCloudAutoSync()
    await vi.advanceTimersByTimeAsync(800)

    expect(cloudMocks.downloadCloudBackup).toHaveBeenCalledOnce()
    expect(cloudMocks.uploadCloudBackup).not.toHaveBeenCalled()

    const settings = getCloudSyncSettings()
    expect(settings.lastBackupAt).toBeUndefined()
    expect(settings.lastSyncStatus).toBe('conflict')
    expect(settings.lastSyncMessage).toContain('2026-04-29T13:03:54.267Z')
  })

  it('rechecks remote data for a persisted conflict even when metadata is current', async () => {
    const { CLOUD_SYNC_SETTINGS_KEY, DEFAULT_CLOUD_SYNC_SETTINGS, getCloudSyncSettings } = await import('./cloud')
    const { initCloudAutoSync } = await import('./cloudSync')

    const remoteMeta = {
      updatedAt: '2026-04-29T13:03:54.267Z',
      clientCreatedAt: '2026-04-29T12:49:43.758Z',
      itemCount: 1,
      device: 'iPhone',
    }
    localStorage.setItem('ratio.accounts', '["imported-local"]')
    cloudMocks.downloadCloudBackup.mockResolvedValue({
      backup: {
        schema: 'ratio.backup.v1',
        createdAt: remoteMeta.clientCreatedAt,
        items: {
          'ratio.accounts': '["remote"]',
        },
      },
      meta: remoteMeta,
    })

    localStorage.setItem(
      CLOUD_SYNC_SETTINGS_KEY,
      JSON.stringify({
        ...DEFAULT_CLOUD_SYNC_SETTINGS,
        serverUrl: 'https://example.com',
        username: 'shinonome',
        password: 'secret',
        autoSync: true,
        lastBackupAt: remoteMeta.updatedAt,
        lastSyncStatus: 'conflict',
      }),
    )

    initCloudAutoSync()
    await vi.advanceTimersByTimeAsync(800)

    expect(cloudMocks.fetchCloudBackupMeta).not.toHaveBeenCalled()
    expect(cloudMocks.downloadCloudBackup).toHaveBeenCalledOnce()
    expect(cloudMocks.uploadCloudBackup).not.toHaveBeenCalled()

    const settings = getCloudSyncSettings()
    expect(settings.lastBackupAt).toBe(remoteMeta.updatedAt)
    expect(settings.lastSyncStatus).toBe('conflict')
  })

  it('does not write an old auto-sync result into a changed cloud target', async () => {
    const { buildRatioBackup } = await import('./backup')
    const { CLOUD_SYNC_SETTINGS_KEY, DEFAULT_CLOUD_SYNC_SETTINGS, getCloudSyncSettings } = await import('./cloud')
    const { CLOUD_SYNC_DIRTY_KEY, initCloudAutoSync } = await import('./cloudSync')

    localStorage.setItem('ratio.accounts', '["wallet"]')
    const localBackup = buildRatioBackup()
    const remoteMeta = {
      updatedAt: '2026-05-08T00:10:00.000Z',
      clientCreatedAt: localBackup.createdAt,
      itemCount: Object.keys(localBackup.items).length,
      device: 'iPhone',
    }

    cloudMocks.uploadCloudBackup.mockImplementation(async () => {
      localStorage.setItem(
        CLOUD_SYNC_SETTINGS_KEY,
        JSON.stringify({
          ...DEFAULT_CLOUD_SYNC_SETTINGS,
          serverUrl: 'https://example.com',
          username: 'other-user',
          password: 'secret',
          autoSync: true,
        }),
      )
      return remoteMeta
    })

    localStorage.setItem(
      CLOUD_SYNC_SETTINGS_KEY,
      JSON.stringify({
        ...DEFAULT_CLOUD_SYNC_SETTINGS,
        serverUrl: 'https://example.com',
        username: 'shinonome',
        password: 'secret',
        autoSync: true,
        lastBackupAt: '2026-04-29T13:03:54.267Z',
      }),
    )

    initCloudAutoSync()
    window.dispatchEvent(
      new CustomEvent('ratio:storage-write', {
        detail: { key: 'ratio.accounts', raw: '["wallet"]' },
      }),
    )
    await vi.advanceTimersByTimeAsync(2500)

    expect(cloudMocks.uploadCloudBackup).toHaveBeenCalledOnce()

    const settings = getCloudSyncSettings()
    expect(settings.username).toBe('other-user')
    expect(settings.lastBackupAt).toBeUndefined()
    expect(localStorage.getItem(CLOUD_SYNC_DIRTY_KEY)).not.toBeNull()
  })

  it('uploads dirty data immediately on pagehide, bypassing the debounce', async () => {
    const { CLOUD_SYNC_SETTINGS_KEY, DEFAULT_CLOUD_SYNC_SETTINGS, getCloudSyncSettings } = await import('./cloud')
    const { CLOUD_SYNC_DIRTY_KEY, initCloudAutoSync } = await import('./cloudSync')

    localStorage.setItem('ratio.accounts', '["wallet"]')
    const remoteMeta = {
      updatedAt: '2026-05-08T00:10:00.000Z',
      clientCreatedAt: '2026-05-08T00:09:00.000Z',
      itemCount: 1,
      device: 'iPhone',
    }
    cloudMocks.uploadCloudBackup.mockResolvedValue(remoteMeta)

    localStorage.setItem(
      CLOUD_SYNC_SETTINGS_KEY,
      JSON.stringify({
        ...DEFAULT_CLOUD_SYNC_SETTINGS,
        serverUrl: 'https://example.com',
        username: 'shinonome',
        password: 'secret',
        autoSync: true,
        lastBackupAt: '2026-04-29T13:03:54.267Z',
        lastSyncStatus: 'ok',
      }),
    )

    initCloudAutoSync()
    // 写入落脏 → 2.5s 防抖定时器挂起；不推进任何时间直接离场
    window.dispatchEvent(
      new CustomEvent('ratio:storage-write', {
        detail: { key: 'ratio.accounts', raw: '["wallet"]' },
      }),
    )
    window.dispatchEvent(new Event('pagehide'))
    await vi.advanceTimersByTimeAsync(0)

    expect(cloudMocks.uploadCloudBackup).toHaveBeenCalledOnce()
    const settings = getCloudSyncSettings()
    expect(settings.lastBackupAt).toBe(remoteMeta.updatedAt)
    expect(settings.lastSyncStatus).toBe('ok')
    expect(localStorage.getItem(CLOUD_SYNC_DIRTY_KEY)).toBeNull()

    // 挂起的防抖定时器已被取消：推进时间不应再触发任何请求（clean 态会走 probe）
    await vi.advanceTimersByTimeAsync(2500)
    expect(cloudMocks.uploadCloudBackup).toHaveBeenCalledOnce()
    expect(cloudMocks.fetchCloudBackupMeta).not.toHaveBeenCalled()
  })

  it('bypasses the 30s throttle when the page hides with dirty data', async () => {
    const { CLOUD_SYNC_SETTINGS_KEY, DEFAULT_CLOUD_SYNC_SETTINGS, getCloudSyncSettings } = await import('./cloud')
    const { CLOUD_SYNC_DIRTY_KEY, initCloudAutoSync } = await import('./cloudSync')

    localStorage.setItem('ratio.accounts', '["wallet"]')
    const meta1 = {
      updatedAt: '2026-05-08T00:10:00.000Z',
      clientCreatedAt: '2026-05-08T00:09:00.000Z',
      itemCount: 1,
      device: 'iPhone',
    }
    const meta2 = { ...meta1, updatedAt: '2026-05-08T00:10:30.000Z' }
    cloudMocks.uploadCloudBackup.mockResolvedValueOnce(meta1).mockResolvedValueOnce(meta2)

    localStorage.setItem(
      CLOUD_SYNC_SETTINGS_KEY,
      JSON.stringify({
        ...DEFAULT_CLOUD_SYNC_SETTINGS,
        serverUrl: 'https://example.com',
        username: 'shinonome',
        password: 'secret',
        autoSync: true,
        lastBackupAt: '2026-04-29T13:03:54.267Z',
        lastSyncStatus: 'ok',
      }),
    )

    initCloudAutoSync()
    // 第一笔走常规防抖路径，建立 lastAutoSyncAt（进入 30s 节流窗口）
    window.dispatchEvent(
      new CustomEvent('ratio:storage-write', {
        detail: { key: 'ratio.accounts', raw: '["wallet"]' },
      }),
    )
    await vi.advanceTimersByTimeAsync(2500)
    expect(cloudMocks.uploadCloudBackup).toHaveBeenCalledTimes(1)

    // 节流窗口内再写一笔并立刻隐藏页面：应当立即上传而不是等 30s
    localStorage.setItem('ratio.accounts', '["wallet","cash"]')
    window.dispatchEvent(
      new CustomEvent('ratio:storage-write', {
        detail: { key: 'ratio.accounts', raw: '["wallet","cash"]' },
      }),
    )
    setVisibilityState('hidden')
    window.dispatchEvent(new Event('visibilitychange'))
    await vi.advanceTimersByTimeAsync(0)

    expect(cloudMocks.uploadCloudBackup).toHaveBeenCalledTimes(2)
    // 第二次上传携带第一次成功后的乐观锁期望值
    expect(cloudMocks.uploadCloudBackup.mock.calls[1][2]).toMatchObject({
      expectedUpdatedAt: meta1.updatedAt,
    })
    const settings = getCloudSyncSettings()
    expect(settings.lastBackupAt).toBe(meta2.updatedAt)
    expect(localStorage.getItem(CLOUD_SYNC_DIRTY_KEY)).toBeNull()
  })

  it('does not fire any request when the page hides without dirty data', async () => {
    const { CLOUD_SYNC_SETTINGS_KEY, DEFAULT_CLOUD_SYNC_SETTINGS } = await import('./cloud')
    const { initCloudAutoSync } = await import('./cloudSync')

    cloudMocks.fetchCloudBackupMeta.mockResolvedValue({ meta: null })
    localStorage.setItem(
      CLOUD_SYNC_SETTINGS_KEY,
      JSON.stringify({
        ...DEFAULT_CLOUD_SYNC_SETTINGS,
        serverUrl: 'https://example.com',
        username: 'shinonome',
        password: 'secret',
        autoSync: true,
        lastBackupAt: '2026-04-29T13:03:54.267Z',
        lastSyncStatus: 'ok',
      }),
    )

    initCloudAutoSync()
    setVisibilityState('hidden')
    window.dispatchEvent(new Event('visibilitychange'))
    window.dispatchEvent(new Event('pagehide'))
    await vi.advanceTimersByTimeAsync(0)

    expect(cloudMocks.fetchCloudBackupMeta).not.toHaveBeenCalled()
    expect(cloudMocks.downloadCloudBackup).not.toHaveBeenCalled()
    expect(cloudMocks.uploadCloudBackup).not.toHaveBeenCalled()
  })
})
