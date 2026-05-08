import { normalizeAmount, type Transaction, type TxType } from './ledger'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function legacyIdPart(value: string, fallback: string) {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return normalized || fallback
}

function legacyTransactionId(index: number, parts: readonly string[]) {
  const signature = parts.map((part, partIndex) => legacyIdPart(part, `part${partIndex}`)).join('-')
  return `legacy-tx-${index}-${signature || 'entry'}`
}

function coerceTxType(value: unknown): TxType {
  if (value === 'expense' || value === 'income') return value
  return 'expense'
}

function normalizeTxDate(value: unknown) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : ''
}

export function coerceStoredTransactions(value: unknown): Transaction[] {
  if (!Array.isArray(value)) return []

  const result: Transaction[] = []

  for (const [index, item] of value.entries()) {
    if (!isRecord(item)) continue

    const type = coerceTxType(item.type)
    const rawAmount = typeof item.amount === 'number' && Number.isFinite(item.amount) ? item.amount : 0
    const amount = normalizeAmount(type, rawAmount)
    const category = typeof item.category === 'string' ? item.category : ''
    const account = typeof item.account === 'string' ? item.account : ''
    const date = normalizeTxDate(item.date)
    const note = typeof item.note === 'string' ? item.note : ''
    const id =
      typeof item.id === 'string' && item.id.trim()
        ? item.id
        : legacyTransactionId(index, [type, String(amount), category, account, date, note])

    result.push({
      id,
      type,
      amount,
      category,
      account,
      date,
      note,
    })
  }

  return result
}

export function canonicalizeTransactionsForBackup(raw: string) {
  try {
    const parsed = JSON.parse(raw) as unknown
    const canonical = coerceStoredTransactions(parsed).map((tx) => {
      const clone = { ...tx } as Partial<Transaction>
      delete clone.id
      return clone
    })
    return JSON.stringify(canonical)
  } catch {
    return raw
  }
}
