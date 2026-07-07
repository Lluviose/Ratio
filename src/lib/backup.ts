import { dispatchStorageWrite } from './storageEvents'
import { appStorage } from './storageKernel'
import { canonicalizeAccountOpsForBackup } from './accountOpsStorage'
import { canonicalizeTransactionsForBackup } from './ledgerStorage'

export const RATIO_STORAGE_PREFIX = 'ratio.' as const
export const RATIO_BACKUP_SCHEMA_V1 = 'ratio.backup.v1' as const
// ratio.demo* = 演示模式标记与真实数据暂存：不进备份文件，也不被恢复流程清掉
//（否则进入演示时的 restoreRatioBackup 会顺手删掉刚写入的暂存）
export const RATIO_BACKUP_EXCLUDE_PREFIXES: readonly string[] = [
  'ratio.cloudSync',
  'ratio.aiPrivacyAcceptedServerUrl',
  'ratio.demo',
]

export type RatioBackupFile = {
  schema: typeof RATIO_BACKUP_SCHEMA_V1
  createdAt: string
  items: Record<string, string>
}

export type RatioBackupDiffSummary = {
  localOnlyCount: number
  remoteOnlyCount: number
  changedCount: number
  differentKeyCount: number
  sampleKeys: string[]
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isExcludedKey(key: string, excludeKeyPrefixes: readonly string[]) {
  return excludeKeyPrefixes.some((prefix) => key.startsWith(prefix))
}

export function readRatioStorage(
  storage: Storage = appStorage,
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
  storage: Storage = appStorage,
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

export function sameRatioBackupData(left: RatioBackupFile, right: RatioBackupFile) {
  const leftKeys = Object.keys(left.items).sort((a, b) => a.localeCompare(b))
  const rightKeys = Object.keys(right.items).sort((a, b) => a.localeCompare(b))
  if (leftKeys.length !== rightKeys.length) return false

  for (let i = 0; i < leftKeys.length; i++) {
    const leftKey = leftKeys[i]
    const rightKey = rightKeys[i]
    if (leftKey !== rightKey) return false
    if (normalizeBackupItemForCompare(leftKey, left.items[leftKey]) !== normalizeBackupItemForCompare(rightKey, right.items[rightKey])) {
      return false
    }
  }

  return true
}

export function summarizeRatioBackupDiff(
  local: RatioBackupFile,
  remote: RatioBackupFile,
  maxSampleKeys = 12,
): RatioBackupDiffSummary {
  const localKeys = Object.keys(local.items).sort((a, b) => a.localeCompare(b))
  const remoteKeys = new Set(Object.keys(remote.items))
  const localOnly: string[] = []
  const changed: string[] = []

  for (const key of localKeys) {
    if (!remoteKeys.has(key)) {
      localOnly.push(key)
      continue
    }
    if (normalizeBackupItemForCompare(key, local.items[key]) !== normalizeBackupItemForCompare(key, remote.items[key])) {
      changed.push(key)
    }
    remoteKeys.delete(key)
  }

  const remoteOnly = Array.from(remoteKeys).sort((a, b) => a.localeCompare(b))
  const sampleKeys = [...localOnly, ...remoteOnly, ...changed].slice(0, Math.max(1, maxSampleKeys))

  return {
    localOnlyCount: localOnly.length,
    remoteOnlyCount: remoteOnly.length,
    changedCount: changed.length,
    differentKeyCount: localOnly.length + remoteOnly.length + changed.length,
    sampleKeys,
  }
}

function normalizeBackupItemForCompare(key: string, raw: string) {
  if (key === 'ratio.accountOps') return canonicalizeAccountOpsForBackup(raw)
  if (key === 'ratio.ledger') return canonicalizeTransactionsForBackup(raw)
  return raw
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

export type RatioBackupContentSummary = {
  itemCount: number
  /** null = 键缺失或无法解析 */
  accountCount: number | null
  snapshotCount: number | null
  opCount: number | null
  /** 存在但解析失败（非 JSON 数组）的关键键 */
  corruptKeys: string[]
  /** 三大关键集合全部为空或缺失（且没有损坏键）——「看起来是空的」 */
  looksEmpty: boolean
}

// 恢复前的内容预检：coerceRatioBackup 只校验文件结构，一个「合法 JSON 但
// 内容退化」的备份（被截断修补/同步盘转码）会静默恢复成空账本。这里对三个
// 关键键做浅解析计数，供确认弹窗展示并在退化时加重警告。
export function summarizeRatioBackupContent(backup: RatioBackupFile): RatioBackupContentSummary {
  const corruptKeys: string[] = []
  const countOf = (key: string): number | null => {
    const raw = backup.items[key]
    if (raw == null) return null
    try {
      const parsed: unknown = JSON.parse(raw)
      if (!Array.isArray(parsed)) {
        corruptKeys.push(key)
        return null
      }
      return parsed.length
    } catch {
      corruptKeys.push(key)
      return null
    }
  }

  const accountCount = countOf('ratio.accounts')
  const snapshotCount = countOf('ratio.snapshots')
  const opCount = countOf('ratio.accountOps')
  const looksEmpty =
    corruptKeys.length === 0 && (accountCount ?? 0) === 0 && (snapshotCount ?? 0) === 0 && (opCount ?? 0) === 0

  return {
    itemCount: Object.keys(backup.items).length,
    accountCount,
    snapshotCount,
    opCount,
    corruptKeys,
    looksEmpty,
  }
}

export type RestoreResult = {
  restoredKeys: string[]
  clearedKeys: string[]
  skippedKeys: string[]
}

export function clearRatioStorage(
  storage: Storage = appStorage,
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

function buildRestorableItems(
  backup: RatioBackupFile,
  prefix: string,
  excludeKeyPrefixes: readonly string[],
): { nextItems: Record<string, string>; skippedKeys: string[] } {
  const nextItems: Record<string, string> = {}
  const skippedKeys: string[] = []
  const entries = Object.entries(backup.items)
  entries.sort(([left], [right]) => left.localeCompare(right))

  for (const [key, raw] of entries) {
    if (!key.startsWith(prefix) || isExcludedKey(key, excludeKeyPrefixes)) {
      skippedKeys.push(key)
      continue
    }
    nextItems[key] = raw
  }

  return { nextItems, skippedKeys }
}

function applyRatioStorageItems(
  nextItems: Record<string, string>,
  storage: Storage,
  prefix: string,
  excludeKeyPrefixes: readonly string[],
) {
  const currentItems = readRatioStorage(storage, prefix, excludeKeyPrefixes)
  const nextKeys = Object.keys(nextItems).sort((left, right) => left.localeCompare(right))
  const nextKeySet = new Set(nextKeys)

  for (const key of Object.keys(currentItems)) {
    if (!nextKeySet.has(key)) storage.removeItem(key)
  }

  for (const key of nextKeys) {
    const raw = nextItems[key]
    if (currentItems[key] === raw) continue
    storage.setItem(key, raw)
  }
}

function isBrowserLocalStorage(storage: Storage) {
  if (typeof window === 'undefined') return false
  // 应用实际使用的两个「活」存储都要广播写事件：内核适配器与 localStorage 本体
  return storage === appStorage || storage === localStorage
}

function notifyRatioStorageDiff(storage: Storage, previousItems: Record<string, string>, nextItems: Record<string, string>) {
  if (!isBrowserLocalStorage(storage)) return

  const changedKeys = Array.from(new Set([...Object.keys(previousItems), ...Object.keys(nextItems)])).sort(
    (left, right) => left.localeCompare(right),
  )

  for (const key of changedKeys) {
    const prevRaw = previousItems[key]
    const nextRaw = nextItems[key]
    if (prevRaw === nextRaw) continue
    dispatchStorageWrite(key, nextRaw)
  }
}

export function restoreRatioBackup(
  backup: RatioBackupFile,
  storage: Storage = appStorage,
  prefix: string = RATIO_STORAGE_PREFIX,
  excludeKeyPrefixes: readonly string[] = RATIO_BACKUP_EXCLUDE_PREFIXES,
): RestoreResult {
  const previousItems = readRatioStorage(storage, prefix, excludeKeyPrefixes)
  const clearedKeys = Object.keys(previousItems).sort((left, right) => left.localeCompare(right))
  const { nextItems, skippedKeys } = buildRestorableItems(backup, prefix, excludeKeyPrefixes)
  const restoredKeys = Object.keys(nextItems).sort((left, right) => left.localeCompare(right))

  try {
    applyRatioStorageItems(nextItems, storage, prefix, excludeKeyPrefixes)
  } catch (error) {
    try {
      applyRatioStorageItems(previousItems, storage, prefix, excludeKeyPrefixes)
    } catch {
      throw new Error('Restore failed and rollback did not complete')
    }

    if (error instanceof Error) {
      throw new Error(`Restore failed: ${error.message}`)
    }

    throw new Error('Restore failed')
  }

  notifyRatioStorageDiff(storage, previousItems, nextItems)

  return { restoredKeys, clearedKeys, skippedKeys }
}
