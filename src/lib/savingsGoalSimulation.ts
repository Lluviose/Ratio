import {
  addDaysToDateKey,
  diffDateDays,
  getSavingsProjectionStartDate,
  type SavingsGoalSummary,
} from './savingsGoal'
import { normalizeMoney } from './money'

const DAYS_PER_MONTH = 30.4375

export type SavingsSimulationPlan = {
  baseDate: string
  baseDaily: number
  simulatedDaily: number
  baseMonthlyPace: number
  simulatedMonthlyPace: number
  remainingAfterOneTime: number
  simulatedDate: string | null
  daysToTarget: number | null
  simulatedNetAtTarget: number | null
  targetGap: number | null
  extraMonthlyNeededForTarget: number | null
}

export function buildSavingsSimulationPlan(summary: SavingsGoalSummary, monthlyExtra: number, oneTime: number): SavingsSimulationPlan {
  const baseDate = getSavingsProjectionStartDate(summary.latestDate)
  const baseDaily = normalizeMoney(summary.avgDailyNetChange ?? 0)
  const simulatedDaily = normalizeMoney(baseDaily + monthlyExtra / DAYS_PER_MONTH)
  const baseMonthlyPace = normalizeMoney(baseDaily * DAYS_PER_MONTH)
  const simulatedMonthlyPace = normalizeMoney(simulatedDaily * DAYS_PER_MONTH)
  const remainingAfterOneTime = Math.max(0, normalizeMoney(summary.targetAmount - summary.currentNetWorth - oneTime))
  const simulatedDate = remainingAfterOneTime <= 0
    ? baseDate
    : simulatedDaily > 0
      ? addDaysToDateKey(baseDate, Math.ceil(remainingAfterOneTime / simulatedDaily))
      : null
  const daysToTarget = diffDateDays(baseDate, summary.targetDate)
  const simulatedNetAtTarget = daysToTarget == null || daysToTarget < 0
    ? null
    : normalizeMoney(summary.currentNetWorth + oneTime + simulatedDaily * daysToTarget)
  const targetGap = simulatedNetAtTarget == null ? null : normalizeMoney(simulatedNetAtTarget - summary.targetAmount)
  const extraMonthlyNeededForTarget = targetGap == null
    ? null
    : targetGap >= 0
      ? 0
      : daysToTarget != null && daysToTarget > 0
        ? normalizeMoney((Math.abs(targetGap) / daysToTarget) * DAYS_PER_MONTH)
        : null

  return {
    baseDate,
    baseDaily,
    simulatedDaily,
    baseMonthlyPace,
    simulatedMonthlyPace,
    remainingAfterOneTime,
    simulatedDate,
    daysToTarget,
    simulatedNetAtTarget,
    targetGap,
    extraMonthlyNeededForTarget,
  }
}
