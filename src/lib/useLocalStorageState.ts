import { useEffect, useMemo, useRef, useState } from 'react'

const STORAGE_WRITE_EVENT = 'ratio:storage-write'

type StorageWriteDetail = {
  key: string
  raw?: string
}

export type UseLocalStorageStateOptions<T> = {
  coerce?: (value: unknown) => T
}

function readStoredValue<T>(
  key: string,
  initialValue: T,
  coerce?: (value: unknown) => T,
): { value: T; raw: string | null } {
  let raw: string | null = null
  try {
    raw = localStorage.getItem(key)
    if (!raw) return { value: initialValue, raw: null }
    const parsed = JSON.parse(raw) as unknown
    const value = coerce ? coerce(parsed) : (parsed as T)
    return { value, raw }
  } catch {
    return { value: initialValue, raw }
  }
}

function parseStoredValue<T>(
  raw: string | null,
  initialValue: T,
  coerce?: (value: unknown) => T,
): T {
  if (!raw) return initialValue
  try {
    const parsed = JSON.parse(raw) as unknown
    return coerce ? coerce(parsed) : (parsed as T)
  } catch {
    return initialValue
  }
}

function getEventDetail(event: Event): StorageWriteDetail | null {
  if (!(event instanceof CustomEvent)) return null
  const detail = event.detail
  if (!detail || typeof detail !== 'object') return null
  const key = Reflect.get(detail, 'key')
  if (typeof key !== 'string') return null
  const raw = Reflect.get(detail, 'raw')
  return { key, raw: typeof raw === 'string' ? raw : undefined }
}

function syncFromRaw<T>(
  raw: string | null,
  initialValue: T,
  setValue: (v: T) => void,
  lastRawRef: { current: string | null },
  coerce?: (value: unknown) => T,
) {
  if (raw === lastRawRef.current) return
  lastRawRef.current = raw
  setValue(parseStoredValue(raw, initialValue, coerce))
}

export function useLocalStorageState<T>(key: string, initialValue: T, options?: UseLocalStorageStateOptions<T>) {
  const coerce = options?.coerce
  const initial = useMemo(() => readStoredValue(key, initialValue, coerce), [coerce, initialValue, key])
  const lastRawRef = useRef<string | null>(initial.raw)

  const [value, setValue] = useState<T>(initial.value)

  useEffect(() => {
    const onWrite = (event: Event) => {
      const detail = getEventDetail(event)
      if (!detail || detail.key !== key) return
      syncFromRaw(detail.raw ?? localStorage.getItem(key), initialValue, setValue, lastRawRef, coerce)
    }

    const onStorage = (event: StorageEvent) => {
      if (event.storageArea !== localStorage) return
      if (event.key !== key) return
      syncFromRaw(event.newValue, initialValue, setValue, lastRawRef, coerce)
    }

    window.addEventListener(STORAGE_WRITE_EVENT, onWrite)
    window.addEventListener('storage', onStorage)
    return () => {
      window.removeEventListener(STORAGE_WRITE_EVENT, onWrite)
      window.removeEventListener('storage', onStorage)
    }
  }, [coerce, initialValue, key])

  useEffect(() => {
    try {
      const nextRaw = JSON.stringify(value)
      const prevRaw = localStorage.getItem(key)
      if (prevRaw === nextRaw) {
        lastRawRef.current = nextRaw
        return
      }

      localStorage.setItem(key, nextRaw)
      lastRawRef.current = nextRaw
      window.dispatchEvent(
        new CustomEvent<StorageWriteDetail>(STORAGE_WRITE_EVENT, {
          detail: { key, raw: nextRaw },
        }),
      )
    } catch {
      return
    }
  }, [key, value])

  return [value, setValue] as const
}
