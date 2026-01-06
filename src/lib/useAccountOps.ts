import { useCallback } from 'react'
import { useLocalStorageState } from './useLocalStorageState'
import type { AccountOp, AccountOpInput } from './accountOps'

function createId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

export function useAccountOps() {
  const [ops, setOps] = useLocalStorageState<AccountOp[]>('ratio.accountOps', [])

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

  return { ops, addOp, deleteOp }
}
