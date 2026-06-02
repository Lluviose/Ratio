import { describe, expect, it } from 'vitest'
import { getGoalDeltaDisplay } from './goalDeltaDisplay'

describe('goalDeltaDisplay', () => {
  it('uses a neutral progress state only when the target delta is missing or effectively zero', () => {
    expect(getGoalDeltaDisplay(null)).toEqual({
      label: '目标偏差',
      value: '—',
      inline: null,
    })
    expect(getGoalDeltaDisplay(0)).toEqual({
      label: '贴合进度',
      value: '按计划',
      tone: 'var(--text)',
      inline: '贴合进度',
    })
    expect(getGoalDeltaDisplay(0.004).label).toBe('贴合进度')
    expect(getGoalDeltaDisplay(-0.01)).toEqual({
      label: '落后进度',
      value: '¥0.01',
      tone: '#ef4444',
      inline: '落后进度 ¥0.01',
    })
  })

  it('only marks meaningful positive or negative deltas as ahead or behind', () => {
    expect(getGoalDeltaDisplay(1200)).toEqual({
      label: '领先进度',
      value: '¥1,200',
      tone: '#10b981',
      inline: '领先进度 ¥1,200',
    })
    expect(getGoalDeltaDisplay(-800)).toEqual({
      label: '落后进度',
      value: '¥800',
      tone: '#ef4444',
      inline: '落后进度 ¥800',
    })
  })
})
