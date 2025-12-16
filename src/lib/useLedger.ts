import { useCallback, useMemo } from 'react'
import { useLocalStorageState } from './useLocalStorageState'
import { createId, type Transaction } from './ledger'

export function useLedger() {
  const [transactions, setTransactions] = useLocalStorageState<Transaction[]>('ratio.ledger', [])

  const addTransaction = useCallback(
    (tx: Omit<Transaction, 'id'>) => {
      setTransactions((prev) => [{ ...tx, id: createId() }, ...prev])
    },
    [setTransactions],
  )

  const recent = useMemo(() => transactions.slice(0, 6), [transactions])

  return { transactions, recent, addTransaction }
}
