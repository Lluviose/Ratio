import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { allocateIntegerPercents } from './percent'

describe('allocateIntegerPercents', () => {
  it('returns zeros for empty/zero totals', () => {
    expect(allocateIntegerPercents([] as Array<{ id: 'a'; amount: number }>)).toEqual({})
    expect(allocateIntegerPercents([{ id: 'a', amount: 0 }])).toEqual({ a: 0 })
    expect(allocateIntegerPercents([{ id: 'a', amount: -1 }])).toEqual({ a: 0 })
  })

  it('sums to 100 for positive totals', () => {
    const res = allocateIntegerPercents([
      { id: 'liquid', amount: 100 },
      { id: 'invest', amount: 50 },
      { id: 'fixed', amount: 50 },
      { id: 'receivable', amount: 0 },
    ] as const)
    expect(Object.values(res).reduce((s, v) => s + v, 0)).toBe(100)
    expect(res.receivable).toBe(0)
  })

  it('never returns 0% for non-zero amounts (when possible)', () => {
    const res = allocateIntegerPercents([
      { id: 'liquid', amount: 10000 },
      { id: 'invest', amount: 1 },
    ] as const)
    expect(res.invest).toBeGreaterThanOrEqual(1)
    expect(Object.values(res).reduce((s, v) => s + v, 0)).toBe(100)
  })

  it('keeps all non-zero categories at least 1%', () => {
    const res = allocateIntegerPercents([
      { id: 'liquid', amount: 9999 },
      { id: 'invest', amount: 1 },
      { id: 'fixed', amount: 1 },
      { id: 'receivable', amount: 1 },
    ] as const)
    expect(res.invest).toBeGreaterThanOrEqual(1)
    expect(res.fixed).toBeGreaterThanOrEqual(1)
    expect(res.receivable).toBeGreaterThanOrEqual(1)
    expect(Object.values(res).reduce((s, v) => s + v, 0)).toBe(100)
  })

  it('splits evenly when amounts equal', () => {
    const res = allocateIntegerPercents([
      { id: 'a', amount: 1 },
      { id: 'b', amount: 1 },
      { id: 'c', amount: 1 },
      { id: 'd', amount: 1 },
    ] as const)
    expect(res).toEqual({ a: 25, b: 25, c: 25, d: 25 })
  })
})

// 性质测试：无论输入如何组合，整数百分比分配的核心不变量都必须成立
describe('allocateIntegerPercents properties', () => {
  const itemsArb = fc
    .array(fc.integer({ min: 0, max: 1_000_000_000 }), { minLength: 1, maxLength: 20 })
    .map((amounts) => amounts.map((amount, i) => ({ id: `k${i}`, amount })))

  it('sums to exactly 100 whenever the total is positive (≤100 positive items)', () => {
    fc.assert(
      fc.property(itemsArb, (items) => {
        const total = items.reduce((s, i) => s + i.amount, 0)
        fc.pre(total > 0)
        const res = allocateIntegerPercents(items)
        const sum = Object.values(res).reduce((s, v) => s + v, 0)
        expect(sum).toBe(100)
      }),
    )
  })

  it('gives every positive amount at least 1% and every zero amount exactly 0%', () => {
    fc.assert(
      fc.property(itemsArb, (items) => {
        const total = items.reduce((s, i) => s + i.amount, 0)
        fc.pre(total > 0)
        const res = allocateIntegerPercents(items)
        for (const item of items) {
          if (item.amount > 0) expect(res[item.id]).toBeGreaterThanOrEqual(1)
          else expect(res[item.id]).toBe(0)
        }
      }),
    )
  })

  it('stays within [0, 100] and never throws on adversarial numbers', () => {
    const adversarialArb = fc
      .array(
        fc.oneof(
          fc.double({ noNaN: false, noDefaultInfinity: false }),
          fc.constant(Number.NaN),
          fc.constant(Number.POSITIVE_INFINITY),
          fc.constant(-1),
        ),
        { minLength: 0, maxLength: 12 },
      )
      .map((amounts) => amounts.map((amount, i) => ({ id: `k${i}`, amount })))

    fc.assert(
      fc.property(adversarialArb, (items) => {
        const res = allocateIntegerPercents(items)
        for (const value of Object.values(res)) {
          expect(Number.isInteger(value)).toBe(true)
          expect(value).toBeGreaterThanOrEqual(0)
          expect(value).toBeLessThanOrEqual(100)
        }
      }),
    )
  })
})

