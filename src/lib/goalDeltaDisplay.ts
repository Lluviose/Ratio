import { formatCny } from './format'
import { normalizeMoney } from './money'

export const GOAL_DELTA_TOLERANCE = 1

export type GoalDeltaDisplay = {
  label: string
  value: string
  tone?: string
  inline: string | null
}

export function getGoalDeltaDisplay(delta: number | null | undefined): GoalDeltaDisplay {
  if (typeof delta !== 'number' || !Number.isFinite(delta)) {
    return {
      label: '目标偏差',
      value: '—',
      inline: null,
    }
  }

  const normalized = normalizeMoney(delta)
  if (Math.abs(normalized) <= GOAL_DELTA_TOLERANCE) {
    return {
      label: '贴合目标',
      value: '刚好',
      tone: 'var(--text)',
      inline: '贴合目标',
    }
  }

  if (normalized > 0) {
    const value = formatCny(normalized)
    return {
      label: '领先目标',
      value,
      tone: '#10b981',
      inline: `领先 ${value}`,
    }
  }

  const value = formatCny(Math.abs(normalized))
  return {
    label: '落后目标',
    value,
    tone: '#ef4444',
    inline: `落后 ${value}`,
  }
}
