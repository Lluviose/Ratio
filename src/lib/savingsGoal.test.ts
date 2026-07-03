import { describe, expect, it, vi } from 'vitest'
import {
  addDaysToDateKey,
  coerceSavingsGoal,
  coerceSavingsPaceAlgorithm,
  getAverageDailyNetChange,
  getGoalComparisonValue,
  getLinearGoalValue,
  getNetChangePace,
  getSavingsGoalSummary,
  getSavingsProjectionStartDate,
  todayDateKey,
  type SavingsGoal,
} from './savingsGoal'
import type { Snapshot } from './snapshots'

const goal: SavingsGoal = {
  targetAmount: 200000,
  targetDate: '2026-12-31',
  startDate: '2026-01-01',
  startNetWorth: 100000,
  createdAt: '2026-01-01T00:00:00.000Z',
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

/**
 * Current-period assertions depend on "today" (getActiveSavingsGoalDate falls
 * back to the wall clock when the latest snapshot is in the past), so tests
 * with fixed June-2026 fixtures must pin the clock or they break as the real
 * calendar moves on.
 */
function withFakeNow<T>(iso: string, run: () => T): T {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(iso))
  try {
    return run()
  } finally {
    vi.useRealTimers()
  }
}

describe('savingsGoal', () => {
  it('coerces valid saved goals and rejects invalid goals', () => {
    expect(coerceSavingsGoal({ ...goal, targetAmount: 12345.678 })?.targetAmount).toBe(12345.68)
    expect(coerceSavingsGoal({ ...goal, targetAmount: 0 })).toBeNull()
    expect(coerceSavingsGoal({ ...goal, targetDate: 'bad-date' })).toBeNull()
  })

  it('interpolates the target path between start and target dates', () => {
    expect(getLinearGoalValue(goal, '2026-01-01')).toBe(100000)
    expect(getLinearGoalValue(goal, '2026-12-31')).toBe(200000)
    expect(getLinearGoalValue(goal, '2025-12-31')).toBeNull()
    expect(getGoalComparisonValue(goal, '2025-12-31')).toBe(100000)
    expect(getGoalComparisonValue(goal, '2027-01-31')).toBe(200000)
  })

  it('summarizes progress from current net worth and projected completion from snapshots', () => {
    const today = todayDateKey()
    const startDate = addDaysToDateKey(today, -30)!
    const targetDate = addDaysToDateKey(today, 365)!
    const summaryGoal = { ...goal, startDate, targetDate }
    const summary = getSavingsGoalSummary(summaryGoal, [
      snapshot(startDate, 100000),
      snapshot(today, 130000),
    ])

    expect(summary?.progress).toBe(0.65)
    expect(summary?.remaining).toBe(70000)
    expect(summary?.avgDailyNetChange).toBe(1000)
    expect(summary?.avgDailyNetChangeMethod).toBe('monthly-close')
    expect(summary?.projectedDate).toBe(addDaysToDateKey(today, 70))
    expect(summary?.targetValueAtLatest).toBeCloseTo(107594.94)
    expect(summary?.targetDeltaAtLatest).toBeCloseTo(22405.06)
  })

  it('counts existing net worth toward goal progress', () => {
    const summary = getSavingsGoalSummary(goal, [snapshot(goal.startDate, goal.startNetWorth)])

    expect(summary?.progress).toBe(0.5)
    expect(summary?.remaining).toBe(100000)
    expect(summary?.isComplete).toBe(false)
  })

  it('compares current period savings against the fixed goal path increment', () => {
    const summary = withFakeNow('2026-06-15T12:00:00.000Z', () => getSavingsGoalSummary(
      {
        ...goal,
        targetAmount: 124000,
        startDate: '2026-01-01',
        startNetWorth: 100000,
        targetDate: '2026-12-31',
      },
      [
        snapshot('2026-01-01', 100000),
        snapshot('2026-06-01', 110000),
        snapshot('2026-06-15', 110200),
      ],
      { monthStartDay: 1 },
    ))

    expect(summary?.currentPeriodStartDate).toBe('2026-06-01')
    expect(summary?.currentPeriodEndDate).toBe('2026-07-01')
    expect(summary?.currentPeriodActual).toBe(200)
    expect(summary?.currentPeriodTarget).toBeCloseTo(1934.07)
    expect(summary?.currentPeriodRemaining).toBeCloseTo(1734.07)
    expect(summary?.currentPeriodDelta).toBeCloseTo(-1734.07)
    expect(summary?.currentPeriodIsOnTrack).toBe(false)
  })

  it('uses the configured month start day for current savings periods before the boundary', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-07T12:00:00.000Z'))

    const summary = getSavingsGoalSummary(
      {
        ...goal,
        targetAmount: 124000,
        startDate: '2026-01-01',
        startNetWorth: 100000,
        targetDate: '2026-12-31',
      },
      [
        snapshot('2026-05-08', 108000),
        snapshot('2026-06-05', 110200),
      ],
      { monthStartDay: 8 },
    )

    vi.useRealTimers()

    expect(summary?.currentPeriodStartDate).toBe('2026-05-08')
    expect(summary?.currentPeriodEndDate).toBe('2026-06-08')
    expect(summary?.currentPeriodStartNetWorth).toBe(108000)
    expect(summary?.currentPeriodActual).toBe(2200)
    expect(summary?.currentPeriodTargetNetWorth).toBeCloseTo(110417.58)
    expect(summary?.currentPeriodTarget).toBeCloseTo(2417.58)
    expect(summary?.currentPeriodRemaining).toBeCloseTo(217.58)
  })

  it('starts a new savings period on the configured month start day', () => {
    const summary = withFakeNow('2026-06-10T12:00:00.000Z', () => getSavingsGoalSummary(
      {
        ...goal,
        targetAmount: 124000,
        startDate: '2026-01-01',
        startNetWorth: 100000,
        targetDate: '2026-12-31',
      },
      [
        snapshot('2026-05-08', 108000),
        snapshot('2026-06-05', 110200),
        snapshot('2026-06-08', 110500),
      ],
      { monthStartDay: 8 },
    ))

    expect(summary?.currentPeriodStartDate).toBe('2026-06-08')
    expect(summary?.currentPeriodEndDate).toBe('2026-07-08')
    expect(summary?.currentPeriodStartNetWorth).toBe(110500)
    expect(summary?.currentPeriodActual).toBe(0)
    expect(summary?.currentPeriodTargetNetWorth).toBeCloseTo(112395.6)
    expect(summary?.currentPeriodTarget).toBeCloseTo(1895.6)
  })

  it('does not raise the current period target when current net worth increases', () => {
    const summaryGoal = {
      ...goal,
      targetAmount: 124000,
      startDate: '2026-01-01',
      startNetWorth: 100000,
      targetDate: '2026-12-31',
    }
    const low = withFakeNow('2026-06-15T12:00:00.000Z', () => getSavingsGoalSummary(summaryGoal, [
      snapshot('2026-01-01', 100000),
      snapshot('2026-06-01', 110000),
      snapshot('2026-06-15', 110200),
    ], { monthStartDay: 1 }))
    const high = withFakeNow('2026-06-15T12:00:00.000Z', () => getSavingsGoalSummary(summaryGoal, [
      snapshot('2026-01-01', 100000),
      snapshot('2026-06-01', 110000),
      snapshot('2026-06-15', 112000),
    ], { monthStartDay: 1 }))

    expect(low?.currentPeriodTarget).toBe(high?.currentPeriodTarget)
    expect(high?.currentPeriodRemaining).toBeCloseTo(0)
    expect(high?.currentPeriodDelta).toBeCloseTo(65.93)
    expect(high?.currentPeriodIsOnTrack).toBe(true)
  })

  it('uses the saved goal start net worth when the first period has older snapshots', () => {
    const summary = withFakeNow('2026-06-20T12:00:00.000Z', () => getSavingsGoalSummary(
      {
        ...goal,
        targetAmount: 124000,
        startDate: '2026-06-15',
        startNetWorth: 110000,
        targetDate: '2026-12-31',
      },
      [
        snapshot('2026-06-01', 90000),
        snapshot('2026-06-20', 110200),
      ],
      { monthStartDay: 1 },
    ))

    expect(summary?.currentPeriodStartDate).toBe('2026-06-15')
    expect(summary?.currentPeriodStartNetWorth).toBe(110000)
    expect(summary?.currentPeriodActual).toBe(200)
    expect(summary?.currentPeriodTarget).toBeCloseTo(1125.63)
    expect(summary?.currentPeriodRemaining).toBeCloseTo(925.63)
    expect(summary?.currentPeriodDelta).toBeCloseTo(-925.63)
  })

  it('keeps an ahead-of-path period on track even if net worth dips slightly', () => {
    const summary = withFakeNow('2026-06-15T12:00:00.000Z', () => getSavingsGoalSummary(
      {
        ...goal,
        targetAmount: 124000,
        startDate: '2026-01-01',
        startNetWorth: 100000,
        targetDate: '2026-12-31',
      },
      [
        snapshot('2026-01-01', 100000),
        snapshot('2026-06-01', 120000),
        snapshot('2026-06-15', 119000),
      ],
      { monthStartDay: 1 },
    ))

    expect(summary?.currentPeriodActual).toBe(-1000)
    expect(summary?.currentPeriodTarget).toBe(0)
    expect(summary?.currentPeriodRemaining).toBe(0)
    expect(summary?.currentPeriodDelta).toBeCloseTo(7065.93)
    expect(summary?.currentPeriodIsOnTrack).toBe(true)
  })

  it('projects from the latest snapshot date instead of today', () => {
    const today = todayDateKey()
    const startDate = addDaysToDateKey(today, -90)!
    const latestDate = addDaysToDateKey(today, -60)!
    const targetDate = addDaysToDateKey(today, 365)!
    const summaryGoal = { ...goal, startDate, targetDate }
    const summary = getSavingsGoalSummary(summaryGoal, [
      snapshot(startDate, 100000),
      snapshot(latestDate, 130000),
    ])

    expect(summary?.avgDailyNetChange).toBe(1000)
    expect(summary?.projectedDate).toBe(addDaysToDateKey(latestDate, 70))
  })

  it('uses the latest snapshot as the shared projection start date', () => {
    const today = todayDateKey()
    const latestDate = addDaysToDateKey(today, -60)!

    expect(getSavingsProjectionStartDate(latestDate)).toBe(latestDate)
    expect(getSavingsProjectionStartDate(null)).toBe(today)
  })

  it('does not turn a short concentrated update into a daily pace', () => {
    expect(getAverageDailyNetChange([
      snapshot('2026-01-30', 100000),
      snapshot('2026-01-31', 130000),
    ])).toBeNull()
  })

  it('uses monthly closing snapshots for sparse monthly records', () => {
    const pace = getNetChangePace([
      snapshot('2026-01-31', 100000),
      snapshot('2026-02-28', 130000),
      snapshot('2026-03-31', 150000),
    ])

    expect(pace?.method).toBe('monthly-close')
    expect(pace?.sampleDays).toBe(59)
    expect(pace?.snapshotCount).toBe(3)
    expect(pace?.avgDaily).toBeCloseTo(847.46)
  })

  it('can manually use the recent snapshot window for dense records', () => {
    const pace = getNetChangePace([
      snapshot('2026-01-01', 100000),
      snapshot('2026-01-04', 103000),
      snapshot('2026-01-08', 108000),
      snapshot('2026-01-11', 111000),
    ], { algorithm: 'recent-window' })

    expect(pace?.method).toBe('recent-window')
    expect(pace?.sampleDays).toBe(10)
    expect(pace?.snapshotCount).toBe(4)
    expect(pace?.avgDaily).toBe(1100)
  })

  it('can manually use the long window instead of recent records', () => {
    const pace = getNetChangePace([
      snapshot('2025-01-01', 100000),
      snapshot('2026-01-01', 140000),
      snapshot('2026-06-01', 160000),
    ], { algorithm: 'long-window' })

    expect(pace?.method).toBe('long-window')
    expect(pace?.startDate).toBe('2025-01-01')
    expect(pace?.endDate).toBe('2026-06-01')
    expect(pace?.avgDaily).toBeCloseTo(116.28)
  })

  it('can manually smooth volatile monthly records with the median monthly pace', () => {
    const pace = getNetChangePace([
      snapshot('2026-01-31', 100000),
      snapshot('2026-02-28', 120000),
      snapshot('2026-03-31', 90000),
      snapshot('2026-04-30', 125000),
      snapshot('2026-05-31', 130000),
    ], { algorithm: 'monthly-smoothed' })

    expect(pace?.method).toBe('monthly-smoothed')
    expect(pace?.snapshotCount).toBe(5)
    expect(pace?.sampleDays).toBe(120)
    expect(pace?.avgDaily).toBeCloseTo(437.79)
  })

  it('requires enough month intervals for manual smoothing', () => {
    expect(getNetChangePace([
      snapshot('2026-01-31', 100000),
      snapshot('2026-02-28', 120000),
      snapshot('2026-03-31', 90000),
    ], { algorithm: 'monthly-smoothed' })).toBeNull()
  })

  it('smart mode smooths large month-to-month swings', () => {
    const pace = getNetChangePace([
      snapshot('2026-01-31', 100000),
      snapshot('2026-02-28', 120000),
      snapshot('2026-03-31', 90000),
      snapshot('2026-04-30', 125000),
      snapshot('2026-05-31', 130000),
      snapshot('2026-06-30', 170000),
      snapshot('2026-07-31', 172000),
    ])

    expect(pace?.method).toBe('monthly-smoothed')
    expect(pace?.avgDaily).toBeCloseTo(161.29)
  })

  it('smart mode waits for more monthly history before smoothing', () => {
    const pace = getNetChangePace([
      snapshot('2026-01-31', 100000),
      snapshot('2026-02-28', 120000),
      snapshot('2026-03-31', 90000),
      snapshot('2026-04-30', 125000),
      snapshot('2026-05-31', 130000),
    ])

    expect(pace?.method).toBe('monthly-close')
    expect(pace?.avgDaily).toBe(250)
  })

  it('keeps short sparse samples unestimated in smart mode', () => {
    expect(getNetChangePace([
      snapshot('2026-01-01', 100000),
      snapshot('2026-01-15', 130000),
    ])).toBeNull()
  })

  it('coerces invalid pace algorithm settings back to smart', () => {
    expect(coerceSavingsPaceAlgorithm('monthly-smoothed')).toBe('monthly-smoothed')
    expect(coerceSavingsPaceAlgorithm('bad')).toBe('smart')
    expect(getNetChangePace([
      snapshot('2026-01-01', 100000),
      snapshot('2026-01-31', 130000),
    ], { algorithm: 'bad' as never })?.method).toBe('recent-window')
  })

  it('prefers monthly pace when record gaps mix clusters and long pauses', () => {
    const pace = getNetChangePace([
      snapshot('2026-01-01', 100000),
      snapshot('2026-01-02', 101000),
      snapshot('2026-01-03', 102000),
      snapshot('2026-02-10', 120000),
      snapshot('2026-02-11', 121000),
      snapshot('2026-03-10', 150000),
    ])

    expect(pace?.method).toBe('monthly-close')
    expect(pace?.startDate).toBe('2026-01-03')
    expect(pace?.endDate).toBe('2026-03-10')
    expect(pace?.sampleDays).toBe(66)
    expect(pace?.avgDaily).toBeCloseTo(727.27)
  })

  it('reuses an injected precomputed pace instead of recomputing', () => {
    const today = todayDateKey()
    const startDate = addDaysToDateKey(today, -30)!
    const targetDate = addDaysToDateKey(today, 365)!
    const summaryGoal = { ...goal, startDate, targetDate }
    const snapshots = [snapshot(startDate, 100000), snapshot(today, 130000)]

    const pace = getNetChangePace(snapshots)
    expect(pace).not.toBeNull()

    const summary = getSavingsGoalSummary(summaryGoal, snapshots, { pace })
    expect(summary?.avgDailyNetChange).toBe(pace?.avgDaily)
    expect(summary?.avgDailyNetChangeMethod).toBe(pace?.method)
    expect(summary?.avgDailyNetChangeSampleDays).toBe(pace?.sampleDays)

    // Same inputs, computed internally, must agree with the injected result.
    const recomputed = getSavingsGoalSummary(summaryGoal, snapshots, {})
    expect(recomputed?.projectedDate).toBe(summary?.projectedDate)

    // pace: null means "computed elsewhere and absent" — no re-estimation.
    const withoutPace = getSavingsGoalSummary(summaryGoal, snapshots, { pace: null })
    expect(withoutPace?.avgDailyNetChange).toBeNull()
    expect(withoutPace?.projectedDate).toBeNull()
  })

  it('keeps pace results identical for pre-sorted and shuffled snapshot input', () => {
    const snapshots = [
      snapshot('2026-01-31', 100000),
      snapshot('2026-02-28', 130000),
      snapshot('2026-03-31', 150000),
    ]
    const shuffled = [snapshots[2], snapshots[0], snapshots[1]]

    expect(getNetChangePace(shuffled)).toEqual(getNetChangePace(snapshots))
  })

  it('marks unfinished goals due today or past due', () => {
    const today = todayDateKey()
    const yesterday = addDaysToDateKey(today, -1)!

    expect(getSavingsGoalSummary({ ...goal, targetDate: today }, [snapshot(today, 120000)])?.isDueToday).toBe(true)
    expect(getSavingsGoalSummary({ ...goal, targetDate: yesterday }, [snapshot(today, 120000)])?.isPastDue).toBe(true)
    expect(getSavingsGoalSummary({ ...goal, targetDate: yesterday }, [snapshot(today, 220000)])?.isPastDue).toBe(false)
  })
})
