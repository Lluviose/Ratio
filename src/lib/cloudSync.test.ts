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

afterEach(() => {
  vi.clearAllTimers()
  vi.useRealTimers()
})

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

  it('marks a clean device as conflicted when remote metadata changed to different data', async () => {
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
})
