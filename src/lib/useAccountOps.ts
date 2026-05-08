import { useCallback } from 'react'
import { useLocalStorageState } from './useLocalStorageState'
import type { AccountOp, AccountOpInput } from './accountOps'
import { coerceStoredAccountOps, normalizeAccountOp, normalizeAccountOpInput } from './accountOpsStorage'

function createId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

export function useAccountOps() {
  const [ops, setOps] = useLocalStorageState<AccountOp[]>('ratio.accountOps', [], {
    coerce: coerceStoredAccountOps,
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
