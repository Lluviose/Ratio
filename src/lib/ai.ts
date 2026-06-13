import { accountGroups, getAccountTypeOption, getGroupIdByAccountType, type Account, type AccountGroupId, type AccountTypeId } from './accounts'
import { coerceStoredAccountOps } from './accountOpsStorage'
import { fetchCloudAiChat, fetchCloudAiChatStream, getCloudSyncSettings, hasCloudCredentials } from './cloud'
import { coerceStoredTransactions } from './ledgerStorage'
import { addMoney, normalizeMoney, subtractMoney } from './money'
import { DEFAULT_MONTH_START_DAY, MONTH_START_DAY_KEY, clampMonthStartDay } from './monthStart'
import { getSavingsGoalSummary, coerceSavingsGoal, coerceSavingsPaceAlgorithm, SAVINGS_PACE_ALGORITHM_KEY } from './savingsGoal'
import { buildCurrentSnapshotStats, buildStatsRangeView, safeRatio, type StatsRangeId } from './snapshotDerived'
import { buildSnapshot, isSnapshotDateKey, normalizeSnapshot, todayDateKey, type Snapshot } from './snapshots'
import type { AccountOp } from './accountOps'
import type { Transaction } from './ledger'

export type AiChatMessage = {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export type AiContextBuildOptions = {
  includeRaw?: boolean
  maxAccounts?: number
  maxRecentOps?: number
  maxRecentLedger?: number
  maxSnapshots?: number
}

export type AiContextSection = {
  id: string
  title: string
  description?: string
  totalItems?: number
  includedItems?: number
  omittedItems?: number
  items: unknown
}

export type AiFinancialSummaryV1 = {
  schema: 'ratio.ai.financial-summary.v1'
  generatedAt: string
  counts: {
    accounts: number
    snapshots: number
    accountOps: number
    ledgerTransactions: number
  }
  current: {
    date: string | null
    netWorth: number
    totalAssets: number
    debt: number
    cash: number
    invest: number
    fixed: number
    receivable: number
    currentAssets: number
    quickAssets: number
    netLiquid: number
    ratios: {
      debtToAssets: number | null
      netToAssets: number | null
      debtToNet: number | null
      equityMultiplier: number | null
    }
    coverage: {
      current: number | null
      quick: number | null
      cash: number | null
    }
  }
  allocation: Array<{
    groupId: AccountGroupId
    label: string
    amount: number
    percentOfAssets: number | null
  }>
  ranges: Partial<Record<StatsRangeId, {
    startDate: string
    endDate: string
    days: number | null
    snapshotCount: number
    rangeFallback: boolean
    delta: {
      net: number
      assets: number
      debt: number
      cash: number
      invest: number
      fixed: number
      receivable: number
    }
    growth: {
      net: number | null
      assets: number | null
      debt: number | null
      avgDailyNet: number | null
    }
    pace: {
      method: string
      avgDaily: number
      sampleDays: number
      snapshotCount: number
    } | null
  } | null>>
  savingsGoal: {
    latestDate: string | null
    currentNetWorth: number
    targetAmount: number
    targetDate: string
    startDate: string
    startNetWorth: number
    progress: number
    remaining: number
    daysLeft: number | null
    requiredDaily: number | null
    requiredMonthly: number | null
    avgDailyNetChange: number | null
    avgDailyNetChangeMethod: string | null
    paceDailyDelta: number | null
    projectedDate: string | null
    projectedNetAtTargetDate: number | null
    currentPeriodActual: number
    currentPeriodTarget: number | null
    currentPeriodRemaining: number | null
    isComplete: boolean
    isOnTrack: boolean | null
    isPastDue: boolean
  } | null
  activity: {
    accountOpsByKind: Record<AccountOp['kind'], number>
    recentAdjustNet: number
    recentTransferAmount: number
    recentSetBalanceNetDelta: number
    ledgerIncome: number
    ledgerExpense: number
    ledgerNet: number
  }
  anomalies: Array<{
    kind: 'large_net_change' | 'large_debt_change' | 'low_cash_coverage' | 'negative_net_worth'
    date?: string
    message: string
    value: number | null
  }>
  dataQuality: {
    monthStartDay: number
    savingsPaceAlgorithm: string
    latestSnapshotSource: 'snapshots' | 'accounts' | 'none'
    invalidStorageKeys: string[]
    evidencePolicy: string
  }
}

export type AiFinancialContextV1 = {
  schema: 'ratio.ai.financial-context.v1'
  generatedAt: string
  summary: AiFinancialSummaryV1
  sections: AiContextSection[]
}

type ParsedStorageValue = {
  value: unknown
  invalid: boolean
}

const DEFAULT_CONTEXT_OPTIONS: Required<AiContextBuildOptions> = {
  includeRaw: false,
  maxAccounts: 24,
  maxRecentOps: 20,
  maxRecentLedger: 20,
  maxSnapshots: 12,
}

const CONTEXT_RANGE_IDS: StatsRangeId[] = ['5w', '6m', '1y']

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function finiteMoney(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? normalizeMoney(value) : 0
}

function safeJsonParse(raw: string | null): ParsedStorageValue {
  if (raw == null) return { value: null, invalid: false }
  try {
    return { value: JSON.parse(raw) as unknown, invalid: false }
  } catch {
    return { value: raw, invalid: true }
  }
}

function parseStorageJson(storage: Storage, key: string, invalidStorageKeys: string[]) {
  const parsed = safeJsonParse(storage.getItem(key))
  if (parsed.invalid) invalidStorageKeys.push(key)
  return parsed.value
}

function coerceAccountTypeId(value: unknown): AccountTypeId {
  if (typeof value === 'string') {
    try {
      getAccountTypeOption(value as AccountTypeId)
      return value as AccountTypeId
    } catch {
      // fall through
    }
  }
  return 'other_liquid'
}

function coerceAccounts(value: unknown): Account[] {
  if (!Array.isArray(value)) return []
  const accounts: Account[] = []

  value.forEach((item, index) => {
    if (!isRecord(item)) return
    const type = coerceAccountTypeId(item.type)
    const option = getAccountTypeOption(type)
    const name = typeof item.name === 'string' && item.name.trim() ? item.name.trim() : option.name
    const id = typeof item.id === 'string' && item.id.trim() ? item.id : `ai-account-${index}`
    const updatedAt = typeof item.updatedAt === 'string' ? item.updatedAt : ''
    accounts.push({
      id,
      type,
      name,
      balance: finiteMoney(item.balance),
      updatedAt,
    })
  })

  return accounts
}

function coerceSnapshots(value: unknown) {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => normalizeSnapshot(item as Snapshot))
    .filter((snapshot) => isSnapshotDateKey(snapshot.date))
    .sort((a, b) => a.date.localeCompare(b.date))
}

