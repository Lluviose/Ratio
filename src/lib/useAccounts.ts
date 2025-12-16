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

function isDebtAccount(type: AccountTypeId) {
  return type === 'credit_card' || type === 'loan' || type === 'payable' || type === 'other_debt'
}

function applyFlow(type: AccountTypeId, balance: number, flow: number) {
  if (isDebtAccount(type)) return balance - flow
  return balance + flow
}

const initialAccounts: Account[] = []

export function useAccounts() {
  const [accounts, setAccounts] = useLocalStorageState<Account[]>('ratio.accounts', initialAccounts)

  const addAccount = useCallback(
    (type: AccountTypeId, customName?: string) => {
      const next: Account = {
        id: createId(),
        type,
        name: customName?.trim() || defaultAccountName(type),
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

  const renameAccount = useCallback(
    (id: string, name: string) => {
      const nextName = name.trim()
      if (!nextName) return
      setAccounts((prev) => prev.map((a) => (a.id === id ? { ...a, name: nextName, updatedAt: nowIso() } : a)))
    },
    [setAccounts],
  )

  const adjustBalance = useCallback(
    (id: string, delta: number) => {
      if (!Number.isFinite(delta) || delta === 0) return
      setAccounts((prev) =>
        prev.map((a) => (a.id === id ? { ...a, balance: a.balance + delta, updatedAt: nowIso() } : a)),
      )
    },
    [setAccounts],
  )

  const transfer = useCallback(
    (fromId: string, toId: string, amount: number) => {
      if (fromId === toId) return
      if (!Number.isFinite(amount) || amount <= 0) return

      setAccounts((prev) => {
        const from = prev.find((a) => a.id === fromId)
        const to = prev.find((a) => a.id === toId)
        if (!from || !to) return prev

        const fromAfter = applyFlow(from.type, from.balance, -amount)
        const toAfter = applyFlow(to.type, to.balance, amount)
        const ts = nowIso()

        return prev.map((a) => {
          if (a.id === fromId) return { ...a, balance: fromAfter, updatedAt: ts }
          if (a.id === toId) return { ...a, balance: toAfter, updatedAt: ts }
          return a
        })
      })
    },
    [setAccounts],
  )

  const liquidAccounts = useMemo(
    () => accounts.filter((a) => getGroupIdByAccountType(a.type) === 'liquid'),
    [accounts],
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
    renameAccount,
    adjustBalance,
    transfer,
    grouped,
    liquidAccounts,
    getIcon,
  }
}
