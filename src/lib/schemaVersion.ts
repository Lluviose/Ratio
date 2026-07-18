// 数据 schema 版本与迁移框架。
//
// 背景：ratio.* 各键此前只靠 coerce 隐式兼容（能加字段，做不了破坏性变更）。
// 本模块给整份数据一个显式版本号，为快照降采样、多币种、账户归档等
// 需要改变数据形状的演进提供安全通道。
//
// 设计决策：版本号本身就是一个普通的 `ratio.schemaVersion` 键——
// 它自然进入备份文件与云端备份，于是「备份版本协商」不需要改动
// ratio.backup.v1 文件格式：恢复路径读 items 里的这个键即可判断
// 备份数据的 schema 版本（缺键 = 版本化之前的数据 = v1）。
//
// 约定：
// - 迁移在 main.tsx 挂载 React 之前执行（storageKernel.ready 之后），
//   组件树读到的一定是当前版本形状的数据。
// - 迁移必须 from 连续且 to = from + 1，逐级推进，每级成功后立即落版本号；
//   任何一级抛错则中止（版本号停在已完成的一级），应用以兼容模式继续运行
//   （coerce 兜底），绝不能因迁移失败白屏。
// - 版本高于当前应用（数据被更新版本写过）：不动数据也不回写版本号，
//   读取靠 coerce 前向兼容；恢复备份路径则直接拒绝（见 backup.ts）。

import { appStorage } from './storageKernel'
import { isDemoModeActive } from './demoMode'

export const DATA_SCHEMA_VERSION_KEY = 'ratio.schemaVersion'
export const CURRENT_DATA_SCHEMA_VERSION = 1

const RATIO_KEY_PREFIX = 'ratio.'

export type DataSchemaMigration = {
  from: number
  to: number
  /** 就地迁移 ratio.* 键。抛错则整个迁移流程中止，版本号不推进到本级。 */
  migrate: (storage: Storage) => void
}

// v1 → v2 起在此追加，保持 from 连续（1→2、2→3、…）。
export const DATA_SCHEMA_MIGRATIONS: readonly DataSchemaMigration[] = []

export function readStoredDataSchemaVersion(storage: Pick<Storage, 'getItem'> = appStorage): number | null {
  try {
    const raw = storage.getItem(DATA_SCHEMA_VERSION_KEY)
    if (raw == null) return null
    const value = Number(raw)
    return Number.isInteger(value) && value >= 1 ? value : null
  } catch {
    return null
  }
}

function hasAnyRatioData(storage: Storage): boolean {
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i)
    if (key && key.startsWith(RATIO_KEY_PREFIX) && key !== DATA_SCHEMA_VERSION_KEY) return true
  }
  return false
}

/**
 * 存储的有效 schema 版本：显式版本键优先；缺键但有数据 = 版本化之前的 v1；
 * 全空 = 全新安装，按当前版本对待。
 */
export function effectiveDataSchemaVersion(storage: Storage = appStorage): number {
  const stored = readStoredDataSchemaVersion(storage)
  if (stored != null) return stored
  return hasAnyRatioData(storage) ? 1 : CURRENT_DATA_SCHEMA_VERSION
}

export type DataSchemaMigrationOutcome =
  | { status: 'current'; version: number }
  | { status: 'migrated'; from: number; to: number }
  | { status: 'newer_data'; version: number }
  | { status: 'failed'; from: number; stoppedAt: number; error: unknown }
  | { status: 'skipped_demo' }

/**
 * 挂载前调用；也可在「恢复旧版本备份且不整页刷新」的路径复用（见 backup.ts）。
 * migrations/targetVersion 参数仅供测试注入，生产调用一律用默认值。
 */
export function runDataSchemaMigrations(
  storage: Storage = appStorage,
  migrations: readonly DataSchemaMigration[] = DATA_SCHEMA_MIGRATIONS,
  targetVersion: number = CURRENT_DATA_SCHEMA_VERSION,
): DataSchemaMigrationOutcome {
  // 演示模式的数据是临时生成的；退出演示会整体恢复真实数据，届时（下次启动）再迁移
  if (isDemoModeActive(storage)) return { status: 'skipped_demo' }

  const stored = readStoredDataSchemaVersion(storage)
  let version = stored ?? (hasAnyRatioData(storage) ? 1 : targetVersion)

  if (version > targetVersion) return { status: 'newer_data', version }

  if (version === targetVersion) {
    // 补章：老数据/新安装把版本显式落盘，此后随备份与云同步流动
    if (stored == null) {
      try {
        storage.setItem(DATA_SCHEMA_VERSION_KEY, String(targetVersion))
      } catch {
        // 落盘失败不阻断启动；下次启动重试
      }
    }
    return { status: 'current', version }
  }

  const from = version
  while (version < targetVersion) {
    const step = migrations.find((m) => m.from === version)
    if (!step) {
      // 缺失迁移步骤属于编程错误：停在当前级，交由 coerce 兜底
      return { status: 'failed', from, stoppedAt: version, error: new Error(`missing migration from v${version}`) }
    }
    try {
      step.migrate(storage)
      storage.setItem(DATA_SCHEMA_VERSION_KEY, String(step.to))
      version = step.to
    } catch (error) {
      return { status: 'failed', from, stoppedAt: version, error }
    }
  }

  return { status: 'migrated', from, to: version }
}
