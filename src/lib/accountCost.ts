import { getGroupIdByAccountType, type Account, type AccountTypeId } from './accounts'
import type { AccountOp } from './accountOps'
import { addMoney, moneyEquals, normalizeMoney, subtractMoney } from './money'

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

// ISO / 可解析时间戳 → 本地日历日。展示归档时刻必须走这里，不能 slice(0,10)（那是 UTC 日）。
export function dateKeyFromTimestamp(value: string): string | undefined {
  const ms = Date.parse(value)
  if (!Number.isFinite(ms)) return undefined
  return todayDateKey(new Date(ms))
}

function hasOtherMoneyHistory(ops: readonly AccountOp[], itemId: string, exceptOpId: string): boolean {
  return ops.some((op) => {
    if (op.id === exceptOpId) return false
    if (op.kind === 'rename' || op.kind === 'set_cost') return false
    if (op.kind === 'transfer') return op.fromId === itemId || op.toId === itemId
    return op.accountId === itemId
  })
}

// 这笔转账是物品的开户转入（新建并转入，或先建 0 净值再转入）且没有后续金额历史时，
// 删除转账应连物品一起删，避免留下 0 净值幽灵条目。
// 但物品若带有与转账金额不同的原值（用户手工建的物品，转入只是部分付款），
// 它承载了转账之外的信息，删除转账只回滚金额、不能连物品和原值一起删。
export function findItemOpenedByTransfer(
  op: AccountOp,
  accounts: readonly Account[],
  ops: readonly AccountOp[],
): Account | null {
  if (op.kind !== 'transfer') return null

  const sides: Array<{ id: string; before: number; after: number }> = []
  if (moneyEquals(op.toBefore, 0)) sides.push({ id: op.toId, before: op.toBefore, after: op.toAfter })
  if (op.fromId !== op.toId && moneyEquals(op.fromBefore, 0)) {
    sides.push({ id: op.fromId, before: op.fromBefore, after: op.fromAfter })
  }

  for (const side of sides) {
    const account = accounts.find((item) => item.id === side.id)
    if (!account || account.archivedAt || !isItemAccountType(account.type)) continue
    if (account.cost != null && !moneyEquals(account.cost, op.amount)) continue
    if (hasOtherMoneyHistory(ops, account.id, op.id)) continue
    if (!moneyEquals(account.balance, 0) && !moneyEquals(account.balance, side.after)) continue
    return account
  }

  return null
}

export function companionOpIdsForItem(
  ops: readonly AccountOp[],
  itemId: string,
  exceptOpId: string,
): string[] {
  const ids: string[] = []
  for (const op of ops) {
    if (op.id === exceptOpId || op.kind === 'transfer') continue
    if (op.accountId === itemId) ids.push(op.id)
  }
  return ids
}

// 购入转账对应的那条「首次记录原值」记录（新建并转入时随转账一起落下，after = 转账金额）。
// 修改购入金额时要把它一并改掉，否则历史里的原值和价值卡上的原值对不上。
export function findPurchaseCostOp(
  ops: readonly AccountOp[],
  itemId: string,
  amount: number,
): Extract<AccountOp, { kind: 'set_cost' }> | null {
  for (const op of ops) {
    if (op.kind !== 'set_cost' || op.accountId !== itemId) continue
    if (op.before === null && moneyEquals(op.after, amount)) return op
  }
  return null
}
