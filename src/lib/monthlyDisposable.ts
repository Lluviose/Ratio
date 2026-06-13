import { normalizeMoney } from './money'
import type { SavingsGoalSummary } from './savingsGoal'

export const MONTHLY_ESTIMATED_INCOME_KEY = 'ratio.monthlyEstimatedIncome'

export type MonthlyDisposableTargetSource = 'none' | 'current-period' | 'complete' | 'past-due'

export type MonthlyDisposablePlan = {
  estimatedIncome: number
  targetSavings: number | null
  targetDisposable: number | null
  currentPeriodRemaining: number | null
  incomeGap: number | null
  isIncomeShort: boolean | null
  targetSource: MonthlyDisposableTargetSource
}

export function coerceMonthlyEstimatedIncome(value: unknown) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0
  const normalized = normalizeMoney(value)
  return normalized > 0 ? normalized : 0
}

function getTargetSavings(summary: SavingsGoalSummary | null): {
  targetSavings: number | null
  targetSource: MonthlyDisposableTargetSource
} {
  if (!summary) return { targetSavings: null, targetSource: 'none' }
  if (summary.isComplete) return { targetSavings: 0, targetSource: 'complete' }
  if (summary.currentPeriodTarget != null) {
    return {
      targetSavings: Math.max(0, normalizeMoney(summary.currentPeriodTarget)),
      targetSource: 'current-period',
    }
  }
  if (summary.isPastDue || summary.isDueToday) {
    return {
      targetSavings: Math.max(0, normalizeMoney(summary.remaining)),
      targetSource: 'past-due',
    }
  }
  return { targetSavings: null, targetSource: 'none' }
}

export function buildMonthlyDisposablePlan(
  estimatedIncomeValue: number,
  summary: SavingsGoalSummary | null,
): MonthlyDisposablePlan {
  const estimatedIncome = coerceMonthlyEstimatedIncome(estimatedIncomeValue)
  const { targetSavings, targetSource } = getTargetSavings(summary)
  const targetDisposable = targetSavings == null ? null : normalizeMoney(estimatedIncome - targetSavings)
  const isIncomeShort = targetDisposable == null ? null : targetDisposable < 0
  const incomeGap = targetDisposable == null ? null : Math.max(0, normalizeMoney(Math.abs(Math.min(0, targetDisposable))))
  const currentPeriodRemaining = !summary
    ? null
    : summary.isComplete
      ? 0
      : summary.currentPeriodRemaining != null
        ? Math.max(0, normalizeMoney(summary.currentPeriodRemaining))
        : targetSource === 'past-due'
          ? Math.max(0, normalizeMoney(summary.remaining))
          : null

  return {
    estimatedIncome,
    targetSavings,
    targetDisposable,
    currentPeriodRemaining,
    incomeGap,
    isIncomeShort,
    targetSource,
  }
}