function readMonthStartDay(storage: Storage, invalidStorageKeys: string[]) {
  const raw = storage.getItem(MONTH_START_DAY_KEY)
  if (raw == null) return DEFAULT_MONTH_START_DAY
  const parsed = safeJsonParse(raw)
  if (parsed.invalid) invalidStorageKeys.push(MONTH_START_DAY_KEY)
  return clampMonthStartDay(parsed.value)
}

function readSavingsPaceAlgorithm(storage: Storage, invalidStorageKeys: string[]) {
  const raw = storage.getItem(SAVINGS_PACE_ALGORITHM_KEY)
  if (raw == null) return 'smart'
  const parsed = safeJsonParse(raw)
  if (parsed.invalid) invalidStorageKeys.push(SAVINGS_PACE_ALGORITHM_KEY)
  return coerceSavingsPaceAlgorithm(parsed.value)
}

function latestSnapshotFromData(accounts: Account[], snapshots: Snapshot[]) {
  const latestStored = snapshots[snapshots.length - 1] ?? null
  if (latestStored) return { snapshot: latestStored, source: 'snapshots' as const }
  if (accounts.length > 0) return { snapshot: buildSnapshot(todayDateKey(), accounts), source: 'accounts' as const }
  return { snapshot: null, source: 'none' as const }
}

