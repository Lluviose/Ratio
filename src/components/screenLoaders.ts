import { preloadableComponent } from '../lib/preloadableComponent'
import type { ComponentProps } from 'react'

export const { Component: TrendScreen, preload: loadTrendScreen } = preloadableComponent<ComponentProps<typeof import('../screens/TrendScreen').TrendScreen>>(
  () => import('../screens/TrendScreen').then((mod) => ({ default: mod.TrendScreen })),
)
export const { Component: StatsScreen, preload: loadStatsScreen } = preloadableComponent<ComponentProps<typeof import('../screens/StatsScreen').StatsScreen>>(
  () => import('../screens/StatsScreen').then((mod) => ({ default: mod.StatsScreen })),
)
export const { Component: SettingsScreen, preload: loadSettingsScreen } = preloadableComponent<ComponentProps<typeof import('../screens/SettingsScreen').SettingsScreen>>(
  () => import('../screens/SettingsScreen').then((mod) => ({ default: mod.SettingsScreen })),
)
