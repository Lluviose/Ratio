import { normalizeMoney } from './money'
import { DEFAULT_MONTH_START_DAY, clampMonthStartDay, monthKeyForDateKey } from './monthStart'
import { median } from './robustStats'
import type { Snapshot } from './snapshots'

export const SAVINGS_GOAL_KEY = 'ratio.savingsGoal'
export const SAVINGS_PACE_ALGORITHM_KEY = 'ratio.savingsPaceAlgorithm'

/** Average Gregorian month length; shared by every monthly<->daily conversion. */
export const DAYS_PER_MONTH = 30.4375

export const SAVINGS_PACE_ALGORITHMS = ['smart', 'recent-window', 'monthly-close', 'monthly-smoothed', 'long-window'] as const

export type SavingsPaceAlgorithm = (typeof SAVINGS_PACE_ALGORITHMS)[number]

export type SavingsGoal = {
  targetAmount: number
  targetDate: string
  startDate: string
  startNetWorth: number
  createdAt: string
  updatedAt?: string
}

export type SavingsGoalSummary = {
  latestDate: string | null
  currentNetWorth: number
  targetAmount: number
  targetDate: string
  startDate: string
  startNetWorth: number
  currentPeriodStartDate: string
  currentPeriodStartNetWorth: number
  currentPeriodActual: number
  currentPeriodTargetNetWorth: number | null
  currentPeriodTarget: number | null
  currentPeriodRemaining: number | null
  currentPeriodDelta: number | null
  currentPeriodEndDate: string | null
  currentPeriodIsOnTrack: boolean | null
  progress: number
  remaining: number
  daysLeft: number | null
  requiredDaily: number | null
  requiredMonthly: number | null
  avgDailyNetChange: number | null
  avgDailyNetChangeMethod: NetChangePaceMethod | null
  avgDailyNetChangeSampleDays: number | null
  avgDailyNetChangeSnapshotCount: number | null
  projectedDate: string | null
  projectedNetAtTargetDate: number | null
  targetValueAtLatest: number | null
  targetDeltaAtLatest: number | null
  paceDailyDelta: number | null
  isComplete: boolean
  isDueToday: boolean
  isPastDue: boolean
  isOnTrack: boolean | null
}

export type NetChangePaceMethod = Exclude<SavingsPaceAlgorithm, 'smart'>

export type NetChangePace = {
  avgDaily: number
  method: NetChangePaceMethod
  sampleDays: number
  snapshotCount: number
  startDate: string
  endDate: string
}

type PaceOptions = {
  monthStartDay?: number
  algorithm?: SavingsPaceAlgorithm
}

export type SavingsGoalSummaryOptions = PaceOptions & {
  /**
   * Precomputed pace to reuse (e.g. shared with the disposable estimator).
   * `undefined` = compute here; `null` = "computed elsewhere and absent".
   */
  pace?: NetChangePace | null
}

const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/
const RECENT_GROWTH_WINDOW_DAYS = 180
const MONTHLY_PACE_WINDOW_COUNT = 7
const MIN_DENSE_PACE_DAYS = 7
const MIN_SPARSE_PACE_DAYS = 21
const SPARSE_TYPICAL_GAP_DAYS = 7
const IRREGULAR_LONG_GAP_DAYS = 14
const IRREGULAR_GAP_RATIO = 4
const HIGH_VOLATILITY_RATIO = 0.9
const MIN_SMOOTHED_MONTHLY_INTERVALS = 3
const MIN_SMART_SMOOTHED_MONTHLY_INTERVALS = 5

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function toDateKey(d: Date) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function todayDateKey() {
  return toDateKey(new Date())
}

export function isDateKey(value: unknown): value is string {
  if (typeof value !== 'string' || !DATE_KEY_RE.test(value)) return false
  const days = dateKeyToUtcDays(value)
  return days != null
}

export function dateKeyToUtcDays(dateKey: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey)
  if (!match) return null

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  if (![year, month, day].every((v) => Number.isInteger(v))) return null
  if (month < 1 || month > 12 || day < 1 || day > 31) return null

  const utc = Date.UTC(year, month - 1, day)
  const d = new Date(utc)
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) return null
  return Math.floor(utc / 86400000)
}

