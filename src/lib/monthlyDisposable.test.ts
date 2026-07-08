import { describe, expect, it } from 'vitest'
import {
  buildDisposableEstimate,
  coerceMonthlyEstimatedExpense,
  coerceMonthlyEstimatedIncome,
  type DisposableEstimateInput,
} from './monthlyDisposable'
import type { AccountOp } from './accountOps'
import type { AccountTypeId } from './accounts'
import { normalizeMoney } from './money'
import type { SavingsGoalSummary } from './savingsGoal'
import type { Snapshot } from './snapshots'

function snap(date: string, net: number, cash = net): Snapshot {
  return { date, net, debt: 0, cash, invest: 0, fixed: 0, receivable: 0 }
}

const baseSummary: SavingsGoalSummary = {
  latestDate: '2026-07-01',
  currentNetWorth: 109000,
  targetAmount: 200000,
  targetDate: '2026-12-31',
  startDate: '2026-01-01',
  startNetWorth: 100000,
  currentPeriodStartDate: '2026-07-01',
  currentPeriodStartNetWorth: 109000,
  currentPeriodActual: 0,
  currentPeriodTargetNetWorth: 110934.07,
  currentPeriodTarget: 1934.07,
  currentPeriodRemaining: 1934.07,
  currentPeriodDelta: -1934.07,
  currentPeriodEndDate: '2026-08-01',
  currentPeriodIsOnTrack: false,
  progress: 0.545,
  remaining: 91000,
  daysLeft: 183,
  requiredDaily: 497.27,
  requiredMonthly: 15136.61,
  avgDailyNetChange: 100,
  avgDailyNetChangeMethod: 'monthly-close',
  avgDailyNetChangeSampleDays: 91,
  avgDailyNetChangeSnapshotCount: 4,
  projectedDate: '2027-01-10',
  projectedNetAtTargetDate: 127000,
  targetValueAtLatest: 109000,
  targetDeltaAtLatest: 0,
  paceDailyDelta: -397.27,
  isComplete: false,
  isDueToday: false,
  isPastDue: false,
  isOnTrack: false,
}

function summary(overrides: Partial<SavingsGoalSummary> = {}): SavingsGoalSummary {
  return { ...baseSummary, ...overrides }
}

let opSeq = 0
function adjust(at: string, accountType: AccountTypeId, delta: number): AccountOp {
  opSeq += 1
  return { id: `adj-${opSeq}`, kind: 'adjust', at, accountType, accountId: 'a1', delta, before: 0, after: delta }
}
function setBalance(at: string, accountType: AccountTypeId, before: number, after: number): AccountOp {
  opSeq += 1
  return { id: `set-${opSeq}`, kind: 'set_balance', at, accountType, accountId: 'a1', before, after }
}
function transfer(at: string, amount: number): AccountOp {
  opSeq += 1
  return {
    id: `tr-${opSeq}`,
    kind: 'transfer',
    at,
    accountType: 'bank_card',
    fromId: 'a1',
    toId: 'a2',
    amount,
    fromBefore: amount,
    fromAfter: 0,
    toBefore: 0,
    toAfter: amount,
  }
}

// Monthly snapshots used by the ops-driven cases; +3000 net/month, ~¥100/day.
const monthlySnapshots: Snapshot[] = [
  snap('2026-04-01', 100000),
  snap('2026-05-01', 103000),
  snap('2026-06-01', 106000),
  snap('2026-07-01', 109000, 50000),
]

function build(input: Partial<DisposableEstimateInput>): ReturnType<typeof buildDisposableEstimate> {
  return buildDisposableEstimate({
    snapshots: input.snapshots ?? [],
    accountOps: input.accountOps ?? [],
    summary: input.summary ?? null,
    monthStartDay: input.monthStartDay ?? 1,
    paceAlgorithm: input.paceAlgorithm,
    manualIncome: input.manualIncome ?? 0,
    manualExpense: input.manualExpense ?? 0,
    latestSnapshot: input.latestSnapshot,
    pace: input.pace,
  })
}

