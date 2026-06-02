import { describe, expect, it } from 'vitest'
import {
  addDaysToDateKey,
  coerceSavingsGoal,
  getAverageDailyNetChange,
  getGoalComparisonValue,
  getLinearGoalValue,
  getNetChangePace,
  getSavingsGoalSummary,
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

  it('summarizes progress and projected completion from snapshots', () => {
    const today = todayDateKey()
    const startDate = addDaysToDateKey(today, -30)!
    const targetDate = addDaysToDateKey(today, 365)!
    const summaryGoal = { ...goal, startDate, targetDate }
    const summary = getSavingsGoalSummary(summaryGoal, [
      snapshot(startDate, 100000),
      snapshot(today, 130000),
    ])

    expect(summary?.progress).toBe(0.3)
    expect(summary?.remaining).toBe(70000)
    expect(summary?.avgDailyNetChange).toBe(1000)
    expect(summary?.projectedDate).toBe(addDaysToDateKey(today, 70))
    expect(summary?.targetValueAtLatest).toBeCloseTo(107594.94)
    expect(summary?.targetDeltaAtLatest).toBeCloseTo(22405.06)
  })

  it('projects stale snapshots from today instead of the old snapshot date', () => {
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
    expect(summary?.projectedDate).toBe(addDaysToDateKey(today, 70))
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

  it('marks unfinished goals due today or past due', () => {
    const today = todayDateKey()
    const yesterday = addDaysToDateKey(today, -1)!

    expect(getSavingsGoalSummary({ ...goal, targetDate: today }, [snapshot(today, 120000)])?.isDueToday).toBe(true)
    expect(getSavingsGoalSummary({ ...goal, targetDate: yesterday }, [snapshot(today, 120000)])?.isPastDue).toBe(true)
    expect(getSavingsGoalSummary({ ...goal, targetDate: yesterday }, [snapshot(today, 220000)])?.isPastDue).toBe(false)
  })
})
