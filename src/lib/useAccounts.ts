import { useCallback, useMemo } from 'react'
import { useLocalStorageState } from './useLocalStorageState'
import {
  accountGroups,
  defaultAccountName,
  getGroupIdByAccountType,
  getAccountTypeOption,
  type Account,
  type AccountGroupId,
  type AccountTypeId,
} from './accounts'

function createId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function nowIso() {
  return new Date().toISOString()
}

const initialAccounts: Account[] = []

export function useAccounts() {
  const [accounts, setAccounts] = useLocalStorageState<Account[]>('ratio.accounts', initialAccounts)

  const addAccount = useCallback(
    (type: AccountTypeId) => {
      const next: Account = {
        id: createId(),
        type,
        name: defaultAccountName(type),
        balance: 0,
        updatedAt: nowIso(),
      }
      setAccounts((prev) => [next, ...prev])
      return next
    },
    [setAccounts],
  )

  const updateBalance = useCallback(
    (id: string, balance: number) => {
      setAccounts((prev) =>
        prev.map((a) => (a.id === id ? { ...a, balance, updatedAt: nowIso() } : a)),
      )
    },
    [setAccounts],
  )

  const grouped = useMemo(() => {
    const byGroup: Record<AccountGroupId, Account[]> = {
      liquid: [],
      invest: [],
      fixed: [],
      receivable: [],
      debt: [],
    }

    for (const a of accounts) {
      const gid = getGroupIdByAccountType(a.type)
      byGroup[gid].push(a)
    }

    const groupCards = (Object.keys(byGroup) as AccountGroupId[]).map((gid) => {
      const list = byGroup[gid]
      const total = list.reduce((s, a) => s + a.balance, 0)
      return {
        group: accountGroups[gid],
        accounts: list,
        total,
      }
    })

    const assetsTotal = groupCards
      .filter((g) => g.group.id !== 'debt')
      .reduce((s, g) => s + g.total, 0)

    const debtTotal = groupCards
      .filter((g) => g.group.id === 'debt')
      .reduce((s, g) => s + g.total, 0)

    return {
      groupCards,
      assetsTotal,
      debtTotal,
      netWorth: assetsTotal - debtTotal,
    }
  }, [accounts])

  const getIcon = useCallback((type: AccountTypeId) => getAccountTypeOption(type).icon, [])

  return {
    accounts,
    addAccount,
    updateBalance,
    grouped,
    getIcon,
  }
}
