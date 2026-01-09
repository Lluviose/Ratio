import { useCallback } from 'react'
import { useLocalStorageState } from './useLocalStorageState'
import type { AccountOp, AccountOpInput } from './accountOps'

function createId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function toFiniteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function toNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const s = value.trim()
  return s ? s : null
}

function coerceOps(value: unknown): AccountOp[] {
  if (!Array.isArray(value)) return []

  const result: AccountOp[] = []
  for (const item of value) {
    if (!isRecord(item)) continue

    const kind = item.kind
    const at = toNonEmptyString(item.at)
    const accountType = toNonEmptyString(item.accountType)
    if (!at || !accountType) continue

    const id = typeof item.id === 'string' && item.id.trim() ? item.id : createId()

    if (kind === 'rename') {
      const accountId = toNonEmptyString(item.accountId)
      const beforeName = typeof item.beforeName === 'string' ? item.beforeName : ''
      const afterName = typeof item.afterName === 'string' ? item.afterName : ''
      if (!accountId) continue
      result.push({
        id,
        kind,
        at,
        accountType: accountType as AccountOp['accountType'],
        accountId,
        beforeName,
        afterName,
      })
      continue
    }

    if (kind === 'set_balance') {
      const accountId = toNonEmptyString(item.accountId)
      const before = toFiniteNumber(item.before)
      const after = toFiniteNumber(item.after)
      if (!accountId || before == null || after == null) continue
      result.push({
        id,
        kind,
        at,
        accountType: accountType as AccountOp['accountType'],
        accountId,
        before,
        after,
      })
      continue
    }

    if (kind === 'adjust') {
      const accountId = toNonEmptyString(item.accountId)
      const delta = toFiniteNumber(item.delta)
      const before = toFiniteNumber(item.before)
      const after = toFiniteNumber(item.after)
      if (!accountId || delta == null || before == null || after == null) continue
      result.push({
        id,
        kind,
        at,
        accountType: accountType as AccountOp['accountType'],
        accountId,
        delta,
        before,
        after,
      })
      continue
    }

    if (kind === 'transfer') {
      const fromId = toNonEmptyString(item.fromId)
      const toId = toNonEmptyString(item.toId)
      const amount = toFiniteNumber(item.amount)
      const fromBefore = toFiniteNumber(item.fromBefore)
      const fromAfter = toFiniteNumber(item.fromAfter)
      const toBefore = toFiniteNumber(item.toBefore)
      const toAfter = toFiniteNumber(item.toAfter)
      if (!fromId || !toId) continue
      if ([amount, fromBefore, fromAfter, toBefore, toAfter].some((v) => v == null)) continue
      result.push({
        id,
        kind,
        at,
        accountType: accountType as AccountOp['accountType'],
        fromId,
        toId,
        amount: amount!,
        fromBefore: fromBefore!,
        fromAfter: fromAfter!,
        toBefore: toBefore!,
        toAfter: toAfter!,
      })
    }
  }

  return result
}

export function useAccountOps() {
  const [ops, setOps] = useLocalStorageState<AccountOp[]>('ratio.accountOps', [], {
    coerce: coerceOps,
  })

  const addOp = useCallback(
    (op: AccountOpInput) => {
      setOps((prev) => [{ ...op, id: createId() } as AccountOp, ...prev])
    },
    [setOps],
  )

  const deleteOp = useCallback(
    (id: string) => {
      setOps((prev) => prev.filter((op) => op.id !== id))
    },
    [setOps],
  )

  const updateOp = useCallback(
    (id: string, next: AccountOp) => {
      setOps((prev) => prev.map((op) => (op.id === id ? { ...next, id } : op)))
    },
    [setOps],
  )

  return { ops, addOp, deleteOp, updateOp }
}