export function dateKeyFromUtcDays(days: number): string | null {
  if (!Number.isFinite(days)) return null
  const d = new Date(Math.round(days) * 86400000)
  return toDateKey(new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
}

export function addDaysToDateKey(dateKey: string, days: number): string | null {
  const start = dateKeyToUtcDays(dateKey)
  if (start == null || !Number.isFinite(days)) return null
  return dateKeyFromUtcDays(start + Math.round(days))
}

export function diffDateDays(startDateKey: string, endDateKey: string): number | null {
  const start = dateKeyToUtcDays(startDateKey)
  const end = dateKeyToUtcDays(endDateKey)
  if (start == null || end == null) return null
  return end - start
}

export function coerceSavingsGoal(value: unknown): SavingsGoal | null {
  if (!isRecord(value)) return null

  const targetAmount = typeof value.targetAmount === 'number' ? normalizeMoney(value.targetAmount) : 0
  if (!Number.isFinite(targetAmount) || targetAmount <= 0) return null

  const targetDate = isDateKey(value.targetDate) ? value.targetDate : null
  if (!targetDate) return null

  const fallbackStartDate = todayDateKey()
  const startDate = isDateKey(value.startDate) ? value.startDate : fallbackStartDate
  const startNetWorth = typeof value.startNetWorth === 'number' && Number.isFinite(value.startNetWorth)
    ? normalizeMoney(value.startNetWorth)
    : 0

  return {
    targetAmount,
    targetDate,
    startDate,
    startNetWorth,
    createdAt: typeof value.createdAt === 'string' ? value.createdAt : new Date().toISOString(),
    updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : undefined,
  }
}

export function coerceSavingsPaceAlgorithm(value: unknown): SavingsPaceAlgorithm {
  return typeof value === 'string' && (SAVINGS_PACE_ALGORITHMS as readonly string[]).includes(value)
    ? value as SavingsPaceAlgorithm
    : 'smart'
}

export function defaultGoalDate(from: Date = new Date()): string {
  const d = new Date(from)
  d.setFullYear(d.getFullYear() + 1)
  return toDateKey(d)
}

export function getActiveSavingsGoalDate(latestDate: string | null) {
  const today = todayDateKey()
  return latestDate && latestDate > today ? latestDate : today
}

export function getSavingsProjectionStartDate(latestDate: string | null) {
  return latestDate ?? getActiveSavingsGoalDate(latestDate)
}

function sortValidSnapshots(snapshots: readonly Snapshot[]) {
  // Single pass: keep date-valid snapshots and detect whether they are already
  // in ascending order (the common case — persisted snapshots and every
  // internal caller pass sorted arrays), so the O(n log n) sort can be skipped.
  const valid: Snapshot[] = []
  let sorted = true
  for (const snapshot of snapshots) {
    if (dateKeyToUtcDays(snapshot.date) == null) continue
    if (sorted && valid.length > 0 && valid[valid.length - 1].date > snapshot.date) sorted = false
    valid.push(snapshot)
  }
  if (!sorted) valid.sort((a, b) => a.date.localeCompare(b.date))
  return valid
}

function getPeriodStartDate(dateKey: string, monthStartDay: number) {
  const days = dateKeyToUtcDays(dateKey)
  if (days == null) return dateKey

  const d = new Date(days * 86400000)
  const year = d.getUTCFullYear()
  const monthIndex = d.getUTCMonth()
  const day = d.getUTCDate()
  const startDay = clampMonthStartDay(monthStartDay)
  const startMonthIndex = day >= startDay ? monthIndex : monthIndex - 1
  return dateKeyFromUtcDays(Math.floor(Date.UTC(year, startMonthIndex, startDay) / 86400000)) ?? dateKey
}

function getNextPeriodStartDate(periodStartDate: string, monthStartDay: number) {
  const days = dateKeyToUtcDays(periodStartDate)
  if (days == null) return null

  const d = new Date(days * 86400000)
  const nextStartDay = clampMonthStartDay(monthStartDay)
  const next = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, nextStartDay)
  return dateKeyFromUtcDays(Math.floor(next / 86400000))
}

function maxDateKey(a: string, b: string) {
  return a > b ? a : b
}

function minDateKey(a: string, b: string) {
  return a < b ? a : b
}

function latestSnapshotOnOrBefore(snapshots: Snapshot[], dateKey: string) {
  let best: Snapshot | null = null
  for (const snapshot of snapshots) {
    if (snapshot.date > dateKey) continue
    if (!best || snapshot.date > best.date) best = snapshot
  }
  return best
}

