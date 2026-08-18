import { useEffect, useState } from 'react'

// 安全区插入值：CSS 侧的单一事实源是 :root 的 --safe-top/--safe-bottom（index.css）。
//
// 布局模型（iOS 26+ 独立模式 Web App 一律沉浸式渲染，内容延伸到状态栏与
// Home Indicator 之下）：.appFrame 铺满整屏，每个贴边组件用
// calc(var(--safe-top/bottom) + …) 自行避让，appViewport 不再整体吃安全区——
// 否则毛玻璃导航条/占比色块与物理屏幕边缘之间会多出一条底色带。
//
// 少数几何计算（资产首页占比图表顶 RATIO_CHART_TOP）需要 JS 数值，从
// useSafeAreaTop() 读取；它读的是 --safe-top 的生效值（含下方兜底覆写）。
//
// 兜底：个别 iOS 版本在独立模式下 env(safe-area-inset-top) 恒为 0，但内容仍被
// 画到状态栏下方（时钟直接压在页面标题上）。检测「iPhone + 独立模式 + 竖屏 +
// env 顶部为 0」组合时，把 --safe-top/--safe-bottom 覆写为保守常量。env 正常
// 上报的设备（黑半透明状态栏 + viewport-fit=cover 的既定行为）永远不会触发。

const FALLBACK_TOP_PX = '59px'
const FALLBACK_BOTTOM_PX = '34px'

export type SafeAreaFallbackInput = {
  isIphone: boolean
  standalone: boolean
  portrait: boolean
  envTopPx: number
  envBottomPx: number
}

export type SafeAreaFallbackDecision = { top: string | null; bottom: string | null }

/** 纯决策函数：返回需要覆写的自定义属性值，null 表示清除覆写交还 env()。 */
export function decideSafeAreaFallback(input: SafeAreaFallbackInput): SafeAreaFallbackDecision {
  const { isIphone, standalone, portrait, envTopPx, envBottomPx } = input
  if (!isIphone || !standalone || !portrait) return { top: null, bottom: null }
  if (envTopPx >= 1) return { top: null, bottom: null }
  return {
    top: FALLBACK_TOP_PX,
    bottom: envBottomPx >= 1 ? null : FALLBACK_BOTTOM_PX,
  }
}

function measureCssLengthPx(expression: string): number {
  if (typeof document === 'undefined' || !document.body) return 0
  const probe = document.createElement('div')
  probe.style.cssText = 'position:fixed;top:0;left:0;width:0;pointer-events:none;visibility:hidden'
  probe.style.height = expression
  document.body.appendChild(probe)
  const px = probe.getBoundingClientRect().height
  probe.remove()
  return Number.isFinite(px) ? px : 0
}

function isStandaloneDisplayMode(): boolean {
  if (typeof window === 'undefined') return false
  if (window.matchMedia?.('(display-mode: standalone)').matches) return true
  // iOS Safari 的历史属性；主屏 Web App 里为 true
  return (navigator as Navigator & { standalone?: boolean }).standalone === true
}

/** 应用启动时调用一次（挂载 React 前）；转屏（resize）时自动复算。 */
export function installSafeAreaFallback() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return

  const apply = () => {
    const decision = decideSafeAreaFallback({
      isIphone: /iPhone|iPod/.test(navigator.userAgent),
      standalone: isStandaloneDisplayMode(),
      portrait: window.matchMedia?.('(orientation: portrait)').matches ?? true,
      // 量 env() 原始值而不是 --safe-top：后者可能已被本函数覆写
      envTopPx: measureCssLengthPx('env(safe-area-inset-top, 0px)'),
      envBottomPx: measureCssLengthPx('env(safe-area-inset-bottom, 0px)'),
    })

    const rootStyle = document.documentElement.style
    if (decision.top) rootStyle.setProperty('--safe-top', decision.top)
    else rootStyle.removeProperty('--safe-top')
    if (decision.bottom) rootStyle.setProperty('--safe-bottom', decision.bottom)
    else rootStyle.removeProperty('--safe-bottom')
  }

  apply()
  window.addEventListener('resize', apply)
}

/** 读 --safe-top 的生效像素值（含兜底覆写）。SSR/测试环境恒为 0。 */
export function readSafeAreaTopPx(): number {
  return measureCssLengthPx('var(--safe-top, 0px)')
}

/** 响应式读取顶部安全区高度；转屏/视口变化时更新。 */
export function useSafeAreaTop(): number {
  const [inset, setInset] = useState(() => readSafeAreaTopPx())

  useEffect(() => {
    const update = () => setInset(readSafeAreaTopPx())
    // installSafeAreaFallback 的 resize 回调先注册先执行，这里读到的已是覆写后的值
    window.addEventListener('resize', update)
    update()
    return () => window.removeEventListener('resize', update)
  }, [])

  return inset
}
