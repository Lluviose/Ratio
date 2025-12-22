import { describe, expect, it } from 'vitest'
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

