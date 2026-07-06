import { describe, expect, it } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'
import { BOOT_MIRROR_KEYS, createStorageKernel } from './storageKernel'

// 每个用例注入独立的 fake IDBFactory 与内存 Storage，互不串扰；
// 全局单例 storageKernel 在 jsdom（无 indexedDB）下自动走 local 回退，
// 其余单测因此保持迁移前的 localStorage 语义，无需感知内核存在。

function makeMemoryStorage(initial: Record<string, string> = {}): Storage {
  const map = new Map(Object.entries(initial))
  return {
    get length() {
      return map.size
    },
    key(index: number) {
      return Array.from(map.keys())[index] ?? null
    },
    getItem(key: string) {
      return map.get(key) ?? null
    },
    setItem(key: string, value: string) {
      map.set(key, String(value))
    },
    removeItem(key: string) {
      map.delete(key)
    },
    clear() {
      map.clear()
    },
  } as Storage
}

function makeKernel(options: {
  factory?: IDBFactory | null
  local?: Storage | null
  dbName?: string
} = {}) {
  return createStorageKernel({
    indexedDBFactory: options.factory === undefined ? new IDBFactory() : options.factory,
    localStorageRef: options.local === undefined ? makeMemoryStorage() : options.local,
    enableBroadcast: false,
    databaseName: options.dbName,
  })
}

describe('storageKernel (IDB 模式)', () => {
  it('ready 后 backend 为 idb，读写删与 keys 过滤符合约定', async () => {
    const kernel = makeKernel()
    await kernel.ready
    expect(kernel.getBackend()).toBe('idb')

    kernel.set('ratio.accounts', '[1]')
    kernel.set('other.key', 'x')
    expect(kernel.get('ratio.accounts')).toBe('[1]')
    expect(kernel.get('missing')).toBeNull()
    // keys 只暴露 ratio.*（迁移标记等内部键不外泄）
    expect(kernel.keys()).toEqual(['ratio.accounts'])

    kernel.remove('ratio.accounts')
    expect(kernel.get('ratio.accounts')).toBeNull()
    expect(kernel.keys()).toEqual([])
  })

  it('flush 后数据落盘：第二个内核（无 localStorage）能读回', async () => {
    const factory = new IDBFactory()
    const first = makeKernel({ factory })
    await first.ready
    first.set('ratio.accounts', '[{"id":"a"}]')
    first.set('ratio.snapshots', '[]')
    first.remove('ratio.snapshots')
    await first.flush()

    const second = makeKernel({ factory, local: null })
    await second.ready
    expect(second.getBackend()).toBe('idb')
    expect(second.get('ratio.accounts')).toBe('[{"id":"a"}]')
    expect(second.get('ratio.snapshots')).toBeNull()
  })

  it('首启迁移：导入 localStorage 全部 ratio.* 键，旧副本冻结保留', async () => {
    const local = makeMemoryStorage({
      'ratio.accounts': '[7]',
      'ratio.theme': '"matisse"',
      'unrelated': 'keep',
    })
    const kernel = makeKernel({ factory: new IDBFactory(), local })
    await kernel.ready

    expect(kernel.get('ratio.accounts')).toBe('[7]')
    expect(kernel.get('ratio.theme')).toBe('"matisse"')
    // 非 ratio.* 键不迁移
    expect(kernel.get('unrelated')).toBeNull()
    // 旧副本原样保留（旧版本回滚仍可用）
    expect(local.getItem('ratio.accounts')).toBe('[7]')

    // 迁移后普通键的写入不再回写 localStorage（冻结）
    kernel.set('ratio.accounts', '[8]')
    await kernel.flush()
    expect(local.getItem('ratio.accounts')).toBe('[7]')
  })

  it('迁移标记：清空数据后重启不会把冻结旧副本导回来', async () => {
    const factory = new IDBFactory()
    const local = makeMemoryStorage({ 'ratio.accounts': '[7]' })
    const first = makeKernel({ factory, local })
    await first.ready
    expect(first.get('ratio.accounts')).toBe('[7]')

    // 模拟「清除全部数据」：通过 Storage 适配器 clear
    first.storage.clear()
    await first.flush()

    const second = makeKernel({ factory, local })
    await second.ready
    expect(second.getBackend()).toBe('idb')
    expect(second.get('ratio.accounts')).toBeNull()
    expect(second.keys()).toEqual([])
  })

  it('boot 镜像键持续回写 localStorage，其余键不回写', async () => {
    const local = makeMemoryStorage()
    const kernel = makeKernel({ factory: new IDBFactory(), local })
    await kernel.ready

    expect(BOOT_MIRROR_KEYS).toContain('ratio.colorMode')
    kernel.set('ratio.colorMode', '"dark"')
    kernel.set('ratio.accounts', '[1]')
    expect(local.getItem('ratio.colorMode')).toBe('"dark"')
    expect(local.getItem('ratio.accounts')).toBeNull()

    kernel.remove('ratio.colorMode')
    expect(local.getItem('ratio.colorMode')).toBeNull()
  })

  it('ready 之前的写入会被重放进 IDB，无读写空窗', async () => {
    const factory = new IDBFactory()
    const local = makeMemoryStorage()
    const kernel = makeKernel({ factory, local })
    // 不等 ready 直接写（此刻仍是 local 直写）
    kernel.set('ratio.early', '"yes"')
    await kernel.ready
    expect(kernel.get('ratio.early')).toBe('"yes"')

    await kernel.flush()
    const second = makeKernel({ factory, local: null })
    await second.ready
    expect(second.get('ratio.early')).toBe('"yes"')
  })

  it('Storage 适配器：length/key 只见 ratio.*，setItem/removeItem 与内核一致', async () => {
    const kernel = makeKernel()
    await kernel.ready
    const storage = kernel.storage

    storage.setItem('ratio.b', '2')
    storage.setItem('ratio.a', '1')
    kernel.set('internal.meta', 'hidden')

    expect(storage.length).toBe(2)
    const seen = [storage.key(0), storage.key(1)].sort()
    expect(seen).toEqual(['ratio.a', 'ratio.b'])
    expect(storage.key(2)).toBeNull()
    expect(storage.getItem('ratio.a')).toBe('1')

    storage.removeItem('ratio.a')
    expect(storage.getItem('ratio.a')).toBeNull()
    // clear 不触碰非 ratio.* 内部键
    storage.clear()
    expect(storage.length).toBe(0)
    expect(kernel.get('internal.meta')).toBe('hidden')
  })
})

