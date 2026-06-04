import { normalizeMoney } from './money'
import { DEFAULT_MONTH_START_DAY, clampMonthStartDay, monthKeyForDateKey } from './monthStart'
import type { Snapshot } from './snapshots'

export const SAVINGS_GOAL_KEY = 'ratio.savingsGoal'
export const SAVINGS_PACE_ALGORITHM_KEY = 'ratio.savingsPaceAlgorithm'

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

function sortValidSnapshots(snapshots: Snapshot[]) {
  return snapshots
    .filter((s) => dateKeyToUtcDays(s.date) != null)
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date))
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

function pickGrowthWindow(snapshots: Snapshot[], latestDate: string) {
  const sorted = sortValidSnapshots(snapshots)
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

function median(values: number[]) {
  if (values.length === 0) return null
  const sorted = values.slice().sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 1) return sorted[mid]
  return (sorted[mid - 1] + sorted[mid]) / 2
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
  const byMonth = new Map<string, Snapshot>()
  for (const snapshot of snapshots) {
    byMonth.set(monthKeyForDateKey(snapshot.date, monthStartDay), snapshot)
  }
  return Array.from(byMonth.keys())
    .sort((a, b) => a.localeCompare(b))
    .map((monthKey) => byMonth.get(monthKey)!)
}

function pickMonthlyPaceWindow(sorted: Snapshot[], selected: Snapshot[], monthStartDay: number) {
  const recentMonthly = pickMonthlyClosingSnapshots(selected, monthStartDay)
  const allMonthly = recentMonthly.length >= 2 ? recentMonthly : pickMonthlyClosingSnapshots(sorted, monthStartDay)
  return allMonthly.slice(Math.max(0, allMonthly.length - MONTHLY_PACE_WINDOW_COUNT))
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

function getRecentWindowPace(selected: Snapshot[]): NetChangePace | null {
  const first = selected[0]
  const last = selected[selected.length - 1]
  if (!first || !last) return null

  const selectedDays = diffDateDays(first.date, last.date)
  if (selectedDays == null || selectedDays < MIN_DENSE_PACE_DAYS) return null
  return buildNetChangePace(first, last, 'recent-window', selected.length)
}

function getLongWindowPace(sorted: Snapshot[]): NetChangePace | null {
  const first = sorted[0]
  const last = sorted[sorted.length - 1]
  if (!first || !last) return null

  const selectedDays = diffDateDays(first.date, last.date)
  if (selectedDays == null || selectedDays < MIN_SPARSE_PACE_DAYS) return null
  return buildNetChangePace(first, last, 'long-window', sorted.length)
}

function getMonthlyClosePace(sorted: Snapshot[], selected: Snapshot[], monthStartDay: number): NetChangePace | null {
  const monthlyWindow = pickMonthlyPaceWindow(sorted, selected, monthStartDay)
  if (monthlyWindow.length < 2) return null

  const monthlyPace = buildNetChangePace(monthlyWindow[0], monthlyWindow[monthlyWindow.length - 1], 'monthly-close', monthlyWindow.length)
  return monthlyPace && monthlyPace.sampleDays >= MIN_SPARSE_PACE_DAYS ? monthlyPace : null
}

function getMonthlyIntervalRates(monthlyWindow: Snapshot[]) {
  const rates: number[] = []
  for (let i = 1; i < monthlyWindow.length; i += 1) {
    const previous = monthlyWindow[i - 1]
    const current = monthlyWindow[i]
    const days = diffDateDays(previous.date, current.date)
    if (days != null && days > 0) rates.push((current.net - previous.net) / days)
  }
  return rates
}

function getMonthlySmoothedPace(sorted: Snapshot[], selected: Snapshot[], monthStartDay: number): NetChangePace | null {
  const monthlyWindow = pickMonthlyPaceWindow(sorted, selected, monthStartDay)
  if (monthlyWindow.length < 3) return null

  const first = monthlyWindow[0]
  const last = monthlyWindow[monthlyWindow.length - 1]
  const sampleDays = diffDateDays(first.date, last.date)
  if (sampleDays == null || sampleDays < MIN_SPARSE_PACE_DAYS) return null

  const rates = getMonthlyIntervalRates(monthlyWindow)
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

function hasHighMonthlyVolatility(sorted: Snapshot[], selected: Snapshot[], monthStartDay: number) {
  const monthlyWindow = pickMonthlyPaceWindow(sorted, selected, monthStartDay)
  const rates = getMonthlyIntervalRates(monthlyWindow)
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

function getManualNetChangePace(
  algorithm: NetChangePaceMethod,
  sorted: Snapshot[],
  selected: Snapshot[],
  monthStartDay: number,
): NetChangePace | null {
  if (algorithm === 'recent-window') return getRecentWindowPace(selected)
  if (algorithm === 'monthly-close') return getMonthlyClosePace(sorted, selected, monthStartDay)
  if (algorithm === 'monthly-smoothed') return getMonthlySmoothedPace(sorted, selected, monthStartDay)
  return getLongWindowPace(sorted)
}

function getSmartNetChangePace(sorted: Snapshot[], selected: Snapshot[], monthStartDay: number): NetChangePace | null {
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

  if (hasHighMonthlyVolatility(sorted, selected, monthStartDay)) {
    const smoothedPace = getMonthlySmoothedPace(sorted, selected, monthStartDay)
    if (smoothedPace) return smoothedPace
  }

  if (prefersMonthlyPace) {
    const monthlyPace = getMonthlyClosePace(sorted, selected, monthStartDay)
    if (monthlyPace) return monthlyPace
    if (selectedDays < MIN_SPARSE_PACE_DAYS) return null
  }

  const recentPace = getRecentWindowPace(selected)
  if (recentPace) return recentPace

  return getMonthlyClosePace(sorted, selected, monthStartDay) ?? getLongWindowPace(sorted)
}

export function getNetChangePace(snapshots: Snapshot[], options: PaceOptions = {}): NetChangePace | null {
  const sorted = sortValidSnapshots(snapshots)
  const latest = sorted[sorted.length - 1]
  if (!latest) return null

  const selected = pickGrowthWindow(sorted, latest.date)
  if (selected.length < 2) return null

  const monthStartDay = clampMonthStartDay(options.monthStartDay ?? DEFAULT_MONTH_START_DAY)
  const algorithm = coerceSavingsPaceAlgorithm(options.algorithm ?? 'smart')

  return algorithm === 'smart'
    ? getSmartNetChangePace(sorted, selected, monthStartDay)
    : getManualNetChangePace(algorithm, sorted, selected, monthStartDay)
}

export function getAverageDailyNetChange(snapshots: Snapshot[], options: PaceOptions = {}): number | null {
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

export function getSavingsGoalSummary(goal: SavingsGoal | null, snapshots: Snapshot[], options: PaceOptions = {}): SavingsGoalSummary | null {
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
  const requiredMonthly = requiredDaily == null ? null : requiredDaily * 30.4375
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

  const netChangePace = getNetChangePace(snapshots, options)
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
