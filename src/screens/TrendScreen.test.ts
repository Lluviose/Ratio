import { describe, expect, it, vi } from 'vitest'
import { withGoalTrendLines } from './trendGoalLines'
import { buildTrendChartDerived, buildTrendView, type RangeId } from './trendView'
import { getLinearGoalValue, getSavingsGoalSummary, type SavingsGoal, type SavingsGoalSummary } from '../lib/savingsGoal'
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

  it('sorts monthly snapshots before sampling', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-05T12:00:00.000Z'))

    const view = buildTrendView([
      snapshot('2026-06-05', 120000),
      snapshot('2026-04-07', 100000),
      snapshot('2026-05-07', 110000),
    ], '6m', 8)

    expect(view.points.map((point) => point.dateKey)).toEqual([
      '2026-04-07',
      '2026-05-07',
      '2026-06-05',
    ])

    vi.useRealTimers()
  })

  it('groups monthly trend points by the configured month start day', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-05T12:00:00.000Z'))

    const view = buildTrendView([
      snapshot('2026-04-07', 100000),
      snapshot('2026-05-07', 110000),
      snapshot('2026-05-08', 111000),
      snapshot('2026-06-05', 120000),
    ], '6m', 8)

    expect(view.points.map((point) => [point.dateKey, point.date])).toEqual([
      ['2026-04-07', '3月'],
      ['2026-05-07', '4月'],
      ['2026-06-05', '5月'],
    ])
    expect(view.selected.map((s) => s.date)).toContain('2026-06-05')

    vi.useRealTimers()
  })

  it('cuts monthly trend ranges by business month instead of calendar date', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-05T12:00:00.000Z'))

    const view = buildTrendView([
      snapshot('2025-12-07', 90000),
      snapshot('2025-12-08', 91000),
      snapshot('2026-01-07', 92000),
      snapshot('2026-02-07', 93000),
      snapshot('2026-03-07', 94000),
      snapshot('2026-04-07', 95000),
      snapshot('2026-05-07', 96000),
      snapshot('2026-06-05', 97000),
    ], '6m', 8)

    expect(view.points.map((point) => point.dateKey)).toEqual([
      '2026-01-07',
      '2026-02-07',
      '2026-03-07',
      '2026-04-07',
      '2026-05-07',
      '2026-06-05',
    ])
    expect(view.points.map((point) => point.date)).toEqual([
      '2025/12',
      '2026/1',
      '2026/2',
      '2026/3',
      '2026/4',
      '2026/5',
    ])
    expect(view.points.some((point) => point.dateKey === '2025-12-07')).toBe(false)

    vi.useRealTimers()
  })

  it.each(['30d', '6m', '1y'] satisfies RangeId[])(
    'keeps real records around a synthetic goal start in %s data',
    (range) => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-06-05T12:00:00.000Z'))

      const snapshots = [
        snapshot('2026-04-07', 100000),
        snapshot('2026-05-07', 110000),
        snapshot('2026-06-05', 120000),
      ]
      const goalStartingAfterClose = {
        ...goal,
        startDate: '2026-05-08',
        startNetWorth: 110000,
      }
      const view = buildTrendView(snapshots, range, 8)
      const summary = getSavingsGoalSummary(goalStartingAfterClose, snapshots, { monthStartDay: 8 })
      const points = withGoalTrendLines(view.points, goalStartingAfterClose, summary, view.futureCadence, (dateKey) => dateKey, view.clipStartDate)
      const dates = points.map((point) => point.dateKey)

      expect(points.find((point) => point.dateKey === '2026-05-07')?.net).toBe(110000)
      expect(points.find((point) => point.dateKey === '2026-05-08')?.net).toBeUndefined()
      expect(points.find((point) => point.dateKey === '2026-06-05')?.net).toBe(120000)
      expect(dates.indexOf('2026-05-07')).toBeLessThan(dates.indexOf('2026-05-08'))
      expect(dates.indexOf('2026-05-08')).toBeLessThan(dates.indexOf('2026-06-05'))

      vi.useRealTimers()
    },
  )
})

