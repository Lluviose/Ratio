import type { Account, AccountGroupId, AccountTypeId } from './accounts'

export type AccountSortMode = 'manual' | 'balance'

export const ACCOUNT_SORT_MODE_KEY = 'ratio.accountSort.mode' as const
export const ACCOUNT_TYPE_ORDER_BY_GROUP_KEY = 'ratio.accountSort.typeOrderByGroup' as const
export const ACCOUNT_ORDER_BY_TYPE_KEY = 'ratio.accountSort.accountOrderByType' as const

export type ManualTypeOrderByGroup = Partial<Record<AccountGroupId, AccountTypeId[]>>
export type ManualAccountOrderByType = Partial<Record<AccountTypeId, string[]>>

export function mergeOrder<T extends string>(current: readonly T[], saved?: readonly T[]): T[] {
  if (!saved || saved.length === 0) return [...current]
  const currentSet = new Set(current)
  const used = new Set<T>()

  const merged: T[] = []
  for (const id of saved) {
    if (!currentSet.has(id)) continue
    if (used.has(id)) continue
    used.add(id)
    merged.push(id)
  }

  for (const id of current) {
    if (used.has(id)) continue
    used.add(id)
    merged.push(id)
  }

  return merged
}

export function sortByOrder<T>(
  items: readonly T[],
  getId: (item: T) => string,
  order?: readonly string[],
): T[] {
  if (!order || order.length === 0) return [...items]
  const rank = new Map(order.map((id, i) => [id, i]))

  return items
    .map((item, idx) => ({ item, idx, rank: rank.get(getId(item)) }))
    .sort((a, b) => (a.rank ?? Number.POSITIVE_INFINITY) - (b.rank ?? Number.POSITIVE_INFINITY) || a.idx - b.idx)
    .map((x) => x.item)
}

export function sortAccountsByBalanceDesc(accounts: readonly Account[]): Account[] {
  return [...accounts].sort((a, b) => {
    if (b.balance !== a.balance) return b.balance - a.balance
    if (b.updatedAt !== a.updatedAt) return b.updatedAt.localeCompare(a.updatedAt)
    return a.name.localeCompare(b.name, 'zh-Hans-CN')
  })
}