function getPeriodStartNetWorth(goal: SavingsGoal, snapshots: Snapshot[], periodStartDate: string) {
  const snapshot = latestSnapshotOnOrBefore(snapshots, periodStartDate)
  if (periodStartDate <= goal.startDate || !snapshot || snapshot.date < goal.startDate) {
    return normalizeMoney(goal.startNetWorth)
  }
  return normalizeMoney(snapshot.net)
}

function pickGrowthWindow(sorted: Snapshot[], latestDate: string) {
  if (sorted.length < 2) return []

  const latestDays = dateKeyToUtcDays(latestDate)
  if (latestDays == null) return sorted

  const cutoff = latestDays - RECENT_GROWTH_WINDOW_DAYS
  const recent = sorted.filter((s) => {
    const days = dateKeyToUtcDays(s.date)
    return days != null && days >= cutoff
  })

  return recent.length >= 2 ? recent : sorted
}

function getGapStats(snapshots: Snapshot[]) {
  const gaps: number[] = []
  for (let i = 1; i < snapshots.length; i += 1) {
    const gap = diffDateDays(snapshots[i - 1].date, snapshots[i].date)
    if (gap != null && gap > 0) gaps.push(gap)
  }
  return {
    typical: median(gaps),
    max: gaps.length > 0 ? Math.max(...gaps) : null,
  }
}

function pickMonthlyClosingSnapshots(snapshots: Snapshot[], monthStartDay: number) {
  // Input is sorted by date, so month keys arrive in ascending order; the Map
  // keeps each month's latest snapshot while preserving month order, and the
  // former key-sort pass is unnecessary.
  const byMonth = new Map<string, Snapshot>()
  for (const snapshot of snapshots) {
    byMonth.set(monthKeyForDateKey(snapshot.date, monthStartDay), snapshot)
  }
  return Array.from(byMonth.values())
}

/**
 * Shared per-call state for the pace estimators. The monthly closing window
 * and its interval rates are needed by up to three strategies in one smart
 * evaluation (volatility probe, smoothed, close); computing them lazily and
 * exactly once turns the former repeated Map/sort passes into cache reads.
 */
type PaceContext = {
  sorted: Snapshot[]
  selected: Snapshot[]
  monthStartDay: number
  monthlyWindow?: Snapshot[]
  monthlyRates?: number[]
}

function getMonthlyPaceWindow(ctx: PaceContext) {
  if (!ctx.monthlyWindow) {
    const recentMonthly = pickMonthlyClosingSnapshots(ctx.selected, ctx.monthStartDay)
    const allMonthly = recentMonthly.length >= 2 ? recentMonthly : pickMonthlyClosingSnapshots(ctx.sorted, ctx.monthStartDay)
    ctx.monthlyWindow = allMonthly.slice(Math.max(0, allMonthly.length - MONTHLY_PACE_WINDOW_COUNT))
  }
  return ctx.monthlyWindow
}

function getMonthlyIntervalRates(ctx: PaceContext) {
  if (!ctx.monthlyRates) {
    const monthlyWindow = getMonthlyPaceWindow(ctx)
    const rates: number[] = []
    for (let i = 1; i < monthlyWindow.length; i += 1) {
      const previous = monthlyWindow[i - 1]
      const current = monthlyWindow[i]
      const days = diffDateDays(previous.date, current.date)
      if (days != null && days > 0) rates.push((current.net - previous.net) / days)
    }
    ctx.monthlyRates = rates
  }
  return ctx.monthlyRates
}

function buildNetChangePace(first: Snapshot, last: Snapshot, method: NetChangePaceMethod, snapshotCount: number): NetChangePace | null {
  const days = diffDateDays(first.date, last.date)
  if (days == null || days <= 0) return null
  return {
    avgDaily: normalizeMoney((last.net - first.net) / days),
    method,
    sampleDays: days,
    snapshotCount,
    startDate: first.date,
    endDate: last.date,
  }
}

function getRecentWindowPace(ctx: PaceContext): NetChangePace | null {
  const { selected } = ctx
  const first = selected[0]
  const last = selected[selected.length - 1]
  if (!first || !last) return null

  const selectedDays = diffDateDays(first.date, last.date)
  if (selectedDays == null || selectedDays < MIN_DENSE_PACE_DAYS) return null
  return buildNetChangePace(first, last, 'recent-window', selected.length)
}

