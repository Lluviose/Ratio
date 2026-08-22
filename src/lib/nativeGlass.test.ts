import { afterEach, describe, expect, it, vi } from 'vitest'
import { isNativeGlassPluginPresent, probeNativeGlassAvailable } from './nativeGlass'

type CapMock = {
  isPluginAvailable?: (name: string) => boolean
  registerPlugin?: (name: string) => unknown
  Plugins?: { LiquidGlass?: unknown }
}

function stubCapacitor(cap: CapMock | undefined) {
  ;(window as unknown as { Capacitor?: CapMock }).Capacitor = cap
}

describe('nativeGlass plugin detection', () => {
  afterEach(() => {
    delete (window as unknown as { Capacitor?: unknown }).Capacitor
  })

  it('is absent in a plain browser', () => {
    expect(isNativeGlassPluginPresent()).toBe(false)
  })

  it('is absent when isPluginAvailable returns false', () => {
    stubCapacitor({
      isPluginAvailable: () => false,
      registerPlugin: () => ({ isSupported: () => Promise.resolve({ available: true }) }),
    })
    expect(isNativeGlassPluginPresent()).toBe(false)
  })

  it('registers via Capacitor.registerPlugin when the native plugin is listed', () => {
    const api = { isSupported: () => Promise.resolve({ available: true }) }
    const registerPlugin = vi.fn().mockReturnValue(api)
    stubCapacitor({
      isPluginAvailable: (name) => name === 'LiquidGlass',
      registerPlugin,
    })
    expect(isNativeGlassPluginPresent()).toBe(true)
    expect(registerPlugin).toHaveBeenCalledWith('LiquidGlass')
  })

  it('probeNativeGlassAvailable waits for isSupported, not just plugin presence', async () => {
    stubCapacitor({
      isPluginAvailable: () => true,
      registerPlugin: () => ({
        isSupported: () => Promise.resolve({ available: false }),
      }),
    })
    expect(isNativeGlassPluginPresent()).toBe(true)
    expect(await probeNativeGlassAvailable()).toBe(false)
  })

  it('probeNativeGlassAvailable is true only when native reports available', async () => {
    stubCapacitor({
      isPluginAvailable: () => true,
      registerPlugin: () => ({
        isSupported: () => Promise.resolve({ available: true }),
      }),
    })
    expect(await probeNativeGlassAvailable()).toBe(true)
  })
})
