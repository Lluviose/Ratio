import { describe, expect, it } from 'vitest'
import { getGoalDeltaDisplay } from './goalDeltaDisplay'

describe('goalDeltaDisplay', () => {
  it('uses a neutral state when the target delta is missing or close to zero', () => {
    expect(getGoalDeltaDisplay(null)).toEqual({
      label: '目标偏差',
      value: '—',
      inline: null,
    })
    expect(getGoalDeltaDisplay(0)).toEqual({
      label: '贴合目标',
      value: '刚好',
      tone: 'var(--text)',
      inline: '贴合目标',
    })
    expect(getGoalDeltaDisplay(0.5).label).toBe('贴合目标')
    expect(getGoalDeltaDisplay(-1).label).toBe('贴合目标')
  })

  it('only marks meaningful positive or negative deltas as ahead or behind', () => {
    expect(getGoalDeltaDisplay(1200)).toEqual({
      label: '领先目标',
      value: '¥1,200',
      tone: '#10b981',
      inline: '领先 ¥1,200',
    })
    expect(getGoalDeltaDisplay(-800)).toEqual({
      label: '落后目标',
      value: '¥800',
      tone: '#ef4444',
      inline: '落后 ¥800',
    })
  })
})
