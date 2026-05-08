import { beforeEach, describe, expect, it } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { useAccounts } from './useAccounts'
import { useSnapshots } from './useSnapshots'
import { todayDateKey } from './snapshots'
import { useDailySnapshotSync } from './useDailySnapshotSync'

function SnapshotHarness() {
  const accounts = useAccounts()
  const { snapshots, storageReady: snapshotsStorageReady, upsertFromAccounts } = useSnapshots()

  useDailySnapshotSync(accounts.accounts, snapshots.length, upsertFromAccounts, accounts.storageReady && snapshotsStorageReady)

  return <pre data-testid="snapshots">{JSON.stringify(snapshots)}</pre>
}

function readSnapshots() {
  return JSON.parse(screen.getByTestId('snapshots').textContent ?? '[]') as Array<Record<string, unknown>>
}

describe('useDailySnapshotSync', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
  })

  it('writes a zero snapshot when history exists but accounts are now empty', async () => {
    const today = todayDateKey()
    localStorage.setItem('ratio.accounts', JSON.stringify([]))
    localStorage.setItem(
      'ratio.snapshots',
      JSON.stringify([{ date: today, net: 12345, debt: 100, cash: 12445, invest: 0, fixed: 0, receivable: 0 }]),
    )

    render(<SnapshotHarness />)

    await waitFor(() => {
      expect(readSnapshots()).toEqual([
        {
          date: today,
          net: 0,
          debt: 0,
          cash: 0,
          invest: 0,
          fixed: 0,
          receivable: 0,
          accounts: [],
        },
      ])
    })
  })

  it('does not create a meaningless zero snapshot for a brand-new empty store', async () => {
    render(<SnapshotHarness />)

    await waitFor(() => {
      expect(readSnapshots()).toEqual([])
    })
  })

  it('does not upsert when source storage is not ready', async () => {
    localStorage.setItem(
      'ratio.accounts',
      JSON.stringify([
        {
          id: 'a1',
          type: 'cash',
          name: 'Cash',
          balance: 10,
          updatedAt: '2025-01-01T00:00:00.000Z',
        },
      ]),
    )
    localStorage.setItem('ratio.snapshots', '{bad json')

    render(<SnapshotHarness />)

    expect(localStorage.getItem('ratio.snapshots')).toBe('{bad json')
    await waitFor(() => expect(localStorage.getItem('ratio.snapshots')).toBe('{bad json'))
  })
})
