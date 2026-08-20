// 原生液态玻璃导航栏桥（iOS 26+ Capacitor 原生壳，UIGlassEffect）。
//
// 可用时（isNativeGlassAvailable() === true）web 隐藏自绘底部导航与首页
// 快捷栏，由原生玻璃导航栏接管（见 ios/App/App/GlassNavBar.swift）：
// - 原生按钮点击 → tabSelected 事件 → 本模块回调 → web 切 tab
// - web 侧状态变化（activeTab / 抽屉开合 / 主题强调色）→ 上报原生
//
// 不可用（浏览器 / 非 iOS 26 / 无插件）时全部 no-op，web 导航照常渲染，
// e2e 与网页版行为完全不变。不静态依赖 @capacitor/core：直接经 bridge
// 注入的 window.Capacitor.Plugins.LiquidGlass 调用（零首包开销）。

type GlassTabId = 'assets' | 'trend' | 'stats' | 'settings'

interface LiquidGlassApi {
  setActiveTab: (options: { tab: string }) => Promise<void>
  setSheetOpen: (options: { open: boolean }) => Promise<void>
  setAccentColor: (options: { color: string }) => Promise<void>
  addListener: (
    eventName: string,
    handler: (data: { tab: string }) => void,
  ) => { remove: () => void }
}

function plugin(): LiquidGlassApi | undefined {
  if (typeof window === 'undefined') return undefined
  return (
    window as unknown as { Capacitor?: { Plugins?: { LiquidGlass?: LiquidGlassApi } } }
  ).Capacitor?.Plugins?.LiquidGlass
}

/** 原生液态玻璃导航栏是否可用（iOS 26+ 原生壳且插件已注册）。 */
export function isNativeGlassAvailable(): boolean {
  return Boolean(plugin())
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
