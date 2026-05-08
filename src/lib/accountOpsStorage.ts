import { normalizeStoredAccountBalance } from './accountBalance'
import { normalizeMoney } from './money'
import type { AccountOp, AccountOpInput } from './accountOps'

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

function legacyIdPart(value: string, fallback: string) {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return normalized || fallback
}

function normalizeOptionalNote(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const note = value.trim()
  return note ? note : undefined
}

function normalizeStoredOpBalance(accountType: AccountOp['accountType'], value: number): number {
  return normalizeStoredAccountBalance(accountType, value)
}

function normalizeUnknownOpBalance(value: number): number {
  const normalized = normalizeMoney(value)
  return normalized < 0 ? 0 : normalized
}

function normalizeTransferAmount(value: number): number {
  const normalized = normalizeMoney(value)
  return normalized < 0 ? normalizeMoney(Math.abs(normalized)) : normalized
}

function legacyAccountOpId(index: number, parts: readonly string[]) {
  const signature = parts.map((part, partIndex) => legacyIdPart(part, `part${partIndex}`)).join('-')
  return `legacy-op-${index}-${signature || 'entry'}`
}

export function normalizeAccountOp(op: AccountOp): AccountOp {
  if (op.kind === 'rename') {
    return {
      ...op,
      note: normalizeOptionalNote(op.note),
    }
  }

  if (op.kind === 'set_balance') {
    return {
      ...op,
      note: normalizeOptionalNote(op.note),
      before: normalizeStoredOpBalance(op.accountType, op.before),
      after: normalizeStoredOpBalance(op.accountType, op.after),
    }
  }

  if (op.kind === 'adjust') {
    return {
      ...op,
      note: normalizeOptionalNote(op.note),
      delta: normalizeMoney(op.delta),
      before: normalizeStoredOpBalance(op.accountType, op.before),
      after: normalizeStoredOpBalance(op.accountType, op.after),
    }
  }

  return {
    ...op,
    note: normalizeOptionalNote(op.note),
    amount: normalizeTransferAmount(op.amount),
    fromBefore: normalizeUnknownOpBalance(op.fromBefore),
    fromAfter: normalizeUnknownOpBalance(op.fromAfter),
    toBefore: normalizeUnknownOpBalance(op.toBefore),
    toAfter: normalizeUnknownOpBalance(op.toAfter),
  }
}

export function normalizeAccountOpInput(op: AccountOpInput): AccountOpInput {
  if (op.kind === 'rename') {
    return {
      ...op,
      note: normalizeOptionalNote(op.note),
    }
  }

  if (op.kind === 'set_balance') {
    return {
      ...op,
      note: normalizeOptionalNote(op.note),
      before: normalizeStoredOpBalance(op.accountType, op.before),
      after: normalizeStoredOpBalance(op.accountType, op.after),
    }
  }

  if (op.kind === 'adjust') {
    return {
      ...op,
      note: normalizeOptionalNote(op.note),
      delta: normalizeMoney(op.delta),
      before: normalizeStoredOpBalance(op.accountType, op.before),
      after: normalizeStoredOpBalance(op.accountType, op.after),
    }
  }

  return {
    ...op,
    note: normalizeOptionalNote(op.note),
    amount: normalizeTransferAmount(op.amount),
    fromBefore: normalizeUnknownOpBalance(op.fromBefore),
    fromAfter: normalizeUnknownOpBalance(op.fromAfter),
    toBefore: normalizeUnknownOpBalance(op.toBefore),
    toAfter: normalizeUnknownOpBalance(op.toAfter),
  }
}

export function coerceStoredAccountOps(value: unknown): AccountOp[] {
  if (!Array.isArray(value)) return []

  const result: AccountOp[] = []
  for (const [index, item] of value.entries()) {
    if (!isRecord(item)) continue

    const kind = item.kind
    const at = toNonEmptyString(item.at)
    const accountType = toNonEmptyString(item.accountType)
    if (!at || !accountType) continue

    if (kind === 'rename') {
      const accountId = toNonEmptyString(item.accountId)
      const beforeName = typeof item.beforeName === 'string' ? item.beforeName : ''
      const afterName = typeof item.afterName === 'string' ? item.afterName : ''
      if (!accountId) continue
      const id =
        typeof item.id === 'string' && item.id.trim()
          ? item.id
          : legacyAccountOpId(index, [String(kind), at, accountType, accountId, beforeName, afterName])
      result.push(
        normalizeAccountOp({
          id,
          kind,
          at,
          accountType: accountType as AccountOp['accountType'],
          note: normalizeOptionalNote(item.note),
          accountId,
          beforeName,
          afterName,
        }),
      )
      continue
    }

    if (kind === 'set_balance') {
      const accountId = toNonEmptyString(item.accountId)
      const before = toFiniteNumber(item.before)
      const after = toFiniteNumber(item.after)
      if (!accountId || before == null || after == null) continue
      const id =
        typeof item.id === 'string' && item.id.trim()
          ? item.id
          : legacyAccountOpId(index, [String(kind), at, accountType, accountId, String(before), String(after)])
      result.push(
        normalizeAccountOp({
          id,
          kind,
          at,
          accountType: accountType as AccountOp['accountType'],
          note: normalizeOptionalNote(item.note),
          accountId,
          before,
          after,
        }),
      )
      continue
    }

    if (kind === 'adjust') {
      const accountId = toNonEmptyString(item.accountId)
      const delta = toFiniteNumber(item.delta)
      const before = toFiniteNumber(item.before)
      const after = toFiniteNumber(item.after)
      if (!accountId || delta == null || before == null || after == null) continue
      const id =
        typeof item.id === 'string' && item.id.trim()
          ? item.id
          : legacyAccountOpId(index, [
              String(kind),
              at,
              accountType,
              accountId,
              String(delta),
              String(before),
              String(after),
            ])
      result.push(
        normalizeAccountOp({
          id,
          kind,
          at,
          accountType: accountType as AccountOp['accountType'],
          note: normalizeOptionalNote(item.note),
          accountId,
          delta,
          before,
          after,
        }),
      )
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
      const id =
        typeof item.id === 'string' && item.id.trim()
          ? item.id
          : legacyAccountOpId(index, [
              String(kind),
              at,
              accountType,
              fromId,
              toId,
              String(amount),
              String(fromBefore),
              String(fromAfter),
              String(toBefore),
              String(toAfter),
            ])
      result.push(
        normalizeAccountOp({
          id,
          kind,
          at,
          accountType: accountType as AccountOp['accountType'],
          note: normalizeOptionalNote(item.note),
          fromId,
          toId,
          amount,
          fromBefore,
          fromAfter,
          toBefore,
          toAfter,
        }),
      )
    }
  }

  return result
}

export function canonicalizeAccountOpsForBackup(raw: string) {
  try {
    const parsed = JSON.parse(raw) as unknown
    const canonical = coerceStoredAccountOps(parsed).map((op) => {
      const clone = { ...op } as Partial<AccountOp>
      delete clone.id
      return clone
    })
    return JSON.stringify(canonical)
  } catch {
    return raw
  }
}
