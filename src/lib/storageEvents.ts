export const STORAGE_WRITE_EVENT = 'ratio:storage-write'

export type StorageWriteDetail = {
  key: string
  raw?: string
}

export function dispatchStorageWrite(key: string, raw?: string) {
  if (typeof window === 'undefined') return

  window.dispatchEvent(
    new CustomEvent<StorageWriteDetail>(STORAGE_WRITE_EVENT, {
      detail: raw === undefined ? { key } : { key, raw },
    }),
  )
}