function groupAccountTotals(accounts: Account[]) {
  const totals: Record<AccountGroupId, number> = {
    liquid: 0,
    invest: 0,
    fixed: 0,
    receivable: 0,
    debt: 0,
  }

  for (const account of accounts) {
    const groupId = getGroupIdByAccountType(account.type)
    totals[groupId] = addMoney(totals[groupId], account.balance)
  }

  return totals
}

function summaryCurrentFromSnapshot(snapshot: Snapshot | null, accounts: Account[]) {
  const fallbackTotals = groupAccountTotals(accounts)
  const currentStats = buildCurrentSnapshotStats(snapshot)
  const cash = snapshot?.cash ?? fallbackTotals.liquid
  const invest = snapshot?.invest ?? fallbackTotals.invest
  const fixed = snapshot?.fixed ?? fallbackTotals.fixed
  const receivable = snapshot?.receivable ?? fallbackTotals.receivable
  const debt = snapshot?.debt ?? fallbackTotals.debt
  const totalAssets = addMoney(addMoney(cash, invest), addMoney(fixed, receivable))
  const netWorth = snapshot?.net ?? subtractMoney(totalAssets, debt)
  const currentAssets = addMoney(addMoney(cash, invest), receivable)
  const quickAssets = addMoney(cash, invest)

  return {
    date: snapshot?.date ?? null,
    netWorth,
    totalAssets,
    debt,
    cash,
    invest,
    fixed,
    receivable,
    currentAssets,
    quickAssets,
    netLiquid: subtractMoney(currentAssets, debt),
    ratios: currentStats?.ratios ?? {
      debtToAssets: safeRatio(debt, totalAssets),
      netToAssets: safeRatio(netWorth, totalAssets),
      debtToNet: netWorth > 0 ? safeRatio(debt, netWorth) : null,
      equityMultiplier: netWorth > 0 ? safeRatio(totalAssets, netWorth) : null,
    },
    coverage: currentStats?.coverage ?? {
      current: safeRatio(currentAssets, debt),
      quick: safeRatio(quickAssets, debt),
      cash: safeRatio(cash, debt),
    },
  }
}

function buildAllocation(current: AiFinancialSummaryV1['current']) {
  const entries: Array<[AccountGroupId, number]> = [
    ['liquid', current.cash],
    ['invest', current.invest],
    ['fixed', current.fixed],
    ['receivable', current.receivable],
    ['debt', current.debt],
  ]

  return entries.map(([groupId, amount]) => ({
    groupId,
    label: accountGroups[groupId].name,
    amount,
    percentOfAssets: groupId === 'debt' ? null : safeRatio(amount, current.totalAssets),
  }))
}

function buildRanges(snapshots: Snapshot[], monthStartDay: number): AiFinancialSummaryV1['ranges'] {
  const ranges: AiFinancialSummaryV1['ranges'] = {}
  for (const rangeId of CONTEXT_RANGE_IDS) {
    const view = buildStatsRangeView(snapshots, rangeId, monthStartDay)
    ranges[rangeId] = view
      ? {
          startDate: view.start.date,
          endDate: view.end.date,
          days: view.days,
          snapshotCount: view.selectedCount,
          rangeFallback: view.rangeFallback,
          delta: view.delta,
          growth: view.growth,
          pace: view.netPace
            ? {
                method: view.netPace.method,
                avgDaily: view.netPace.avgDaily,
                sampleDays: view.netPace.sampleDays,
                snapshotCount: view.netPace.snapshotCount,
              }
            : null,
        }
      : null
  }
  return ranges
}

