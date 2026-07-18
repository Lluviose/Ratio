import { describe, expect, it } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'
import { BOOT_MIRROR_KEYS, createStorageKernel, FALLBACK_WRITES_MARKER_KEY } from './storageKernel'
import { subscribeAppToasts, type ToastOptions } from './overlay'

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
  openTimeoutMs?: number
} = {}) {
  return createStorageKernel({
    indexedDBFactory: options.factory === undefined ? new IDBFactory() : options.factory,
    localStorageRef: options.local === undefined ? makeMemoryStorage() : options.local,
    enableBroadcast: false,
    databaseName: options.dbName,
    openTimeoutMs: options.openTimeoutMs,
  })
}

// 包装 fake-indexeddb：state.failTransactions > 0 时 transaction() 同步抛
// InvalidStateError（模拟 iOS 挂起后连接被系统单方面关闭的典型表现）；
// state.errorName 可改为 QuotaExceededError 等模拟配额耗尽
function makeFlakyFactory(base: IDBFactory) {
  const state = { failTransactions: 0, errorName: 'InvalidStateError' }
  const wrapped = new WeakMap<IDBDatabase, IDBDatabase>()

  function wrapDb(db: IDBDatabase): IDBDatabase {
    const cached = wrapped.get(db)
    if (cached) return cached
    const proxy = new Proxy(db, {
      get(target, prop) {
        if (prop === 'transaction' && state.failTransactions > 0) {
          state.failTransactions -= 1
          return () => {
            throw new DOMException('The database connection is closing.', state.errorName)
          }
        }
        const value = Reflect.get(target, prop)
        return typeof value === 'function' ? (value as (...args: unknown[]) => unknown).bind(target) : value
      },
      set(target, prop, value) {
        Reflect.set(target, prop, value)
        return true
      },
    })
    wrapped.set(db, proxy)
    return proxy
  }

  const factory = {
    open(name: string, version?: number) {
      const request = base.open(name, version)
      return new Proxy(request, {
        get(target, prop) {
          if (prop === 'result') return wrapDb(Reflect.get(target, prop) as IDBDatabase)
          const value = Reflect.get(target, prop)
          return typeof value === 'function' ? (value as (...args: unknown[]) => unknown).bind(target) : value
        },
        set(target, prop, value) {
          Reflect.set(target, prop, value)
          return true
        },
      })
    },
  } as unknown as IDBFactory

  return { factory, state }
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

  it('落盘失败的批次不丢弃：flush 报告失败，条目留队列稍后重试成功', async () => {
    const base = new IDBFactory()
    const { factory, state } = makeFlakyFactory(base)
    const kernel = createStorageKernel({
      indexedDBFactory: factory,
      localStorageRef: makeMemoryStorage(),
      enableBroadcast: false,
    })
    await kernel.ready
    expect(kernel.getBackend()).toBe('idb')

    // 首试 + 重开重试全部失败
    state.failTransactions = 99
    kernel.set('ratio.accounts', '[1]')
    await expect(kernel.flush()).resolves.toBe(false)
    // 内存视图不受影响
    expect(kernel.get('ratio.accounts')).toBe('[1]')

    // 故障恢复后，同一批条目由下一次 flush 自动重试提交
    state.failTransactions = 0
    await expect(kernel.flush()).resolves.toBe(true)

    const second = createStorageKernel({ indexedDBFactory: base, localStorageRef: null, enableBroadcast: false })
    await second.ready
    expect(second.get('ratio.accounts')).toBe('[1]')
  })

  it('落盘失败后按退避主动重试：无需新写入或显式 flush 即自动恢复', async () => {
    const base = new IDBFactory()
    const { factory, state } = makeFlakyFactory(base)
    const kernel = createStorageKernel({
      indexedDBFactory: factory,
      localStorageRef: makeMemoryStorage(),
      enableBroadcast: false,
      flushRetryBaseMs: 5,
    })
    await kernel.ready

    state.failTransactions = 99
    kernel.set('ratio.accounts', '[2]')
    await expect(kernel.flush()).resolves.toBe(false)

    // 故障恢复后不再有任何调用方动作：失败退避定时器应自行完成落盘
    state.failTransactions = 0
    await new Promise((resolve) => setTimeout(resolve, 200))

    const second = createStorageKernel({ indexedDBFactory: base, localStorageRef: null, enableBroadcast: false })
    await second.ready
    expect(second.get('ratio.accounts')).toBe('[2]')
  })

  it('配额错误升级为可操作提示：清理本机快照动作释放空间并重试成功', async () => {
    const base = new IDBFactory()
    const { factory, state } = makeFlakyFactory(base)
    const kernel = createStorageKernel({
      indexedDBFactory: factory,
      localStorageRef: makeMemoryStorage(),
      enableBroadcast: false,
      flushRetryBaseMs: 5,
    })
    await kernel.ready

    // 先落一代本机快照
    kernel.set('__backup.daily.2026-01-01', '{"snapshot":true}')
    await expect(kernel.flush()).resolves.toBe(true)

    const toasts: Array<{ message: string; options?: ToastOptions }> = []
    const unsubscribe = subscribeAppToasts((request) => void toasts.push(request))
    try {
      state.errorName = 'QuotaExceededError'
      state.failTransactions = 99
      kernel.set('ratio.accounts', '[1]')
      await expect(kernel.flush()).resolves.toBe(false)

      const quotaToast = toasts.find((t) => t.options?.action)
      expect(quotaToast?.message).toContain('存储空间不足')
      expect(quotaToast?.options?.action?.label).toBe('清理本机快照')

      // 用户点击清理动作：__backup.* 代际被清空并立即重试落盘
      state.failTransactions = 0
      quotaToast?.options?.action?.onClick()
      await expect(kernel.flush()).resolves.toBe(true)
      expect(kernel.internalKeys('__backup.')).toEqual([])
      expect(kernel.get('ratio.accounts')).toBe('[1]')

      const second = createStorageKernel({ indexedDBFactory: base, localStorageRef: null, enableBroadcast: false })
      await second.ready
      expect(second.get('ratio.accounts')).toBe('[1]')
      expect(second.internalKeys('__backup.')).toEqual([])
    } finally {
      unsubscribe()
    }
  })

  it('连接失效时重开连接重试：单次瞬时失败对调用方透明', async () => {
    const base = new IDBFactory()
    const { factory, state } = makeFlakyFactory(base)
    const kernel = createStorageKernel({
      indexedDBFactory: factory,
      localStorageRef: makeMemoryStorage(),
      enableBroadcast: false,
    })
    await kernel.ready

    state.failTransactions = 1
    kernel.set('ratio.theme', '"miro"')
    await expect(kernel.flush()).resolves.toBe(true)

    const second = createStorageKernel({ indexedDBFactory: base, localStorageRef: null, enableBroadcast: false })
    await second.ready
    expect(second.get('ratio.theme')).toBe('"miro"')
  })

  it('IDB open 挂死时按超时回退 local，ready 不悬挂（白屏防护）', async () => {
    const hangingFactory = {
      open: () => ({}) as IDBOpenDBRequest,
    } as unknown as IDBFactory
    const local = makeMemoryStorage({ 'ratio.accounts': '[7]' })
    const kernel = makeKernel({ factory: hangingFactory, local, openTimeoutMs: 20 })
    await kernel.ready
    expect(kernel.getBackend()).toBe('local')
    expect(kernel.get('ratio.accounts')).toBe('[7]')
  })

  it('迁移期间 localStorage 读取失败：不写迁移标记，下次启动重试导入', async () => {
    const factory = new IDBFactory()
    const goodLocal = makeMemoryStorage({ 'ratio.accounts': '[7]' })
    const brokenLocal = {
      getItem: goodLocal.getItem.bind(goodLocal),
      setItem: goodLocal.setItem.bind(goodLocal),
      removeItem: goodLocal.removeItem.bind(goodLocal),
      key: goodLocal.key.bind(goodLocal),
      clear: goodLocal.clear.bind(goodLocal),
      get length(): number {
        throw new Error('SecurityError')
      },
    } as Storage

    const first = makeKernel({ factory, local: brokenLocal })
    await first.ready
    expect(first.getBackend()).toBe('idb')
    // 本次没导入任何数据，但也没有盖「已迁移」章
    expect(first.keys()).toEqual([])
    await first.flush()

    // localStorage 恢复可读的下一次启动：迁移照常执行
    const second = makeKernel({ factory, local: goodLocal })
    await second.ready
    expect(second.get('ratio.accounts')).toBe('[7]')
  })

  it('internalKeys 枚举内核键；keys/appStorage 视图不见它们', async () => {
    const kernel = makeKernel()
    await kernel.ready
    kernel.set('__backup.daily.2026-07-08', '{"schema":"ratio.backup.v1"}')
    kernel.set('ratio.accounts', '[1]')

    expect(kernel.internalKeys('__backup.')).toEqual(['__backup.daily.2026-07-08'])
    expect(kernel.keys()).toEqual(['ratio.accounts'])
    expect(kernel.storage.length).toBe(1)
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
    await expect(kernel.flush()).resolves.toBe(true)
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

  it('回退会话（IDB 本应可用）的写入打降级标记；无 IDB 工厂的常态不打', async () => {
    const brokenFactory = {
      open() {
        throw new Error('boom')
      },
    } as unknown as IDBFactory
    const local = makeMemoryStorage()
    const kernel = makeKernel({ factory: brokenFactory, local })
    await kernel.ready
    kernel.set('ratio.accounts', '[1]')
    expect(local.getItem(FALLBACK_WRITES_MARKER_KEY)).toBeTruthy()

    // 真正没有 IDB 的环境（老浏览器/jsdom）不算降级，不打标
    const plainLocal = makeMemoryStorage()
    const plainKernel = makeKernel({ factory: null, local: plainLocal })
    await plainKernel.ready
    plainKernel.set('ratio.accounts', '[1]')
    expect(plainLocal.getItem(FALLBACK_WRITES_MARKER_KEY)).toBeNull()
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
