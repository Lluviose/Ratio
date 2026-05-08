import { useCallback, useMemo } from 'react'
import { useLocalStorageState } from './useLocalStorageState'
import { createId, normalizeAmount, type Transaction } from './ledger'
import { coerceStoredTransactions } from './ledgerStorage'

export function useLedger() {
  const [transactions, setTransactions] = useLocalStorageState<Transaction[]>('ratio.ledger', [], {
    coerce: coerceStoredTransactions,
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
