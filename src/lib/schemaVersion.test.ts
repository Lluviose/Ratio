import { beforeEach, describe, expect, it } from 'vitest'
import {
  CURRENT_DATA_SCHEMA_VERSION,
  DATA_SCHEMA_VERSION_KEY,
  effectiveDataSchemaVersion,
  runDataSchemaMigrations,
  type DataSchemaMigration,
} from './schemaVersion'
import { DEMO_MODE_KEY } from './demoMode'

beforeEach(() => {
  localStorage.clear()
})

describe('effectiveDataSchemaVersion', () => {
  it('treats an empty storage as the current version (fresh install)', () => {
    expect(effectiveDataSchemaVersion(localStorage)).toBe(CURRENT_DATA_SCHEMA_VERSION)
  })

  it('treats data without a version key as legacy v1', () => {
    localStorage.setItem('ratio.accounts', '[]')
    expect(effectiveDataSchemaVersion(localStorage)).toBe(1)
  })

  it('prefers the stored version key and ignores invalid values', () => {
    localStorage.setItem(DATA_SCHEMA_VERSION_KEY, '3')
    expect(effectiveDataSchemaVersion(localStorage)).toBe(3)

    localStorage.setItem(DATA_SCHEMA_VERSION_KEY, 'not-a-number')
    localStorage.setItem('ratio.accounts', '[]')
    expect(effectiveDataSchemaVersion(localStorage)).toBe(1)
  })
})

describe('runDataSchemaMigrations', () => {
  it('stamps the version key on first run and reports current', () => {
    localStorage.setItem('ratio.accounts', '[]')
    const outcome = runDataSchemaMigrations(localStorage)
    expect(outcome).toEqual({ status: 'current', version: CURRENT_DATA_SCHEMA_VERSION })
    expect(localStorage.getItem(DATA_SCHEMA_VERSION_KEY)).toBe(String(CURRENT_DATA_SCHEMA_VERSION))
  })

  it('skips migrations while demo mode is active', () => {
    localStorage.setItem(DEMO_MODE_KEY, 'true')
    localStorage.setItem('ratio.accounts', '[]')
    const outcome = runDataSchemaMigrations(localStorage)
    expect(outcome).toEqual({ status: 'skipped_demo' })
    expect(localStorage.getItem(DATA_SCHEMA_VERSION_KEY)).toBeNull()
  })

  it('reports newer_data without touching storage when data is from a newer app', () => {
    localStorage.setItem(DATA_SCHEMA_VERSION_KEY, String(CURRENT_DATA_SCHEMA_VERSION + 5))
    localStorage.setItem('ratio.accounts', '["future"]')
    const outcome = runDataSchemaMigrations(localStorage)
    expect(outcome).toEqual({ status: 'newer_data', version: CURRENT_DATA_SCHEMA_VERSION + 5 })
    expect(localStorage.getItem('ratio.accounts')).toBe('["future"]')
    expect(localStorage.getItem(DATA_SCHEMA_VERSION_KEY)).toBe(String(CURRENT_DATA_SCHEMA_VERSION + 5))
  })

  it('runs pending migrations in order and persists the version after each step', () => {
    localStorage.setItem('ratio.accounts', '[]')
    localStorage.setItem(DATA_SCHEMA_VERSION_KEY, '1')
    const ran: string[] = []
    const migrations: DataSchemaMigration[] = [
      { from: 2, to: 3, migrate: () => void ran.push('2->3') },
      { from: 1, to: 2, migrate: () => void ran.push('1->2') },
    ]

    const outcome = runDataSchemaMigrations(localStorage, migrations, 3)

    expect(outcome).toEqual({ status: 'migrated', from: 1, to: 3 })
    expect(ran).toEqual(['1->2', '2->3'])
    expect(localStorage.getItem(DATA_SCHEMA_VERSION_KEY)).toBe('3')
  })

  it('stops at the completed step when a migration throws', () => {
    localStorage.setItem('ratio.accounts', '[]')
    localStorage.setItem(DATA_SCHEMA_VERSION_KEY, '1')
    const boom = new Error('boom')
    const migrations: DataSchemaMigration[] = [
      { from: 1, to: 2, migrate: (storage) => storage.setItem('ratio.migrated', 'yes') },
      {
        from: 2,
        to: 3,
        migrate: () => {
          throw boom
        },
      },
    ]

    const outcome = runDataSchemaMigrations(localStorage, migrations, 3)

    // 第一步成功且版本推进到 2；第二步失败停在 2，交由 coerce 兜底
    expect(outcome).toEqual({ status: 'failed', from: 1, stoppedAt: 2, error: boom })
    expect(localStorage.getItem('ratio.migrated')).toBe('yes')
    expect(localStorage.getItem(DATA_SCHEMA_VERSION_KEY)).toBe('2')
  })

  it('fails cleanly when a migration step is missing', () => {
    localStorage.setItem('ratio.accounts', '[]')
    localStorage.setItem(DATA_SCHEMA_VERSION_KEY, '1')
    const outcome = runDataSchemaMigrations(localStorage, [], 2)
    expect(outcome.status).toBe('failed')
    expect(localStorage.getItem(DATA_SCHEMA_VERSION_KEY)).toBe('1')
  })
})
