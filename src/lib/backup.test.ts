import { beforeEach, describe, expect, it } from 'vitest'
import { buildRatioBackup, clearRatioStorage, parseRatioBackup, RATIO_BACKUP_SCHEMA_V1, restoreRatioBackup } from './backup'

beforeEach(() => {
  localStorage.clear()
})

describe('backup', () => {
  it('buildRatioBackup backs up ratio.* keys', () => {
    localStorage.setItem('ratio.accounts', '[]')
    localStorage.setItem('ratio.theme', '"matisse2"')
    localStorage.setItem('unrelated', '1')

    const backup = buildRatioBackup(localStorage)

    expect(backup.schema).toBe(RATIO_BACKUP_SCHEMA_V1)
    expect(Object.keys(backup.items)).toEqual(['ratio.accounts', 'ratio.theme'])
    expect(backup.items['ratio.theme']).toBe('"matisse2"')
    expect(typeof backup.createdAt).toBe('string')
  })

  it('clearRatioStorage removes backed-up keys only', () => {
    localStorage.setItem('ratio.accounts', '[]')
    localStorage.setItem('ratio.theme', '"matisse2"')
    localStorage.setItem('unrelated', '1')

    const cleared = clearRatioStorage(localStorage)

    expect(cleared).toEqual(['ratio.accounts', 'ratio.theme'])
    expect(localStorage.getItem('ratio.accounts')).toBeNull()
    expect(localStorage.getItem('ratio.theme')).toBeNull()
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
    localStorage.setItem('unrelated', 'keep')

    const backup = parseRatioBackup(
      JSON.stringify({
        schema: RATIO_BACKUP_SCHEMA_V1,
        createdAt: '2025-01-01T00:00:00.000Z',
        items: {
          'ratio.new': '2',
          unrelated: 'skip',
        },
      }),
    )

    const res = restoreRatioBackup(backup, localStorage)

    expect(res.clearedKeys).toEqual(['ratio.old'])
    expect(res.restoredKeys).toEqual(['ratio.new'])
    expect(res.skippedKeys).toEqual(['unrelated'])
    expect(localStorage.getItem('ratio.old')).toBeNull()
    expect(localStorage.getItem('ratio.new')).toBe('2')
    expect(localStorage.getItem('unrelated')).toBe('keep')
  })

  it('restoreRatioBackup rolls back if writing new state fails', () => {
    const store = new Map<string, string>([
      ['ratio.accounts', '["old"]'],
      ['ratio.snapshots', '["old-snap"]'],
      ['ratio.theme', '"old-theme"'],
    ])

    const storage: Storage = {
      get length() {
        return store.size
      },
      clear() {
        store.clear()
      },
      key(index: number) {
        return Array.from(store.keys())[index] ?? null
      },
      getItem(key: string) {
        return store.has(key) ? store.get(key)! : null
      },
      removeItem(key: string) {
        store.delete(key)
      },
      setItem(key: string, value: string) {
        if (value === '["new-snap"]') throw new Error('boom')
        store.set(key, value)
      },
    }

    const backup = parseRatioBackup(
      JSON.stringify({
        schema: RATIO_BACKUP_SCHEMA_V1,
        createdAt: '2025-01-01T00:00:00.000Z',
        items: {
          'ratio.accounts': '["new"]',
          'ratio.snapshots': '["new-snap"]',
          'ratio.theme': '"new-theme"',
        },
      }),
    )

    expect(() => restoreRatioBackup(backup, storage)).toThrow('Restore failed: boom')
    expect(store.get('ratio.accounts')).toBe('["old"]')
    expect(store.get('ratio.snapshots')).toBe('["old-snap"]')
    expect(store.get('ratio.theme')).toBe('"old-theme"')
  })

  it('restoreRatioBackup dispatches storage write events after success', () => {
    localStorage.setItem('ratio.old', '1')

    const events: Array<{ key: string; raw?: string }> = []
    const onWrite = (event: Event) => {
      const detail = (event as CustomEvent<{ key: string; raw?: string }>).detail
      events.push(detail)
    }

    window.addEventListener('ratio:storage-write', onWrite)
    try {
      const backup = parseRatioBackup(
        JSON.stringify({
          schema: RATIO_BACKUP_SCHEMA_V1,
          createdAt: '2025-01-01T00:00:00.000Z',
          items: {
            'ratio.new': '2',
          },
        }),
      )

      restoreRatioBackup(backup, localStorage)
    } finally {
      window.removeEventListener('ratio:storage-write', onWrite)
    }

    expect(events).toEqual([
      { key: 'ratio.new', raw: '2' },
      { key: 'ratio.old' },
    ])
  })
})
