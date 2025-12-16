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
    const gid = getGroupIdByAccountType(a.type)
    byGroup[gid] += a.balance
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
