import { describe, expect, it } from 'vitest'
import { DEFAULT_CLOUD_SYNC_SETTINGS, mergeCloudSyncSettings, type CloudSyncSettings } from './cloud'

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
