// 网页系统液态玻璃（可选）：iOS 原生壳打开 WKWebView 私有偏好后，
// CSS `-apple-visual-effect: -apple-system-glass-material` 才会被认。
// 设置页开关写入 ratio.systemGlass；默认关闭，浏览器/PWA/e2e 外观不变。

export const SYSTEM_GLASS_KEY = 'ratio.systemGlass' as const

export function coerceSystemGlass(value: unknown): boolean {
  return value === true
}

/** WebKit 是否认系统玻璃 CSS（原生壳打开私有偏好后为 true；Safari/Chrome 为 false）。 */
export function isSystemGlassCssSupported(): boolean {
  if (typeof CSS === 'undefined' || typeof CSS.supports !== 'function') return false
  try {
    return CSS.supports('-apple-visual-effect', '-apple-system-glass-material')
  } catch {
    return false
  }
}

/** 把开关落到 <html data-system-glass>。不支持时绝不写属性，避免背景被掏空。 */
export function applyDocumentSystemGlass(enabled: boolean) {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  if (enabled && isSystemGlassCssSupported()) {
    root.dataset.systemGlass = '1'
  } else {
    delete root.dataset.systemGlass
  }
}
