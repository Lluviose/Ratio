import { useEffect } from 'react'
import type { Account } from './accounts'

export function shouldUpsertDailySnapshot(accountCount: number, snapshotCount: number) {
  return accountCount > 0 || snapshotCount > 0
}

export function useDailySnapshotSync(
  accounts: readonly Account[],
  snapshotCount: number,
  upsertFromAccounts: (accounts: Account[]) => void,
  ready = true,
) {
  useEffect(() => {
    if (!ready) return
    if (!shouldUpsertDailySnapshot(accounts.length, snapshotCount)) return
    upsertFromAccounts([...accounts])
  }, [accounts, ready, snapshotCount, upsertFromAccounts])
}