function summarizeSavingsGoal(value: unknown, snapshots: Snapshot[], monthStartDay: number, savingsPaceAlgorithm: string): AiFinancialSummaryV1['savingsGoal'] {
  const goal = coerceSavingsGoal(value)
  const summary = getSavingsGoalSummary(goal, snapshots, {
    monthStartDay,
    algorithm: coerceSavingsPaceAlgorithm(savingsPaceAlgorithm),
  })
  if (!summary) return null

  return {
    latestDate: summary.latestDate,
    currentNetWorth: summary.currentNetWorth,
    targetAmount: summary.targetAmount,
    targetDate: summary.targetDate,
    startDate: summary.startDate,
    startNetWorth: summary.startNetWorth,
    progress: summary.progress,
    remaining: summary.remaining,
    daysLeft: summary.daysLeft,
    requiredDaily: summary.requiredDaily,
    requiredMonthly: summary.requiredMonthly,
    avgDailyNetChange: summary.avgDailyNetChange,
    avgDailyNetChangeMethod: summary.avgDailyNetChangeMethod,
    paceDailyDelta: summary.paceDailyDelta,
    projectedDate: summary.projectedDate,
    projectedNetAtTargetDate: summary.projectedNetAtTargetDate,
    currentPeriodActual: summary.currentPeriodActual,
    currentPeriodTarget: summary.currentPeriodTarget,
    currentPeriodRemaining: summary.currentPeriodRemaining,
    isComplete: summary.isComplete,
    isOnTrack: summary.isOnTrack,
    isPastDue: summary.isPastDue,
  }
}

function sortByDateDesc<T extends { at?: string; date?: string }>(items: T[]) {
  return items.slice().sort((left, right) => (right.at ?? right.date ?? '').localeCompare(left.at ?? left.date ?? ''))
}

function buildActivity(accountOps: AccountOp[], ledger: Transaction[]) {
  const recentOps = sortByDateDesc(accountOps).slice(0, 60)
  const recentLedger = sortByDateDesc(ledger).slice(0, 60)
  const accountOpsByKind: Record<AccountOp['kind'], number> = {
    rename: 0,
    set_balance: 0,
    adjust: 0,
    transfer: 0,
  }

  let recentAdjustNet = 0
  let recentTransferAmount = 0
  let recentSetBalanceNetDelta = 0
  for (const op of recentOps) {
    accountOpsByKind[op.kind] += 1
    if (op.kind === 'adjust') recentAdjustNet = addMoney(recentAdjustNet, op.delta)
    if (op.kind === 'transfer') recentTransferAmount = addMoney(recentTransferAmount, op.amount)
    if (op.kind === 'set_balance') recentSetBalanceNetDelta = addMoney(recentSetBalanceNetDelta, subtractMoney(op.after, op.before))
  }

  let ledgerIncome = 0
  let ledgerExpense = 0
  for (const tx of recentLedger) {
    if (tx.type === 'income') ledgerIncome = addMoney(ledgerIncome, Math.abs(tx.amount))
    if (tx.type === 'expense') ledgerExpense = addMoney(ledgerExpense, Math.abs(tx.amount))
  }

  return {
    accountOpsByKind,
    recentAdjustNet,
    recentTransferAmount,
    recentSetBalanceNetDelta,
    ledgerIncome,
    ledgerExpense,
    ledgerNet: subtractMoney(ledgerIncome, ledgerExpense),
  }
}

