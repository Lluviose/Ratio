import { formatCny } from './format'
import { normalizeMoney } from './money'

const GOAL_DELTA_TOLERANCE = 0.005

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
      label: '贴合进度',
      value: '按计划',
      tone: 'var(--text)',
      inline: '贴合进度',
    }
  }

  if (normalized > 0) {
    const value = formatGoalDeltaAmount(normalized)
    return {
      label: '领先进度',
      value,
      tone: '#10b981',
      inline: `领先进度 ${value}`,
    }
  }

  const value = formatGoalDeltaAmount(normalized)
  return {
    label: '落后进度',
    value,
    tone: '#ef4444',
    inline: `落后进度 ${value}`,
  }
}

function formatGoalDeltaAmount(value: number) {
  const abs = Math.abs(normalizeMoney(value))
  return formatCny(abs, { keepCents: abs < 1 })
}