function getLongWindowPace(ctx: PaceContext): NetChangePace | null {
  const { sorted } = ctx
  const first = sorted[0]
  const last = sorted[sorted.length - 1]
  if (!first || !last) return null

  const selectedDays = diffDateDays(first.date, last.date)
  if (selectedDays == null || selectedDays < MIN_SPARSE_PACE_DAYS) return null
  return buildNetChangePace(first, last, 'long-window', sorted.length)
}

function getMonthlyClosePace(ctx: PaceContext): NetChangePace | null {
  const monthlyWindow = getMonthlyPaceWindow(ctx)
  if (monthlyWindow.length < 2) return null

  const monthlyPace = buildNetChangePace(monthlyWindow[0], monthlyWindow[monthlyWindow.length - 1], 'monthly-close', monthlyWindow.length)
  return monthlyPace && monthlyPace.sampleDays >= MIN_SPARSE_PACE_DAYS ? monthlyPace : null
}

function getMonthlySmoothedPace(ctx: PaceContext): NetChangePace | null {
  const monthlyWindow = getMonthlyPaceWindow(ctx)
  if (monthlyWindow.length < 3) return null

  const first = monthlyWindow[0]
  const last = monthlyWindow[monthlyWindow.length - 1]
  const sampleDays = diffDateDays(first.date, last.date)
  if (sampleDays == null || sampleDays < MIN_SPARSE_PACE_DAYS) return null

  const rates = getMonthlyIntervalRates(ctx)
  if (rates.length < MIN_SMOOTHED_MONTHLY_INTERVALS) return null

  const smoothedDaily = median(rates)
  if (smoothedDaily == null || !Number.isFinite(smoothedDaily)) return null

  return {
    avgDaily: normalizeMoney(smoothedDaily),
    method: 'monthly-smoothed',
    sampleDays,
    snapshotCount: monthlyWindow.length,
    startDate: first.date,
    endDate: last.date,
  }
}

function hasHighMonthlyVolatility(ctx: PaceContext) {
  const rates = getMonthlyIntervalRates(ctx)
  if (rates.length < MIN_SMART_SMOOTHED_MONTHLY_INTERVALS) return false

  const center = median(rates)
  if (center == null) return false

  const absRates = rates.map((rate) => Math.abs(rate))
  const typicalAbsRate = median(absRates) ?? 0
  const maxAbsRate = Math.max(...absRates)
  const maxDeviation = Math.max(...rates.map((rate) => Math.abs(rate - center)))
  const crossesZero = rates.some((rate) => rate > 0) && rates.some((rate) => rate < 0)

  if (crossesZero && maxAbsRate > 0) return true
  if (typicalAbsRate <= 0) return maxAbsRate > 0
  return maxDeviation / typicalAbsRate >= HIGH_VOLATILITY_RATIO
}

function getManualNetChangePace(algorithm: NetChangePaceMethod, ctx: PaceContext): NetChangePace | null {
  if (algorithm === 'recent-window') return getRecentWindowPace(ctx)
  if (algorithm === 'monthly-close') return getMonthlyClosePace(ctx)
  if (algorithm === 'monthly-smoothed') return getMonthlySmoothedPace(ctx)
  return getLongWindowPace(ctx)
}

function getSmartNetChangePace(ctx: PaceContext): NetChangePace | null {
  const { selected } = ctx
  const first = selected[0]
  const last = selected[selected.length - 1]
  if (!first || !last) return null

  const selectedDays = diffDateDays(first.date, last.date)
  if (selectedDays == null || selectedDays <= 0) return null

  const gapStats = getGapStats(selected)
  const hasIrregularGaps = gapStats.typical != null && gapStats.max != null
    && gapStats.max >= IRREGULAR_LONG_GAP_DAYS
    && gapStats.max / Math.max(1, gapStats.typical) >= IRREGULAR_GAP_RATIO
  const prefersMonthlyPace = selected.length <= 2 || gapStats.typical == null || gapStats.typical >= SPARSE_TYPICAL_GAP_DAYS || hasIrregularGaps

  if (hasHighMonthlyVolatility(ctx)) {
    const smoothedPace = getMonthlySmoothedPace(ctx)
    if (smoothedPace) return smoothedPace
  }

  if (prefersMonthlyPace) {
    const monthlyPace = getMonthlyClosePace(ctx)
    if (monthlyPace) return monthlyPace
    if (selectedDays < MIN_SPARSE_PACE_DAYS) return null
  }

  const recentPace = getRecentWindowPace(ctx)
  if (recentPace) return recentPace

  return getMonthlyClosePace(ctx) ?? getLongWindowPace(ctx)
}

