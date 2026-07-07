// 存储内核：应用数据的持久层。IndexedDB 为权威存储（配额远大于 localStorage
// 的 ~5MB，且可申请持久化豁免驱逐），启动时全量水合进内存，之后同步读写内存、
// 异步批量落盘。IndexedDB 不可用（jsdom / 隐私模式打开失败 / 老浏览器）时整体
// 回退为 localStorage 直读直写——语义与迁移前完全一致，全部单测在该模式下运行。
//
// 关键约定（改动前必读）：
// - main.tsx 必须 await `storageKernel.ready` 后再挂载 React。ready 之前
//   backend 保持 'local'（直读 localStorage 旧副本），期间的写入会被记录并在
//   切换到 IDB 后重放，因此没有读写空窗。openDb 带超时：IDB open 挂死
//   （WebKit 已知缺陷）时按不可用回退 local，ready 不会永久悬挂。
// - 首次以 IDB 模式启动时，把 localStorage 的 ratio.* 全量导入 IDB 并写入
//   迁移标记（标记存 IDB、不带 ratio. 前缀，永不进备份/清理）。localStorage
//   读取中途失败时整体放弃且不写标记，下次启动重试——绝不把空/半份数据盖章成
//   「已迁移」。旧副本原样冻结保留（旧版本回滚仍有近期数据可用），此后不再
//   更新——例外是 BOOT_MIRROR_KEYS（colorMode/theme），持续镜像回
//   localStorage，供 public/color-mode-boot.js 在首屏样式绘制前同步读取。
// - 跨标签同步走 BroadcastChannel（IDB 写不会触发 storage 事件），收到广播后
//   更新内存并派发与本地写一致的 storageEvents 自定义事件，hooks 无感知。
// - 落盘失败的批次不会被丢弃：条目留在待写队列里，由后续任意一次 flush
//   自动重试；写失败会先重开一次连接再试（iOS 挂起恢复后 WebKit 可能单方面
//   关闭连接，onclose 后由写入路径惰性重连）。
// - `flush()` 返回是否全部落盘成功。写入后要整页刷新的路径（恢复备份、
//   进出演示模式）必须 `await flush()` 并在 false 时中止刷新——否则刷新会
//   丢弃内存态、读回旧数据，操作看似成功实际没发生。
// - 非 ratio.* 的内核键（__meta.* 迁移标记、__backup.* 本机滚动快照）不进
//   备份文件、不被恢复/清空触碰、不出现在 appStorage 视图；枚举走
//   `internalKeys()`。IDB 本应可用却回退的会话，写入会在 localStorage 打
//   降级标记（FALLBACK_WRITES_MARKER_KEY），下次正常启动由 localBackups
//   把降级期间的数据另存为本机快照。
// - `appStorage` 是 Storage 形状的适配器（只暴露 ratio.* 键），backup/ai/
//   demo/cloud 等按 Storage 接口消费的模块以它为默认存储。

import { dispatchStorageWrite } from './storageEvents'
import { emitAppToast } from './overlay'

const RATIO_PREFIX = 'ratio.'
const DB_NAME = 'ratio'
const DB_VERSION = 1
const KV_STORE = 'kv'
const MIGRATED_META_KEY = '__meta.migratedFromLocalStorage'
const CHANNEL_NAME = 'ratio.storage.kernel'
const WRITE_ERROR_TOAST_THROTTLE_MS = 30_000
const DEFAULT_OPEN_TIMEOUT_MS = 5_000
const MAX_FLUSH_ROUNDS = 8

export const BOOT_MIRROR_KEYS: readonly string[] = ['ratio.colorMode', 'ratio.theme']

// 降级会话写入标记：存 localStorage（IDB 模式启动时也要能读到）。
// 不带 ratio. 前缀，不进备份/清理/appStorage 视图。
export const FALLBACK_WRITES_MARKER_KEY = 'ratio-kernel.fallbackWrites'

export type StorageKernelBackend = 'local' | 'idb'

