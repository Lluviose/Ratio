import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const cloudMocks = vi.hoisted(() => ({
  downloadCloudBackup: vi.fn(),
  uploadCloudBackup: vi.fn(),
}))

vi.mock('./cloud', async () => {
  const actual = await vi.importActual<typeof import('./cloud')>('./cloud')
  return {
    ...actual,
    downloadCloudBackup: cloudMocks.downloadCloudBackup,
    uploadCloudBackup: cloudMocks.uploadCloudBackup,
  }
})

beforeEach(() => {
  vi.resetModules()
  vi.useFakeTimers()
  localStorage.clear()
  sessionStorage.clear()
  cloudMocks.downloadCloudBackup.mockReset()
  cloudMocks.uploadCloudBackup.mockReset()
})

afterEach(() => {
  vi.clearAllTimers()
  vi.useRealTimers()
})

describe('initCloudAutoSync', () => {
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
})
