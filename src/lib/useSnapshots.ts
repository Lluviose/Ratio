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

  // 状态里的数组恒为规范化数据：读取/跨标签同步经 coerceSnapshots，写入经
  // upsertSnapshot（规范化新条目）。此前这里还对整个数组再 map 一遍
  // normalizeSnapshot，属于纯冗余的第二次全量规范化，已删除。

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
    if (snapshots.length === 0) return null
    return snapshots.reduce<Snapshot | null>((best, s) => {
      if (!best) return s
      return s.date > best.date ? s : best
    }, null)
  }, [snapshots])

  return { snapshots, latest, storageReady: storageMeta.canPersist, upsertFromAccounts }
}
