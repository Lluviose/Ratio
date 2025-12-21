import { beforeEach, describe, expect, it } from 'vitest'
import { buildRatioBackup, clearRatioStorage, parseRatioBackup, RATIO_BACKUP_SCHEMA_V1, restoreRatioBackup } from './backup'

beforeEach(() => {
  localStorage.clear()
})

describe('backup', () => {
  it('buildRatioBackup backs up ratio.* keys excluding webdav config', () => {
    localStorage.setItem('ratio.accounts', '[]')
    localStorage.setItem('ratio.theme', '"matisse2"')
    localStorage.setItem('ratio.webdav.password', 'secret')
    localStorage.setItem('ratio.account.token', 'token')
    localStorage.setItem('unrelated', '1')

    const backup = buildRatioBackup(localStorage)

    expect(backup.schema).toBe(RATIO_BACKUP_SCHEMA_V1)
    expect(Object.keys(backup.items)).toEqual(['ratio.accounts', 'ratio.theme'])
    expect(backup.items['ratio.theme']).toBe('"matisse2"')
    expect(typeof backup.createdAt).toBe('string')
  })

  it('clearRatioStorage removes backed-up keys only', () => {
    localStorage.setItem('ratio.accounts', '[]')
    localStorage.setItem('ratio.webdav.password', 'secret')
    localStorage.setItem('ratio.account.token', 'token')
    localStorage.setItem('unrelated', '1')

    const cleared = clearRatioStorage(localStorage)

    expect(cleared).toEqual(['ratio.accounts'])
    expect(localStorage.getItem('ratio.accounts')).toBeNull()
    expect(localStorage.getItem('ratio.webdav.password')).toBe('secret')
    expect(localStorage.getItem('ratio.account.token')).toBe('token')
    expect(localStorage.getItem('unrelated')).toBe('1')
  })

  it('parseRatioBackup validates schema and filters items', () => {
    const text = JSON.stringify({
      schema: RATIO_BACKUP_SCHEMA_V1,
      createdAt: '2025-01-01T00:00:00.000Z',
      items: {
        'ratio.accounts': '[]',
        'ratio.invalid': 123,
      },
    })

    const backup = parseRatioBackup(text)

    expect(backup.items).toEqual({ 'ratio.accounts': '[]' })
  })

  it('restoreRatioBackup clears then restores ratio.* keys', () => {
    localStorage.setItem('ratio.old', '1')
    localStorage.setItem('ratio.webdav.password', 'keep')
    localStorage.setItem('ratio.account.token', 'keep')
    localStorage.setItem('unrelated', 'keep')

    const backup = parseRatioBackup(
      JSON.stringify({
        schema: RATIO_BACKUP_SCHEMA_V1,
        createdAt: '2025-01-01T00:00:00.000Z',
        items: {
          'ratio.new': '2',
          'ratio.webdav.password': 'hacked',
          'ratio.account.token': 'hacked',
          'unrelated': 'skip',
        },
      }),
    )

    const res = restoreRatioBackup(backup, localStorage)

    expect(res.clearedKeys).toEqual(['ratio.old'])
    expect(res.restoredKeys).toEqual(['ratio.new'])
    expect(res.skippedKeys).toEqual(['ratio.account.token', 'ratio.webdav.password', 'unrelated'])
    expect(localStorage.getItem('ratio.old')).toBeNull()
    expect(localStorage.getItem('ratio.new')).toBe('2')
    expect(localStorage.getItem('ratio.webdav.password')).toBe('keep')
    expect(localStorage.getItem('ratio.account.token')).toBe('keep')
    expect(localStorage.getItem('unrelated')).toBe('keep')
  })
})
