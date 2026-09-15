import { getGroupIdByAccountType, type Account, type AccountTypeId } from './accounts'
import { addMoney, normalizeMoney, subtractMoney } from './money'

// 「物品」= 固定资产分组下的账户条目：balance 是账面净值，cost 是购入原值。
// 会计口径：账面净值 = 原值 − 累计减值；净值高于原值时为增值（如房产升值），不做拦截。

export function isItemAccountType(type: AccountTypeId): boolean {
  return getGroupIdByAccountType(type) === 'fixed'
}

export function normalizeStoredAccountCost(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined
  const normalized = normalizeMoney(value)
  return normalized > 0 ? normalized : undefined
}

const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/

export function normalizeStoredDateKey(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const key = value.trim()
  if (!DATE_KEY_RE.test(key)) return undefined
  const parsed = new Date(`${key}T00:00:00`)
  return Number.isNaN(parsed.getTime()) || todayDateKey(parsed) !== key ? undefined : key
}

export type ItemValueSummary = {
  cost: number
  net: number
  // > 0 减值，< 0 增值
  impairment: number
  // 减值占原值比例（0~1，增值时为负）
  impairmentRatio: number
  // 净值占原值比例，用于进度条（可能 > 1）
  retainedRatio: number
}

export function summarizeItemValue(cost: number | undefined, balance: number): ItemValueSummary | null {
  if (cost == null || !Number.isFinite(cost) || !(cost > 0) || !Number.isFinite(balance)) return null
  const net = normalizeMoney(balance)
  const impairment = subtractMoney(cost, net)
  return {
    cost,
    net,
    impairment,
    impairmentRatio: impairment / cost,
    retainedRatio: net / cost,
  }
}

export type ItemValueTotals = {
  // 记录了原值的物品数
  counted: number
  cost: number
  net: number
  impairment: number
}

export function summarizeItemValueTotals(accounts: readonly Account[]): ItemValueTotals {
  let counted = 0
  let cost = 0
  let net = 0
  for (const account of accounts) {
    if (account.archivedAt || !isItemAccountType(account.type)) continue
    const summary = summarizeItemValue(account.cost, account.balance)
    if (!summary) continue
    counted += 1
    cost = addMoney(cost, summary.cost)
    net = addMoney(net, summary.net)
  }
  return { counted, cost, net, impairment: subtractMoney(cost, net) }
}

// 比例展示：整数百分比；0~1% 之间显示「<1%」避免把小减值抹成 0
export function formatRatioPercent(ratio: number): string {
  if (!Number.isFinite(ratio)) return '0%'
  const abs = Math.abs(ratio) * 100
  if (abs > 0 && abs < 1) return '<1%'
  return `${Math.round(abs)}%`
}

export function formatDateKey(key: string): string {
  const [y, m, d] = key.split('-')
  if (!y || !m || !d) return key
  return `${y}年${Number(m)}月${Number(d)}日`
}

export function todayDateKey(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}
