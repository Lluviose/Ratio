import { registerSW } from 'virtual:pwa-register'
import { emitAppToast, queueToastAfterReload } from './lib/overlay'
import { trackTelemetry } from './lib/telemetry'

// 更新策略（prompt 模式）：新版本 SW 安装完成后进入 waiting，旧 SW 继续服务
// 完整的旧版产物——绝不在用户操作中途整页强刷。用户点 toast 里的「立即更新」
// 才发送 SKIP_WAITING，新 SW 接管（controlling 事件）后由 registerSW 自动刷新；
// 用户忽略 toast 的话，下次冷启动自然切到新版本。
// 首次安装（无旧 SW）走 onOfflineReady，全程不会触发刷新——这也让旧方案里
// 「首装 controllerchange 误刷新」一类缺陷从结构上消失。

// 更新检查改为回到前台时触发：PWA 大多数时间在后台，固定 60s 轮询常年空转
// 耗电耗流量；前台切换正是「可能装了新版本」的时刻。长驻前台的会话由慢速
// 兜底定时器覆盖。
const UPDATE_CHECK_MIN_INTERVAL_MS = 5 * 60_000
const UPDATE_CHECK_FALLBACK_INTERVAL_MS = 30 * 60_000
const UPDATE_TOAST_REMIND_INTERVAL_MS = 5 * 60_000

let updateReady = false
let applyingUpdate = false
let lastUpdateToastAt = 0

function showUpdateToast() {
  const now = Date.now()
  if (now - lastUpdateToastAt < UPDATE_TOAST_REMIND_INTERVAL_MS) return
  lastUpdateToastAt = now

  emitAppToast('新版本已就绪', {
    tone: 'neutral',
    durationMs: 10_000,
    action: {
      label: '立即更新',
      onClick: () => {
        if (applyingUpdate) return
        applyingUpdate = true
        trackTelemetry('pwa_update_accepted')
        queueToastAfterReload('已更新到最新版本', { tone: 'success' })
        void updateServiceWorker(true)
      },
    },
  })
}

const updateServiceWorker = registerSW({
  immediate: true,
  onNeedRefresh() {
    updateReady = true
    trackTelemetry('pwa_update_ready')
    showUpdateToast()
  },
  onOfflineReady() {
    trackTelemetry('pwa_offline_ready')
  },
  onRegisterError(error) {
    trackTelemetry('pwa_register_error', {
      message: error instanceof Error ? error.message : String(error),
    })
  },
  onRegisteredSW(swUrl, registration) {
    trackTelemetry('pwa_registered', {
      swUrl,
      hasRegistration: Boolean(registration),
      hasController: Boolean(navigator.serviceWorker?.controller),
    })

    if (!registration || typeof window === 'undefined') return

    let lastCheckAt = Date.now()
    const checkForUpdate = () => {
      if (document.visibilityState !== 'visible') return

      // 已有待应用的更新：不再发网络请求，只按节流重新浮出提示
      if (updateReady) {
        showUpdateToast()
        return
      }

      const now = Date.now()
      if (now - lastCheckAt < UPDATE_CHECK_MIN_INTERVAL_MS) return
      lastCheckAt = now
      void registration.update().catch(() => undefined)
    }

    window.addEventListener('focus', checkForUpdate)
    document.addEventListener('visibilitychange', checkForUpdate)
    window.setInterval(checkForUpdate, UPDATE_CHECK_FALLBACK_INTERVAL_MS)
  },
})
