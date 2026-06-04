import { describe, expect, it } from 'vitest'
import {
  addDaysToDateKey,
  getSavingsGoalSummary,
  todayDateKey,
  type SavingsGoal,
} from './savingsGoal'
import { buildSavingsSimulationPlan } from './savingsGoalSimulation'
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

describe('savingsGoalSimulation', () => {
  it('keeps the default simulation aligned with stale latest-date projections', () => {
    const today = todayDateKey()
    const startDate = addDaysToDateKey(today, -90)!
    const latestDate = addDaysToDateKey(today, -60)!
    const targetDate = addDaysToDateKey(today, 365)!
    const summary = getSavingsGoalSummary({ ...goal, startDate, targetDate }, [
      snapshot(startDate, 100000),
      snapshot(latestDate, 130000),
    ])

    expect(summary?.avgDailyNetChange).toBe(1000)
    expect(summary?.projectedDate).toBe(addDaysToDateKey(latestDate, 70))

    const plan = buildSavingsSimulationPlan(summary!, 0, 0)
    expect(plan.baseDate).toBe(latestDate)
    expect(plan.simulatedDate).toBe(summary?.projectedDate)
  })
})
