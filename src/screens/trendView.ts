import { dateKeyToUtcDays, diffDateDays } from '../lib/savingsGoal'
import { getMaxDateValue, shouldShowYearForDateKeys } from '../lib/dateSeries'
import { formatMonthKeyLabel, monthKeyForDateKey } from '../lib/monthStart'
import type { Snapshot } from '../lib/snapshots'
import type { FutureCadence, TrendPoint } from './trendGoalLines'

export type RangeId = '30d' | '6m' | '1y' | 'custom'

export const RECENT_SNAPSHOT_LIMIT = 90

const DAYS_PER_MONTH = 30.4375

const DEFAULT_FUTURE_CADENCE: FutureCadence = {
  stepDays: Math.round(DAYS_PER_MONTH),
  maxPoints: 8,
  horizonDays: Math.round(DAYS_PER_MONTH * 6),
}

type TrendSelectionEntry = {
  snapshot: Snapshot
  monthKey?: string
}

type TrendView = {
  points: TrendPoint[]
  selected: Snapshot[]
  showYear: boolean
  futureCadence: FutureCadence
  clipStartDate: string | null
  domainStartDate: string | null
}

export type TrendChartDerived = {
  data: TrendPoint[]
  forecastStartDate: string | null
  forecastStartValue: number | null
  forecastArea: { start: number; end: number } | null
  hasProjectionBridge: boolean
  showYearInData: boolean
  goalDateContext: string[]
}

type TrendChartDerivedOptions = {
  mode: 'netDebt' | 'cashInvest'
  viewPoints: TrendPoint[]
  goalTrendPoints: TrendPoint[]
  goalSummary?: {
    avgDailyNetChange: number | null
    latestDate: string | null
    startDate: string
    targetDate: string
    projectedDate: string | null
  } | null
  getSavingsProjectionStartDate: (latestDate: string | null) => string | null
}

