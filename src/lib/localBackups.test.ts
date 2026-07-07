import { beforeEach, describe, expect, it } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'
import { createStorageKernel, FALLBACK_WRITES_MARKER_KEY } from './storageKernel'
import {
  ensureDailyLocalBackup,
  importFallbackSessionSnapshot,
  listLocalBackups,
  restoreLocalBackup,
  writePreOperationLocalBackup,
} from './localBackups'

// 滚动快照仅在 IDB 模式启用：这里逐用例注入 fake-indexeddb 内核；
// 全局单例内核在 jsdom 下是 local 回退，相关入口应整体 no-op。

async function makeIdbKernel(seed: Record<string, string> = {}) {
  const kernel = createStorageKernel({
    indexedDBFactory: new IDBFactory(),
    localStorageRef: null,
    enableBroadcast: false,
  })
  await kernel.ready
  for (const [key, value] of Object.entries(seed)) kernel.set(key, value)
  return kernel
}

beforeEach(() => {
  localStorage.clear()
})

describe('localBackups', () => {
  it('每日一代：同日幂等，超过 7 代裁剪最旧', async () => {
    const kernel = await makeIdbKernel({ 'ratio.accounts': '[1]' })

    expect(ensureDailyLocalBackup(kernel, new Date('2026-07-08T10:00:00'))).toBe(true)
    expect(ensureDailyLocalBackup(kernel, new Date('2026-07-08T18:00:00'))).toBe(false)

    for (let d = 9; d <= 16; d++) {
      expect(ensureDailyLocalBackup(kernel, new Date(`2026-07-${String(d).padStart(2, '0')}T10:00:00`))).toBe(true)
    }

    const daily = listLocalBackups(kernel).filter((entry) => entry.kind === 'daily')
    expect(daily).toHaveLength(7)
    expect(daily[0].createdAt).toBe('2026-07-16')
    // 07-08 / 07-09 两代已被裁剪
    expect(daily[daily.length - 1].createdAt).toBe('2026-07-10')
  })

  it('操作前代际可恢复：覆盖当前数据回到快照时刻', async () => {
    const kernel = await makeIdbKernel({ 'ratio.accounts': '["old"]', 'ratio.theme': '"macke"' })
    expect(writePreOperationLocalBackup(kernel, new Date('2026-07-08T10:00:00'))).toBe(true)

    kernel.storage.setItem('ratio.accounts', '["new"]')
    kernel.storage.removeItem('ratio.theme')

    const [entry] = listLocalBackups(kernel)
    expect(entry.kind).toBe('pre')
    const res = restoreLocalBackup(entry.key, kernel)
    expect(res.restoredKeys).toContain('ratio.accounts')
    expect(kernel.get('ratio.accounts')).toBe('["old"]')
    expect(kernel.get('ratio.theme')).toBe('"macke"')
  })

  it('演示模式与空数据不占代际；local 回退模式整体停用', async () => {
    const demoKernel = await makeIdbKernel({ 'ratio.accounts': '[1]', 'ratio.demoMode': 'true' })
    expect(ensureDailyLocalBackup(demoKernel, new Date('2026-07-08T10:00:00'))).toBe(false)
    expect(listLocalBackups(demoKernel)).toEqual([])

    const emptyKernel = await makeIdbKernel()
    expect(ensureDailyLocalBackup(emptyKernel, new Date('2026-07-08T10:00:00'))).toBe(false)
    expect(listLocalBackups(emptyKernel)).toEqual([])

    const localKernel = createStorageKernel({
      indexedDBFactory: null,
      localStorageRef: localStorage,
      enableBroadcast: false,
    })
    await localKernel.ready
    localStorage.setItem('ratio.accounts', '[1]')
    expect(ensureDailyLocalBackup(localKernel, new Date())).toBe(false)
    expect(writePreOperationLocalBackup(localKernel, new Date())).toBe(false)
    expect(listLocalBackups(localKernel)).toEqual([])
  })

  it('降级会话抢救：按标记把 localStorage 数据存为 fallback 代际并消费标记', async () => {
    localStorage.setItem('ratio.accounts', '["from-fallback"]')
    localStorage.setItem(FALLBACK_WRITES_MARKER_KEY, '2026-07-07T09:00:00.000Z')
    const kernel = await makeIdbKernel()

    expect(importFallbackSessionSnapshot(kernel)).toBe(true)
    expect(localStorage.getItem(FALLBACK_WRITES_MARKER_KEY)).toBeNull()

    const [entry] = listLocalBackups(kernel)
    expect(entry.kind).toBe('fallback')
    restoreLocalBackup(entry.key, kernel)
    expect(kernel.get('ratio.accounts')).toBe('["from-fallback"]')

    // 无标记时 no-op
    expect(importFallbackSessionSnapshot(kernel)).toBe(false)
  })

  it('降级期间零数据：消费标记但不写代际（无可抢救）', async () => {
    localStorage.setItem(FALLBACK_WRITES_MARKER_KEY, '2026-07-07T09:00:00.000Z')
    const kernel = await makeIdbKernel()

    expect(importFallbackSessionSnapshot(kernel)).toBe(false)
    expect(localStorage.getItem(FALLBACK_WRITES_MARKER_KEY)).toBeNull()
    expect(listLocalBackups(kernel)).toEqual([])
  })
})
