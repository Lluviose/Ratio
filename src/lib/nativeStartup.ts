import { loadTrendScreen, loadStatsScreen, loadSettingsScreen } from '../components/screenLoaders'
import { loadAiAssistant } from '../components/aiAssistantLoader'
import { loadMatter } from './matterLoader'
import { isNativeIos } from './nativePlatform'

/** Start local bundled modules immediately, alongside storage hydration, without
 * blocking the first render or waiting for idle/touch quiet windows. A failed
 * optional module must not prevent the remaining screens from warming up. */
export function preloadNativeModules(): Promise<unknown> {
  if (!isNativeIos()) return Promise.resolve()
  return Promise.allSettled([
    loadTrendScreen(), loadStatsScreen(), loadSettingsScreen(), loadAiAssistant(), loadMatter(),
  ])
}