function toDateKey(d: Date) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function formatLabel(date: string, options?: { showYear?: boolean }) {
  const d = new Date(`${date}T00:00:00`)
  if (Number.isNaN(d.getTime())) return date
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const showYear = options?.showYear ?? shouldShowYearForDateKeys([date])
  if (showYear) return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`
  return `${m}/${day}`
}

function formatMonthLabel(monthKey: string, showYear: boolean) {
  const m = /^(\d{4})-(\d{2})$/.exec(monthKey)
  if (!m) return monthKey
  if (showYear) return `${Number(m[1])}/${Number(m[2])}`
  return formatMonthKeyLabel(monthKey)
}

function shiftMonthKey(monthKey: string, offsetMonths: number) {
  const m = /^(\d{4})-(\d{2})$/.exec(monthKey)
  if (!m) return monthKey

  const year = Number(m[1])
  const monthIndex = Number(m[2]) - 1
  if (!Number.isFinite(year) || !Number.isFinite(monthIndex)) return monthKey

  const shifted = year * 12 + monthIndex + offsetMonths
  const shiftedYear = Math.floor(shifted / 12)
  const shiftedMonth = shifted % 12
  return `${String(shiftedYear).padStart(4, '0')}-${String(shiftedMonth + 1).padStart(2, '0')}`
}

function getMonthlyRangeStartKey(range: Extract<RangeId, '6m' | '1y'>, monthStartDay: number, latest: Snapshot | null) {
  const todayKey = toDateKey(new Date())
  const anchorDateKey = latest && latest.date > todayKey ? latest.date : todayKey
  const anchorMonthKey = monthKeyForDateKey(anchorDateKey, monthStartDay)
  const monthCount = range === '6m' ? 6 : 12
  return shiftMonthKey(anchorMonthKey, -(monthCount - 1))
}

function pickMonthlyLastFromSorted(snapshots: readonly Snapshot[], monthCount: number, monthStartDay: number, startMonthKey?: string) {
  const byMonth = new Map<string, Snapshot>()

  for (const s of snapshots) {
    const monthKey = monthKeyForDateKey(s.date, monthStartDay)
    if (startMonthKey && monthKey < startMonthKey) continue
    byMonth.set(monthKey, s)
  }

  const months = Array.from(byMonth.keys()).sort((a, b) => a.localeCompare(b))
  const pickedKeys = months.slice(Math.max(0, months.length - monthCount))
  return pickedKeys.map((key) => ({ monthKey: key, snapshot: byMonth.get(key)! }))
}

function getRangeCutoffKey(range: Exclude<RangeId, 'custom'>) {
  const cutoff = new Date()
  if (range === '30d') cutoff.setDate(cutoff.getDate() - 30)
  if (range === '6m') cutoff.setMonth(cutoff.getMonth() - 6)
  if (range === '1y') cutoff.setFullYear(cutoff.getFullYear() - 1)
  return toDateKey(cutoff)
}

function toPoint(s: Snapshot, idx: number, label: string): TrendPoint {
  return {
    date: label,
    dateKey: s.date,
    dateValue: dateKeyToUtcDays(s.date) ?? idx,
    idx,
    net: s.net,
    debt: s.debt,
    cash: s.cash,
    invest: s.invest,
    fixed: s.fixed,
    receivable: s.receivable,
  }
}

function median(values: number[]) {
  if (values.length === 0) return null
  const sorted = values.slice().sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 1) return sorted[mid]
  return (sorted[mid - 1] + sorted[mid]) / 2
}

function getTypicalPointGapDays(points: TrendPoint[]) {
  const gaps: number[] = []
  for (let i = 1; i < points.length; i += 1) {
    const gap = diffDateDays(points[i - 1].dateKey, points[i].dateKey)
    if (gap != null && gap > 0) gaps.push(gap)
  }
  return median(gaps)
}

function getPointSpanDays(points: TrendPoint[]) {
  const first = points[0]?.dateKey
  const last = points[points.length - 1]?.dateKey
  if (!first || !last) return null
  const days = diffDateDays(first, last)
  return days != null && days > 0 ? days : null
}

function getFutureCadence(range: RangeId, points: TrendPoint[]): FutureCadence {
  if (range === '30d') return { stepDays: 7, maxPoints: 18, horizonDays: 30 }
  if (range === '6m') return DEFAULT_FUTURE_CADENCE
  if (range === '1y') return { stepDays: Math.round(DAYS_PER_MONTH), maxPoints: 14, horizonDays: Math.round(DAYS_PER_MONTH * 12) }

  const typicalGap = getTypicalPointGapDays(points) ?? Math.round(DAYS_PER_MONTH)
  const spanDays = getPointSpanDays(points) ?? typicalGap * 16
  return {
    stepDays: Math.max(1, Math.min(45, Math.round(typicalGap))),
    maxPoints: 16,
    horizonDays: Math.max(30, Math.min(Math.round(DAYS_PER_MONTH * 12), Math.round(spanDays))),
  }
}

function withLatestSnapshotEntry(entries: TrendSelectionEntry[], latest: Snapshot | null) {
  if (!latest || entries.length === 0) return entries
  if (entries.some((entry) => entry.snapshot.date === latest.date)) return entries
  if (latest.date < entries[0].snapshot.date) return entries

  return [...entries, { snapshot: latest }]
    .sort((a, b) => a.snapshot.date.localeCompare(b.snapshot.date))
}

function getEntryLabel(entry: TrendSelectionEntry, showYear: boolean) {
  return entry.monthKey ? formatMonthLabel(entry.monthKey, showYear) : formatLabel(entry.snapshot.date, { showYear })
}

export function buildTrendView(snapshots: Snapshot[], range: RangeId, monthStartDay: number): TrendView {
  if (!snapshots || snapshots.length === 0) {
    return { points: [], selected: [], showYear: false, futureCadence: DEFAULT_FUTURE_CADENCE, clipStartDate: null, domainStartDate: null }
  }

  const sorted = snapshots.slice().sort((a, b) => a.date.localeCompare(b.date))
  const latest = sorted[sorted.length - 1] ?? null

  let entries: TrendSelectionEntry[] = []
  let domainStartDate: string | null = null

  if (range === '30d') {
    const cutoffKey = getRangeCutoffKey(range)
    domainStartDate = cutoffKey
    entries = sorted.filter((s) => s.date >= cutoffKey).map((snapshot) => ({ snapshot }))
  } else if (range === '6m') {
    entries = pickMonthlyLastFromSorted(sorted, 6, monthStartDay, getMonthlyRangeStartKey(range, monthStartDay, latest))
      .map((x) => ({ snapshot: x.snapshot, monthKey: x.monthKey }))
    entries = withLatestSnapshotEntry(entries, latest)
  } else if (range === 'custom') {
    entries = sorted.slice(Math.max(0, sorted.length - RECENT_SNAPSHOT_LIMIT)).map((snapshot) => ({ snapshot }))
  } else {
    entries = pickMonthlyLastFromSorted(sorted, 12, monthStartDay, getMonthlyRangeStartKey(range, monthStartDay, latest))
      .map((x) => ({ snapshot: x.snapshot, monthKey: x.monthKey }))
    entries = withLatestSnapshotEntry(entries, latest)
  }

  const showYear = shouldShowYearForDateKeys(entries.map((entry) => entry.monthKey ?? entry.snapshot.date))
  const selected = entries.map((entry) => entry.snapshot)
  const labels = entries.map((entry) => getEntryLabel(entry, showYear))
  const points = selected.map((s, idx) => toPoint(s, idx, labels[idx] ?? formatLabel(s.date, { showYear })))
  const clipStartDate = points[0]?.dateKey ?? null
  domainStartDate = domainStartDate ?? clipStartDate

  return {
    points,
    selected,
    showYear,
    futureCadence: getFutureCadence(range, points),
    clipStartDate,
    domainStartDate,
  }
}

export function buildTrendChartDerived(options: TrendChartDerivedOptions): TrendChartDerived {
  const { mode, viewPoints, goalTrendPoints, goalSummary, getSavingsProjectionStartDate } = options
  const data = mode === 'netDebt' ? goalTrendPoints : viewPoints
  const forecastStartDate = mode === 'netDebt' && goalSummary?.avgDailyNetChange != null
    ? getSavingsProjectionStartDate(goalSummary.latestDate)
    : null
  const forecastStartValue = forecastStartDate ? dateKeyToUtcDays(forecastStartDate) : null
  const forecastEndValue = forecastStartValue == null ? null : getMaxDateValue(data)
  const forecastArea = forecastStartValue != null && forecastEndValue != null && forecastEndValue > forecastStartValue
    ? { start: forecastStartValue, end: forecastEndValue }
    : null

  return {
    data,
    forecastStartDate,
    forecastStartValue,
    forecastArea,
    hasProjectionBridge: mode === 'netDebt' && data.some((point) => point.projectedBridgeNet != null),
    showYearInData: shouldShowYearForDateKeys(data.map((point) => point.dateKey)),
    goalDateContext: goalSummary
      ? [goalSummary.startDate, goalSummary.latestDate, goalSummary.targetDate, goalSummary.projectedDate].filter(
          (dateKey): dateKey is string => Boolean(dateKey),
        )
      : [],
  }
}
