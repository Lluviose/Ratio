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

type HapticsStyle = 'light' | 'medium' | 'heavy'

// 仅类型导入，无运行时依赖（运行时经动态 import 加载）
import type { ImpactStyle, NotificationType } from '@capacitor/haptics'

type HapticsApi = typeof import('@capacitor/haptics')

// 枚举成员值：ImpactStyle.Heavy = 'HEAVY' 等。不静态 import 枚举（会把
// @capacitor/haptics 拉进首包），字符串字面量在调用处单点断言。
const IMPACT_STYLE = {
  light: 'LIGHT',
  medium: 'MEDIUM',
  heavy: 'HEAVY',
} as const satisfies Record<HapticsStyle, string>

const NOTIFICATION_SUCCESS = 'SUCCESS'

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

/** 原生容器内执行 Haptics 调用；非原生环境直接返回。 */
function nativeHaptics(run: (Haptics: HapticsApi['Haptics']) => void | Promise<void>) {
  if (!isNativePlatform()) return
  try {
    void import('@capacitor/haptics')
      .then(({ Haptics }) => run(Haptics))
      .catch(() => undefined)
  } catch {
    // 动态 import 同步抛错（理论不可达）也静默
  }
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
  nativeHaptics((H) => H.selectionStart())
}

/** 连续选择变化（tab 切换、列表项选中）。60ms 窗口节流。 */
export function hapticSelectionChanged() {
  throttled('selection:changed', 60, () => {
    nativeHaptics((H) => H.selectionChanged())
    if (!isNativePlatform()) webVibrate(4)
  })
}

/** 连续选择结束。 */
export function hapticSelectionEnd() {
  nativeHaptics((H) => H.selectionEnd())
}

/** 成功通知（保存完成、庆祝等）。400ms 窗口节流：连存只震一次。 */
export function hapticSuccess() {
  throttled('notification:success', 400, () => {
    nativeHaptics((H) => H.notification({ type: NOTIFICATION_SUCCESS as NotificationType }))
    if (!isNativePlatform()) webVibrate([6, 30, 10])
  })
}
