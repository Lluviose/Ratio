// 首屏外观模式引导：在样式绘制前把已解析的模式写到 <html data-mode>，
// 避免暗色用户冷启动闪白。解析规则必须与 src/lib/colorMode.ts 保持一致。
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
})()
