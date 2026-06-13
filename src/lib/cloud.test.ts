import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_CLOUD_SYNC_SETTINGS,
  fetchCloudMe,
  fetchCloudBackupMeta,
  getCloudEndpointIssue,
  writeCloudSyncSettingsPatch,
  mergeCloudSyncSettings,
  type CloudSyncSettings,
} from './cloud'

function withSyncState(patch: Partial<CloudSyncSettings> = {}): CloudSyncSettings {
  return {
    ...DEFAULT_CLOUD_SYNC_SETTINGS,
    serverUrl: 'https://example.com',
    username: 'shinonome',
    password: 'secret',
    autoSync: true,
    lastConnectionAt: '2026-05-08T00:00:00.000Z',
    lastBackupAt: '2026-04-29T13:03:54.267Z',
    lastRestoreAt: '2026-04-29T13:05:00.000Z',
    lastSyncAt: '2026-05-07T19:00:00.000Z',
    lastSyncStatus: 'ok',
    lastSyncMessage: '已自动上传 23 项数据',
    ...patch,
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('mergeCloudSyncSettings', () => {
  it('keeps backup metadata when only the password changes', () => {
    const current = withSyncState()

    const next = mergeCloudSyncSettings(current, { password: 'rotated-secret' })

    expect(next.password).toBe('rotated-secret')
    expect(next.lastBackupAt).toBe(current.lastBackupAt)
    expect(next.lastRestoreAt).toBe(current.lastRestoreAt)
    expect(next.lastConnectionAt).toBeUndefined()
    expect(next.lastSyncAt).toBeUndefined()
    expect(next.lastSyncStatus).toBeUndefined()
    expect(next.lastSyncMessage).toBeUndefined()
  })

  it('clears backup metadata when the cloud identity changes', () => {
    const current = withSyncState()

    const next = mergeCloudSyncSettings(current, { username: 'other-user' })

    expect(next.username).toBe('other-user')
    expect(next.lastConnectionAt).toBeUndefined()
    expect(next.lastBackupAt).toBeUndefined()
    expect(next.lastRestoreAt).toBeUndefined()
    expect(next.lastSyncAt).toBeUndefined()
    expect(next.lastSyncStatus).toBeUndefined()
    expect(next.lastSyncMessage).toBeUndefined()
  })
})

describe('writeCloudSyncSettingsPatch', () => {
  it('persists cloud credentials so sync survives reloads', () => {
    writeCloudSyncSettingsPatch(withSyncState({ registrationInvite: 'invite-code' }))

    const stored = JSON.parse(localStorage.getItem('ratio.cloudSync') ?? '{}') as Record<string, unknown>

    expect(stored.password).toBe('secret')
    expect(stored.registrationInvite).toBe('invite-code')
  })
})

describe('fetchCloudBackupMeta', () => {
  it('falls back to the full backup endpoint when the metadata endpoint is not deployed yet', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: { code: 'not_found', message: 'Not found' } }), {
          status: 404,
          statusText: 'Not Found',
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            backup: null,
            meta: {
              updatedAt: '2026-04-29T13:03:54.267Z',
              clientCreatedAt: '2026-04-29T12:49:43.758Z',
              itemCount: 1,
              device: 'iPhone',
            },
          }),
          { status: 200 },
        ),
      )
    vi.stubGlobal('fetch', fetchMock)

    const res = await fetchCloudBackupMeta(withSyncState())

    expect(res.meta?.updatedAt).toBe('2026-04-29T13:03:54.267Z')
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls[0][0]).toBe('https://example.com/api/backup/meta')
    expect(fetchMock.mock.calls[1][0]).toBe('https://example.com/api/backup')
  })
})

describe('cloud endpoint checks', () => {
  it('explains HTTPS to HTTP mixed-content cloud requests', async () => {
    vi.stubGlobal('location', new URL('https://ratio.example/app'))
    const settings = withSyncState({ serverUrl: 'http://vps.example:8787' })

    expect(getCloudEndpointIssue(settings)).toBe('Current page uses HTTPS, so the cloud server must also use HTTPS')
    await expect(fetchCloudMe(settings)).rejects.toThrow('Current page uses HTTPS, so the cloud server must also use HTTPS')
  })
})
