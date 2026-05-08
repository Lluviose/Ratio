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
      navigator.serviceWorker.addEventListener(
        'controllerchange',
        () => {
          trackTelemetry('pwa_controller_changed', { swUrl })
          reloadForUpdate('controllerchange')
        },
        { once: true },
      )
    }
  },
})
