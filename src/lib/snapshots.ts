import type { Account, AccountGroupId, AccountTypeId } from './accounts'
import { getAccountTypeOption, getGroupIdByAccountType } from './accounts'
import { normalizeStoredAccountBalance } from './accountBalance'
import { addMoney, normalizeMoney } from './money'

export type SnapshotAccount = {
  id: string
  type: AccountTypeId
  name: string
  balance: number
}

export type Snapshot = {
  date: string
  net: number
  debt: number
  cash: number
  invest: number
  fixed: number
  receivable: number
  accounts?: SnapshotAccount[]
}

function toFiniteMoney(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? normalizeMoney(value) : 0
}

export function isSnapshotDateKey(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return false
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  if (![year, month, day].every((v) => Number.isInteger(v))) return false
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}

function isAccountTypeId(value: unknown): value is AccountTypeId {
  if (typeof value !== 'string') return false
  try {
    getAccountTypeOption(value as AccountTypeId)
    return true
  } catch {
    return false
  }
}

function normalizeSnapshotGroupAmount(groupId: AccountGroupId, value: unknown): number {
  const normalized = toFiniteMoney(value)
  if (normalized >= 0) return normalized
  return groupId === 'debt' ? normalizeMoney(Math.abs(normalized)) : 0
}

export function normalizeSnapshot(s: Snapshot): Snapshot {
  const anySnap = s as unknown as Record<string, unknown>
  const date = typeof anySnap.date === 'string' ? anySnap.date : ''
  const accountsRaw = anySnap.accounts
  const accounts = Array.isArray(accountsRaw)
    ? accountsRaw
        .map((a) => a as Record<string, unknown>)
        .filter((a) => typeof a.id === 'string' && isAccountTypeId(a.type) && typeof a.name === 'string')
        .map((a) => ({
          id: a.id as string,
          type: a.type as AccountTypeId,
          name: a.name as string,
          balance: normalizeStoredAccountBalance(a.type as AccountTypeId, a.balance),
        }))
    : undefined

  const debt = normalizeSnapshotGroupAmount('debt', anySnap.debt)
  const cash = normalizeSnapshotGroupAmount('liquid', anySnap.cash ?? anySnap.liquid)
  const invest = normalizeSnapshotGroupAmount('invest', anySnap.invest)
  const fixed = normalizeSnapshotGroupAmount('fixed', anySnap.fixed)
  const receivable = normalizeSnapshotGroupAmount('receivable', anySnap.receivable)
  const assetsTotal = addMoney(addMoney(cash, invest), addMoney(fixed, receivable))

  return {
    date,
    net: addMoney(assetsTotal, -debt),
    debt,
    cash,
    invest,
    fixed,
    receivable,
    accounts,
  }
}

export function todayDateKey() {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function buildSnapshot(date: string, accounts: Account[]): Snapshot {
  const byGroup: Record<AccountGroupId, number> = {
    liquid: 0,
    invest: 0,
    fixed: 0,
    receivable: 0,
    debt: 0,
  }

  for (const a of accounts) {
    const balance = normalizeStoredAccountBalance(a.type, a.balance)
    const gid = getGroupIdByAccountType(a.type)
    byGroup[gid] = addMoney(byGroup[gid], balance)
  }

  let assetsTotal = 0
  for (const gid of ['liquid', 'invest', 'fixed', 'receivable'] as const) {
    assetsTotal = addMoney(assetsTotal, byGroup[gid])
  }
  const debtTotal = byGroup.debt

  return {
    date,
    net: addMoney(assetsTotal, -debtTotal),
    debt: debtTotal,
    cash: byGroup.liquid,
    invest: byGroup.invest,
    fixed: byGroup.fixed,
    receivable: byGroup.receivable,
    accounts: accounts.map((a) => ({
      id: a.id,
      type: a.type,
      name: a.name,
      balance: normalizeStoredAccountBalance(a.type, a.balance),
    })),
  }
}

export function upsertSnapshot(snapshots: readonly Snapshot[], next: Snapshot): Snapshot[] {
  const normalizedNext = normalizeSnapshot(next)
  const copy = snapshots
    .map((s) => normalizeSnapshot(s))
    .filter((s) => isSnapshotDateKey(s.date) && s.date !== normalizedNext.date)
  if (!isSnapshotDateKey(normalizedNext.date)) return copy
  copy.push(normalizedNext)
  copy.sort((a, b) => a.date.localeCompare(b.date))
  return copy
}

export function withAccountSnapshot(
  snapshots: readonly Snapshot[],
  accounts: readonly Account[],
  date: string = todayDateKey(),
): Snapshot[] {
  return upsertSnapshot(snapshots, buildSnapshot(date, [...accounts]))
}
