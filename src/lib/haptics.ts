// 触觉反馈统一入口。
//
// - Capacitor 原生容器（iOS app）：走 @capacitor/haptics 的原生 Haptics
//   （底层是 UIImpactFeedbackGenerator / UISelectionFeedbackGenerator /
//   UINotificationFeedbackGenerator），系统「触感反馈」开关自动生效。
// - Web 环境：回退 navigator.vibrate()（Android Chrome PWA 可用）；iOS Safari
//   没有震动 API，静默跳过。
// - 减弱动态偏好下 Web 回退也跳过（与项目动效三层规范一致；原生侧由系统自理）。
//
// 模块按需动态 import：@capacitor/haptics 不进任何静态依赖链（首包体积纪律见
// PROJECT.md「懒加载与分包」）。任何失败都被吞掉——触觉反馈绝不影响主功能。
// 组件测试（jsdom）无 window.Capacitor / navigator.vibrate，自然走空路径。
//
// Capacitor iOS 的 selectionChanged 在没先 selectionStart 时是空操作
// （生成器为 nil）。离散点击（Tab / 分段）必须先 start 再 changed，
// 并让生成器常驻，否则切 Tab 完全不震。

type HapticsStyle = 'light' | 'medium' | 'heavy'

import type { ImpactStyle, NotificationType } from '@capacitor/haptics'

type HapticsPluginApi = (typeof import('@capacitor/haptics'))['Haptics']

const IMPACT_STYLE = {
  light: 'LIGHT',
  medium: 'MEDIUM',
  heavy: 'HEAVY',
} as const satisfies Record<HapticsStyle, string>

const NOTIFICATION = {
  success: 'SUCCESS',
  warning: 'WARNING',
  error: 'ERROR',
} as const satisfies Record<'success' | 'warning' | 'error', string>

function isNativePlatform(): boolean {
  return (
    typeof window !== 'undefined' &&
    Boolean(
      (
        window as unknown as {
          Capacitor?: { isNativePlatform?: () => boolean }
        }
      ).Capacitor?.isNativePlatform?.(),
    )
  )
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
  )
}

let cachedPlugin: HapticsPluginApi | null = null
let loadPromise: Promise<PluginBox | null> | null = null
let selectionArmed = false

// Capacitor 的插件对象是个 Proxy：**任意**属性访问都返回方法包装器，`then` 也不例外
// ——于是它是个 thenable。把它直接从 .then 回调里 return（或塞进 Promise.resolve）会被
// Promise 当成 thenable 去 adopt：引擎调用 `Haptics.then(resolve, reject)`，原生侧没有
// 名为 then 的方法 → 抛 `"Haptics.then()" is not implemented on ios`，而这个包装器返回的
// 拒绝没人接（成了 unhandledrejection，被 telemetry 记成应用错误），外层 promise 则
// **永远不 settle** → 整条原生触觉链路彻底哑火。装箱后再穿过 Promise 即可绕开。
type PluginBox = { plugin: HapticsPluginApi }

function loadNativePlugin(): Promise<PluginBox | null> {
  if (!isNativePlatform()) return Promise.resolve(null)
  if (cachedPlugin) return Promise.resolve({ plugin: cachedPlugin })
  if (!loadPromise) {
    loadPromise = import('@capacitor/haptics')
      .then(({ Haptics }) => {
        cachedPlugin = Haptics
        return { plugin: Haptics }
      })
      .catch(() => {
        loadPromise = null
        return null
      })
  }
  return loadPromise
}

async function armSelection(H: HapticsPluginApi) {
  if (selectionArmed) return
  await H.selectionStart()
  selectionArmed = true
}

function disarmSelection() {
  if (!selectionArmed) return
  selectionArmed = false
  const H = cachedPlugin
  if (!H) return
  void H.selectionEnd().catch(() => undefined)
}

/** 原生容器内执行 Haptics 调用；非原生环境直接返回。 */
function nativeHaptics(run: (Haptics: HapticsPluginApi) => void | Promise<void>) {
  void loadNativePlugin()
    .then((box) => {
      if (!box) return
      return run(box.plugin)
    })
    .catch(() => undefined)
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') disarmSelection()
  })
}

// 触感节流：快速连点/连甩时合并同类型震动，避免震动风暴。
// key 按触感类型分桶；同类型在窗口内只放一次。
const lastFireAt = new Map<string, number>()

function throttled(key: string, windowMs: number, fire: () => void) {
  const now = performance.now()
  if (now - (lastFireAt.get(key) ?? 0) < windowMs) return
  lastFireAt.set(key, now)
  fire()
}

/** Web 回退：navigator.vibrate，减弱动态偏好或环境不支持时静默。 */
function webVibrate(pattern: number | number[]) {
  if (prefersReducedMotion()) return
  try {
    navigator.vibrate?.(pattern)
  } catch {
    // 部分 WebView 会抛 NotAllowedError
  }
}

/** 启动时预热插件并武装选择生成器，避免第一次点 Tab 空震 / 晚一拍。 */
export function preloadHaptics() {
  nativeHaptics((H) => armSelection(H))
}

/** 普通按压反馈。style 按交互强度选：轻按 light、拨动 medium、重击 heavy。
 *  50ms 窗口节流：连点/连甩只保留首拍，避免震动风暴。 */
export function hapticImpact(style: HapticsStyle = 'light') {
  throttled(`impact:${style}`, 50, () => {
    nativeHaptics((H) => H.impact({ style: IMPACT_STYLE[style] as ImpactStyle }))
    if (!isNativePlatform()) {
      webVibrate(style === 'heavy' ? 18 : style === 'medium' ? 12 : 6)
    }
  })
}

/** 连续选择开始（长按拖动等手势起点）。 */
export function hapticSelectionStart() {
  nativeHaptics((H) => armSelection(H))
}

/** 连续选择变化（tab 切换、列表项选中）。60ms 窗口节流。
 *  未 start 时先武装生成器，否则 iOS 上 selectionChanged 是空操作。 */
export function hapticSelectionChanged() {
  throttled('selection:changed', 60, () => {
    nativeHaptics(async (H) => {
      await armSelection(H)
      await H.selectionChanged()
    })
    if (!isNativePlatform()) webVibrate(4)
  })
}

/** 连续选择结束。 */
export function hapticSelectionEnd() {
  disarmSelection()
}

/** 成功通知（保存完成、庆祝等）。400ms 窗口节流：连存只震一次。 */
export function hapticSuccess() {
  throttled('notification:success', 400, () => {
    nativeHaptics((H) => H.notification({ type: NOTIFICATION.success as NotificationType }))
    if (!isNativePlatform()) webVibrate([6, 30, 10])
  })
}

/** 警告（危险确认等）。 */
export function hapticWarning() {
  throttled('notification:warning', 400, () => {
    nativeHaptics((H) => H.notification({ type: NOTIFICATION.warning as NotificationType }))
    if (!isNativePlatform()) webVibrate([10, 40, 10])
  })
}

/** 失败（操作未完成）。 */
export function hapticError() {
  throttled('notification:error', 400, () => {
    nativeHaptics((H) => H.notification({ type: NOTIFICATION.error as NotificationType }))
    if (!isNativePlatform()) webVibrate([16, 40, 16])
  })
}
