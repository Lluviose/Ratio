import { describe, expect, it, vi } from 'vitest'
import { withGoalTrendLines } from './trendGoalLines'
import { buildTrendView } from './trendView'
import type { SavingsGoal, SavingsGoalSummary } from '../lib/savingsGoal'
import type { Snapshot } from '../lib/snapshots'

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

function snapshot(date: string, net: number): Snapshot {
  return {
    date,
    net,
    debt: 0,
    cash: net,
    invest: 0,
    fixed: 0,
    receivable: 0,
  }
}

describe('buildTrendView', () => {
  it('keeps the latest snapshot visible after monthly sampling', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-04T12:00:00.000Z'))

    const view = buildTrendView([
      snapshot('2026-01-31', 100000),
      snapshot('2026-02-28', 120000),
      snapshot('2026-03-31', 110000),
      snapshot('2026-04-30', 125000),
      snapshot('2026-06-04', 9902),
    ], '1y', 8)

    expect(view.selected.map((s) => s.date)).toContain('2026-06-04')
    expect(view.points.at(-1)?.dateKey).toBe('2026-06-04')
    expect(view.points.at(-1)?.net).toBe(9902)
    expect(view.points.every((point) => typeof point.dateValue === 'number')).toBe(true)

    vi.useRealTimers()
  })
})

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
      currentPeriodTargetNetWorth: 128333.33,
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

    expect(latestPoint?.projectedBridgeNet).toBe(120000)
    expect(latestPoint?.projectedNet).toBeNull()
    expect(forecastStartPoint?.net).toBeUndefined()
    expect(forecastStartPoint?.debt).toBeUndefined()
    expect(forecastStartPoint?.projectedBridgeNet).toBe(120000)
    expect(forecastStartPoint?.projectedNet).toBe(120000)
    expect(points.some((point) => point.projectedNet != null && point.dateKey > '2026-06-01')).toBe(true)

    vi.useRealTimers()
  })

  it('starts projected net worth at the latest point when the latest record is current', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-01T12:00:00.000Z'))

    const summary: SavingsGoalSummary = {
      latestDate: '2026-06-01',
      currentNetWorth: 120000,
      targetAmount: goal.targetAmount,
      targetDate: goal.targetDate,
      startDate: goal.startDate,
      startNetWorth: goal.startNetWorth,
      currentPeriodStartDate: '2026-06-01',
      currentPeriodStartNetWorth: 120000,
      currentPeriodActual: 0,
      currentPeriodTargetNetWorth: 128333.33,
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
        date: '6月',
        dateKey: '2026-06-01',
        idx: 0,
        net: 120000,
        debt: 0,
        cash: 120000,
        invest: 0,
        fixed: 0,
        receivable: 0,
      },
    ], goal, summary, cadence)

    const latestPoint = points.find((point) => point.dateKey === '2026-06-01')

    expect(latestPoint?.projectedBridgeNet).toBeNull()
    expect(latestPoint?.projectedNet).toBe(120000)
    expect(points.some((point) => point.projectedNet != null && point.dateKey > '2026-06-01')).toBe(true)

    vi.useRealTimers()
  })

  it('bridges from the last visible recorded point when monthly sampling hides the latest record', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-04T12:00:00.000Z'))

    const summary: SavingsGoalSummary = {
      latestDate: '2026-06-04',
      currentNetWorth: 9902,
      targetAmount: goal.targetAmount,
      targetDate: goal.targetDate,
      startDate: goal.startDate,
      startNetWorth: goal.startNetWorth,
      currentPeriodStartDate: '2026-06-01',
      currentPeriodStartNetWorth: 9902,
      currentPeriodActual: 0,
      currentPeriodTargetNetWorth: 128333.33,
      currentPeriodTarget: 118431.33,
      currentPeriodRemaining: 118431.33,
      currentPeriodDelta: -118431.33,
      currentPeriodEndDate: '2026-07-01',
      currentPeriodIsOnTrack: false,
      progress: 0.05,
      remaining: 190098,
      daysLeft: 210,
      requiredDaily: 905.23,
      requiredMonthly: 27550.31,
      avgDailyNetChange: 100,
      avgDailyNetChangeMethod: 'monthly-smoothed',
      avgDailyNetChangeSampleDays: 148,
      avgDailyNetChangeSnapshotCount: 6,
      projectedDate: '2028-12-25',
      projectedNetAtTargetDate: 31000,
      targetValueAtLatest: 140000,
      targetDeltaAtLatest: -130098,
      paceDailyDelta: -805.23,
      isComplete: false,
      isDueToday: false,
      isPastDue: false,
      isOnTrack: false,
    }

    const points = withGoalTrendLines([
      {
        date: '4月',
        dateKey: '2026-04-30',
        dateValue: 20213,
        idx: 0,
        net: 125000,
        debt: 0,
        cash: 125000,
        invest: 0,
        fixed: 0,
        receivable: 0,
      },
    ], goal, summary, cadence)

    const visibleHistoryEnd = points.find((point) => point.dateKey === '2026-04-30')
    const latestPoint = points.find((point) => point.dateKey === '2026-06-04')

    expect(visibleHistoryEnd?.projectedBridgeNet).toBe(125000)
    expect(visibleHistoryEnd?.projectedNet).toBeNull()
    expect(latestPoint?.net).toBeUndefined()
    expect(latestPoint?.debt).toBeUndefined()
    expect(latestPoint?.projectedBridgeNet).toBe(9902)
    expect(latestPoint?.projectedNet).toBe(9902)

    vi.useRealTimers()
  })
})
