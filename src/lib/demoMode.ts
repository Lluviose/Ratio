// 演示模式开关（独立小模块：cloudSync 等底层也要读，避免循环依赖）。
// 进入/退出的编排在 demoData.ts。

import { appStorage } from './storageKernel'

export const DEMO_MODE_KEY = 'ratio.demoMode'
export const DEMO_STASH_KEY = 'ratio.demoStash'

// 备份/恢复与云同步都按该前缀排除演示相关键：
// 暂存与标记永远不进备份文件，也不会被恢复流程清掉
export const DEMO_KEY_PREFIX = 'ratio.demo'

export function isDemoModeActive(storage: Pick<Storage, 'getItem'> = appStorage): boolean {
  try {
    const raw = storage.getItem(DEMO_MODE_KEY)
    return raw === 'true' || raw === '1'
  } catch {
    return false
  }
}

export function setDemoModeActive(active: boolean, storage: Pick<Storage, 'setItem' | 'removeItem'> = appStorage) {
  if (active) storage.setItem(DEMO_MODE_KEY, 'true')
  else storage.removeItem(DEMO_MODE_KEY)
}
