export const RATIO_STORAGE_PREFIX = 'ratio.' as const
export const RATIO_BACKUP_SCHEMA_V1 = 'ratio.backup.v1' as const
export const RATIO_BACKUP_EXCLUDE_PREFIXES = ['ratio.webdav.', 'ratio.account.'] as const

export type RatioBackupFile = {
  schema: typeof RATIO_BACKUP_SCHEMA_V1
  createdAt: string
  items: Record<string, string>
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isExcludedKey(key: string, excludeKeyPrefixes: readonly string[]) {
  return excludeKeyPrefixes.some((prefix) => key.startsWith(prefix))
}

export function readRatioStorage(
  storage: Storage = localStorage,
  prefix: string = RATIO_STORAGE_PREFIX,
  excludeKeyPrefixes: readonly string[] = RATIO_BACKUP_EXCLUDE_PREFIXES,
) {
  const keys: string[] = []
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i)
    if (!key) continue
    if (!key.startsWith(prefix)) continue
    if (isExcludedKey(key, excludeKeyPrefixes)) continue
    keys.push(key)
  }
  keys.sort()

  const items: Record<string, string> = {}
  for (const key of keys) {
    const raw = storage.getItem(key)
    if (raw == null) continue
    items[key] = raw
  }

  return items
}

export function buildRatioBackup(
  storage: Storage = localStorage,
  prefix: string = RATIO_STORAGE_PREFIX,
  excludeKeyPrefixes: readonly string[] = RATIO_BACKUP_EXCLUDE_PREFIXES,
): RatioBackupFile {
  return {
    schema: RATIO_BACKUP_SCHEMA_V1,
    createdAt: new Date().toISOString(),
    items: readRatioStorage(storage, prefix, excludeKeyPrefixes),
  }
}

export function stringifyRatioBackup(backup: RatioBackupFile) {
  return `${JSON.stringify(backup, null, 2)}\n`
}

export function coerceRatioBackup(value: unknown): RatioBackupFile {
  if (!isPlainObject(value)) throw new Error('Invalid backup file')
  if (value.schema !== RATIO_BACKUP_SCHEMA_V1) throw new Error('Unsupported backup schema')
  if (typeof value.createdAt !== 'string') throw new Error('Invalid backup file')
  if (!isPlainObject(value.items)) throw new Error('Invalid backup file')

  const items: Record<string, string> = {}
  for (const [k, v] of Object.entries(value.items)) {
    if (typeof v !== 'string') continue
    items[k] = v
  }

  return { schema: RATIO_BACKUP_SCHEMA_V1, createdAt: value.createdAt, items }
}

export function parseRatioBackup(text: string): RatioBackupFile {
  let parsed: unknown
  try {
    parsed = JSON.parse(text) as unknown
  } catch {
    throw new Error('Invalid JSON backup file')
  }
  return coerceRatioBackup(parsed)
}

export type RestoreResult = {
  restoredKeys: string[]
  clearedKeys: string[]
  skippedKeys: string[]
}

export function clearRatioStorage(
  storage: Storage = localStorage,
  prefix: string = RATIO_STORAGE_PREFIX,
  excludeKeyPrefixes: readonly string[] = RATIO_BACKUP_EXCLUDE_PREFIXES,
) {
  const keysToRemove: string[] = []
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i)
    if (!key) continue
    if (!key.startsWith(prefix)) continue
    if (isExcludedKey(key, excludeKeyPrefixes)) continue
    keysToRemove.push(key)
  }

  for (const key of keysToRemove) storage.removeItem(key)
  keysToRemove.sort()
  return keysToRemove
}

export function restoreRatioBackup(
  backup: RatioBackupFile,
  storage: Storage = localStorage,
  prefix: string = RATIO_STORAGE_PREFIX,
  excludeKeyPrefixes: readonly string[] = RATIO_BACKUP_EXCLUDE_PREFIXES,
): RestoreResult {
  const clearedKeys = clearRatioStorage(storage, prefix, excludeKeyPrefixes)

  const restoredKeys: string[] = []
  const skippedKeys: string[] = []
  const entries = Object.entries(backup.items)
  entries.sort(([left], [right]) => left.localeCompare(right))

  for (const [key, raw] of entries) {
    if (!key.startsWith(prefix) || isExcludedKey(key, excludeKeyPrefixes)) {
      skippedKeys.push(key)
      continue
    }
    storage.setItem(key, raw)
    restoredKeys.push(key)
  }

  return { restoredKeys, clearedKeys, skippedKeys }
}
