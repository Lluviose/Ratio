import { describe, expect, it } from 'vitest'
import type { Account } from './accounts'
import { buildGroupBreakdown, buildToneScale, distributeSegmentHeights, mixHexColors } from './ratioBreakdown'

function account(partial: Partial<Account> & Pick<Account, 'type' | 'balance'>): Account {
  return {
    id: partial.id ?? `${partial.type}-${partial.balance}`,
    name: partial.name ?? 'test',
    updatedAt: partial.updatedAt ?? '2026-01-01T00:00:00.000Z',
    ...partial,
  }
}

describe('mixHexColors', () => {
  it('returns base color at ratio 0 and target color at ratio 1', () => {
    expect(mixHexColors('#ff6b57', '#ffffff', 0)).toBe('#ff6b57')
    expect(mixHexColors('#ff6b57', '#ffffff', 1)).toBe('#ffffff')
  })

  it('interpolates channels linearly', () => {
    expect(mixHexColors('#000000', '#ffffff', 0.5)).toBe('#808080')
  })

  it('expands 3-digit hex colors', () => {
    expect(mixHexColors('#f00', '#fff', 0)).toBe('#ff0000')
  })

  it('clamps out-of-range ratios', () => {
    expect(mixHexColors('#336699', '#ffffff', -1)).toBe('#336699')
    expect(mixHexColors('#336699', '#ffffff', 2)).toBe('#ffffff')
  })

  it('returns the base string untouched for invalid colors', () => {
    expect(mixHexColors('var(--tone)', '#ffffff', 0.5)).toBe('var(--tone)')
    expect(mixHexColors('#336699', 'nope', 0.5)).toBe('#336699')
  })
})

describe('buildToneScale', () => {
  it('returns an empty scale for non-positive counts', () => {
    expect(buildToneScale('#ff6b57', 0)).toEqual([])
    expect(buildToneScale('#ff6b57', -2)).toEqual([])
  })

  it('produces the requested number of valid hex colors', () => {
    const scale = buildToneScale('#3949c7', 5)
    expect(scale).toHaveLength(5)
    for (const color of scale) expect(color).toMatch(/^#[0-9a-f]{6}$/)
  })

  it('produces distinct steps that all differ from the base tone', () => {
    const scale = buildToneScale('#3949c7', 4)
    expect(new Set(scale).size).toBe(4)
    for (const color of scale) expect(color).not.toBe('#3949c7')
  })

  it('lightens dark tones and deepens light tones', () => {
    const darkToneScale = buildToneScale('#3949c7', 2)
    // 深色基调向白色靠拢：每档的红色通道都应大于基色
    for (const color of darkToneScale) {
      expect(Number.parseInt(color.slice(1, 3), 16)).toBeGreaterThan(0x39)
    }

    const lightToneScale = buildToneScale('#d9d4f6', 2)
    // 浅色基调向墨色靠拢：每档的红色通道都应小于基色
    for (const color of lightToneScale) {
      expect(Number.parseInt(color.slice(1, 3), 16)).toBeLessThan(0xd9)
    }
  })
})

describe('distributeSegmentHeights', () => {
  it('returns an empty list for no segments', () => {
    expect(distributeSegmentHeights([], 300, 34)).toEqual([])
  })

  it('splits heights proportionally and sums to the available height', () => {
    const heights = distributeSegmentHeights([300, 100], 400, 34)
    expect(heights[0]).toBeCloseTo(300)
    expect(heights[1]).toBeCloseTo(100)
    expect(heights.reduce((s, h) => s + h, 0)).toBeCloseTo(400)
  })

  it('enforces the minimum height for tiny segments', () => {
    const heights = distributeSegmentHeights([990, 10], 400, 34)
    expect(heights[1]).toBeGreaterThanOrEqual(34)
    expect(heights.reduce((s, h) => s + h, 0)).toBeCloseTo(400)
  })

  it('falls back to equal heights when amounts are all zero', () => {
    const heights = distributeSegmentHeights([0, 0, 0], 300, 34)
    expect(heights).toEqual([100, 100, 100])
  })

  it('falls back to equal heights when space cannot fit all minimums', () => {
    const heights = distributeSegmentHeights([500, 300, 200], 90, 34)
    expect(heights).toEqual([30, 30, 30])
  })

  it('returns zero heights when nothing is available', () => {
    expect(distributeSegmentHeights([10, 20], 0, 34)).toEqual([0, 0])
  })
})

describe('buildGroupBreakdown', () => {
  it('groups accounts by type with totals, counts and integer percents', () => {
    const breakdown = buildGroupBreakdown([
      account({ type: 'fund', balance: 600 }),
      account({ type: 'stock', balance: 250 }),
      account({ type: 'fund', balance: 100 }),
      account({ type: 'crypto', balance: 50 }),
    ])

    expect(breakdown.map((i) => i.type)).toEqual(['fund', 'stock', 'crypto'])
    expect(breakdown[0]).toMatchObject({ name: '投资基金', amount: 700, count: 2, percent: 70 })
    expect(breakdown[1]).toMatchObject({ name: '股票', amount: 250, count: 1, percent: 25 })
    expect(breakdown[2]).toMatchObject({ name: '加密货币', amount: 50, count: 1, percent: 5 })
    expect(breakdown.reduce((s, i) => s + i.percent, 0)).toBe(100)
  })

  it('keeps zero-balance types visible with zero percent', () => {
    const breakdown = buildGroupBreakdown([
      account({ type: 'cash', balance: 0 }),
      account({ type: 'bank_card', balance: 100 }),
    ])

    expect(breakdown.map((i) => i.type)).toEqual(['bank_card', 'cash'])
    expect(breakdown[1]).toMatchObject({ amount: 0, count: 1, percent: 0 })
  })

  it('ignores negative balances instead of skewing percents', () => {
    const breakdown = buildGroupBreakdown([
      account({ type: 'cash', balance: -50 }),
      account({ type: 'bank_card', balance: 100 }),
    ])

    expect(breakdown[0]).toMatchObject({ type: 'bank_card', percent: 100 })
    expect(breakdown[1]).toMatchObject({ type: 'cash', amount: 0, percent: 0 })
  })

  it('returns an empty breakdown for no accounts', () => {
    expect(buildGroupBreakdown([])).toEqual([])
  })
})