export function getNetChangePace(snapshots: readonly Snapshot[], options: PaceOptions = {}): NetChangePace | null {
  const sorted = sortValidSnapshots(snapshots)
  const latest = sorted[sorted.length - 1]
  if (!latest) return null

  const selected = pickGrowthWindow(sorted, latest.date)
  if (selected.length < 2) return null

  const monthStartDay = clampMonthStartDay(options.monthStartDay ?? DEFAULT_MONTH_START_DAY)
  const algorithm = coerceSavingsPaceAlgorithm(options.algorithm ?? 'smart')
  const ctx: PaceContext = { sorted, selected, monthStartDay }

  return algorithm === 'smart'
    ? getSmartNetChangePace(ctx)
    : getManualNetChangePace(algorithm, ctx)
}

export function getAverageDailyNetChange(snapshots: readonly Snapshot[], options: PaceOptions = {}): number | null {
  return getNetChangePace(snapshots, options)?.avgDaily ?? null
}

export function getLinearGoalValue(goal: SavingsGoal, dateKey: string): number | null {
  const startDays = dateKeyToUtcDays(goal.startDate)
  const targetDays = dateKeyToUtcDays(goal.targetDate)
  const currentDays = dateKeyToUtcDays(dateKey)
  if (startDays == null || targetDays == null || currentDays == null) return null

  if (targetDays <= startDays) return currentDays >= targetDays ? goal.targetAmount : null
  if (currentDays < startDays || currentDays > targetDays) return null

  const progress = (currentDays - startDays) / (targetDays - startDays)
  return normalizeMoney(goal.startNetWorth + (goal.targetAmount - goal.startNetWorth) * progress)
}

export function getGoalComparisonValue(goal: SavingsGoal, dateKey: string): number | null {
  const linear = getLinearGoalValue(goal, dateKey)
  if (linear != null) return linear
  if (dateKey > goal.targetDate) return goal.targetAmount
  if (dateKey < goal.startDate) return goal.startNetWorth
  return null
}

