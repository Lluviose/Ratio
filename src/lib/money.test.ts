import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
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

// 性质测试：金额运算在“分”整数域内必须精确（限定在安全整数范围内的金额）
describe('money properties', () => {
  const amountArb = fc.double({ min: -1e9, max: 1e9, noNaN: true, noDefaultInfinity: true })

  it('normalizeMoney is idempotent and lands on whole cents', () => {
    fc.assert(
      fc.property(amountArb, (a) => {
        const once = normalizeMoney(a)
        expect(normalizeMoney(once)).toBe(once)
        expect(Math.abs(Math.round(once * 100) - once * 100)).toBeLessThan(1e-6)
      }),
    )
  })

  it('addMoney is commutative and associative at cent precision', () => {
    fc.assert(
      fc.property(amountArb, amountArb, amountArb, (a, b, c) => {
        expect(addMoney(a, b)).toBe(addMoney(b, a))
        expect(moneyEquals(addMoney(addMoney(a, b), c), addMoney(a, addMoney(b, c)))).toBe(true)
      }),
    )
  })

  it('subtractMoney inverts addMoney exactly', () => {
    fc.assert(
      fc.property(amountArb, amountArb, (a, b) => {
        expect(moneyEquals(subtractMoney(addMoney(a, b), b), a)).toBe(true)
      }),
    )
  })

  it('treats non-finite operands as zero', () => {
    fc.assert(
      fc.property(amountArb, (a) => {
        expect(addMoney(Number.NaN, a)).toBe(normalizeMoney(a))
        expect(addMoney(Number.POSITIVE_INFINITY, a)).toBe(normalizeMoney(a))
        expect(normalizeMoney(Number.NaN)).toBe(0)
      }),
    )
  })
})
