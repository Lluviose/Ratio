import { useCallback, useMemo } from 'react'
import { useLocalStorageState } from './useLocalStorageState'
import { createId, normalizeAmount, type Transaction, type TxType } from './ledger'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function todayDateKey() {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function coerceTxType(value: unknown): TxType {
  if (value === 'expense' || value === 'income') return value
  return 'expense'
}

function coerceTransactions(value: unknown): Transaction[] {
  if (!Array.isArray(value)) return []

  const fallbackDate = todayDateKey()
  const result: Transaction[] = []

  for (const item of value) {
    if (!isRecord(item)) continue

    const type = coerceTxType(item.type)
    const rawAmount = typeof item.amount === 'number' && Number.isFinite(item.amount) ? item.amount : 0

    const id = typeof item.id === 'string' && item.id.trim() ? item.id : createId()
    const category = typeof item.category === 'string' ? item.category : ''
    const account = typeof item.account === 'string' ? item.account : ''
    const date = typeof item.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(item.date) ? item.date : fallbackDate
    const note = typeof item.note === 'string' ? item.note : ''

    result.push({
      id,
      type,
      amount: normalizeAmount(type, rawAmount),
      category,
      account,
      date,
      note,
    })
  }

  return result
}

export function useLedger() {
  const [transactions, setTransactions] = useLocalStorageState<Transaction[]>('ratio.ledger', [], {
    coerce: coerceTransactions,
  })

  const addTransaction = useCallback(
    (tx: Omit<Transaction, 'id'>) => {
      const normalized = {
        ...tx,
        amount: normalizeAmount(tx.type, tx.amount),
      }
      setTransactions((prev) => [{ ...normalized, id: createId() }, ...prev])
    },
    [setTransactions],
  )

  const recent = useMemo(() => transactions.slice(0, 6), [transactions])

  return { transactions, recent, addTransaction }
}
