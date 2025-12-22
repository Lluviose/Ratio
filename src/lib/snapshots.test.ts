import { describe, expect, it } from 'vitest'
import { normalizeSnapshot, type Snapshot } from './snapshots'

describe('normalizeSnapshot', () => {
  it('fills missing numeric fields with 0', () => {
    const raw = { date: '2025-01-01' } as unknown as Snapshot
    const s = normalizeSnapshot(raw)
    expect(s).toEqual({
      date: '2025-01-01',
      net: 0,
      debt: 0,
      cash: 0,
      invest: 0,
      fixed: 0,
      receivable: 0,
      accounts: undefined,
    })
  })

  it('uses legacy liquid as cash fallback', () => {
    const raw = { date: '2025-01-01', liquid: 1234 } as unknown as Snapshot
    const s = normalizeSnapshot(raw)
    expect(s.cash).toBe(1234)
  })

  it('sanitizes accounts list balances', () => {
    const raw = {
      date: '2025-01-01',
      accounts: [
        { id: 'a', type: 'fund', name: '基金', balance: 100 },
        { id: 'b', type: 'fund', name: '基金2', balance: 'nope' },
        { id: 'bad', type: 1, name: 'x', balance: 1 },
      ],
    } as unknown as Snapshot

    const s = normalizeSnapshot(raw)
    expect(s.accounts).toEqual([
      { id: 'a', type: 'fund', name: '基金', balance: 100 },
      { id: 'b', type: 'fund', name: '基金2', balance: 0 },
    ])
  })
})

