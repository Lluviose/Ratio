import { useCallback, useMemo } from 'react'
import type { Account } from './accounts'
import { useLocalStorageState } from './useLocalStorageState'
import { buildSnapshot, isSnapshotDateKey, normalizeSnapshot, todayDateKey, upsertSnapshot, type Snapshot } from './snapshots'

function coerceSnapshots(value: unknown): Snapshot[] {
  if (!Array.isArray(value)) return []
  return value.map((item) => normalizeSnapshot(item as Snapshot)).filter((s) => isSnapshotDateKey(s.date))
}

export function useSnapshots() {
  const [snapshots, setSnapshots, storageMeta] = useLocalStorageState<Snapshot[]>('ratio.snapshots', [], {
    coerce: coerceSnapshots,
  })

  const normalized = useMemo(() => snapshots.map((s) => normalizeSnapshot(s)).filter((s) => isSnapshotDateKey(s.date)), [snapshots])

  const upsertFromAccounts = useCallback(
    (accounts: Account[], date: string = todayDateKey()) => {
      const next = buildSnapshot(date, accounts)
      setSnapshots((prev) => {
        return upsertSnapshot(prev, next)
      })
    },
    [setSnapshots],
  )

  const latest = useMemo(() => {
    if (normalized.length === 0) return null
    return normalized.reduce<Snapshot | null>((best, s) => {
      if (!best) return s
      return s.date > best.date ? s : best
    }, null)
  }, [normalized])

  return { snapshots: normalized, latest, storageReady: storageMeta.canPersist, upsertFromAccounts }
}
