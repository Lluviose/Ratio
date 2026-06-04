import { addMoney, subtractMoney } from './money'
import { diffDateDays, getNetChangePace, toDateKey, type NetChangePace } from './savingsGoal'
import type { Snapshot } from './snapshots'

export type StatsRangeId = '5w' | '6m' | '1y' | '4y'

export type SnapshotDelta = {
  net: number
  assets: number
  debt: number
  cash: number
  invest: number
  fixed: number
  receivable: number
}

export type StatsRangeView = {
  start: Snapshot
  end: Snapshot
  selectedCount: number
  rangeFallback: boolean
  assetsStart: number
  delta: SnapshotDelta
  days: number | null
  growth: {
    net: number | null
    assets: number | null
    debt: number | null
    avgDailyNet: number | null
  }
  netPace: NetChangePace | null
}

export type CurrentSnapshotStats = {
  snapshot: Snapshot
  assets: number
  currentAssets: number
  netLiquid: number
  ratios: {
    debtToAssets: number | null
    netToAssets: number | null
    debtToNet: number | null
    equityMultiplier: number | null
  }
  coverage: {
    current: number | null
    quick: number | null
    cash: number | null
  }
}

export function sortSnapshotsByDate(snapshots: readonly Snapshot[]): Snapshot[] {
  return [...snapshots].sort((a, b) => a.date.localeCompare(b.date))
}

export function getLatestSnapshot(snapshots: readonly Snapshot[]): Snapshot | null {
  let latest: Snapshot | null = null
  for (const snapshot of snapshots) {
    if (!latest || snapshot.date > latest.date) latest = snapshot
  }
  return latest
}

export function sumSnapshotAssets(snapshot: Snapshot): number {
  return addMoney(addMoney(snapshot.cash, snapshot.invest), addMoney(snapshot.fixed, snapshot.receivable))
}

export function safeRatio(numerator: number, denominator: number): number | null {
  if (![numerator, denominator].every((value) => Number.isFinite(value))) return null
  if (denominator === 0) return numerator === 0 ? 0 : Infinity
  return numerator / denominator
}

export function safeGrowth(delta: number, base: number): number | null {
  if (![delta, base].every((value) => Number.isFinite(value))) return null
  if (base <= 0) return null
  return delta / base
}

function getStatsRangeCutoffDate(range: StatsRangeId): Date {
  const cutoff = new Date()
  if (range === '5w') cutoff.setDate(cutoff.getDate() - 35)
  if (range === '6m') cutoff.setMonth(cutoff.getMonth() - 6)
  if (range === '1y') cutoff.setFullYear(cutoff.getFullYear() - 1)
  if (range === '4y') cutoff.setFullYear(cutoff.getFullYear() - 4)
  return cutoff
}

export function buildStatsRangeView(
  snapshots: readonly Snapshot[],
  range: StatsRangeId,
  monthStartDay: number,
): StatsRangeView | null {
  if (snapshots.length === 0) return null

  const sorted = sortSnapshotsByDate(snapshots)
  const cutoffKey = toDateKey(getStatsRangeCutoffDate(range))
  let selected = sorted.filter((snapshot) => snapshot.date >= cutoffKey)
  const rangeFallback = selected.length < 2 && sorted.length > selected.length
  if (rangeFallback) selected = sorted

  const start = selected[0]
  const end = selected[selected.length - 1]
  if (!start || !end) return null

  const assetsStart = sumSnapshotAssets(start)
  const assetsEnd = sumSnapshotAssets(end)
  const delta: SnapshotDelta = {
    net: subtractMoney(end.net, start.net),
    assets: subtractMoney(assetsEnd, assetsStart),
    debt: subtractMoney(end.debt, start.debt),
    cash: subtractMoney(end.cash, start.cash),
    invest: subtractMoney(end.invest, start.invest),
    fixed: subtractMoney(end.fixed, start.fixed),
    receivable: subtractMoney(end.receivable, start.receivable),
  }

  const days = diffDateDays(start.date, end.date)
  const netPace = getNetChangePace(selected, { monthStartDay })

  return {
    start,
    end,
    selectedCount: selected.length,
    rangeFallback,
    assetsStart,
    delta,
    days: days == null ? null : Math.max(0, days),
    growth: {
      net: safeGrowth(delta.net, start.net),
      assets: safeGrowth(delta.assets, assetsStart),
      debt: safeGrowth(delta.debt, start.debt),
      avgDailyNet: netPace?.avgDaily ?? null,
    },
    netPace,
  }
}

export function buildCurrentSnapshotStats(snapshot: Snapshot | null): CurrentSnapshotStats | null {
  if (!snapshot) return null

  const assets = sumSnapshotAssets(snapshot)
  const currentAssets = addMoney(addMoney(snapshot.cash, snapshot.invest), snapshot.receivable)
  const quickAssets = addMoney(snapshot.cash, snapshot.invest)
  const netLiquid = subtractMoney(currentAssets, snapshot.debt)

  return {
    snapshot,
    assets,
    currentAssets,
    netLiquid,
    ratios: {
      debtToAssets: safeRatio(snapshot.debt, assets),
      netToAssets: safeRatio(snapshot.net, assets),
      debtToNet: snapshot.net > 0 ? safeRatio(snapshot.debt, snapshot.net) : null,
      equityMultiplier: snapshot.net > 0 ? safeRatio(assets, snapshot.net) : null,
    },
    coverage: {
      current: safeRatio(currentAssets, snapshot.debt),
      quick: safeRatio(quickAssets, snapshot.debt),
      cash: safeRatio(snapshot.cash, snapshot.debt),
    },
  }
}
