// 原生液态玻璃导航栏桥（iOS 26+ Capacitor 原生壳，UIGlassEffect）。
//
// 可用时（probeNativeGlassAvailable() === true）web 隐藏自绘底部导航与首页
// 快捷栏，由原生玻璃导航栏接管（见 ios/App/App/GlassNavBar.swift）：
// - 原生按钮点击 → tabSelected 事件 → 本模块回调 → web 切 tab
// - web 侧状态变化（activeTab / 抽屉开合 / 主题强调色）→ 上报原生
//
// 不可用（浏览器 / 非 iOS 26 / 无插件）时全部 no-op，web 导航照常渲染，
// e2e 与网页版行为完全不变。不静态依赖 @capacitor/core：直接经壳注入的
// window.Capacitor.registerPlugin / isPluginAvailable 调用（零首包开销）。
//
// Capacitor 8 必须 JS 侧 registerPlugin，光靠原生 registerPluginInstance
// 不会往 Capacitor.Plugins 上挂代理——只读 Plugins.LiquidGlass 会永远
// undefined，然后按设计静默降级到 CSS 毛玻璃。

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
 * 探测原生液态玻璃导航栏是否真正可用。
 * 插件在 iOS 15–25 也会注册，必须等 isSupported 返回 true 才藏 CSS 栏，
 * 否则会出现「web 栏藏了、原生栏因 #available 建不出来」的空底。
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
