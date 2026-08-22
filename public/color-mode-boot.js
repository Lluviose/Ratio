// 首屏外观模式引导：在样式绘制前把已解析的模式写到 <html data-mode>，
// 避免暗色用户冷启动闪白。解析规则必须与 src/lib/colorMode.ts 保持一致。
// 系统液态玻璃开关（ratio.systemGlass）同样在这里提前落地，规则与
// src/lib/systemGlass.ts 一致：只有 CSS.supports 通过才写 data-system-glass，
// 避免不支持的环境把卡片背景掏空。
;(function () {
  try {
    var raw = localStorage.getItem('ratio.colorMode')
    var mode = raw ? JSON.parse(raw) : 'system'
    if (mode !== 'light' && mode !== 'dark') mode = 'system'
    var dark =
      mode === 'dark' ||
      (mode === 'system' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches)
    if (dark) {
      document.documentElement.dataset.mode = 'dark'
      var meta = document.querySelector('meta[name="theme-color"]')
      if (meta) meta.setAttribute('content', '#0b101a')
    }
  } catch (e) {
    /* 解析失败按浅色处理 */
  }

  try {
    var glassRaw = localStorage.getItem('ratio.systemGlass')
    var glassOn = glassRaw ? JSON.parse(glassRaw) === true : false
    if (
      glassOn &&
      typeof CSS !== 'undefined' &&
      typeof CSS.supports === 'function' &&
      CSS.supports('-apple-visual-effect', '-apple-system-glass-material')
    ) {
      document.documentElement.dataset.systemGlass = '1'
    }
  } catch (e) {
    /* 不支持或解析失败保持网页毛玻璃 */
  }
})()