function buildAnomalies(current: AiFinancialSummaryV1['current'], snapshots: Snapshot[]): AiFinancialSummaryV1['anomalies'] {
  const anomalies: AiFinancialSummaryV1['anomalies'] = []
  if (current.netWorth < 0) {
    anomalies.push({
      kind: 'negative_net_worth',
      message: '当前净资产为负，需要优先解释负债结构和偿债压力。',
      value: current.netWorth,
    })
  }
  if (current.debt > 0 && current.coverage.cash != null && Number.isFinite(current.coverage.cash) && current.coverage.cash < 0.25) {
    anomalies.push({
      kind: 'low_cash_coverage',
      message: '现金对负债覆盖偏低，分析时需要关注短期流动性。',
      value: current.coverage.cash,
    })
  }

  for (let i = 1; i < snapshots.length; i += 1) {
    const previous = snapshots[i - 1]
    const next = snapshots[i]
    const netDelta = subtractMoney(next.net, previous.net)
    const debtDelta = subtractMoney(next.debt, previous.debt)
    const assetsBase = Math.max(1, Math.abs(previous.net), Math.abs(next.net), current.totalAssets)
    if (Math.abs(netDelta) >= Math.max(5000, assetsBase * 0.12)) {
      anomalies.push({
        kind: 'large_net_change',
        date: next.date,
        message: `相邻快照净资产变化较大：${previous.date} 至 ${next.date}。`,
        value: netDelta,
      })
    }
    if (Math.abs(debtDelta) >= Math.max(3000, Math.max(1, current.debt) * 0.2)) {
      anomalies.push({
        kind: 'large_debt_change',
        date: next.date,
        message: `相邻快照负债变化较大：${previous.date} 至 ${next.date}。`,
        value: debtDelta,
      })
    }
  }

  return anomalies.slice(-8)
}

function trimAccounts(accounts: Account[], maxAccounts: number) {
  return accounts
    .slice()
    .sort((left, right) => Math.abs(right.balance) - Math.abs(left.balance))
    .slice(0, maxAccounts)
    .map((account) => {
      const option = getAccountTypeOption(account.type)
      return {
        id: account.id,
        name: account.name,
        type: account.type,
        typeName: option.name,
        groupId: option.groupId,
        groupName: accountGroups[option.groupId].name,
        balance: account.balance,
        updatedAt: account.updatedAt,
      }
    })
}

function trimAccountOps(accountOps: AccountOp[], maxRecentOps: number) {
  return sortByDateDesc(accountOps).slice(0, maxRecentOps).map((op) => {
    if (op.kind === 'rename') return op
    if (op.kind === 'set_balance') return { ...op, netDelta: subtractMoney(op.after, op.before) }
    return op
  })
}

function trimLedger(ledger: Transaction[], maxRecentLedger: number) {
  return sortByDateDesc(ledger).slice(0, maxRecentLedger)
}

function trimSnapshots(snapshots: Snapshot[], maxSnapshots: number) {
  return snapshots.slice(Math.max(0, snapshots.length - maxSnapshots))
}

