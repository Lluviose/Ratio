/** Read the bridge injected by Capacitor without pulling its SDK into the entry. */
export function isNativeIos(): boolean {
  if (typeof window === 'undefined') return false
  const bridge = (window as unknown as {
    Capacitor?: { isNativePlatform?: () => boolean; getPlatform?: () => string }
  }).Capacitor
  return bridge?.isNativePlatform?.() === true && bridge.getPlatform?.() === 'ios'
}
