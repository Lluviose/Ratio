import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import { dispatchStorageWrite, STORAGE_WRITE_EVENT, type StorageWriteDetail } from './storageEvents'

export type UseLocalStorageStateErrorPhase = 'read' | 'write'

export type UseLocalStorageStateOptions<T> = {
  coerce?: (value: unknown) => T
  onError?: (error: unknown, context: { key: string; phase: UseLocalStorageStateErrorPhase }) => void
}

type HookState<T> = {
  key: string
  value: T
}

function reportStorageError(
  key: string,
  phase: UseLocalStorageStateErrorPhase,
  error: unknown,
  onError?: (error: unknown, context: { key: string; phase: UseLocalStorageStateErrorPhase }) => void,
) {
  if (onError) {
    onError(error, { key, phase })
    return
  }

  if (typeof console !== 'undefined' && typeof console.error === 'function') {
    console.error(`useLocalStorageState ${phase} failed for ${key}`, error)
  }
}

function readStoredValue<T>(
  key: string,
  initialValue: T,
  coerce?: (value: unknown) => T,
  onError?: (error: unknown, context: { key: string; phase: UseLocalStorageStateErrorPhase }) => void,
): { value: T; raw: string | null } {
  let raw: string | null = null
  try {
    raw = localStorage.getItem(key)
    if (!raw) return { value: initialValue, raw: null }
    const parsed = JSON.parse(raw) as unknown
    const value = coerce ? coerce(parsed) : (parsed as T)
    return { value, raw }
  } catch (error) {
    reportStorageError(key, 'read', error, onError)
    return { value: initialValue, raw }
  }
}

function parseStoredValue<T>(
  raw: string | null,
  key: string,
  initialValue: T,
  coerce?: (value: unknown) => T,
  onError?: (error: unknown, context: { key: string; phase: UseLocalStorageStateErrorPhase }) => void,
): T {
  if (!raw) return initialValue
  try {
    const parsed = JSON.parse(raw) as unknown
    return coerce ? coerce(parsed) : (parsed as T)
  } catch (error) {
    reportStorageError(key, 'read', error, onError)
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
  key: string,
  initialValue: T,
  setState: (next: HookState<T>) => void,
  lastRawRef: { current: string | null },
  coerce?: (value: unknown) => T,
  onError?: (error: unknown, context: { key: string; phase: UseLocalStorageStateErrorPhase }) => void,
) {
  if (raw === lastRawRef.current) return
  lastRawRef.current = raw
  setState({
    key,
    value: parseStoredValue(raw, key, initialValue, coerce, onError),
  })
}

export function useLocalStorageState<T>(key: string, initialValue: T, options?: UseLocalStorageStateOptions<T>) {
  const coerce = options?.coerce
  const onError = options?.onError
  const lastRawRef = useRef<string | null>(null)
  const initialValueRef = useRef(initialValue)
  const coerceRef = useRef(coerce)
  const onErrorRef = useRef(onError)

  const [state, setState] = useState<HookState<T>>(() => {
    const initial = readStoredValue(key, initialValue, coerce, onError)
    return { key, value: initial.value }
  })
  const value = state.key === key ? state.value : initialValue

  useEffect(() => {
    initialValueRef.current = initialValue
  }, [initialValue])

  useEffect(() => {
    coerceRef.current = coerce
  }, [coerce])

  useEffect(() => {
    onErrorRef.current = onError
  }, [onError])

  const setValue = useCallback<Dispatch<SetStateAction<T>>>(
    (next) => {
      setState((prev) => {
        const baseValue =
          prev.key === key
            ? prev.value
            : readStoredValue(key, initialValueRef.current, coerceRef.current, onErrorRef.current).value
        const nextValue = typeof next === 'function' ? (next as (prevState: T) => T)(baseValue) : next
        return { key, value: nextValue }
      })
    },
    [key],
  )

  useEffect(() => {
    const next = readStoredValue(key, initialValueRef.current, coerceRef.current, onErrorRef.current)
    lastRawRef.current = next.raw
    setState((prev) => {
      if (prev.key === key && Object.is(prev.value, next.value)) return prev
      return { key, value: next.value }
    })
  }, [key])

  useEffect(() => {
    const onWrite = (event: Event) => {
      const detail = getEventDetail(event)
      if (!detail || detail.key !== key) return
      syncFromRaw(
        detail.raw ?? localStorage.getItem(key),
        key,
        initialValueRef.current,
        setState,
        lastRawRef,
        coerceRef.current,
        onErrorRef.current,
      )
    }

    const onStorage = (event: StorageEvent) => {
      if (event.storageArea !== localStorage) return
      if (event.key !== key) return
      syncFromRaw(event.newValue, key, initialValueRef.current, setState, lastRawRef, coerceRef.current, onErrorRef.current)
    }

      window.addEventListener(STORAGE_WRITE_EVENT, onWrite)
      window.addEventListener('storage', onStorage)
      return () => {
        window.removeEventListener(STORAGE_WRITE_EVENT, onWrite)
        window.removeEventListener('storage', onStorage)
      }
  }, [key])

  useEffect(() => {
    if (state.key !== key) return

    try {
      const nextRaw = JSON.stringify(state.value)
      const prevRaw = localStorage.getItem(key)
      if (prevRaw === nextRaw) {
        lastRawRef.current = nextRaw
        return
      }

      localStorage.setItem(key, nextRaw)
      lastRawRef.current = nextRaw
      dispatchStorageWrite(key, nextRaw)
    } catch (error) {
      reportStorageError(key, 'write', error, onErrorRef.current)
    }
  }, [key, state])

  return [value, setValue] as const
}
