import { getGroupIdByAccountType } from './accounts'
import type { AccountOp } from './accountOps'
import { addMoney, normalizeMoney, subtractMoney } from './money'
import { clampMonthStartDay, monthKeyForDateKey } from './monthStart'
import {
  dateKeyToUtcDays,
  getNetChangePace,
  type NetChangePaceMethod,
  type SavingsGoalSummary,
  type SavingsPaceAlgorithm,
} from './savingsGoal'
import type { Snapshot } from './snapshots'

export const MONTHLY_ESTIMATED_INCOME_KEY = 'ratio.monthlyEstimatedIncome'

const DAYS_PER_MONTH = 30.4375
/** Trailing window for flow inference; ~6 months of account operations. */
const FLOW_WINDOW_DAYS = 183
/** Complete months of flow signal needed before medians are treated as solid. */
const MIN_FLOW_MONTHS = 2

/** How much we trust the estimate, used to scale microcopy and visuals. */
export type DisposableConfidence = 'high' | 'medium' | 'low' | 'none'
/** Where the headline income figure came from. */
export type DisposableIncomeSource = 'manual' | 'ops' | 'surplus' | 'none'
/** Which goal signal produced the savings reservation. */
export type DisposableTargetSource =
  | 'none'
  | 'current-period'
  | 'complete'
  | 'past-due'
  | 'required-monthly'
/** Which number the card leads with, given the available data. */
export type DisposableHeadlineMode = 'disposable' | 'surplus' | 'empty'

export type DisposableEstimate = {
  // headline
  headlineMode: DisposableHeadlineMode
  /** estimatedIncome − requiredSavings; null when income can't be estimated. */
  disposable: number | null
  /** monthlySurplus − requiredSavings; the snapshot-only fallback headline. */
  surplusSlack: number | null
  isIncomeShort: boolean
  incomeGap: number

  // income / expense / surplus (income − expense need NOT equal surplus: liquid cash vs net worth)
  estimatedIncome: number | null
  incomeSource: DisposableIncomeSource
  estimatedExpense: number | null
  monthlySurplus: number | null

  // goal reservation
  hasGoal: boolean
  requiredSavings: number | null
  targetSource: DisposableTargetSource
  /** Is the realized surplus already covering what the goal needs this month? */
  savingsCovered: boolean | null

  // liquidity ("other factors")
  liquidBuffer: number
  /** liquidBuffer / estimatedExpense — emergency runway in months (1 decimal). */
  monthsOfExpenseCovered: number | null
  limitedByLiquidity: boolean

  // diagnostics / confidence
  confidence: DisposableConfidence
  monthsSampled: number
  flowOpsUsed: number
  paceMethod: NetChangePaceMethod | null
}

export type DisposableEstimateInput = {
  snapshots: readonly Snapshot[]
  accountOps: readonly AccountOp[]
  summary: SavingsGoalSummary | null
  monthStartDay: number
  paceAlgorithm?: SavingsPaceAlgorithm
  /** Optional manual override stored at MONTHLY_ESTIMATED_INCOME_KEY; 0 = unset. */
  manualIncome?: number
  latestSnapshot?: Snapshot | null
}

export function coerceMonthlyEstimatedIncome(value: unknown) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0
  const normalized = normalizeMoney(value)
  return normalized > 0 ? normalized : 0
}

