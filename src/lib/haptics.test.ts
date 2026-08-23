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
