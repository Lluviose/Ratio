import { describe, expect, it } from 'vitest'
import { formatCny } from './format'

describe('formatCny', () => {
  it('keeps cent precision and normalizes floating-point artifacts', () => {
    expect(formatCny(1)).toBe('\u00A51.00')
    expect(formatCny(1.2)).toBe('\u00A51.20')
    expect(formatCny(1.005)).toBe('\u00A51.01')
    expect(formatCny(0.1 + 0.2)).toBe('\u00A50.30')
  })

  it('handles negatives and invalid values safely', () => {
    expect(formatCny(-1.005)).toBe('\u00A5-1.01')
    expect(formatCny(Number.NaN)).toBe('\u00A50.00')
  })
})