describe('buildTrendChartDerived', () => {
  it('derives forecast bounds, projection bridge state, and goal date context', () => {
    const goalSummary = {
      avgDailyNetChange: 100,
      latestDate: '2026-06-05',
      startDate: '2026-01-01',
      targetDate: '2026-12-31',
      projectedDate: '2027-01-15',
    }
    const viewPoints = [
      {
        date: '6/5',
        dateKey: '2026-06-05',
        dateValue: 20609,
        idx: 0,
        net: 100000,
        debt: 0,
        cash: 100000,
        invest: 0,
        fixed: 0,
        receivable: 0,
      },
    ]
    const goalTrendPoints = [
      ...viewPoints,
      {
        date: '6/20',
        dateKey: '2026-06-20',
        dateValue: 20624,
        idx: -1,
        net: undefined,
        debt: undefined,
        cash: undefined,
        invest: undefined,
        fixed: undefined,
        receivable: undefined,
        projectedBridgeNet: 100000,
      },
      {
        date: '7/5',
        dateKey: '2026-07-05',
        dateValue: 20639,
        idx: -1,
        net: undefined,
        debt: undefined,
        cash: undefined,
        invest: undefined,
        fixed: undefined,
        receivable: undefined,
        projectedNet: 103000,
      },
    ]

    const derived = buildTrendChartDerived({
      mode: 'netDebt',
      viewPoints,
      goalTrendPoints,
      goalSummary,
      getSavingsProjectionStartDate: () => '2026-06-20',
    })

    expect(derived.data).toBe(goalTrendPoints)
    expect(derived.forecastStartDate).toBe('2026-06-20')
    expect(derived.forecastStartValue).toBe(20624)
    expect(derived.forecastArea).toEqual({ start: 20624, end: 20639 })
    expect(derived.hasProjectionBridge).toBe(true)
    expect(derived.showYearInData).toBe(false)
    expect(derived.goalDateContext).toEqual(['2026-01-01', '2026-06-05', '2026-12-31', '2027-01-15'])
  })

  it('uses raw view points and disables forecast metadata outside net debt mode', () => {
    const viewPoints = [
      {
        date: '6/5',
        dateKey: '2026-06-05',
        idx: 0,
        net: 100000,
        debt: 0,
        cash: 100000,
        invest: 0,
        fixed: 0,
        receivable: 0,
      },
    ]
    const derived = buildTrendChartDerived({
      mode: 'cashInvest',
      viewPoints,
      goalTrendPoints: [],
      goalSummary: null,
      getSavingsProjectionStartDate: () => '2026-06-20',
    })

    expect(derived.data).toBe(viewPoints)
    expect(derived.forecastStartDate).toBeNull()
    expect(derived.forecastStartValue).toBeNull()
    expect(derived.forecastArea).toBeNull()
    expect(derived.hasProjectionBridge).toBe(false)
    expect(derived.goalDateContext).toEqual([])
  })
})

