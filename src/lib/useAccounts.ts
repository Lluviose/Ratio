import { useCallback, useMemo } from 'react'
import { useLocalStorageState } from './useLocalStorageState'
import { addMoney, normalizeMoney } from './money'
import {
  accountGroups,
  defaultAccountName,
  getGroupIdByAccountType,
  getAccountTypeOption,
  type Account,
  type AccountGroupId,
  type AccountTypeId,
} from './accounts'
import {
  applyAccountFlow,
  canApplyBalanceDelta,
  isNegativeAccountBalance,
  normalizeStoredAccountBalance,
} from './accountBalance'
import { isItemAccountType, normalizeStoredAccountCost, normalizeStoredDateKey } from './accountCost'

function createId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function nowIso() {
  return new Date().toISOString()
}

function legacyIdPart(value: string, fallback: string) {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return normalized || fallback
}

function legacyAccountId(index: number, type: AccountTypeId, name: string) {
  return `legacy-account-${index}-${legacyIdPart(type, 'type')}-${legacyIdPart(name, 'account')}`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function coerceAccountTypeId(value: unknown): AccountTypeId {
  if (typeof value === 'string') {
    try {
      getAccountTypeOption(value as AccountTypeId)
      return value as AccountTypeId
    } catch {
      // ignore
    }
  }
  return 'other_liquid'
}

const initialAccounts: Account[] = []

function coerceAccounts(value: unknown): Account[] {
  if (!Array.isArray(value)) return initialAccounts

  const result: Account[] = []
  for (const [index, item] of value.entries()) {
    if (!isRecord(item)) continue

    const type = coerceAccountTypeId(item.type)
    const name =
      typeof item.name === 'string' && item.name.trim() ? item.name.trim() : defaultAccountName(type)
    const balance = normalizeStoredAccountBalance(type, item.balance)
    const id = typeof item.id === 'string' && item.id.trim() ? item.id : legacyAccountId(index, type, name)
    const updatedAt = typeof item.updatedAt === 'string' ? item.updatedAt : ''

    const account: Account = { id, type, name, balance, updatedAt }
    // 原值/购入日期只对物品（固定资产）有意义；其他分组即使残留也丢弃
    if (isItemAccountType(type)) {
      const cost = normalizeStoredAccountCost(item.cost)
      const acquiredAt = normalizeStoredDateKey(item.acquiredAt)
      if (cost != null) account.cost = cost
      if (acquiredAt) account.acquiredAt = acquiredAt
      if (typeof item.archivedAt === 'string' && Number.isFinite(Date.parse(item.archivedAt))) account.archivedAt = item.archivedAt
    }
    result.push(account)
  }

  return result
}

export function useAccounts() {
  const [accounts, setAccounts, storageMeta] = useLocalStorageState<Account[]>('ratio.accounts', initialAccounts, {
    coerce: coerceAccounts,
  })

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

  // 添加物品：固定资产分组条目，原值与净值同时落库（净值缺省等于原值）
  const addItem = useCallback(
    (input: { type: AccountTypeId; name?: string; cost: number; net?: number; acquiredAt?: string }) => {
      if (!isItemAccountType(input.type) || !Number.isFinite(input.cost) || input.cost <= 0 ||
        (input.net != null && (!Number.isFinite(input.net) || input.net < 0))) {
        throw new Error('物品类型或金额无效')
      }
      const cost = normalizeMoney(input.cost)
      if (cost <= 0) throw new Error('原值至少为 0.01 元')
      const net = normalizeMoney(input.net ?? cost)
      const next: Account = {
        id: createId(),
        type: input.type,
        name: input.name?.trim() || defaultAccountName(input.type),
        balance: isNegativeAccountBalance(net) ? 0 : net,
        updatedAt: nowIso(),
      }
      if (cost > 0) next.cost = cost
      const acquiredAt = normalizeStoredDateKey(input.acquiredAt)
      if (acquiredAt) next.acquiredAt = acquiredAt
      setAccounts((prev) => [next, ...prev])
      return next
    },
    [setAccounts],
  )

  // 记录/修正物品原值与购入日期；不改净值。acquiredAt 传空串/无效值即清除
  const updateItemCost = useCallback(
    (id: string, cost: number, acquiredAt?: string) => {
      if (!Number.isFinite(cost)) return
      const nextCost = normalizeMoney(cost)
      if (!(nextCost > 0)) return
      const nextAcquiredAt = normalizeStoredDateKey(acquiredAt)
      setAccounts((prev) =>
        prev.map((a) => {
          if (a.id !== id || !isItemAccountType(a.type)) return a
          const next: Account = { ...a, cost: nextCost, updatedAt: nowIso() }
          if (nextAcquiredAt) next.acquiredAt = nextAcquiredAt
          else delete next.acquiredAt
          return next
        }),
      )
    },
    [setAccounts],
  )

  const updateBalance = useCallback(
    (id: string, balance: number) => {
      if (!Number.isFinite(balance)) return
      const nextBalance = normalizeMoney(balance)
      if (isNegativeAccountBalance(nextBalance)) return
      setAccounts((prev) =>
        prev.map((a) => (a.id === id ? { ...a, balance: nextBalance, updatedAt: nowIso() } : a)),
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
      if (!Number.isFinite(delta)) return
      const normalizedDelta = normalizeMoney(delta)
      if (normalizedDelta === 0) return
      setAccounts((prev) => {
        let changed = false
        const ts = nowIso()
        const next = prev.map((a) => {
          if (a.id !== id) return a
          if (!canApplyBalanceDelta(a.balance, normalizedDelta)) return a
          changed = true
          return { ...a, balance: addMoney(a.balance, normalizedDelta), updatedAt: ts }
        })
        return changed ? next : prev
      })
    },
    [setAccounts],
  )

  const transfer = useCallback(
    (fromId: string, toId: string, amount: number) => {
      if (fromId === toId) return
      if (!Number.isFinite(amount)) return

      const normalizedAmount = normalizeMoney(amount)
      if (normalizedAmount <= 0) return

      setAccounts((prev) => {
        const from = prev.find((a) => a.id === fromId)
        const to = prev.find((a) => a.id === toId)
        if (!from || !to || from.archivedAt || to.archivedAt) return prev

        const fromAfter = applyAccountFlow(from.type, from.balance, -normalizedAmount)
        const toAfter = applyAccountFlow(to.type, to.balance, normalizedAmount)
        if (isNegativeAccountBalance(fromAfter) || isNegativeAccountBalance(toAfter)) return prev

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

  // 归档/取消归档物品：归档后退出所有汇总，但账户与历史保留
  const archiveAccount = useCallback(
    (id: string) => {
      setAccounts((prev) =>
        prev.map((a) => (a.id === id && isItemAccountType(a.type) && !a.archivedAt ? { ...a, archivedAt: nowIso(), updatedAt: nowIso() } : a)),
      )
    },
    [setAccounts],
  )

  const unarchiveAccount = useCallback(
    (id: string) => {
      setAccounts((prev) =>
        prev.map((a) => {
          if (a.id !== id || !a.archivedAt) return a
          const next: Account = { ...a, updatedAt: nowIso() }
          delete next.archivedAt
          return next
        }),
      )
    },
    [setAccounts],
  )

  // 参与汇总/快照/列表的账户（排除已归档物品）
  const activeAccounts = useMemo(() => accounts.filter((a) => !a.archivedAt), [accounts])
  const archivedAccounts = useMemo(() => accounts.filter((a) => Boolean(a.archivedAt)), [accounts])

  const deleteAccount = useCallback(
    (id: string) => {
      setAccounts((prev) => prev.filter((a) => a.id !== id))
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

    for (const a of activeAccounts) {
      const gid = getGroupIdByAccountType(a.type)
      byGroup[gid].push(a)
    }

    const groupCards = (Object.keys(byGroup) as AccountGroupId[]).map((gid) => {
      const list = byGroup[gid]
      const total = list.reduce((sum, a) => addMoney(sum, a.balance), 0)
      return {
        group: accountGroups[gid],
        accounts: list,
        total,
      }
    })

    const assetsTotal = groupCards
      .filter((g) => g.group.id !== 'debt')
      .reduce((sum, g) => addMoney(sum, g.total), 0)

    const debtTotal = groupCards
      .filter((g) => g.group.id === 'debt')
      .reduce((sum, g) => addMoney(sum, g.total), 0)

    return {
      groupCards,
      assetsTotal,
      debtTotal,
      netWorth: addMoney(assetsTotal, -debtTotal),
    }
  }, [activeAccounts])

  const getIcon = useCallback((type: AccountTypeId) => getAccountTypeOption(type).icon, [])

  return {
    accounts,
    activeAccounts,
    archivedAccounts,
    storageReady: storageMeta.canPersist,
    addAccount,
    addItem,
    updateItemCost,
    updateBalance,
    renameAccount,
    adjustBalance,
    transfer,
    archiveAccount,
    unarchiveAccount,
    deleteAccount,
    grouped,
    getIcon,
  }
}
