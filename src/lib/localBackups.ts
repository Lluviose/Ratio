// 本机滚动快照：在存储内核里保留最近几代全量备份，给「导入了坏备份 /
// 误清数据 / 降级会话丢改动」这类不可逆操作一个本机恢复手段。
//
// - 键以 __backup. 开头（非 ratio.* 前缀）：不进备份文件、不被恢复/清空
//   流程触碰、不出现在 appStorage 视图、不触发云同步脏标记。
// - 仅 IDB 模式启用：local 回退模式共享 localStorage 的 ~5MB 配额，装不下
//   多代全量副本（jsdom 单测经注入 fake-indexeddb 的内核覆盖 IDB 路径）。
// - 三类代际：daily 每日一代（App 启动空闲时写，保 7 代）、pre 危险操作前
//   抢一代（导入备份/云端恢复/进入演示，保 3 代）、fallback 降级会话数据
//  （IDB 恢复后从 localStorage 抢救，保 1 代）。
// - 写入失败绝不阻断主流程：所有入口自吞错并返回 false。

import {
  buildRatioBackup,
  parseRatioBackup,
  restoreRatioBackup,
  type RatioBackupFile,
  type RestoreResult,
} from './backup'
import { isDemoModeActive } from './demoMode'
import { emitAppToast } from './overlay'
import { FALLBACK_WRITES_MARKER_KEY, storageKernel, type StorageKernel } from './storageKernel'

export const LOCAL_BACKUP_PREFIX = '__backup.'

export type LocalBackupKind = 'daily' | 'pre' | 'fallback'

export type LocalBackupEntry = {
  key: string
  kind: LocalBackupKind
  /** daily 为 YYYY-MM-DD，其余为 ISO 时间戳 */
  createdAt: string
  sizeBytes: number
}

const KEEP_BY_KIND: Record<LocalBackupKind, number> = {
  daily: 7,
  pre: 3,
  fallback: 1,
}

function generationKey(kind: LocalBackupKind, id: string) {
  return `${LOCAL_BACKUP_PREFIX}${kind}.${id}`
}

function parseGenerationKey(key: string): { kind: LocalBackupKind; id: string } | null {
  if (!key.startsWith(LOCAL_BACKUP_PREFIX)) return null
  const rest = key.slice(LOCAL_BACKUP_PREFIX.length)
  const dot = rest.indexOf('.')
  if (dot <= 0) return null
  const kind = rest.slice(0, dot)
  if (kind !== 'daily' && kind !== 'pre' && kind !== 'fallback') return null
  return { kind, id: rest.slice(dot + 1) }
}

function entryCreatedAt(kind: LocalBackupKind, id: string): string {
  if (kind === 'daily') return id
  const ms = Number(id)
  if (Number.isFinite(ms) && ms > 0) return new Date(ms).toISOString()
  return id
}

function localDateKey(now: Date): string {
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function listLocalBackups(kernel: StorageKernel = storageKernel): LocalBackupEntry[] {
  if (kernel.getBackend() !== 'idb') return []
  const entries: LocalBackupEntry[] = []
  for (const key of kernel.internalKeys(LOCAL_BACKUP_PREFIX)) {
    const parsed = parseGenerationKey(key)
    if (!parsed) continue
    const raw = kernel.get(key)
    if (raw == null) continue
    entries.push({
      key,
      kind: parsed.kind,
      createdAt: entryCreatedAt(parsed.kind, parsed.id),
      sizeBytes: raw.length,
    })
  }
  // createdAt 混合了 YYYY-MM-DD 与 ISO 时间戳，字典序即时间序
  entries.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  return entries
}

function prune(kernel: StorageKernel, kind: LocalBackupKind) {
  const sameKind = listLocalBackups(kernel).filter((entry) => entry.kind === kind)
  for (const entry of sameKind.slice(KEEP_BY_KIND[kind])) kernel.remove(entry.key)
}

function writeGeneration(kernel: StorageKernel, kind: LocalBackupKind, id: string, backup: RatioBackupFile): boolean {
  try {
    if (kernel.getBackend() !== 'idb') return false
    // 空数据集不占代际（全新安装/刚清空时没有可保护的东西）
    if (Object.keys(backup.items).length === 0) return false
    // 紧凑序列化：与备份文件的 pretty-print 不同，代际存储体积优先
    kernel.set(generationKey(kind, id), JSON.stringify(backup))
    prune(kernel, kind)
    return true
  } catch (error) {
    console.error('localBackups: write generation failed', error)
    return false
  }
}

/** 每日一代：当天已有则跳过；演示模式下跳过（不用演示数据占掉真实数据的代际） */
export function ensureDailyLocalBackup(kernel: StorageKernel = storageKernel, now = new Date()): boolean {
  try {
    if (kernel.getBackend() !== 'idb') return false
    if (isDemoModeActive(kernel.storage)) return false
    const id = localDateKey(now)
    if (kernel.get(generationKey('daily', id)) != null) return false
    return writeGeneration(kernel, 'daily', id, buildRatioBackup(kernel.storage))
  } catch (error) {
    console.error('localBackups: daily generation failed', error)
    return false
  }
}

/** 危险操作（导入备份/云端恢复/进入演示）前抢一代快照；失败不阻断主流程 */
export function writePreOperationLocalBackup(kernel: StorageKernel = storageKernel, now = new Date()): boolean {
  return writeGeneration(kernel, 'pre', String(now.getTime()), buildRatioBackup(kernel.storage))
}

/** 从指定代际恢复（覆盖当前 ratio.* 数据）；调用方负责确认、flush 与刷新 */
export function restoreLocalBackup(key: string, kernel: StorageKernel = storageKernel): RestoreResult {
  const raw = kernel.get(key)
  if (raw == null) throw new Error('本机快照不存在或已被清理')
  return restoreRatioBackup(parseRatioBackup(raw), kernel.storage)
}

/**
 * 降级会话数据抢救：上一会话 IDB 打开失败回退 localStorage 时，写入只落在
 * localStorage（storageKernel 会打降级标记）。本次 IDB 正常启动后把那份数据
 * 整体另存为 fallback 代际，用户可在设置里查看/恢复。App 启动空闲时调用。
 */
export function importFallbackSessionSnapshot(kernel: StorageKernel = storageKernel): boolean {
  try {
    if (kernel.getBackend() !== 'idb') return false
    if (typeof localStorage === 'undefined') return false
    const markedAt = localStorage.getItem(FALLBACK_WRITES_MARKER_KEY)
    if (!markedAt) return false

    const backup = buildRatioBackup(localStorage)
    if (Object.keys(backup.items).length === 0) {
      // 降级期间没有留下任何数据：无可抢救，直接消费标记
      localStorage.removeItem(FALLBACK_WRITES_MARKER_KEY)
      return false
    }
    const ms = Date.parse(markedAt)
    const id = String(Number.isFinite(ms) ? ms : Date.now())
    const ok = writeGeneration(kernel, 'fallback', id, backup)
    // 写失败时保留标记，下次启动重试；成功才消费
    if (!ok) return false
    localStorage.removeItem(FALLBACK_WRITES_MARKER_KEY)
    emitAppToast('已把降级模式期间的数据另存为本机快照，可在设置中恢复', {
      tone: 'neutral',
      durationMs: 8000,
    })
    return true
  } catch (error) {
    console.error('localBackups: import fallback snapshot failed', error)
    return false
  }
}