function median(values: number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

function findLatestSnapshot(snapshots: readonly Snapshot[]): Snapshot | null {
  let latest: Snapshot | null = null
  for (const snapshot of snapshots) {
    if (dateKeyToUtcDays(snapshot.date) == null) continue
    if (!latest || snapshot.date > latest.date) latest = snapshot
  }
  return latest
}

function opDateKey(at: unknown): string | null {
  if (typeof at !== 'string' || at.length < 10) return null
  const key = at.slice(0, 10)
  return dateKeyToUtcDays(key) != null ? key : null
}

type MonthlyFlow = { monthKey: string; inflow: number; outflow: number }

/**
 * Classify recorded account operations into per-month inflow / outflow on
 * spendable accounts. adjust deltas are the most transaction-like signal;
 * liquid set_balance net deltas are treated as reconciled cash flow. transfers
 * (internal) and rename are ignored, and set_balance on invest/fixed is dropped
 * because it usually reflects market revaluation rather than a real flow.
 */
function classifyMonthlyFlows(
  accountOps: readonly AccountOp[],
  monthStartDay: number,
  referenceDays: number,
): { months: MonthlyFlow[]; opsUsed: number } {
  const byMonth = new Map<string, { inflow: number; outflow: number }>()
  let opsUsed = 0

  for (const op of accountOps) {
    if (op.kind === 'rename' || op.kind === 'transfer') continue

    const dateKey = opDateKey(op.at)
    if (!dateKey) continue
    const days = dateKeyToUtcDays(dateKey)
    if (days == null || days > referenceDays || referenceDays - days > FLOW_WINDOW_DAYS) continue

    const groupId = getGroupIdByAccountType(op.accountType)
    if (groupId !== 'liquid' && groupId !== 'receivable') continue

    let flow = 0
    if (op.kind === 'adjust') {
      flow = normalizeMoney(op.delta)
    } else if (op.kind === 'set_balance') {
      // A reconciled liquid balance ≈ net cash flow since the last update. Skip
      // seeding entries (before === 0, e.g. recording an account's opening
      // balance), which are pre-existing money rather than new income.
      if (groupId !== 'liquid' || op.before === 0) continue
      flow = subtractMoney(op.after, op.before)
    }
    if (flow === 0) continue

    const monthKey = monthKeyForDateKey(dateKey, monthStartDay)
    const bucket = byMonth.get(monthKey) ?? { inflow: 0, outflow: 0 }
    if (flow > 0) bucket.inflow = addMoney(bucket.inflow, flow)
    else bucket.outflow = addMoney(bucket.outflow, -flow)
    byMonth.set(monthKey, bucket)
    opsUsed += 1
  }

  const months = Array.from(byMonth.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([monthKey, value]) => ({ monthKey, inflow: value.inflow, outflow: value.outflow }))

  return { months, opsUsed }
}

/**
 * Prefer complete months for medians; the current (partial) period understates
 * flows, so it is only used as a last resort when nothing else exists.
 */
function pickFlowSample(months: MonthlyFlow[], currentMonthKey: string | null) {
  const complete = currentMonthKey ? months.filter((m) => m.monthKey !== currentMonthKey) : months
  if (complete.length >= MIN_FLOW_MONTHS) return { sample: complete, full: true }
  if (complete.length >= 1) return { sample: complete, full: false }
  if (months.length >= 1) return { sample: months, full: false }
  return { sample: [] as MonthlyFlow[], full: false }
}

function getRequiredSavings(summary: SavingsGoalSummary | null): {
  requiredSavings: number | null
  targetSource: DisposableTargetSource
} {
  if (!summary) return { requiredSavings: null, targetSource: 'none' }
  if (summary.isComplete) return { requiredSavings: 0, targetSource: 'complete' }
  if (summary.currentPeriodTarget != null) {
    return { requiredSavings: Math.max(0, normalizeMoney(summary.currentPeriodTarget)), targetSource: 'current-period' }
  }
  if (summary.isPastDue || summary.isDueToday) {
    return { requiredSavings: Math.max(0, normalizeMoney(summary.remaining)), targetSource: 'past-due' }
  }
  if (summary.requiredMonthly != null) {
    return { requiredSavings: Math.max(0, normalizeMoney(summary.requiredMonthly)), targetSource: 'required-monthly' }
  }
  return { requiredSavings: null, targetSource: 'none' }
}

function scoreConfidence(args: {
  snapshotCount: number
  monthsSampled: number
  flowSampleFull: boolean
  opsUsed: number
  paceMethod: NetChangePaceMethod | null
  incomeSource: DisposableIncomeSource
  hasSurplus: boolean
}): DisposableConfidence {
  const { snapshotCount, monthsSampled, flowSampleFull, opsUsed, paceMethod, incomeSource, hasSurplus } = args
  if (!hasSurplus && incomeSource === 'none') return 'none'

  const richOps = monthsSampled >= 3 && opsUsed >= 6 && flowSampleFull
  const okOps = monthsSampled >= MIN_FLOW_MONTHS && opsUsed >= 3
  const goodPace = paceMethod === 'recent-window' || paceMethod === 'monthly-close' || paceMethod === 'monthly-smoothed'
  const enoughSnaps = snapshotCount >= 4

  if (incomeSource === 'manual') {
    return richOps || (goodPace && enoughSnaps) ? 'high' : 'medium'
  }
  if (richOps && goodPace) return 'high'
  if (okOps || (goodPace && enoughSnaps)) return 'medium'
  return 'low'
}

/**
 * Estimate this month's freely-spendable funds from data the app already
 * records — net-worth velocity (snapshots), classified account-operation flows,
 * the savings goal, and the current liquid buffer — degrading gracefully and
 * reporting how much it trusts the result.
 */
export function buildDisposableEstimate(input: DisposableEstimateInput): DisposableEstimate {
  const { snapshots, accountOps, summary } = input
  const monthStartDay = clampMonthStartDay(input.monthStartDay)
  const paceAlgorithm = input.paceAlgorithm ?? 'smart'
  const manual = coerceMonthlyEstimatedIncome(input.manualIncome ?? 0)

  // 1. Realized monthly surplus (net-worth velocity) via the shared pace engine.
  const pace = getNetChangePace([...snapshots], { monthStartDay, algorithm: paceAlgorithm })
  const avgDaily = pace?.avgDaily ?? summary?.avgDailyNetChange ?? null
  const monthlySurplus = avgDaily == null ? null : normalizeMoney(avgDaily * DAYS_PER_MONTH)
  const paceMethod = pace?.method ?? summary?.avgDailyNetChangeMethod ?? null
  const snapshotCount = pace?.snapshotCount ?? summary?.avgDailyNetChangeSnapshotCount ?? snapshots.length

  // 2-3. Classify operation flows and derive robust monthly income / expense.
  const latest = input.latestSnapshot ?? findLatestSnapshot(snapshots)
  const referenceDateKey = latest?.date ?? null
  const referenceDays = referenceDateKey ? dateKeyToUtcDays(referenceDateKey) : null
  const flows = referenceDays != null
    ? classifyMonthlyFlows(accountOps, monthStartDay, referenceDays)
    : { months: [] as MonthlyFlow[], opsUsed: 0 }
  const currentMonthKey = referenceDateKey ? monthKeyForDateKey(referenceDateKey, monthStartDay) : null
  const { sample, full: flowSampleFull } = pickFlowSample(flows.months, currentMonthKey)
  const monthsSampled = sample.length

  // Only months that actually recorded a flow in a given direction contribute
  // to that direction's median. Otherwise a month with, say, only a deposit
  // (inflow) would inject a 0 into the outflow median and understate spending —
  // particularly misleading for users who reconcile balances net via set_balance.
  const outflows = sample.map((m) => m.outflow).filter((v) => v > 0)
  const inflows = sample.map((m) => m.inflow).filter((v) => v > 0)
  const expenseMedian = outflows.length > 0 ? median(outflows) : null
  const estimatedExpense = expenseMedian == null ? null : normalizeMoney(expenseMedian)
  const incomeMedian = inflows.length > 0 ? median(inflows) : null
  const opsIncome = incomeMedian == null ? null : normalizeMoney(incomeMedian)

  // 4. Income fallback ladder: manual → ops inflow → surplus + expense → none.
  let estimatedIncome: number | null = null
  let incomeSource: DisposableIncomeSource = 'none'
  if (manual > 0) {
    estimatedIncome = manual
    incomeSource = 'manual'
  } else if (opsIncome != null && opsIncome > 0) {
    estimatedIncome = opsIncome
    incomeSource = 'ops'
  } else if (monthlySurplus != null && estimatedExpense != null) {
    estimatedIncome = Math.max(0, normalizeMoney(monthlySurplus + estimatedExpense))
    incomeSource = 'surplus'
  }

  // 5. Savings reservation from the goal.
  const { requiredSavings, targetSource } = getRequiredSavings(summary)
  const reserve = requiredSavings ?? 0
  const savingsCovered = monthlySurplus == null || requiredSavings == null ? null : monthlySurplus >= requiredSavings

  // 6. Headline disposable = income − reservation.
  const disposable = estimatedIncome == null ? null : normalizeMoney(estimatedIncome - reserve)
  const isIncomeShort = disposable != null && disposable < 0
  const incomeGap = disposable != null && disposable < 0 ? normalizeMoney(-disposable) : 0
  const surplusSlack = monthlySurplus == null ? null : normalizeMoney(monthlySurplus - reserve)

  // 7. Liquidity ("other factors").
  const liquidBuffer = Math.max(0, normalizeMoney(latest?.cash ?? 0))
  const monthsOfExpenseCovered = estimatedExpense != null && estimatedExpense > 0
    ? Math.round((liquidBuffer / estimatedExpense) * 10) / 10
    : null
  const limitedByLiquidity = disposable != null && disposable > 0 && disposable > liquidBuffer

  // 8. Confidence + which number to lead with.
  const confidence = scoreConfidence({
    snapshotCount,
    monthsSampled,
    flowSampleFull,
    opsUsed: flows.opsUsed,
    paceMethod,
    incomeSource,
    hasSurplus: monthlySurplus != null,
  })

  const headlineMode: DisposableHeadlineMode = disposable != null
    ? 'disposable'
    : monthlySurplus != null
      ? 'surplus'
      : 'empty'

  return {
    headlineMode,
    disposable,
    surplusSlack,
    isIncomeShort,
    incomeGap,
    estimatedIncome,
    incomeSource,
    estimatedExpense,
    monthlySurplus,
    hasGoal: summary != null,
    requiredSavings,
    targetSource,
    savingsCovered,
    liquidBuffer,
    monthsOfExpenseCovered,
    limitedByLiquidity,
    confidence,
    monthsSampled,
    flowOpsUsed: flows.opsUsed,
    paceMethod,
  }
}