export function getSavingsGoalSummary(goal: SavingsGoal | null, snapshots: readonly Snapshot[], options: SavingsGoalSummaryOptions = {}): SavingsGoalSummary | null {
  if (!goal) return null

  const sortedSnapshots = sortValidSnapshots(snapshots)
  const monthStartDay = clampMonthStartDay(options.monthStartDay ?? DEFAULT_MONTH_START_DAY)
  const latest = sortedSnapshots[sortedSnapshots.length - 1] ?? null
  const currentNetWorth = latest ? normalizeMoney(latest.net) : normalizeMoney(goal.startNetWorth)
  const latestDate = latest?.date ?? null
  const activeDate = getActiveSavingsGoalDate(latestDate)
  const projectionStartDate = getSavingsProjectionStartDate(latestDate)
  const calendarPeriodStartDate = getPeriodStartDate(activeDate, monthStartDay)
  const currentPeriodStartDate = goal.startDate <= activeDate ? maxDateKey(calendarPeriodStartDate, goal.startDate) : calendarPeriodStartDate
  const nextPeriodStartDate = getNextPeriodStartDate(calendarPeriodStartDate, monthStartDay)
  const currentPeriodEndDate = nextPeriodStartDate
    ? goal.targetDate > currentPeriodStartDate ? minDateKey(nextPeriodStartDate, goal.targetDate) : null
    : null
  const currentPeriodStartNetWorth = getPeriodStartNetWorth(goal, sortedSnapshots, currentPeriodStartDate)
  const currentPeriodActual = normalizeMoney(currentNetWorth - currentPeriodStartNetWorth)

  const rawProgress = goal.targetAmount <= 0 ? 0 : currentNetWorth / goal.targetAmount
  const progress = Math.max(0, Math.min(1, Number.isFinite(rawProgress) ? rawProgress : 0))
  const remaining = Math.max(0, normalizeMoney(goal.targetAmount - currentNetWorth))
  const isComplete = remaining <= 0

  const daysLeftRaw = diffDateDays(activeDate, goal.targetDate)
  const daysLeft = daysLeftRaw == null ? null : Math.max(0, daysLeftRaw)
  const isDueToday = !isComplete && daysLeftRaw === 0
  const isPastDue = !isComplete && daysLeftRaw != null && daysLeftRaw < 0
  const requiredDaily = !isComplete && daysLeft && daysLeft > 0 ? remaining / daysLeft : null
  const requiredMonthly = requiredDaily == null ? null : requiredDaily * DAYS_PER_MONTH
  const currentPeriodTargetValue = currentPeriodEndDate ? getGoalComparisonValue(goal, currentPeriodEndDate) : null
  const currentPeriodTargetNetWorth = currentPeriodTargetValue == null ? null : normalizeMoney(currentPeriodTargetValue)
  const currentPeriodTarget = !isComplete && currentPeriodTargetValue != null
    ? Math.max(0, normalizeMoney(currentPeriodTargetValue - currentPeriodStartNetWorth))
    : null
  const currentPeriodDelta = !isComplete && currentPeriodTargetValue != null
    ? normalizeMoney(currentNetWorth - currentPeriodTargetValue)
    : null
  const currentPeriodRemaining = !isComplete && currentPeriodTargetValue != null
    ? Math.max(0, normalizeMoney(currentPeriodTargetValue - currentNetWorth))
    : null
  const currentPeriodIsOnTrack = isComplete ? true : currentPeriodDelta == null ? null : currentPeriodDelta >= 0

  // Reuse an injected pace (shared with other estimators on the same inputs)
  // or compute it from the snapshots already sorted above.
  const netChangePace = options.pace !== undefined ? options.pace : getNetChangePace(sortedSnapshots, options)
  const avgDailyNetChange = netChangePace?.avgDaily ?? null
  const paceDailyDelta = avgDailyNetChange != null && requiredDaily != null ? avgDailyNetChange - requiredDaily : null
  const isOnTrack = isComplete ? true : paceDailyDelta == null ? null : paceDailyDelta >= 0

  let projectedDate: string | null = null
  if (!isComplete && latestDate && avgDailyNetChange != null && avgDailyNetChange > 0) {
    const daysToGoal = Math.ceil(remaining / avgDailyNetChange)
    projectedDate = addDaysToDateKey(projectionStartDate, daysToGoal)
  }

  let projectedNetAtTargetDate: number | null = null
  if (latestDate && avgDailyNetChange != null) {
    const daysToTarget = diffDateDays(projectionStartDate, goal.targetDate)
    if (daysToTarget != null && daysToTarget >= 0) {
      projectedNetAtTargetDate = normalizeMoney(currentNetWorth + avgDailyNetChange * daysToTarget)
    }
  }

  const targetValueAtLatest = latestDate ? getGoalComparisonValue(goal, latestDate) : null
  const targetDeltaAtLatest = targetValueAtLatest == null ? null : normalizeMoney(currentNetWorth - targetValueAtLatest)

  return {
    latestDate,
    currentNetWorth,
    targetAmount: goal.targetAmount,
    targetDate: goal.targetDate,
    startDate: goal.startDate,
    startNetWorth: goal.startNetWorth,
    currentPeriodStartDate,
    currentPeriodStartNetWorth,
    currentPeriodActual,
    currentPeriodTargetNetWorth,
    currentPeriodTarget: currentPeriodTarget == null ? null : normalizeMoney(currentPeriodTarget),
    currentPeriodRemaining,
    currentPeriodDelta: currentPeriodDelta == null ? null : normalizeMoney(currentPeriodDelta),
    currentPeriodEndDate,
    currentPeriodIsOnTrack,
    progress,
    remaining,
    daysLeft,
    requiredDaily: requiredDaily == null ? null : normalizeMoney(requiredDaily),
    requiredMonthly: requiredMonthly == null ? null : normalizeMoney(requiredMonthly),
    avgDailyNetChange: avgDailyNetChange == null ? null : normalizeMoney(avgDailyNetChange),
    avgDailyNetChangeMethod: netChangePace?.method ?? null,
    avgDailyNetChangeSampleDays: netChangePace?.sampleDays ?? null,
    avgDailyNetChangeSnapshotCount: netChangePace?.snapshotCount ?? null,
    projectedDate,
    projectedNetAtTargetDate,
    targetValueAtLatest,
    targetDeltaAtLatest,
    paceDailyDelta: paceDailyDelta == null ? null : normalizeMoney(paceDailyDelta),
    isComplete,
    isDueToday,
    isPastDue,
    isOnTrack,
  }
}
