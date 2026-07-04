import { registerSW } from 'virtual:pwa-register'
import { trackTelemetry } from './lib/telemetry'

let reloadingForUpdate = false

function reloadForUpdate(reason: string) {
  if (reloadingForUpdate || typeof window === 'undefined') return
  reloadingForUpdate = true
  trackTelemetry('pwa_update_reloading', { reason })
  window.location.reload()
}

registerSW({
  immediate: true,
  onNeedRefresh() {
    trackTelemetry('pwa_update_ready')
    reloadForUpdate('need_refresh')
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

    if (registration) {
      window.setInterval(() => {
        void registration.update().catch(() => undefined)
      }, 60_000)
    }

    if ('serviceWorker' in navigator) {
      const armReloadOnControllerChange = () => {
        navigator.serviceWorker.addEventListener(
          'controllerchange',
          () => {
            trackTelemetry('pwa_controller_changed', { swUrl })
            reloadForUpdate('controllerchange')
          },
          { once: true },
        )
      }

      if (navigator.serviceWorker.controller) {
        // 页面加载时已受控：之后的 controllerchange 一定是新版本替换，需要刷新
        armReloadOnControllerChange()
      } else {
        // 首次安装：clientsClaim 接管未受控页面也会触发一次 controllerchange，
        // 此时页面本身就是最新版本，整页刷新只会打断用户首次使用（含 e2e 与
        // iOS PWA 首开）。静默消费这一次，之后再武装真正的更新重载。
        navigator.serviceWorker.addEventListener(
          'controllerchange',
          () => {
            trackTelemetry('pwa_first_controller', { swUrl })
            armReloadOnControllerChange()
          },
          { once: true },
        )
      }
    }
  },
})