describe('storageKernel (local 回退模式)', () => {
  it('无 IDB 工厂时整体回退：直读直写注入的 localStorage', async () => {
    const local = makeMemoryStorage({ 'ratio.accounts': '[7]' })
    const kernel = makeKernel({ factory: null, local })
    await kernel.ready
    expect(kernel.getBackend()).toBe('local')

    expect(kernel.get('ratio.accounts')).toBe('[7]')
    kernel.set('ratio.theme', '"miro"')
    expect(local.getItem('ratio.theme')).toBe('"miro"')
    kernel.remove('ratio.accounts')
    expect(local.getItem('ratio.accounts')).toBeNull()
    expect(kernel.keys()).toEqual(['ratio.theme'])
    // local 模式下 flush 是空操作但必须可等待（刷新前统一 await flush）
    await expect(kernel.flush()).resolves.toBeUndefined()
  })

  it('IDB 打开失败时回退 local，且 ready 不会 reject', async () => {
    const brokenFactory = {
      open() {
        throw new Error('boom')
      },
    } as unknown as IDBFactory
    const local = makeMemoryStorage({ 'ratio.accounts': '[7]' })
    const kernel = makeKernel({ factory: brokenFactory, local })
    await expect(kernel.ready).resolves.toBeUndefined()
    expect(kernel.getBackend()).toBe('local')
    expect(kernel.get('ratio.accounts')).toBe('[7]')
  })

  it('local 模式写入配额错误向上抛给调用方（与迁移前语义一致）', async () => {
    const quotaError = new Error('QuotaExceededError')
    const local = makeMemoryStorage()
    const throwingLocal = {
      ...local,
      setItem() {
        throw quotaError
      },
      getItem: local.getItem.bind(local),
      removeItem: local.removeItem.bind(local),
      key: local.key.bind(local),
      clear: local.clear.bind(local),
      get length() {
        return local.length
      },
    } as Storage
    const kernel = makeKernel({ factory: null, local: throwingLocal })
    await kernel.ready
    expect(() => kernel.set('ratio.accounts', '[1]')).toThrow(quotaError)
  })

  it('local 模式读取异常同样向上抛（调用方自带 try/catch）', async () => {
    const readError = new Error('SecurityError')
    const local = makeMemoryStorage()
    const throwingLocal = {
      ...local,
      getItem() {
        throw readError
      },
      setItem: local.setItem.bind(local),
      removeItem: local.removeItem.bind(local),
      key: local.key.bind(local),
      clear: local.clear.bind(local),
      get length() {
        return local.length
      },
    } as Storage
    const kernel = makeKernel({ factory: null, local: throwingLocal })
    await kernel.ready
    expect(() => kernel.get('ratio.accounts')).toThrow(readError)
  })
})
