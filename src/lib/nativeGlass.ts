// 原生液态玻璃探测（iOS 26+ Capacitor 壳）。
//
// 底部导航已改回网页自绘（与改造前同一套 layout：首页左下角三按钮胶囊、
// 其它页贴底四栏）。系统材质由设置页「系统液态玻璃」经 CSS
// `-apple-visual-effect` 套在原来的 .navBar / .glassChrome / .card / .sheet 上
// （见 systemGlass.ts）。本模块不再藏 CSS 导航，也不再驱动原生 GlassNavBar。
//
// 仍通过壳注入的 window.Capacitor.registerPlugin / isPluginAvailable 探测，
// 禁止静态 import @capacitor/core。isSupported 留给需要判断 iOS 26 的调用方。

type GlassTabId = 'assets' | 'trend' | 'stats' | 'settings'

interface LiquidGlassApi {
  isSupported: () => Promise<{ available?: boolean }>
  setActiveTab: (options: { tab: string }) => Promise<void>
  setSheetOpen: (options: { open: boolean }) => Promise<void>
  setAccentColor: (options: { color: string }) => Promise<void>
  addListener: (
    eventName: string,
    handler: (data: { tab: string }) => void,
  ) => { remove: () => void }
}

type CapacitorBridge = {
  isNativePlatform?: () => boolean
  isPluginAvailable?: (name: string) => boolean
  registerPlugin?: (name: string) => LiquidGlassApi
  Plugins?: { LiquidGlass?: LiquidGlassApi }
}

function capacitor(): CapacitorBridge | undefined {
  if (typeof window === 'undefined') return undefined
  return (window as unknown as { Capacitor?: CapacitorBridge }).Capacitor
}

function plugin(): LiquidGlassApi | undefined {
  const cap = capacitor()
  if (!cap) return undefined
  if (typeof cap.isPluginAvailable === 'function' && !cap.isPluginAvailable('LiquidGlass')) {
    return undefined
  }
  if (cap.Plugins?.LiquidGlass) return cap.Plugins.LiquidGlass
  if (typeof cap.registerPlugin === 'function') {
    try {
      return cap.registerPlugin('LiquidGlass')
    } catch {
      return undefined
    }
  }
  return undefined
}

/** 原生插件是否挂上（不等于 iOS 26 能画出 UIGlassEffect）。 */
export function isNativeGlassPluginPresent(): boolean {
  return Boolean(plugin())
}

/**
 * 探测原生壳是否在 iOS 26+（WKWebView 能认系统玻璃 CSS）。
 * 不再用来隐藏 CSS 导航。
 */
export async function probeNativeGlassAvailable(): Promise<boolean> {
  const p = plugin()
  if (!p) return false
  if (typeof p.isSupported !== 'function') return false
  try {
    const result = await p.isSupported()
    return result?.available === true
  } catch {
    return false
  }
}

/** @deprecated 用 probeNativeGlassAvailable；同步探测无法区分 iOS 版本。 */
export function isNativeGlassAvailable(): boolean {
  return isNativeGlassPluginPresent()
}

/** 读取当前主题强调色（--primary，index.css 按 data-theme 定义）。 */
export function readAccentColor(): string {
  if (typeof document === 'undefined') return ''
  return getComputedStyle(document.documentElement).getPropertyValue('--primary').trim()
}

/**
 * 初始化桥接：订阅原生按钮点击事件。
 * 返回清理函数（卸载时移除监听）。
 */
export function initNativeGlass(handlers: { onTabSelected: (tab: GlassTabId) => void }): () => void {
  const p = plugin()
  if (!p) return () => undefined
  const listener = p.addListener('tabSelected', (data) => {
    if (data.tab === 'assets' || data.tab === 'trend' || data.tab === 'stats' || data.tab === 'settings') {
      handlers.onTabSelected(data.tab)
    }
  })
  return () => listener.remove()
}

/** 同步当前激活 tab 给原生高亮。 */
export function nativeGlassSetActiveTab(tab: GlassTabId) {
  void plugin()?.setActiveTab({ tab })
}

/** 抽屉开合时隐藏/恢复原生导航栏（抽屉盖住底部）。 */
export function nativeGlassSetSheetOpen(open: boolean) {
  void plugin()?.setSheetOpen({ open })
}

/** 主题切换时同步强调色（原生按钮高亮）。 */
export function nativeGlassSetAccentColor(color: string) {
  if (color) void plugin()?.setAccentColor({ color })
}
