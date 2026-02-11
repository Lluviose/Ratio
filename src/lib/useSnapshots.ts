import { useCallback, useMemo } from 'react'
import type { Account } from './accounts'
import { useLocalStorageState } from './useLocalStorageState'
import { buildSnapshot, normalizeSnapshot, todayDateKey, type Snapshot } from './snapshots'

function coerceSnapshots(value: unknown): Snapshot[] {
  if (!Array.isArray(value)) return []
  return value.map((item) => normalizeSnapshot(item as Snapshot))
}

export function useSnapshots() {
  const [snapshots, setSnapshots] = useLocalStorageState<Snapshot[]>('ratio.snapshots', [], {
    coerce: coerceSnapshots,
  })

  const normalized = useMemo(() => snapshots.map((s) => normalizeSnapshot(s)), [snapshots])

  const upsertFromAccounts = useCallback(
    (accounts: Account[], date: string = todayDateKey()) => {
      const next = buildSnapshot(date, accounts)
      setSnapshots((prev) => {
        const idx = prev.findIndex((s) => s.date === date)
        if (idx >= 0) {
          const copy = prev.slice()
          copy[idx] = next
          copy.sort((a, b) => a.date.localeCompare(b.date))
          return copy
        }

        const copy = [...prev, next]
        copy.sort((a, b) => a.date.localeCompare(b.date))
        return copy
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

  return { snapshots: normalized, latest, upsertFromAccounts }
}
