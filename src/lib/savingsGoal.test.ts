import { describe, expect, it } from 'vitest'
import {
  coerceSavingsGoal,
  getLinearGoalValue,
  getSavingsGoalSummary,
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
  })

  it('summarizes progress and projected completion from snapshots', () => {
    const summary = getSavingsGoalSummary(goal, [
      snapshot('2026-01-01', 100000),
      snapshot('2026-01-31', 130000),
    ])

    expect(summary?.progress).toBe(0.3)
    expect(summary?.remaining).toBe(70000)
    expect(summary?.avgDailyNetChange).toBe(1000)
    expect(summary?.projectedDate).toBe('2026-04-11')
  })
})
