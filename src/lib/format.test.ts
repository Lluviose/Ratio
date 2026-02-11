import { describe, expect, it } from 'vitest'
import { formatCny } from './format'

describe('formatCny', () => {
  it('shows integers by default', () => {
    expect(formatCny(1)).toBe('\u00A51')
    expect(formatCny(1.2)).toBe('\u00A51')
    expect(formatCny(1.8)).toBe('\u00A52')
    expect(formatCny(0.1 + 0.2)).toBe('\u00A50')
  })

  it('can keep cent precision when requested', () => {
    expect(formatCny(1, { keepCents: true })).toBe('\u00A51.00')
    expect(formatCny(1.2, { keepCents: true })).toBe('\u00A51.20')
    expect(formatCny(1.005, { keepCents: true })).toBe('\u00A51.01')
    expect(formatCny(0.1 + 0.2, { keepCents: true })).toBe('\u00A50.30')
  })

  it('handles negatives and invalid values safely', () => {
    expect(formatCny(-1.005)).toBe('\u00A5-1')
    expect(formatCny(-1.005, { keepCents: true })).toBe('\u00A5-1.01')
    expect(formatCny(Number.NaN)).toBe('\u00A50')
    expect(formatCny(Number.NaN, { keepCents: true })).toBe('\u00A50.00')
  })
})