function buildSections(args: {
  accounts: Account[]
  accountOps: AccountOp[]
  ledger: Transaction[]
  snapshots: Snapshot[]
  savingsGoalRaw: unknown
  options: Required<AiContextBuildOptions>
}) {
  const { accounts, accountOps, ledger, snapshots, savingsGoalRaw, options } = args
  const sections: AiContextSection[] = [
    {
      id: 'accounts.top',
      title: '按余额排序的账户证据',
      totalItems: accounts.length,
      includedItems: Math.min(accounts.length, options.maxAccounts),
      omittedItems: Math.max(0, accounts.length - options.maxAccounts),
      items: trimAccounts(accounts, options.maxAccounts),
    },
    {
      id: 'snapshots.recent',
      title: '最近资产快照',
      description: '仅包含最近快照；相邻快照差值可能同时包含现金流、估值变化和余额校准。',
      totalItems: snapshots.length,
      includedItems: Math.min(snapshots.length, options.maxSnapshots),
      omittedItems: Math.max(0, snapshots.length - options.maxSnapshots),
      items: trimSnapshots(snapshots, options.maxSnapshots),
    },
    {
      id: 'accountOps.recent',
      title: '最近账户操作',
      description: 'adjust 是期间净变动汇总，transfer 是内部转移，set_balance 是余额校准。',
      totalItems: accountOps.length,
      includedItems: Math.min(accountOps.length, options.maxRecentOps),
      omittedItems: Math.max(0, accountOps.length - options.maxRecentOps),
      items: trimAccountOps(accountOps, options.maxRecentOps),
    },
    {
      id: 'ledger.recent',
      title: '最近可选明细账',
      description: 'ledger 可能不完整，不应推断为全部收入支出。',
      totalItems: ledger.length,
      includedItems: Math.min(ledger.length, options.maxRecentLedger),
      omittedItems: Math.max(0, ledger.length - options.maxRecentLedger),
      items: trimLedger(ledger, options.maxRecentLedger),
    },
    {
      id: 'savingsGoal.raw',
      title: '储蓄目标原始设置',
      items: savingsGoalRaw,
    },
  ]

  if (options.includeRaw) {
    sections.push({
      id: 'raw.trimmed',
      title: '按需原始数据片段',
      description: '这是裁剪后的原始数据，用于排查摘要无法回答的问题。',
      items: {
        accounts: trimAccounts(accounts, options.maxAccounts),
        snapshots: trimSnapshots(snapshots, options.maxSnapshots),
        accountOps: trimAccountOps(accountOps, options.maxRecentOps),
        ledger: trimLedger(ledger, options.maxRecentLedger),
        savingsGoal: savingsGoalRaw,
      },
    })
  }

  return sections
}

export function buildAiFinancialContext(
  storage: Storage = localStorage,
  options: AiContextBuildOptions = {},
): AiFinancialContextV1 {
  const resolvedOptions = { ...DEFAULT_CONTEXT_OPTIONS, ...options }
  const invalidStorageKeys: string[] = []
  const generatedAt = new Date().toISOString()
  const accountsRaw = parseStorageJson(storage, 'ratio.accounts', invalidStorageKeys)
  const snapshotsRaw = parseStorageJson(storage, 'ratio.snapshots', invalidStorageKeys)
  const accountOpsRaw = parseStorageJson(storage, 'ratio.accountOps', invalidStorageKeys)
  const ledgerRaw = parseStorageJson(storage, 'ratio.ledger', invalidStorageKeys)
  const savingsGoalRaw = parseStorageJson(storage, 'ratio.savingsGoal', invalidStorageKeys)
  const monthStartDay = readMonthStartDay(storage, invalidStorageKeys)
  const savingsPaceAlgorithm = readSavingsPaceAlgorithm(storage, invalidStorageKeys)

  const accounts = coerceAccounts(accountsRaw)
  const snapshots = coerceSnapshots(snapshotsRaw)
  const accountOps = coerceStoredAccountOps(accountOpsRaw)
  const ledger = coerceStoredTransactions(ledgerRaw)
  const latest = latestSnapshotFromData(accounts, snapshots)
  const current = summaryCurrentFromSnapshot(latest.snapshot, accounts)
  const summary: AiFinancialSummaryV1 = {
    schema: 'ratio.ai.financial-summary.v1',
    generatedAt,
    counts: {
      accounts: accounts.length,
      snapshots: snapshots.length,
      accountOps: accountOps.length,
      ledgerTransactions: ledger.length,
    },
    current,
    allocation: buildAllocation(current),
    ranges: buildRanges(snapshots, monthStartDay),
    savingsGoal: summarizeSavingsGoal(savingsGoalRaw, snapshots, monthStartDay, savingsPaceAlgorithm),
    activity: buildActivity(accountOps, ledger),
    anomalies: buildAnomalies(current, snapshots),
    dataQuality: {
      monthStartDay,
      savingsPaceAlgorithm,
      latestSnapshotSource: latest.source,
      invalidStorageKeys,
      evidencePolicy: '默认只发送派生摘要、最近快照、最近账户操作和最近 ledger；ledger 可能不完整。',
    },
  }

  return {
    schema: 'ratio.ai.financial-context.v1',
    generatedAt,
    summary,
    sections: buildSections({
      accounts,
      accountOps,
      ledger,
      snapshots,
      savingsGoalRaw,
      options: resolvedOptions,
    }),
  }
}

