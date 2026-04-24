import type { Account, AccountGroupId, AccountTypeId } from './accounts'
import { getGroupIdByAccountType } from './accounts'
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
        .filter((a) => typeof a.id === 'string' && typeof a.type === 'string' && typeof a.name === 'string')
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
