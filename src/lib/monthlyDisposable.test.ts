import { describe, expect, it } from 'vitest'
import {
  buildMonthlyDisposablePlan,
  coerceMonthlyEstimatedIncome,
} from './monthlyDisposable'
import type { SavingsGoalSummary } from './savingsGoal'

const baseSummary: SavingsGoalSummary = {
  latestDate: '2026-06-15',
  currentNetWorth: 110200,
  targetAmount: 124000,
  targetDate: '2026-12-31',
  startDate: '2026-01-01',
  startNetWorth: 100000,
  currentPeriodStartDate: '2026-06-01',
  currentPeriodStartNetWorth: 110000,
  currentPeriodActual: 200,
  currentPeriodTargetNetWorth: 111934.07,
  currentPeriodTarget: 1934.07,
  currentPeriodRemaining: 1734.07,
  currentPeriodDelta: -1734.07,
  currentPeriodEndDate: '2026-07-01',
  currentPeriodIsOnTrack: false,
  progress: 0.8887,
  remaining: 13800,
  daysLeft: 199,
  requiredDaily: 69.35,
  requiredMonthly: 2110.84,
  avgDailyNetChange: 66.23,
  avgDailyNetChangeMethod: 'monthly-close',
  avgDailyNetChangeSampleDays: 165,
  avgDailyNetChangeSnapshotCount: 6,
  projectedDate: '2027-01-10',
  projectedNetAtTargetDate: 123380,
  targetValueAtLatest: 110900,
  targetDeltaAtLatest: -700,
  paceDailyDelta: -3.12,
  isComplete: false,
  isDueToday: false,
  isPastDue: false,
  isOnTrack: false,
}

function summary(overrides: Partial<SavingsGoalSummary> = {}): SavingsGoalSummary {
  return { ...baseSummary, ...overrides }
}

describe('monthlyDisposable', () => {
  it('coerces monthly estimated income to positive normalized money', () => {
    expect(coerceMonthlyEstimatedIncome(12345.678)).toBe(12345.68)
    expect(coerceMonthlyEstimatedIncome(12000)).toBe(12000)
    expect(coerceMonthlyEstimatedIncome(-1)).toBe(0)
    expect(coerceMonthlyEstimatedIncome(Number.NaN)).toBe(0)
    expect(coerceMonthlyEstimatedIncome('12000')).toBe(0)
  })

  it('subtracts the current period target from estimated monthly income', () => {
    const plan = buildMonthlyDisposablePlan(12000, summary())

    expect(plan.targetSavings).toBe(1934.07)
    expect(plan.targetDisposable).toBe(10065.93)
    expect(plan.currentPeriodRemaining).toBe(1734.07)
    expect(plan.isIncomeShort).toBe(false)
    expect(plan.incomeGap).toBe(0)
    expect(plan.targetSource).toBe('current-period')
  })

  it('marks the income gap when target savings exceed estimated income', () => {
    const plan = buildMonthlyDisposablePlan(1000, summary())

    expect(plan.targetDisposable).toBe(-934.07)
    expect(plan.isIncomeShort).toBe(true)
    expect(plan.incomeGap).toBe(934.07)
  })

  it('sets target savings to zero when the savings goal is complete', () => {
    const plan = buildMonthlyDisposablePlan(
      12000,
      summary({
        currentPeriodTarget: 1934.07,
        currentPeriodRemaining: 1734.07,
        isComplete: true,
        remaining: 0,
      }),
    )

    expect(plan.targetSavings).toBe(0)
    expect(plan.targetDisposable).toBe(12000)
    expect(plan.currentPeriodRemaining).toBe(0)
    expect(plan.targetSource).toBe('complete')
  })

  it('falls back to the overdue remaining gap when there is no current period target', () => {
    const plan = buildMonthlyDisposablePlan(
      6000,
      summary({
        currentPeriodTarget: null,
        currentPeriodRemaining: null,
        currentPeriodTargetNetWorth: null,
        currentPeriodDelta: null,
        currentPeriodEndDate: null,
        currentPeriodIsOnTrack: null,
        isPastDue: true,
        remaining: 4500,
      }),
    )

    expect(plan.targetSavings).toBe(4500)
    expect(plan.targetDisposable).toBe(1500)
    expect(plan.currentPeriodRemaining).toBe(4500)
    expect(plan.targetSource).toBe('past-due')
  })
})
