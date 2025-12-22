import type { Account, AccountGroupId, AccountTypeId } from './accounts'
import { getGroupIdByAccountType } from './accounts'

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

function toFiniteNumber(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0
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
          balance: toFiniteNumber(a.balance),
        }))
    : undefined

  return {
    date,
    net: toFiniteNumber(anySnap.net),
    debt: toFiniteNumber(anySnap.debt),
    cash: toFiniteNumber(anySnap.cash ?? anySnap.liquid),
    invest: toFiniteNumber(anySnap.invest),
    fixed: toFiniteNumber(anySnap.fixed),
    receivable: toFiniteNumber(anySnap.receivable),
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
    const balance = Number.isFinite(a.balance) ? a.balance : 0
    const gid = getGroupIdByAccountType(a.type)
    byGroup[gid] += balance
  }

  const assetsTotal = byGroup.liquid + byGroup.invest + byGroup.fixed + byGroup.receivable
  const debtTotal = byGroup.debt

  return {
    date,
    net: assetsTotal - debtTotal,
    debt: debtTotal,
    cash: byGroup.liquid,
    invest: byGroup.invest,
    fixed: byGroup.fixed,
    receivable: byGroup.receivable,
    accounts: accounts.map((a) => ({
      id: a.id,
      type: a.type,
      name: a.name,
      balance: a.balance,
    })),
  }
}
