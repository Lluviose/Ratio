// 外观模式（浅色/深色/跟随系统）。
// 解析后的模式写在 <html data-mode> 上，index.css 的
// :root[data-mode="dark"] 变量块负责实际换肤；index.html 里有一段
// 首屏内联脚本做同样的解析以避免暗色用户冷启动闪白，两处逻辑需保持一致。

export type ColorMode = 'system' | 'light' | 'dark'

export const COLOR_MODE_KEY = 'ratio.colorMode'

export const COLOR_MODE_OPTIONS: Array<{ id: ColorMode; label: string }> = [
  { id: 'system', label: '跟随系统' },
  { id: 'light', label: '浅色' },
  { id: 'dark', label: '深色' },
]

// 与 index.css 的 --bg（浅/暗）保持同步，用于 meta theme-color
export const LIGHT_THEME_COLOR = '#f2f4f7'
export const DARK_THEME_COLOR = '#0b101a'

export function coerceColorMode(value: unknown): ColorMode {
  return value === 'dark' || value === 'light' || value === 'system' ? value : 'system'
}

export function resolveColorMode(mode: ColorMode, systemPrefersDark: boolean): 'light' | 'dark' {
  if (mode === 'system') return systemPrefersDark ? 'dark' : 'light'
  return mode
}

export function applyDocumentColorMode(resolved: 'light' | 'dark') {
  if (typeof document === 'undefined') return
  document.documentElement.dataset.mode = resolved
  const meta = document.querySelector('meta[name="theme-color"]')
  meta?.setAttribute('content', resolved === 'dark' ? DARK_THEME_COLOR : LIGHT_THEME_COLOR)
}
