import { describe, expect, it } from 'vitest'
import { addMoney, moneyEquals, normalizeMoney, subtractMoney } from './money'

describe('money', () => {
  it('normalizes floating-point artifacts to cents', () => {
    expect(normalizeMoney(0.1 + 0.2)).toBe(0.3)
    expect(normalizeMoney(1.005)).toBe(1.01)
    expect(normalizeMoney(-1.005)).toBe(-1.01)
  })

  it('adds and subtracts using cent precision', () => {
    expect(addMoney(0.1, 0.2)).toBe(0.3)
    expect(subtractMoney(1, 0.33)).toBe(0.67)
  })

  it('compares values by cent precision', () => {
    expect(moneyEquals(0.30000000000000004, 0.3)).toBe(true)
    expect(moneyEquals(0.31, 0.3)).toBe(false)
  })
})
