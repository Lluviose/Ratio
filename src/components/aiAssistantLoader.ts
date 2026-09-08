import { preloadableComponent } from '../lib/preloadableComponent'
import type { ComponentProps } from 'react'

// One import shared by on-demand rendering, web idle warmup and immediate iOS startup.
export const { Component: AiAssistant, preload: loadAiAssistant } = preloadableComponent<NonNullable<ComponentProps<typeof import('./AiAssistant').AiAssistant>>>(
  () => import('./AiAssistant').then((mod) => ({ default: mod.AiAssistant })),
)
