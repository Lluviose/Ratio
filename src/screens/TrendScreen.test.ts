import { describe, expect, it, vi } from 'vitest'
import { withGoalTrendLines } from './trendGoalLines'
import type { SavingsGoal, SavingsGoalSummary } from '../lib/savingsGoal'

const goal: SavingsGoal = {
  targetAmount: 200000,
  targetDate: '2026-12-31',
  startDate: '2026-01-01',
  startNetWorth: 100000,
  createdAt: '2026-01-01T00:00:00.000Z',
}

const cadence = {
  stepDays: 30,
  maxPoints: 4,
  horizonDays: 120,
}

describe('withGoalTrendLines', () => {
  it('anchors projected net worth at the latest recorded point when the forecast starts later', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-01T12:00:00.000Z'))

    const summary: SavingsGoalSummary = {
      latestDate: '2026-05-01',
      currentNetWorth: 120000,
      targetAmount: goal.targetAmount,
      targetDate: goal.targetDate,
      startDate: goal.startDate,
      startNetWorth: goal.startNetWorth,
      currentPeriodStartDate: '2026-06-01',
      currentPeriodStartNetWorth: 120000,
      currentPeriodActual: 0,
      currentPeriodTarget: 8333.33,
      currentPeriodRemaining: 8333.33,
      currentPeriodDelta: -8333.33,
      currentPeriodEndDate: '2026-07-01',
      currentPeriodIsOnTrack: false,
      progress: 0.6,
      remaining: 80000,
      daysLeft: 213,
      requiredDaily: 375.59,
      requiredMonthly: 11429.06,
      avgDailyNetChange: 1000,
      avgDailyNetChangeMethod: 'monthly-close',
      avgDailyNetChangeSampleDays: 90,
      avgDailyNetChangeSnapshotCount: 4,
      projectedDate: '2026-08-20',
      projectedNetAtTargetDate: 333000,
      targetValueAtLatest: 133000,
      targetDeltaAtLatest: -13000,
      paceDailyDelta: 624.41,
      isComplete: false,
      isDueToday: false,
      isPastDue: false,
      isOnTrack: true,
    }

    const points = withGoalTrendLines([
      {
        date: '5月',
        dateKey: '2026-05-01',
        idx: 0,
        net: 120000,
        debt: 0,
        cash: 120000,
        invest: 0,
        fixed: 0,
        receivable: 0,
      },
    ], goal, summary, cadence)

    const latestPoint = points.find((point) => point.dateKey === '2026-05-01')
    const forecastStartPoint = points.find((point) => point.dateKey === '2026-06-01')

    expect(latestPoint?.projectedNet).toBe(120000)
    expect(forecastStartPoint?.projectedNet).toBe(120000)
    expect(points.some((point) => point.projectedNet != null && point.dateKey > '2026-06-01')).toBe(true)

    vi.useRealTimers()
  })
})
