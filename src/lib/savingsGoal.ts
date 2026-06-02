import { normalizeMoney } from './money'
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
  projectedDate: string | null
  projectedNetAtTargetDate: number | null
  paceDailyDelta: number | null
  isComplete: boolean
  isOnTrack: boolean | null
}

const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/

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

function pickGrowthWindow(snapshots: Snapshot[], latestDate: string) {
  const sorted = snapshots.slice().sort((a, b) => a.date.localeCompare(b.date))
  if (sorted.length < 2) return []

  const latestDays = dateKeyToUtcDays(latestDate)
  if (latestDays == null) return sorted

  const cutoff = latestDays - 180
  const recent = sorted.filter((s) => {
    const days = dateKeyToUtcDays(s.date)
    return days != null && days >= cutoff
  })

  return recent.length >= 2 ? recent : sorted
}

export function getAverageDailyNetChange(snapshots: Snapshot[]): number | null {
  const latest = latestSnapshot(snapshots)
  if (!latest) return null

  const selected = pickGrowthWindow(snapshots, latest.date)
  if (selected.length < 2) return null

  const first = selected[0]
  const last = selected[selected.length - 1]
  const days = diffDateDays(first.date, last.date)
  if (days == null || days <= 0) return null

  return (last.net - first.net) / days
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

export function getSavingsGoalSummary(goal: SavingsGoal | null, snapshots: Snapshot[]): SavingsGoalSummary | null {
  if (!goal) return null

  const latest = latestSnapshot(snapshots)
  const currentNetWorth = latest ? normalizeMoney(latest.net) : normalizeMoney(goal.startNetWorth)
  const latestDate = latest?.date ?? null

  const totalNeeded = goal.targetAmount - goal.startNetWorth
  const gained = currentNetWorth - goal.startNetWorth
  const rawProgress = totalNeeded <= 0 ? (currentNetWorth >= goal.targetAmount ? 1 : 0) : gained / totalNeeded
  const progress = Math.max(0, Math.min(1, Number.isFinite(rawProgress) ? rawProgress : 0))
  const remaining = Math.max(0, normalizeMoney(goal.targetAmount - currentNetWorth))
  const isComplete = remaining <= 0

  const daysLeftRaw = diffDateDays(todayDateKey(), goal.targetDate)
  const daysLeft = daysLeftRaw == null ? null : Math.max(0, daysLeftRaw)
  const requiredDaily = !isComplete && daysLeft && daysLeft > 0 ? remaining / daysLeft : null
  const requiredMonthly = requiredDaily == null ? null : requiredDaily * 30.4375

  const avgDailyNetChange = getAverageDailyNetChange(snapshots)
  const paceDailyDelta = avgDailyNetChange != null && requiredDaily != null ? avgDailyNetChange - requiredDaily : null
  const isOnTrack = isComplete ? true : paceDailyDelta == null ? null : paceDailyDelta >= 0

  let projectedDate: string | null = null
  if (!isComplete && latestDate && avgDailyNetChange != null && avgDailyNetChange > 0) {
    const daysToGoal = Math.ceil(remaining / avgDailyNetChange)
    projectedDate = addDaysToDateKey(latestDate, daysToGoal)
  }

  let projectedNetAtTargetDate: number | null = null
  if (latestDate && avgDailyNetChange != null) {
    const daysToTarget = diffDateDays(latestDate, goal.targetDate)
    if (daysToTarget != null && daysToTarget >= 0) {
      projectedNetAtTargetDate = normalizeMoney(currentNetWorth + avgDailyNetChange * daysToTarget)
    }
  }

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
    projectedDate,
    projectedNetAtTargetDate,
    paceDailyDelta: paceDailyDelta == null ? null : normalizeMoney(paceDailyDelta),
    isComplete,
    isOnTrack,
  }
}