describe('coerceMonthlyEstimatedIncome', () => {
  it('coerces to positive normalized money', () => {
    expect(coerceMonthlyEstimatedIncome(12345.678)).toBe(12345.68)
    expect(coerceMonthlyEstimatedIncome(12000)).toBe(12000)
    expect(coerceMonthlyEstimatedIncome(-1)).toBe(0)
    expect(coerceMonthlyEstimatedIncome(Number.NaN)).toBe(0)
    expect(coerceMonthlyEstimatedIncome('12000')).toBe(0)
  })
})

describe('coerceMonthlyEstimatedExpense', () => {
  it('coerces to positive normalized money', () => {
    expect(coerceMonthlyEstimatedExpense(8000.505)).toBe(8000.51)
    expect(coerceMonthlyEstimatedExpense(-500)).toBe(0)
    expect(coerceMonthlyEstimatedExpense(Number.POSITIVE_INFINITY)).toBe(0)
    expect(coerceMonthlyEstimatedExpense('8000')).toBe(0)
  })
})

describe('buildDisposableEstimate', () => {
  it('uses a manual income override and reserves the current-period savings target', () => {
    const result = build({
      snapshots: [snap('2026-04-01', 100000), snap('2026-07-01', 109000)],
      summary: summary(),
      manualIncome: 12000,
    })

    expect(result.incomeSource).toBe('manual')
    expect(result.estimatedIncome).toBe(12000)
    expect(result.requiredSavings).toBe(1934.07)
    expect(result.targetSource).toBe('current-period')
    expect(result.disposable).toBe(10065.93)
    expect(result.isIncomeShort).toBe(false)
    expect(result.incomeGap).toBe(0)
    expect(result.headlineMode).toBe('disposable')
    expect(result.liquidBuffer).toBe(109000)
  })

  it('flags an income shortfall when reservation exceeds income', () => {
    const result = build({
      snapshots: [snap('2026-04-01', 100000), snap('2026-07-01', 109000)],
      summary: summary(),
      manualIncome: 1000,
    })

    expect(result.disposable).toBe(-934.07)
    expect(result.isIncomeShort).toBe(true)
    expect(result.incomeGap).toBe(934.07)
  })

  it('estimates income and expense from liquid account operations (median, spike-robust)', () => {
    const result = build({
      snapshots: monthlySnapshots,
      summary: summary(),
      accountOps: [
        adjust('2026-04-15T12:00:00.000Z', 'bank_card', 7000),
        adjust('2026-04-20T12:00:00.000Z', 'bank_card', -3000),
        adjust('2026-05-15T12:00:00.000Z', 'bank_card', 8000),
        adjust('2026-05-20T12:00:00.000Z', 'bank_card', -5000),
        adjust('2026-06-15T12:00:00.000Z', 'bank_card', 9000),
        adjust('2026-06-20T12:00:00.000Z', 'bank_card', -4000),
        // Current (partial) month — must be excluded from the medians.
        adjust('2026-07-01T00:00:00.000Z', 'bank_card', 50000),
        // Noise that must be ignored.
        transfer('2026-05-10T12:00:00.000Z', 6000),
        setBalance('2026-05-12T12:00:00.000Z', 'fund', 10000, 30000),
      ],
    })

    expect(result.incomeSource).toBe('ops')
    expect(result.estimatedIncome).toBe(8000)
    expect(result.estimatedExpense).toBe(4000)
    expect(result.monthsSampled).toBe(3)
    // The current month already recorded a ¥50000 inflow ≥ the ¥8000 income
    // estimate, so the income counts as fully received: nothing remains to be
    // added on top of the realized net-worth position — the headline follows
    // the period gap instead of re-adding income the net worth already holds.
    expect(result.recognizedIncome).toBe(8000)
    expect(result.remainingExpectedIncome).toBe(0)
    expect(result.disposable).toBe(-1934.07)
    expect(result.confidence).toBe('high')
  })

  it('reconstructs income from surplus + expense when only outflows are recorded', () => {
    const result = build({
      snapshots: monthlySnapshots,
      summary: null,
      accountOps: [
        adjust('2026-04-15T12:00:00.000Z', 'bank_card', -3000),
        adjust('2026-05-15T12:00:00.000Z', 'bank_card', -5000),
        adjust('2026-06-15T12:00:00.000Z', 'bank_card', -4000),
      ],
    })

    expect(result.estimatedExpense).toBe(4000)
    expect(result.incomeSource).toBe('surplus')
    expect(result.monthlySurplus).not.toBeNull()
    expect(result.estimatedIncome).toBeCloseTo((result.monthlySurplus ?? 0) + 4000, 2)
    expect(result.confidence).toBe('medium')
  })

  it('excludes transfers and invest revaluations from flow inference', () => {
    const result = build({
      snapshots: monthlySnapshots,
      accountOps: [
        transfer('2026-04-15T12:00:00.000Z', 6000),
        transfer('2026-05-15T12:00:00.000Z', 4000),
        setBalance('2026-04-16T12:00:00.000Z', 'fund', 10000, 25000),
        setBalance('2026-05-16T12:00:00.000Z', 'stock', 5000, 1000),
      ],
    })

    expect(result.flowOpsUsed).toBe(0)
    expect(result.estimatedExpense).toBeNull()
    expect(result.incomeSource).not.toBe('ops')
  })

  it('treats reconciled liquid balances as flow but ignores opening (before=0) balances', () => {
    const result = build({
      snapshots: monthlySnapshots,
      summary: summary(),
      accountOps: [
        // Opening balances from account creation — pre-existing money, not income.
        setBalance('2026-04-10T12:00:00.000Z', 'bank_card', 0, 40000),
        setBalance('2026-05-10T12:00:00.000Z', 'cash', 0, 12000),
        // Real reconciled inflows on existing liquid accounts.
        setBalance('2026-04-15T12:00:00.000Z', 'bank_card', 2000, 8000),
        setBalance('2026-05-15T12:00:00.000Z', 'bank_card', 3000, 10000),
        setBalance('2026-06-15T12:00:00.000Z', 'bank_card', 1000, 8000),
      ],
    })

    expect(result.incomeSource).toBe('ops')
    expect(result.estimatedIncome).toBe(7000) // median of +6000, +7000, +7000
    expect(result.flowOpsUsed).toBe(3)
  })

  it('does not let unrecorded directions drag income/expense medians to zero', () => {
    const result = build({
      snapshots: monthlySnapshots,
      summary: summary(),
      accountOps: [
        // April: only an inflow recorded (no outflow ops this month)
        adjust('2026-04-15T12:00:00.000Z', 'bank_card', 8000),
        // May: only an outflow recorded (no inflow ops this month)
        adjust('2026-05-15T12:00:00.000Z', 'bank_card', -5000),
        // June: only an inflow recorded
        adjust('2026-06-15T12:00:00.000Z', 'bank_card', 9000),
        // Current (partial) month — excluded from medians.
        adjust('2026-07-01T12:00:00.000Z', 'bank_card', 50000),
      ],
    })

    // Inflow median over months that recorded income: median([8000, 9000]) = 8500
    expect(result.incomeSource).toBe('ops')
    expect(result.estimatedIncome).toBe(8500)
    // Outflow median over the single outflow month: 5000 — not 0 from the two inflow-only months.
    expect(result.estimatedExpense).toBe(5000)
    expect(result.monthsSampled).toBe(3)
  })

  it('reserves nothing when there is no goal', () => {
    const result = build({
      snapshots: [snap('2026-04-01', 100000), snap('2026-07-01', 109000)],
      summary: null,
      manualIncome: 5000,
    })

    expect(result.hasGoal).toBe(false)
    expect(result.requiredSavings).toBeNull()
    expect(result.targetSource).toBe('none')
    expect(result.disposable).toBe(5000)
    expect(result.savingsCovered).toBeNull()
  })

  it('reserves nothing when the goal is complete', () => {
    const result = build({
      snapshots: [snap('2026-04-01', 100000), snap('2026-07-01', 109000)],
      summary: summary({ isComplete: true, remaining: 0 }),
      manualIncome: 8000,
    })

    expect(result.requiredSavings).toBe(0)
    expect(result.targetSource).toBe('complete')
    expect(result.disposable).toBe(8000)
  })

  it('falls back to the overdue remaining gap when there is no current-period target', () => {
    const result = build({
      snapshots: [snap('2026-04-01', 100000), snap('2026-07-01', 109000)],
      summary: summary({ currentPeriodTarget: null, isPastDue: true, remaining: 4500 }),
      manualIncome: 6000,
    })

    expect(result.requiredSavings).toBe(4500)
    expect(result.targetSource).toBe('past-due')
    expect(result.disposable).toBe(1500)
  })

  it('leads with the realized surplus when income cannot be estimated', () => {
    const result = build({
      snapshots: [snap('2026-04-01', 100000), snap('2026-07-01', 109000)],
      summary: null,
    })

    expect(result.estimatedIncome).toBeNull()
    expect(result.incomeSource).toBe('none')
    expect(result.disposable).toBeNull()
    expect(result.monthlySurplus).not.toBeNull()
    expect(result.surplusSlack).toBe(result.monthlySurplus)
    expect(result.headlineMode).toBe('surplus')
    expect(result.confidence).toBe('low')
  })

  it('returns an empty estimate when there are no snapshots', () => {
    const result = build({ snapshots: [], summary: null })

    expect(result.headlineMode).toBe('empty')
    expect(result.monthlySurplus).toBeNull()
    expect(result.disposable).toBeNull()
    expect(result.confidence).toBe('none')
    expect(result.liquidBuffer).toBe(0)
  })

  it('reports the liquid buffer runway and caps spending by available cash', () => {
    const result = build({
      snapshots: [snap('2026-04-01', 50000), snap('2026-07-01', 60000, 2000)],
      summary: null,
      manualIncome: 10000,
      accountOps: [
        adjust('2026-04-15T12:00:00.000Z', 'bank_card', -3000),
        adjust('2026-05-15T12:00:00.000Z', 'bank_card', -5000),
        adjust('2026-06-15T12:00:00.000Z', 'bank_card', -4000),
      ],
    })

    expect(result.liquidBuffer).toBe(2000)
    expect(result.estimatedExpense).toBe(4000)
    expect(result.monthsOfExpenseCovered).toBe(0.5)
    expect(result.limitedByLiquidity).toBe(true)
  })

  it('keeps disposable = income − reservation across a grid of inputs (period-start invariant)', () => {
    const snapshots = [snap('2026-04-01', 100000), snap('2026-07-01', 109000)]
    for (const income of [0, 1000, 5000, 18000.55, 99999.99]) {
      for (const target of [0, 250.5, 1934.07, 25000]) {
        // Latest snapshot lands on the period start ⇒ elapsed = 0 ⇒ the reconciled
        // formula reduces to estimatedIncome + currentPeriodDelta. With actual = 0
        // and not ahead, currentPeriodDelta = −target, so disposable = income − target.
        const result = build({
          snapshots,
          summary: summary({
            currentPeriodTarget: target,
            currentPeriodDelta: -target,
            currentPeriodRemaining: target,
          }),
          manualIncome: income,
        })
        const reserve = Math.max(0, normalizeMoney(target))
        const expected = income > 0 ? normalizeMoney(income - reserve) : null
        expect(result.disposable).toBe(expected)
        if (result.disposable != null) {
          expect(result.incomeGap).toBe(result.disposable < 0 ? normalizeMoney(-result.disposable) : 0)
          expect(result.isIncomeShort).toBe(result.disposable < 0)
        }
        expect(result.liquidBuffer).toBeGreaterThanOrEqual(0)
        expect(result.monthsOfExpenseCovered).toBeNull()
      }
    }
  })

  it('reconciles disposable with the realized period gap once the period is over', () => {
    // Latest snapshot lands on the period end ⇒ elapsed = 1 ⇒ no income is still
    // expected, so the headline follows currentPeriodDelta (the realized gap)
    // instead of the stale "income − full target" forecast.
    const result = build({
      snapshots: [snap('2026-07-01', 109000), snap('2026-08-01', 109800)],
      summary: summary({
        latestDate: '2026-08-01',
        currentNetWorth: 109800,
        currentPeriodStartDate: '2026-07-01',
        currentPeriodEndDate: '2026-08-01',
        currentPeriodStartNetWorth: 109000,
        currentPeriodActual: 800,
        currentPeriodTargetNetWorth: 111734.07,
        currentPeriodTarget: 2734.07,
        currentPeriodRemaining: 1934.07,
        currentPeriodDelta: -1934.07,
      }),
      manualIncome: 12000,
    })

    expect(result.periodElapsedFraction).toBe(1)
    expect(result.remainingExpectedIncome).toBe(0)
    expect(result.currentPeriodDelta).toBe(-1934.07)
    // Old forecast would have been 12000 − 2734.07 = +9265.93; reconciled it is the gap.
    expect(result.disposable).toBe(-1934.07)
    expect(result.isIncomeShort).toBe(true)
    expect(result.incomeGap).toBe(1934.07)
  })

  it('blends the remaining income forecast with the realized gap mid-period', () => {
    // Halfway through July: part of the income is still expected, part of the gap
    // is already baked in. disposable = remainingExpectedIncome + currentPeriodDelta,
    // smoothly between the period-start forecast and the month-end gap.
    const result = build({
      snapshots: [snap('2026-07-01', 109000), snap('2026-07-17', 109400)],
      summary: summary({
        latestDate: '2026-07-17',
        currentNetWorth: 109400,
        currentPeriodStartDate: '2026-07-01',
        currentPeriodEndDate: '2026-08-01',
        currentPeriodStartNetWorth: 109000,
        currentPeriodActual: 400,
        currentPeriodTargetNetWorth: 110934.07,
        currentPeriodTarget: 1934.07,
        currentPeriodRemaining: 1534.07,
        currentPeriodDelta: -1534.07,
      }),
      manualIncome: 12000,
    })

    // July has 31 days; the 17th ⇒ 16 elapsed days.
    const elapsed = 16 / 31
    const expectedRemaining = normalizeMoney(12000 * (1 - elapsed))
    expect(result.periodElapsedFraction).toBeCloseTo(elapsed, 5)
    expect(result.remainingExpectedIncome).toBeCloseTo(expectedRemaining, 2)
    expect(result.disposable).toBeCloseTo(normalizeMoney(expectedRemaining + -1534.07), 2)
    // Still a forecast, so it stays above the raw month-end gap (−1534.07).
    expect(result.disposable).toBeGreaterThan(-1534.07)
  })

  it('reuses an injected precomputed pace for the surplus estimate', () => {
    const injected = {
      avgDaily: 200,
      method: 'monthly-close' as const,
      sampleDays: 91,
      snapshotCount: 4,
      startDate: '2026-04-01',
      endDate: '2026-07-01',
    }
    const result = build({
      snapshots: monthlySnapshots,
      summary: null,
      pace: injected,
    })

    // 200/day × 30.4375 = 6087.5 — from the injected pace, not a recompute
    // (the snapshots themselves average ~100/day).
    expect(result.monthlySurplus).toBe(6087.5)
    expect(result.paceMethod).toBe('monthly-close')

    // pace: null falls back to the summary's stored pace fields.
    const fromSummary = build({
      snapshots: monthlySnapshots,
      summary: summary(),
      pace: null,
    })
    expect(fromSummary.monthlySurplus).toBe(normalizeMoney(100 * 30.4375))
  })

  it('falls back to the pure forecast when there is no current-period path', () => {
    // currentPeriodTarget null (past-due) ⇒ no reconciliation; disposable = income − reserve.
    const result = build({
      snapshots: [snap('2026-04-01', 100000), snap('2026-07-01', 109000)],
      summary: summary({ currentPeriodTarget: null, currentPeriodDelta: null, isPastDue: true, remaining: 4500 }),
      manualIncome: 6000,
    })

    expect(result.currentPeriodDelta).toBeNull()
    expect(result.remainingExpectedIncome).toBe(6000)
    expect(result.disposable).toBe(1500)
  })

  it('does not double count a salary that landed early in the period', () => {
    // Salary arrives and is recorded on day 1: the net worth already holds it
    // (currentPeriodDelta jumped by the full income), so the recorded inflow
    // marks the income as received. The old calendar-linear formula would have
    // kept ~30/31 of the income "still expected" and produced ≈ ¥21678 —
    // roughly 2×income − target — for the rest of the month.
    const result = build({
      snapshots: [snap('2026-07-01', 109000), snap('2026-07-02', 121000, 62000)],
      summary: summary({
        latestDate: '2026-07-02',
        currentNetWorth: 121000,
        currentPeriodActual: 12000,
        currentPeriodRemaining: 0,
        currentPeriodDelta: 10065.93,
      }),
      manualIncome: 12000,
      accountOps: [adjust('2026-07-02T09:00:00.000Z', 'bank_card', 12000)],
    })

    expect(result.recognizedIncome).toBe(12000)
    expect(result.remainingExpectedIncome).toBe(0)
    expect(result.disposable).toBe(10065.93)
    expect(result.disposable).toBeLessThanOrEqual(result.estimatedIncome ?? 0)
  })

  it('recognizes partially received income and keeps the rest as forecast', () => {
    // ¥5000 of a ¥12000 income recorded so far: the remaining ¥7000 stays in
    // the forecast on top of the realized position. The elapsed-fraction floor
    // (12000 × 1/31 ≈ 387) is below the recorded inflow and does not apply.
    const result = build({
      snapshots: [snap('2026-07-01', 109000), snap('2026-07-02', 114000, 55000)],
      summary: summary({
        latestDate: '2026-07-02',
        currentNetWorth: 114000,
        currentPeriodActual: 5000,
        currentPeriodRemaining: 0,
        currentPeriodDelta: 3065.93,
      }),
      manualIncome: 12000,
      accountOps: [adjust('2026-07-02T09:00:00.000Z', 'bank_card', 5000)],
    })

    expect(result.recognizedIncome).toBe(5000)
    expect(result.remainingExpectedIncome).toBe(7000)
    expect(result.disposable).toBe(10065.93)
  })

  it('keeps the calendar-elapsed floor for snapshot-only users with no flow records', () => {
    // No recorded inflows: recognition falls back to the elapsed fraction so
    // the estimate still converges on the realized gap by period end.
    const result = build({
      snapshots: [snap('2026-07-01', 109000), snap('2026-07-17', 109400)],
      summary: summary({
        latestDate: '2026-07-17',
        currentNetWorth: 109400,
        currentPeriodActual: 400,
        currentPeriodRemaining: 1534.07,
        currentPeriodDelta: -1534.07,
      }),
      manualIncome: 12000,
    })

    const elapsed = 16 / 31
    expect(result.recognizedIncome).toBeCloseTo(normalizeMoney(12000 * elapsed), 2)
    expect(result.remainingExpectedIncome).toBeCloseTo(normalizeMoney(12000 * (1 - elapsed)), 2)
  })

  it('prefers a manual expense override over the ops median', () => {
    const result = build({
      snapshots: monthlySnapshots,
      summary: null,
      manualExpense: 6000,
      accountOps: [
        adjust('2026-04-15T12:00:00.000Z', 'bank_card', -3000),
        adjust('2026-05-15T12:00:00.000Z', 'bank_card', -5000),
        adjust('2026-06-15T12:00:00.000Z', 'bank_card', -4000),
      ],
    })

    expect(result.expenseSource).toBe('manual')
    expect(result.estimatedExpense).toBe(6000)
    // Downstream consumers follow the override: cash runway and the
    // surplus-based income reconstruction.
    expect(result.monthsOfExpenseCovered).toBe(8.3) // 50000 / 6000
    expect(result.incomeSource).toBe('surplus')
    expect(result.estimatedIncome).toBeCloseTo((result.monthlySurplus ?? 0) + 6000, 2)

    const fromOps = build({
      snapshots: monthlySnapshots,
      summary: null,
      accountOps: [
        adjust('2026-04-15T12:00:00.000Z', 'bank_card', -3000),
        adjust('2026-05-15T12:00:00.000Z', 'bank_card', -5000),
        adjust('2026-06-15T12:00:00.000Z', 'bank_card', -4000),
      ],
    })
    expect(fromOps.expenseSource).toBe('ops')
    expect(fromOps.estimatedExpense).toBe(4000)
  })

  it('ignores receivable adjusts in flow inference (lending is not income)', () => {
    // A growing receivable means cash lent out — counting it as inflow would
    // invert the direction; the liquid side of a collection still counts.
    const result = build({
      snapshots: monthlySnapshots,
      summary: summary(),
      accountOps: [
        adjust('2026-04-15T12:00:00.000Z', 'receivable', 5000),
        adjust('2026-05-15T12:00:00.000Z', 'receivable', -2000),
        adjust('2026-05-15T12:30:00.000Z', 'bank_card', 2000),
      ],
    })

    expect(result.flowOpsUsed).toBe(1)
    expect(result.estimatedIncome).toBe(2000)
    expect(result.estimatedExpense).toBeNull()
  })
})
