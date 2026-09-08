import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { preloadNativeModules } from './nativeStartup'
import { entranceDelay } from './motionPresets'

const loaders = vi.hoisted(() => Array.from({ length: 5 }, () => vi.fn<() => Promise<unknown>>()))
vi.mock('../components/screenLoaders', () => ({
  loadTrendScreen: loaders[0], loadStatsScreen: loaders[1], loadSettingsScreen: loaders[2],
}))
vi.mock('../components/aiAssistantLoader', () => ({ loadAiAssistant: loaders[3] }))
vi.mock('./matterLoader', () => ({ loadMatter: loaders[4] }))

function bridge(platform: string, native = true) {
  vi.stubGlobal('Capacitor', { isNativePlatform: () => native, getPlatform: () => platform })
}

beforeEach(() => {
  vi.useFakeTimers()
  loaders.forEach((loader) => loader.mockReset().mockResolvedValue(undefined))
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('native startup', () => {
  it('starts every iOS module immediately even if the first module is still pending', async () => {
    bridge('ios')
    let finish!: () => void
    loaders[0].mockImplementation(() => new Promise<void>((resolve) => { finish = resolve }))
    const pending = preloadNativeModules()
    loaders.forEach((loader) => expect(loader).toHaveBeenCalledTimes(1))
    expect(vi.getTimerCount()).toBe(0)
    expect(entranceDelay(0.4)).toBe(0)
    finish()
    await pending
  })

  it.each(['web', 'android'])('does not eagerly load modules on %s', async (platform) => {
    bridge(platform, platform !== 'web')
    await preloadNativeModules()
    loaders.forEach((loader) => expect(loader).not.toHaveBeenCalled())
    expect(entranceDelay(0.4)).toBe(0.4)
  })

  it('does not mistake iOS Safari for the native app', async () => {
    bridge('ios', false)
    await preloadNativeModules()
    loaders.forEach((loader) => expect(loader).not.toHaveBeenCalled())
  })

  it('isolates preload failures instead of rejecting the startup', async () => {
    bridge('ios')
    loaders[0].mockRejectedValue(new Error('unavailable chunk'))
    await expect(preloadNativeModules()).resolves.toBeDefined()
    loaders.forEach((loader) => expect(loader).toHaveBeenCalledTimes(1))
  })
})
