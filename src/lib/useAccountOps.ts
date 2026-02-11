import { useCallback } from 'react'
import { useLocalStorageState } from './useLocalStorageState'
import { normalizeMoney } from './money'
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

function normalizeAccountOp(op: AccountOp): AccountOp {
  if (op.kind === 'rename') return op

  if (op.kind === 'set_balance') {
    return {
      ...op,
      before: normalizeMoney(op.before),
      after: normalizeMoney(op.after),
    }
  }

  if (op.kind === 'adjust') {
    return {
      ...op,
      delta: normalizeMoney(op.delta),
      before: normalizeMoney(op.before),
      after: normalizeMoney(op.after),
    }
  }

  return {
    ...op,
    amount: normalizeMoney(op.amount),
    fromBefore: normalizeMoney(op.fromBefore),
    fromAfter: normalizeMoney(op.fromAfter),
    toBefore: normalizeMoney(op.toBefore),
    toAfter: normalizeMoney(op.toAfter),
  }
}

function normalizeAccountOpInput(op: AccountOpInput): AccountOpInput {
  if (op.kind === 'rename') return op

  if (op.kind === 'set_balance') {
    return {
      ...op,
      before: normalizeMoney(op.before),
      after: normalizeMoney(op.after),
    }
  }

  if (op.kind === 'adjust') {
    return {
      ...op,
      delta: normalizeMoney(op.delta),
      before: normalizeMoney(op.before),
      after: normalizeMoney(op.after),
    }
  }

  return {
    ...op,
    amount: normalizeMoney(op.amount),
    fromBefore: normalizeMoney(op.fromBefore),
    fromAfter: normalizeMoney(op.fromAfter),
    toBefore: normalizeMoney(op.toBefore),
    toAfter: normalizeMoney(op.toAfter),
  }
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
      const next: AccountOp = {
        id,
        kind,
        at,
        accountType: accountType as AccountOp['accountType'],
        accountId,
        beforeName,
        afterName,
      }
      result.push(next)
      continue
    }

    if (kind === 'set_balance') {
      const accountId = toNonEmptyString(item.accountId)
      const before = toFiniteNumber(item.before)
      const after = toFiniteNumber(item.after)
      if (!accountId || before == null || after == null) continue
      const next: AccountOp = {
        id,
        kind,
        at,
        accountType: accountType as AccountOp['accountType'],
        accountId,
        before,
        after,
      }
      result.push(normalizeAccountOp(next))
      continue
    }

    if (kind === 'adjust') {
      const accountId = toNonEmptyString(item.accountId)
      const delta = toFiniteNumber(item.delta)
      const before = toFiniteNumber(item.before)
      const after = toFiniteNumber(item.after)
      if (!accountId || delta == null || before == null || after == null) continue
      const next: AccountOp = {
        id,
        kind,
        at,
        accountType: accountType as AccountOp['accountType'],
        accountId,
        delta,
        before,
        after,
      }
      result.push(normalizeAccountOp(next))
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
      if (amount == null || fromBefore == null || fromAfter == null || toBefore == null || toAfter == null) continue
      const next: AccountOp = {
        id,
        kind,
        at,
        accountType: accountType as AccountOp['accountType'],
        fromId,
        toId,
        amount,
        fromBefore,
        fromAfter,
        toBefore,
        toAfter,
      }
      result.push(normalizeAccountOp(next))
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
      const normalized = normalizeAccountOpInput(op)
      setOps((prev) => [{ ...normalized, id: createId() } as AccountOp, ...prev])
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
      const normalized = normalizeAccountOp(next)
      setOps((prev) => prev.map((op) => (op.id === id ? { ...normalized, id } : op)))
    },
    [setOps],
  )

  return { ops, addOp, deleteOp, updateOp }
}
