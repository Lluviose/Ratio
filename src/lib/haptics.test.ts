import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const impact = vi.fn(() => Promise.resolve())
const notification = vi.fn(() => Promise.resolve())
const selectionStart = vi.fn(() => Promise.resolve())
const selectionChanged = vi.fn(() => Promise.resolve())
const selectionEnd = vi.fn(() => Promise.resolve())

vi.mock('@capacitor/haptics', () => ({
  Haptics: {
    impact,
    notification,
    selectionStart,
    selectionChanged,
    selectionEnd,
  },
}))

function stubNative(on = true) {
  ;(window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor = on
    ? { isNativePlatform: () => true }
    : undefined
}

async function loadHaptics() {
  vi.resetModules()
  impact.mockClear()
  notification.mockClear()
  selectionStart.mockClear()
  selectionChanged.mockClear()
  selectionEnd.mockClear()
  return import('./haptics')
}

describe('haptics', () => {
  beforeEach(() => {
    stubNative(true)
  })

  afterEach(() => {
    delete (window as unknown as { Capacitor?: unknown }).Capacitor
  })

  it('selectionChanged 先 selectionStart，否则 iOS 不震', async () => {
    const { hapticSelectionChanged } = await loadHaptics()
    hapticSelectionChanged()
    await vi.waitFor(() => {
      expect(selectionStart).toHaveBeenCalledTimes(1)
      expect(selectionChanged).toHaveBeenCalledTimes(1)
    })
    expect(selectionStart.mock.invocationCallOrder[0]).toBeLessThan(selectionChanged.mock.invocationCallOrder[0])
  })

  it('同一选择生成器只武装一次', async () => {
    const { hapticSelectionChanged } = await loadHaptics()
    hapticSelectionChanged()
    await vi.waitFor(() => expect(selectionChanged).toHaveBeenCalledTimes(1))
    await new Promise((r) => setTimeout(r, 70))
    hapticSelectionChanged()
    await vi.waitFor(() => expect(selectionChanged).toHaveBeenCalledTimes(2))
    expect(selectionStart).toHaveBeenCalledTimes(1)
  })

  it('preload 提前武装选择生成器', async () => {
    const { preloadHaptics, hapticSelectionChanged } = await loadHaptics()
    preloadHaptics()
    await vi.waitFor(() => expect(selectionStart).toHaveBeenCalledTimes(1))
    hapticSelectionChanged()
    await vi.waitFor(() => expect(selectionChanged).toHaveBeenCalledTimes(1))
    expect(selectionStart).toHaveBeenCalledTimes(1)
  })

  it('impact 按强度把 style 传给原生', async () => {
    const { hapticImpact } = await loadHaptics()
    hapticImpact('light')
    await vi.waitFor(() => expect(impact).toHaveBeenCalledWith({ style: 'LIGHT' }))
  })

  it('同类型 impact 50ms 内只放一次', async () => {
    const { hapticImpact } = await loadHaptics()
    hapticImpact('medium')
    hapticImpact('medium')
    await vi.waitFor(() => expect(impact).toHaveBeenCalledTimes(1))
  })

  it('非原生环境不调插件', async () => {
    stubNative(false)
    const { hapticSelectionChanged, hapticImpact } = await loadHaptics()
    hapticSelectionChanged()
    hapticImpact('light')
    await new Promise((r) => setTimeout(r, 30))
    expect(selectionStart).not.toHaveBeenCalled()
    expect(impact).not.toHaveBeenCalled()
  })
})

// 上面的用例把 Haptics 模拟成普通对象，看不见真实插件对象的形状：
// Capacitor 的 registerPlugin 返回 Proxy，任意属性（含 then）都返回方法包装器，
// 于是它是 thenable。加载器一旦让它裸奔穿过 Promise，引擎会去调 Haptics.then()，
// 原生没这个方法 → 拒绝没人接 + 外层 promise 永不 settle，整条链路哑火。
// 这一组用真实 Proxy 语义复现（修复前必红）。
describe('haptics：插件对象是 thenable Proxy（真实 Capacitor 形状）', () => {
  const nativeCalls: string[] = []
  const rejections: string[] = []

  function proxyPlugin(implemented: string[]) {
    return new Proxy(
      {},
      {
        get(_target, prop) {
          if (prop === '$$typeof' || prop === 'toJSON') return undefined
          const name = String(prop)
          return (...args: unknown[]) => {
            if (!implemented.includes(name)) {
              // Capacitor 对未实现方法的行为：返回一个「没人接」的拒绝
              const p = Promise.reject(new Error(`"Haptics.${name}()" is not implemented on ios`))
              p.catch(() => undefined) // 只为不污染测试进程；生产里正是这里冒出 unhandledrejection
              rejections.push(name)
              return p
            }
            nativeCalls.push(name + (args.length ? ':' + JSON.stringify(args[0]) : ''))
            return Promise.resolve()
          }
        },
      },
    )
  }

  beforeEach(() => {
    nativeCalls.length = 0
    rejections.length = 0
    stubNative(true)
  })

  afterEach(() => {
    delete (window as unknown as { Capacitor?: unknown }).Capacitor
    vi.doUnmock('@capacitor/haptics')
  })

  it('插件对象经 Promise 传递时不会被当作 thenable 触发 Haptics.then()', async () => {
    vi.doMock('@capacitor/haptics', () => ({
      Haptics: proxyPlugin(['impact', 'notification', 'selectionStart', 'selectionChanged', 'selectionEnd']),
    }))
    vi.resetModules()
    const { hapticImpact } = await import('./haptics')

    hapticImpact('heavy')
    await vi.waitFor(() => expect(nativeCalls).toContain('impact:{"style":"HEAVY"}'))
    expect(rejections).not.toContain('then')
  })

  it('缓存命中后的第二次调用同样不触发 then（Promise.resolve 也会 adopt thenable）', async () => {
    vi.doMock('@capacitor/haptics', () => ({
      Haptics: proxyPlugin(['impact', 'notification', 'selectionStart', 'selectionChanged', 'selectionEnd']),
    }))
    vi.resetModules()
    const { hapticSuccess, hapticError } = await import('./haptics')

    hapticSuccess()
    await vi.waitFor(() => expect(nativeCalls).toContain('notification:{"type":"SUCCESS"}'))
    hapticError()
    await vi.waitFor(() => expect(nativeCalls).toContain('notification:{"type":"ERROR"}'))
    expect(rejections).toEqual([])
  })
})
