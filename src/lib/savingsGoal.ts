import { normalizeMoney } from './money'
import { DEFAULT_MONTH_START_DAY, clampMonthStartDay, monthKeyForDateKey } from './monthStart'
import type { Snapshot } from './snapshots'

export const SAVINGS_GOAL_KEY = 'ratio.savingsGoal'

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

export type NetChangePaceMethod = 'monthly-close' | 'snapshot-window'

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
}

const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/
const RECENT_GROWTH_WINDOW_DAYS = 180
const MONTHLY_PACE_WINDOW_COUNT = 7
const MIN_DENSE_PACE_DAYS = 7
const MIN_SPARSE_PACE_DAYS = 21
const SPARSE_TYPICAL_GAP_DAYS = 7
const IRREGULAR_LONG_GAP_DAYS = 14
const IRREGULAR_GAP_RATIO = 4

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

export function defaultGoalDate(from: Date = new Date()): string {
  const d = new Date(from)
  d.setFullYear(d.getFullYear() + 1)
  return toDateKey(d)
}

function latestSnapshot(snapshots: Snapshot[]): Snapshot | null {
  if (snapshots.length === 0) return null
  return snapshots.reduce<Snapshot | null>((best, s) => {
    if (!best) return s
    return s.date > best.date ? s : best
  }, null)
}

function activeDateFromLatest(latestDate: string | null) {
  const today = todayDateKey()
  return latestDate && latestDate > today ? latestDate : today
}

function sortValidSnapshots(snapshots: Snapshot[]) {
  return snapshots
    .filter((s) => dateKeyToUtcDays(s.date) != null)
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date))
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

export function getNetChangePace(snapshots: Snapshot[], options: PaceOptions = {}): NetChangePace | null {
  const sorted = sortValidSnapshots(snapshots)
  const latest = sorted[sorted.length - 1]
  if (!latest) return null

  const selected = pickGrowthWindow(sorted, latest.date)
  if (selected.length < 2) return null

  const first = selected[0]
  const last = selected[selected.length - 1]
  const selectedDays = diffDateDays(first.date, last.date)
  if (selectedDays == null || selectedDays <= 0) return null

  const gapStats = getGapStats(selected)
  const hasIrregularGaps = gapStats.typical != null && gapStats.max != null
    && gapStats.max >= IRREGULAR_LONG_GAP_DAYS
    && gapStats.max / Math.max(1, gapStats.typical) >= IRREGULAR_GAP_RATIO
  const prefersMonthlyPace = selected.length <= 2 || gapStats.typical == null || gapStats.typical >= SPARSE_TYPICAL_GAP_DAYS || hasIrregularGaps
  const monthStartDay = clampMonthStartDay(options.monthStartDay ?? DEFAULT_MONTH_START_DAY)

  if (prefersMonthlyPace) {
    const recentMonthly = pickMonthlyClosingSnapshots(selected, monthStartDay)
    const allMonthly = recentMonthly.length >= 2 ? recentMonthly : pickMonthlyClosingSnapshots(sorted, monthStartDay)
    const monthlyWindow = allMonthly.slice(Math.max(0, allMonthly.length - MONTHLY_PACE_WINDOW_COUNT))
    if (monthlyWindow.length >= 2) {
      const monthlyPace = buildNetChangePace(monthlyWindow[0], monthlyWindow[monthlyWindow.length - 1], 'monthly-close', monthlyWindow.length)
      if (monthlyPace && monthlyPace.sampleDays >= MIN_SPARSE_PACE_DAYS) return monthlyPace
    }
  }

  const minSampleDays = prefersMonthlyPace ? MIN_SPARSE_PACE_DAYS : MIN_DENSE_PACE_DAYS
  if (selectedDays < minSampleDays) return null

  return buildNetChangePace(first, last, 'snapshot-window', selected.length)
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

  const latest = latestSnapshot(snapshots)
  const currentNetWorth = latest ? normalizeMoney(latest.net) : normalizeMoney(goal.startNetWorth)
  const latestDate = latest?.date ?? null
  const activeDate = activeDateFromLatest(latestDate)

  const totalNeeded = goal.targetAmount - goal.startNetWorth
  const gained = currentNetWorth - goal.startNetWorth
  const rawProgress = totalNeeded <= 0 ? (currentNetWorth >= goal.targetAmount ? 1 : 0) : gained / totalNeeded
  const progress = Math.max(0, Math.min(1, Number.isFinite(rawProgress) ? rawProgress : 0))
  const remaining = Math.max(0, normalizeMoney(goal.targetAmount - currentNetWorth))
  const isComplete = remaining <= 0

  const daysLeftRaw = diffDateDays(activeDate, goal.targetDate)
  const daysLeft = daysLeftRaw == null ? null : Math.max(0, daysLeftRaw)
  const isDueToday = !isComplete && daysLeftRaw === 0
  const isPastDue = !isComplete && daysLeftRaw != null && daysLeftRaw < 0
  const requiredDaily = !isComplete && daysLeft && daysLeft > 0 ? remaining / daysLeft : null
  const requiredMonthly = requiredDaily == null ? null : requiredDaily * 30.4375

  const netChangePace = getNetChangePace(snapshots, options)
  const avgDailyNetChange = netChangePace?.avgDaily ?? null
  const paceDailyDelta = avgDailyNetChange != null && requiredDaily != null ? avgDailyNetChange - requiredDaily : null
  const isOnTrack = isComplete ? true : paceDailyDelta == null ? null : paceDailyDelta >= 0

  let projectedDate: string | null = null
  if (!isComplete && latestDate && avgDailyNetChange != null && avgDailyNetChange > 0) {
    const daysToGoal = Math.ceil(remaining / avgDailyNetChange)
    projectedDate = addDaysToDateKey(activeDate, daysToGoal)
  }

  let projectedNetAtTargetDate: number | null = null
  if (latestDate && avgDailyNetChange != null) {
    const daysToTarget = diffDateDays(activeDate, goal.targetDate)
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