describe('withGoalTrendLines', () => {
  it('clips an old goal start to the 30 day range cutoff', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-05T12:00:00.000Z'))

    const snapshots = [
      snapshot('2026-01-01', 100000),
      snapshot('2026-05-20', 115000),
      snapshot('2026-06-05', 120000),
    ]
    const view = buildTrendView(snapshots, '30d', 8)
    const summary = getSavingsGoalSummary(goal, snapshots, { monthStartDay: 8 })
    const points = withGoalTrendLines(view.points, goal, summary, view.futureCadence, (dateKey) => dateKey, view.clipStartDate)
    const dates = points.map((point) => point.dateKey)
    const clipPoint = points.find((point) => point.dateKey === '2026-05-06')

    expect(view.clipStartDate).toBe('2026-05-06')
    expect(dates).not.toContain(goal.startDate)
    expect(points[0]?.dateKey).toBe('2026-05-06')
    expect(clipPoint?.net).toBeUndefined()
    expect(clipPoint?.goalTarget).toBe(getLinearGoalValue(goal, '2026-05-06'))
    expect(clipPoint?.goalComparison).toBe(getLinearGoalValue(goal, '2026-05-06'))

    vi.useRealTimers()
  })

  it('keeps the goal start as the path start when it is inside the current range', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-05T12:00:00.000Z'))

    const inRangeGoal = {
      ...goal,
      startDate: '2026-05-25',
      startNetWorth: 116000,
      createdAt: '2026-05-25T00:00:00.000Z',
    }
    const snapshots = [
      snapshot('2026-05-20', 115000),
      snapshot('2026-06-05', 120000),
    ]
    const view = buildTrendView(snapshots, '30d', 8)
    const summary = getSavingsGoalSummary(inRangeGoal, snapshots, { monthStartDay: 8 })
    const points = withGoalTrendLines(view.points, inRangeGoal, summary, view.futureCadence, (dateKey) => dateKey, view.clipStartDate)
    const dates = points.map((point) => point.dateKey)
    const beforeGoalPoint = points.find((point) => point.dateKey === '2026-05-20')
    const goalStartPoint = points.find((point) => point.dateKey === inRangeGoal.startDate)

    expect(view.clipStartDate).toBe('2026-05-06')
    expect(dates).toContain(inRangeGoal.startDate)
    expect(beforeGoalPoint?.goalComparison).toBeNull()
    expect(goalStartPoint?.net).toBeUndefined()
    expect(goalStartPoint?.goalTarget).toBe(inRangeGoal.startNetWorth)
    expect(goalStartPoint?.goalComparison).toBe(inRangeGoal.startNetWorth)

    vi.useRealTimers()
  })

  it.each(['6m', '1y'] satisfies RangeId[])(
    'clips an old goal start to the first visible monthly point in %s data',
    (range) => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-06-05T12:00:00.000Z'))

      const oldGoal = {
        ...goal,
        startDate: '2025-01-01',
        startNetWorth: 80000,
        createdAt: '2025-01-01T00:00:00.000Z',
      }
      const snapshots = [
        snapshot('2025-07-07', 90000),
        snapshot('2025-08-07', 92000),
        snapshot('2025-09-07', 94000),
        snapshot('2025-10-07', 96000),
        snapshot('2025-11-07', 98000),
        snapshot('2025-12-07', 100000),
        snapshot('2026-01-07', 102000),
        snapshot('2026-02-07', 104000),
        snapshot('2026-03-07', 106000),
        snapshot('2026-04-07', 108000),
        snapshot('2026-05-07', 110000),
        snapshot('2026-06-05', 120000),
      ]
      const view = buildTrendView(snapshots, range, 8)
      const summary = getSavingsGoalSummary(oldGoal, snapshots, { monthStartDay: 8 })
      const points = withGoalTrendLines(view.points, oldGoal, summary, view.futureCadence, (dateKey) => dateKey, view.clipStartDate)
      const dates = points.map((point) => point.dateKey)
      const clipPoint = points.find((point) => point.dateKey === view.clipStartDate)

      expect(view.clipStartDate).toBe(view.points[0]?.dateKey)
      expect(dates).not.toContain(oldGoal.startDate)
      expect(clipPoint?.goalComparison).toBe(getLinearGoalValue(oldGoal, view.clipStartDate!))

      vi.useRealTimers()
    },
  )

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
    const firstFuturePoint = points.find((point) => point.dateKey > '2026-05-01' && point.projectedNet != null)

    // 预测线直接从最新记录点出发，无需bridge
    expect(latestPoint?.projectedBridgeNet).toBeNull()
    expect(latestPoint?.projectedNet).toBe(120000)
    // 第一个未来检查点无真实记录数据
    expect(firstFuturePoint?.net).toBeUndefined()
    expect(firstFuturePoint?.debt).toBeUndefined()
    expect(firstFuturePoint?.projectedBridgeNet).toBeNull()
    expect(firstFuturePoint?.projectedNet).toBe(150000) // 120000 + 1000*30
    expect(points.some((point) => point.projectedNet != null && point.dateKey > '2026-05-01')).toBe(true)

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