export type StorageKernel = {
  /** 水合 + 迁移完成；main.tsx 在此之后才挂载 React */
  ready: Promise<void>
  getBackend(): StorageKernelBackend
  get(key: string): string | null
  set(key: string, raw: string): void
  remove(key: string): void
  /** 全部 ratio.* 键（IDB 模式下来自内存，local 模式下来自 localStorage） */
  keys(): string[]
  /** 非 ratio.* 内核键的枚举（迁移标记、本机滚动快照等），仅供内核级模块使用 */
  internalKeys(prefix: string): string[]
  /** 等待挂起的 IDB 写入全部落盘；false = 有批次未能提交（条目仍在队列里等待重试） */
  flush(): Promise<boolean>
  /** Storage 形状适配器，供按 Storage 接口消费的模块使用 */
  storage: Storage
}

type KernelOptions = {
  /** 测试注入；显式传 null 表示强制 local 回退 */
  indexedDBFactory?: IDBFactory | null
  localStorageRef?: Storage | null
  enableBroadcast?: boolean
  databaseName?: string
  /** IDB open 超时（毫秒），超时按不可用回退 local；测试可调小 */
  openTimeoutMs?: number
}

export function createStorageKernel(options: KernelOptions = {}): StorageKernel {
  const idbFactory =
    options.indexedDBFactory !== undefined
      ? options.indexedDBFactory
      : typeof indexedDB === 'undefined'
        ? null
        : indexedDB
  const local =
    options.localStorageRef !== undefined
      ? options.localStorageRef
      : typeof localStorage === 'undefined'
        ? null
        : localStorage
  const dbName = options.databaseName ?? DB_NAME
  const openTimeoutMs = options.openTimeoutMs ?? DEFAULT_OPEN_TIMEOUT_MS

  let backend: StorageKernelBackend = 'local'
  let db: IDBDatabase | null = null
  let reopening: Promise<IDBDatabase> | null = null
  let channel: BroadcastChannel | null = null
  let readyResolved = false
  let lastWriteErrorToastAt = 0

  const memory = new Map<string, string>()
  const pendingWrites = new Map<string, string | null>()
  const preReadyWrites: Array<{ key: string; raw: string | null }> = []
  let flushTimer: ReturnType<typeof setTimeout> | null = null
  let inflight: Promise<boolean> = Promise.resolve(true)

  function openDb(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      let settled = false
      // WebKit 已知缺陷：open 请求可能永不回调。超时判负走回退，
      // 避免 main.tsx 等 ready 时白屏挂死
      const timer =
        openTimeoutMs > 0
          ? setTimeout(() => {
              if (settled) return
              settled = true
              reject(new Error('indexedDB open timed out'))
            }, openTimeoutMs)
          : null
      const clearTimer = () => {
        if (timer !== null) clearTimeout(timer)
      }

      let request: IDBOpenDBRequest
      try {
        request = idbFactory!.open(dbName, DB_VERSION)
      } catch (error) {
        settled = true
        clearTimer()
        reject(error instanceof Error ? error : new Error('indexedDB open failed'))
        return
      }
      request.onupgradeneeded = () => {
        const database = request.result
        if (!database.objectStoreNames.contains(KV_STORE)) database.createObjectStore(KV_STORE)
      }
      request.onsuccess = () => {
        if (settled) {
          // 超时判负之后才回调成功：关闭这个脱管连接，避免占住数据库
          try {
            request.result.close()
          } catch {
            // ignore
          }
          return
        }
        settled = true
        clearTimer()
        resolve(request.result)
      }
      request.onerror = () => {
        if (settled) return
        settled = true
        clearTimer()
        reject(request.error ?? new Error('indexedDB open failed'))
      }
      request.onblocked = () => {
        if (settled) return
        settled = true
        clearTimer()
        reject(new Error('indexedDB open blocked'))
      }
    })
  }

  function attachDbHandlers(database: IDBDatabase) {
    // versionchange：另一个标签请求升级 schema 时主动让路
    database.onversionchange = () => {
      if (db === database) db = null
      try {
        database.close()
      } catch {
        // ignore
      }
    }
    // iOS/WebKit 可能在页面挂起后单方面关闭连接；置空后由写入路径惰性重开
    database.onclose = () => {
      if (db === database) db = null
    }
  }

  function markDatabaseLost() {
    const database = db
    db = null
    if (!database) return
    try {
      database.close()
    } catch {
      // 已断开的连接 close 可能抛错，忽略
    }
  }

  function ensureDb(): Promise<IDBDatabase> {
    if (db) return Promise.resolve(db)
    if (!idbFactory) return Promise.reject(new Error('indexedDB unavailable'))
    if (!reopening) {
      reopening = openDb()
        .then((database) => {
          attachDbHandlers(database)
          db = database
          return database
        })
        .finally(() => {
          reopening = null
        })
    }
    return reopening
  }

  function hydrate(database: IDBDatabase): Promise<void> {
    return new Promise((resolve, reject) => {
      const tx = database.transaction(KV_STORE, 'readonly')
      const store = tx.objectStore(KV_STORE)
      const keysRequest = store.getAllKeys()
      const valuesRequest = store.getAll()
      tx.oncomplete = () => {
        const keys = keysRequest.result
        const values = valuesRequest.result
        for (let i = 0; i < keys.length; i++) {
          const key = keys[i]
          const value = values[i]
          if (typeof key === 'string' && typeof value === 'string') memory.set(key, value)
        }
        resolve()
      }
      tx.onerror = () => reject(tx.error ?? new Error('indexedDB hydrate failed'))
      tx.onabort = () => reject(tx.error ?? new Error('indexedDB hydrate aborted'))
    })
  }

  function writeBatch(database: IDBDatabase, entries: Array<[string, string | null]>): Promise<void> {
    if (entries.length === 0) return Promise.resolve()
    return new Promise((resolve, reject) => {
      let tx: IDBTransaction
      try {
        // 连接已被系统关闭时 transaction() 同步抛 InvalidStateError，
        // 归一成 rejection 让重开重试路径接手
        tx = database.transaction(KV_STORE, 'readwrite')
      } catch (error) {
        reject(error instanceof Error ? error : new Error('indexedDB write failed'))
        return
      }
      const store = tx.objectStore(KV_STORE)
      for (const [key, raw] of entries) {
        if (raw === null) store.delete(key)
        else store.put(raw, key)
      }
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error ?? new Error('indexedDB write failed'))
      tx.onabort = () => reject(tx.error ?? new Error('indexedDB write aborted'))
    })
  }

  // 迁移：IDB 里既无标记也无 ratio.* 数据时，导入 localStorage 旧数据。
  // 标记的存在使「用户清空数据后重启」不会把冻结的旧副本再导回来。
  async function migrateIfNeeded(database: IDBDatabase): Promise<void> {
    if (memory.has(MIGRATED_META_KEY)) return
    let hasAppKeys = false
    for (const key of memory.keys()) {
      if (key.startsWith(RATIO_PREFIX)) {
        hasAppKeys = true
        break
      }
    }

    const entries: Array<[string, string | null]> = []
    if (!hasAppKeys && local) {
      const imported: Array<[string, string]> = []
      try {
        for (let i = 0; i < local.length; i++) {
          const key = local.key(i)
          if (!key || !key.startsWith(RATIO_PREFIX)) continue
          const raw = local.getItem(key)
          if (raw == null) continue
          imported.push([key, raw])
        }
      } catch {
        // 读取中途失败：整体放弃本次迁移且不写标记，下次启动重试。
        // 绝不把空/半份数据盖章成「已迁移」——那会永久遗弃旧数据
        return
      }
      for (const [key, raw] of imported) {
        memory.set(key, raw)
        entries.push([key, raw])
      }
    }

    const stamp = new Date().toISOString()
    memory.set(MIGRATED_META_KEY, stamp)
    entries.push([MIGRATED_META_KEY, stamp])
    await writeBatch(database, entries)
  }

  function reportWriteError(error: unknown) {
    console.error('storageKernel: IndexedDB write failed', error)
    const now = Date.now()
    if (now - lastWriteErrorToastAt >= WRITE_ERROR_TOAST_THROTTLE_MS) {
      lastWriteErrorToastAt = now
      emitAppToast('数据落盘失败，最近的修改可能没有保存', { tone: 'danger', durationMs: 6000 })
    }
  }

  // 提交成功之前绝不从 pendingWrites 移除条目：失败的批次留在队列里，
  // 由后续任意一次 flush（定时/生命周期/显式）自动重试。永不 reject。
  async function attemptFlush(): Promise<boolean> {
    for (let round = 0; round < MAX_FLUSH_ROUNDS && pendingWrites.size > 0; round++) {
      const entries = Array.from(pendingWrites.entries())
      try {
        await writeBatch(await ensureDb(), entries)
      } catch (firstError) {
        // iOS 挂起恢复后连接可能已被单方面关闭：重开一次连接再试
        markDatabaseLost()
        try {
          await writeBatch(await ensureDb(), entries)
        } catch {
          reportWriteError(firstError)
          return false
        }
      }
      // 只清除仍等于已提交值的键；提交期间被覆盖的留给下一轮
      for (const [key, raw] of entries) {
        if (pendingWrites.get(key) === raw) pendingWrites.delete(key)
      }
    }
    if (pendingWrites.size > 0) scheduleFlush()
    return pendingWrites.size === 0
  }

  function runFlush(): Promise<boolean> {
    if (flushTimer !== null) {
      clearTimeout(flushTimer)
      flushTimer = null
    }
    if (backend !== 'idb' || pendingWrites.size === 0) return inflight
    const run = () => attemptFlush()
    inflight = inflight.then(run, run)
    return inflight
  }

  function scheduleFlush() {
    if (flushTimer !== null) return
    flushTimer = setTimeout(() => {
      flushTimer = null
      void runFlush()
    }, 0)
  }

  function syncBootMirror(key: string, raw: string | null) {
    if (!BOOT_MIRROR_KEYS.includes(key)) return
    try {
      if (raw === null) local?.removeItem(key)
      else local?.setItem(key, raw)
    } catch {
      // 镜像失败只影响下次冷启动首帧的明暗判断，不阻塞主写入
    }
  }

  // 本会话 IDB 本应可用（工厂存在）却回退了：打标「降级期间发生过写入」，
  // 下次 IDB 正常启动时据此把 localStorage 数据另存为本机快照（localBackups）
  function markFallbackWrite() {
    if (!idbFactory || !readyResolved) return
    try {
      if (local && local.getItem(FALLBACK_WRITES_MARKER_KEY) == null) {
        local.setItem(FALLBACK_WRITES_MARKER_KEY, new Date().toISOString())
      }
    } catch {
      // 打标失败不影响主写入
    }
  }

  function get(key: string): string | null {
    if (backend === 'idb') return memory.get(key) ?? null
    // local 模式直读：读取异常向上抛（与迁移前 localStorage.getItem 语义
    // 一致，调用方自带 try/catch）
    return local?.getItem(key) ?? null
  }

  function set(key: string, raw: string): void {
    if (!readyResolved) preReadyWrites.push({ key, raw })
    if (backend === 'idb') {
      memory.set(key, raw)
      pendingWrites.set(key, raw)
      scheduleFlush()
      syncBootMirror(key, raw)
      channel?.postMessage({ key, raw })
      return
    }
    // local 模式：同步直写，配额错误向上抛给调用方（hook 层已有提示逻辑）
    local?.setItem(key, raw)
    markFallbackWrite()
  }

  function remove(key: string): void {
    if (!readyResolved) preReadyWrites.push({ key, raw: null })
    if (backend === 'idb') {
      memory.delete(key)
      pendingWrites.set(key, null)
      scheduleFlush()
      syncBootMirror(key, null)
      channel?.postMessage({ key, raw: null })
      return
    }
    try {
      local?.removeItem(key)
      markFallbackWrite()
    } catch {
      // 删除失败忽略
    }
  }

  function keys(): string[] {
    if (backend === 'idb') {
      return Array.from(memory.keys()).filter((key) => key.startsWith(RATIO_PREFIX))
    }
    const out: string[] = []
    if (!local) return out
    try {
      for (let i = 0; i < local.length; i++) {
        const key = local.key(i)
        if (key && key.startsWith(RATIO_PREFIX)) out.push(key)
      }
    } catch {
      // 不可读按空处理
    }
    return out
  }

  function internalKeys(prefix: string): string[] {
    if (backend === 'idb') {
      return Array.from(memory.keys()).filter((key) => key.startsWith(prefix))
    }
    const out: string[] = []
    if (!local) return out
    try {
      for (let i = 0; i < local.length; i++) {
        const key = local.key(i)
        if (key && key.startsWith(prefix)) out.push(key)
      }
    } catch {
      // 不可读按空处理
    }
    return out
  }

  async function flush(): Promise<boolean> {
    const ok = await runFlush()
    // 一次 runFlush 期间可能又排入新写（罕见）；再收一遍尾
    if (pendingWrites.size > 0) return runFlush()
    return ok
  }

  function setupBroadcast() {
    if (options.enableBroadcast === false || typeof BroadcastChannel === 'undefined') return
    channel = new BroadcastChannel(CHANNEL_NAME)
    channel.onmessage = (event) => {
      const data: unknown = event.data
      if (!data || typeof data !== 'object') return
      const key = Reflect.get(data, 'key')
      if (typeof key !== 'string') return
      const rawValue = Reflect.get(data, 'raw')
      const raw = typeof rawValue === 'string' ? rawValue : null
      if (raw === null) memory.delete(key)
      else memory.set(key, raw)
      // 发送方已负责落盘；这里只同步内存并让 hooks 走既有事件协议刷新
      dispatchStorageWrite(key, raw ?? undefined)
    }
  }

  // 批量落盘有一个 setTimeout(0) 的窗口；移动端切后台可能在窗口内冻结 JS，
  // 页面隐藏时立即抢跑一次 flush，尽可能缩短「已写内存未落盘」的时间
  function setupLifecycleFlush() {
    if (typeof window === 'undefined' || typeof document === 'undefined') return
    window.addEventListener('pagehide', () => {
      void runFlush()
    })
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') void runFlush()
    })
  }

  function requestPersistentStorage() {
    try {
      if (typeof navigator === 'undefined') return
      void navigator.storage?.persist?.().catch(() => undefined)
    } catch {
      // 不支持则跳过
    }
  }

  const ready = (async () => {
    if (!idbFactory) {
      readyResolved = true
      preReadyWrites.length = 0
      requestPersistentStorage()
      return
    }
    try {
      const database = await openDb()
      attachDbHandlers(database)
      await hydrate(database)
      await migrateIfNeeded(database)
      db = database
      backend = 'idb'
      setupBroadcast()
      setupLifecycleFlush()
      readyResolved = true
      // 重放 ready 之前落在 localStorage 的写入（理论上渲染门控下不会有）
      const replay = preReadyWrites.splice(0, preReadyWrites.length)
      for (const op of replay) {
        if (op.raw === null) remove(op.key)
        else set(op.key, op.raw)
      }
      // boot 镜像键对齐 IDB 权威值（另一台标签页改过而本地镜像滞后时）
      for (const key of BOOT_MIRROR_KEYS) {
        const raw = memory.get(key)
        if (raw != null) syncBootMirror(key, raw)
      }
    } catch (error) {
      console.error('storageKernel: IndexedDB unavailable, falling back to localStorage', error)
      db = null
      backend = 'local'
      readyResolved = true
      preReadyWrites.length = 0
      // IDB 存在却打开失败：本会话跑在冻结于迁移日的 localStorage 副本上，
      // 且本会话写入不会进 IDB——明确警示，避免用户在旧数据上无感记账
      emitAppToast('本机数据库暂时不可用，已切换到降级存储：当前显示的可能不是最新数据', {
        tone: 'danger',
        durationMs: 8000,
      })
    }
    requestPersistentStorage()
  })()

  const storage = {
    get length() {
      return keys().length
    },
    key(index: number) {
      return keys()[index] ?? null
    },
    getItem(key: string) {
      return get(key)
    },
    setItem(key: string, value: string) {
      set(key, String(value))
    },
    removeItem(key: string) {
      remove(key)
    },
    clear() {
      for (const key of keys()) remove(key)
    },
  } as Storage

  return {
    ready,
    getBackend: () => backend,
    get,
    set,
    remove,
    keys,
    internalKeys,
    flush,
    storage,
  }
}

export const storageKernel = createStorageKernel()

/** 应用数据的默认 Storage：IDB 模式下是内存/IDB 视图，回退模式下等价 localStorage */
export const appStorage = storageKernel.storage