export function buildAiSystemMessage(storage: Storage = localStorage): AiChatMessage {
  const context = buildAiFinancialContext(storage)
  return {
    role: 'system',
    content:
      '你是 Ratio 的个人财务分析助手。请只基于下面 JSON 中的事实回答，不要编造不存在的交易、分类、收入或支出。\n\n' +
      '分析协议：\n' +
      '1. 先用一句话说明数据口径，例如“基于最近快照和账户操作，ledger 可能不完整”。\n' +
      '2. 再给 2-4 条核心结论，每条都引用具体金额、比例、日期或快照变化作为证据。\n' +
      '3. 如果用户问原因，要区分“可由数据确认”和“只能推测/需要补充信息”。\n' +
      '4. 输出建议时按优先级排序，避免泛泛而谈。\n' +
      '5. 信息不足时先提出需要补充的问题。\n\n' +
      '重要语义：\n' +
      '- Ratio 不是逐笔记账工具；用户通常不会记录每一笔交易。\n' +
      '- accountOps.kind="adjust" 表示期间净流量/净变动的汇总记录，不是单笔交易。\n' +
      '- accountOps.kind="set_balance" 是余额校准/覆盖；差额可能同时包含现金流、估值波动和校准。\n' +
      '- accountOps.kind="transfer" 是账户间内部转移，不改变净资产；不要把它当作收入或支出。\n' +
      '- snapshots 是不同日期的余额快照；相邻快照差值代表期间总变化，不能拆成逐笔明细。\n' +
      '- ledger 是可选明细，可能不完整；不要假设它覆盖全部收支。\n' +
      '- savingsGoal 是目标，不是实际资产或负债。\n\n' +
      '建议回答结构：数据口径 / 结论 / 证据 / 风险 / 下一步。\n\n' +
      JSON.stringify(context, null, 2),
  }
}

export function getAiEndpointIssue(): string | null {
  if (typeof window === 'undefined') return null

  const cloudSettings = getCloudSyncSettings()
  if (!cloudSettings.useCloudAi) return '请先在设置中启用云端 AI 代理'
  if (!hasCloudCredentials(cloudSettings)) return '云端 AI 已启用，但云同步账号未配置'

  let serverUrl: URL
  try {
    serverUrl = new URL(cloudSettings.serverUrl)
  } catch {
    return '云端服务器地址无效'
  }

  if (window.location.protocol === 'https:' && serverUrl.protocol === 'http:') {
    return '当前页面为 HTTPS，浏览器会拦截 HTTP 云端 AI 代理请求'
  }

  return null
}

export function getAiTransportLabel() {
  const cloudSettings = getCloudSyncSettings()
  if (cloudSettings.useCloudAi && hasCloudCredentials(cloudSettings)) return `云端代理：${cloudSettings.serverUrl}`
  return '云端 AI 未启用'
}

export function readResponseContent(value: unknown): string | undefined {
  if (!isRecord(value)) return undefined

  const choices = value.choices
  if (Array.isArray(choices) && choices.length > 0) {
    const first = choices[0]
    if (isRecord(first)) {
      const delta = first.delta
      if (isRecord(delta) && typeof delta.content === 'string') return delta.content
      const message = first.message
      if (isRecord(message) && typeof message.content === 'string') return message.content
      if (typeof first.text === 'string') return first.text
    }
  }

  if (typeof value.output_text === 'string') return value.output_text
  const output = value.output
  if (Array.isArray(output) && output.length > 0) {
    const chunks: string[] = []
    output.forEach((item) => {
      if (!isRecord(item)) return
      const content = item.content
      if (Array.isArray(content)) {
        content.forEach((part) => {
          if (!isRecord(part)) return
          if (typeof part.text === 'string' && (part.type === 'output_text' || !part.type)) chunks.push(part.text)
        })
      } else if (typeof item.text === 'string' && item.type === 'output_text') {
        chunks.push(item.text)
      }
    })
    if (chunks.length > 0) return chunks.join('')
  }
  if (typeof value.text === 'string') return value.text
  return undefined
}

