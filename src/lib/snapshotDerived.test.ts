import { describe, expect, it, vi } from 'vitest'
import {
  buildCurrentSnapshotStats,
  buildStatsRangeView,
  getLatestSnapshot,
  safeGrowth,
  safeRatio,
  sortSnapshotsByDate,
  sumSnapshotAssets,
} from './snapshotDerived'
import type { Snapshot } from './snapshots'

function snapshot(date: string, values: Partial<Snapshot> = {}): Snapshot {
  const cash = values.cash ?? 0
  const invest = values.invest ?? 0
  const fixed = values.fixed ?? 0
  const receivable = values.receivable ?? 0
  const debt = values.debt ?? 0
  return {
    date,
    cash,
    invest,
    fixed,
    receivable,
    debt,
    net: values.net ?? cash + invest + fixed + receivable - debt,
    accounts: values.accounts,
  }
}

describe('snapshotDerived', () => {
  it('sorts snapshots without mutating the original list and finds the latest snapshot', () => {
    const snapshots = [
      snapshot('2026-02-01', { cash: 2 }),
      snapshot('2026-01-01', { cash: 1 }),
      snapshot('2026-03-01', { cash: 3 }),
    ]

    expect(sortSnapshotsByDate(snapshots).map((s) => s.date)).toEqual(['2026-01-01', '2026-02-01', '2026-03-01'])
    expect(snapshots.map((s) => s.date)).toEqual(['2026-02-01', '2026-01-01', '2026-03-01'])
    expect(getLatestSnapshot(snapshots)?.date).toBe('2026-03-01')
  })

  it('builds stats ranges from sorted snapshots and falls back when the range has fewer than two records', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-05T12:00:00.000Z'))

    const view = buildStatsRangeView(
      [
        snapshot('2025-01-01', { cash: 100, debt: 20 }),
        snapshot('2026-06-01', { cash: 150, invest: 50, debt: 10 }),
      ],
      '5w',
      1,
    )

    expect(view?.rangeFallback).toBe(true)
    expect(view?.start.date).toBe('2025-01-01')
    expect(view?.end.date).toBe('2026-06-01')
    expect(view?.assetsStart).toBe(100)
    expect(view?.delta).toMatchObject({
      net: 110,
      assets: 100,
      debt: -10,
      cash: 50,
      invest: 50,
    })
    expect(view?.days).toBeGreaterThan(0)

    vi.useRealTimers()
  })

  it('builds current snapshot ratios and preserves zero-debt coverage semantics', () => {
    const stats = buildCurrentSnapshotStats(snapshot('2026-06-05', {
      cash: 100,
      invest: 50,
      fixed: 200,
      receivable: 25,
      debt: 0,
    }))

    expect(stats?.assets).toBe(375)
    expect(stats?.currentAssets).toBe(175)
    expect(stats?.netLiquid).toBe(175)
    expect(stats?.ratios.debtToAssets).toBe(0)
    expect(stats?.ratios.netToAssets).toBe(1)
    expect(stats?.coverage.current).toBe(Infinity)
    expect(stats?.coverage.quick).toBe(Infinity)
    expect(stats?.coverage.cash).toBe(Infinity)
  })

  it('keeps ratio and growth edge cases explicit', () => {
    expect(sumSnapshotAssets(snapshot('2026-01-01', { cash: 1, invest: 2, fixed: 3, receivable: 4 }))).toBe(10)
    expect(safeRatio(0, 0)).toBe(0)
    expect(safeRatio(10, 0)).toBe(Infinity)
    expect(safeRatio(Number.NaN, 1)).toBeNull()
    expect(safeGrowth(10, 0)).toBeNull()
    expect(safeGrowth(10, -1)).toBeNull()
    expect(safeGrowth(10, 100)).toBe(0.1)
  })

})
