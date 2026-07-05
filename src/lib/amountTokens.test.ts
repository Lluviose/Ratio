import { describe, expect, it } from 'vitest'
import { splitAmountTokens } from '../lib/amountTokens'

describe('splitAmountTokens', () => {
  it('splits digits and symbols with right-anchored keys', () => {
    const tokens = splitAmountTokens('¥1,234')
    expect(tokens.map((t) => t.kind)).toEqual(['symbol', 'digit', 'symbol', 'digit', 'digit', 'digit'])
    expect(tokens.filter((t) => t.kind === 'digit').map((t) => (t.kind === 'digit' ? t.digit : -1))).toEqual([1, 2, 3, 4])
    // 尾数字 key 为 d0，从右往左递增
    expect(tokens[tokens.length - 1].key).toBe('d0')
    expect(tokens[1].key).toBe('d4')
  })

  it('keeps tail digit and separator identity when the amount grows a digit', () => {
    const before = splitAmountTokens('¥9,999')
    const after = splitAmountTokens('¥10,000')
    const beforeKeys = new Set(before.map((t) => t.key))
    // 千分位逗号（fromRight=3）与尾部三位数字的 key 稳定
    expect(beforeKeys.has('s3-,')).toBe(true)
    expect(after.some((t) => t.key === 's3-,')).toBe(true)
    for (const k of ['d0', 'd1', 'd2', 'd4']) {
      expect(beforeKeys.has(k)).toBe(true)
      expect(after.some((t) => t.key === k)).toBe(true)
    }
    // 新高位是新 key
    expect(after.some((t) => t.key === 'd5')).toBe(true)
    expect(beforeKeys.has('d5')).toBe(false)
  })

  it('handles cents and negative amounts', () => {
    const tokens = splitAmountTokens('-¥1,234.56')
    expect(tokens[0]).toEqual({ key: 's9--', kind: 'symbol', char: '-' })
    expect(tokens.filter((t) => t.kind === 'digit')).toHaveLength(6)
    expect(tokens.some((t) => t.kind === 'symbol' && t.char === '.')).toBe(true)
  })
})