function isAbortError(err: unknown) {
  return err instanceof DOMException && err.name === 'AbortError'
}

function readStreamDelta(value: unknown) {
  if (!isRecord(value)) return ''
  if (typeof value.delta === 'string') return value.delta
  const choices = value.choices
  if (Array.isArray(choices) && choices.length > 0) {
    return choices
      .map((choice) => {
        if (!isRecord(choice)) return ''
        const delta = choice.delta
        if (isRecord(delta) && typeof delta.content === 'string') return delta.content
        const message = choice.message
        if (isRecord(message) && typeof message.content === 'string') return message.content
        if (typeof choice.text === 'string') return choice.text
        return ''
      })
      .join('')
  }

  if (typeof value.type === 'string') return ''
  return readResponseContent(value) ?? ''
}

function readStreamEventDeltas(event: string) {
  const deltas: string[] = []
  const dataLines = event
    .split(/\r?\n/)
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trimStart())
  for (const data of dataLines) {
    if (!data || data === '[DONE]') continue
    try {
      const delta = readStreamDelta(JSON.parse(data) as unknown)
      if (!delta) continue
      deltas.push(delta)
    } catch {
      // Ignore malformed stream events; the final empty response check catches unusable streams.
    }
  }
  return deltas
}

async function readStreamingResponse(res: Response, onDelta: (delta: string) => void) {
  const contentType = res.headers.get('content-type') || ''
  if (!contentType.toLowerCase().includes('text/event-stream')) {
    const json = (await res.json()) as unknown
    const content = readResponseContent(json)
    if (typeof content !== 'string' || content.trim().length === 0) throw new Error('Empty AI response')
    onDelta(content)
    return content
  }

  const reader = res.body?.getReader()
  if (!reader) throw new Error('Empty AI response')

  const decoder = new TextDecoder()
  let buffer = ''
  let content = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const events = buffer.split(/\r?\n\r?\n/)
    buffer = events.pop() ?? ''

    for (const event of events) {
      for (const delta of readStreamEventDeltas(event)) {
        content += delta
        onDelta(delta)
      }
    }
  }

  const tail = decoder.decode()
  if (tail) buffer += tail
  if (buffer) {
    for (const delta of readStreamEventDeltas(buffer)) {
      content += delta
      onDelta(delta)
    }
  }
  if (content.trim().length === 0) throw new Error('Empty AI response')
  return content
}

export async function fetchAiChatCompletion(args: {
  messages: AiChatMessage[]
  signal?: AbortSignal
  stream?: boolean
  onDelta?: (delta: string) => void
}) {
  const { messages, signal, stream = false, onDelta } = args

  const issue = getAiEndpointIssue()
  if (issue) throw new Error(issue)

  const cloudSettings = getCloudSyncSettings()
  if (stream && onDelta) {
    try {
      const res = await fetchCloudAiChatStream(cloudSettings, { messages, signal })
      return await readStreamingResponse(res, onDelta)
    } catch (err) {
      if (isAbortError(err)) throw err
      const json = await fetchCloudAiChat(cloudSettings, { messages, signal, stream: false })
      const content = readResponseContent(json)
      if (typeof content !== 'string' || content.trim().length === 0) throw new Error('Empty AI response')
      onDelta(content)
      return content
    }
  }

  const json = await fetchCloudAiChat(cloudSettings, { messages, signal, stream: false })
  const content = readResponseContent(json)
  if (typeof content !== 'string' || content.trim().length === 0) throw new Error('Empty AI response')
  return content
}
