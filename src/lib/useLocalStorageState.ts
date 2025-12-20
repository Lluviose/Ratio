import { useEffect, useMemo, useState } from 'react'

export function useLocalStorageState<T>(key: string, initialValue: T) {
  const initial = useMemo(() => {
    try {
      const raw = localStorage.getItem(key)
      if (!raw) return initialValue
      return JSON.parse(raw) as T
    } catch {
      return initialValue
    }
  }, [initialValue, key])

  const [value, setValue] = useState<T>(initial)

  useEffect(() => {
    try {
      const nextRaw = JSON.stringify(value)
      const prevRaw = localStorage.getItem(key)
      if (prevRaw === nextRaw) return

      localStorage.setItem(key, nextRaw)
      window.dispatchEvent(
        new CustomEvent('ratio:storage-write', {
          detail: { key },
        }),
      )
    } catch {
      return
    }
  }, [key, value])

  return [value, setValue] as const
}
