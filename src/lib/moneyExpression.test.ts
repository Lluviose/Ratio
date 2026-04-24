import { describe, expect, it } from 'vitest'
import {
  appendMoneyExpressionOperator,
  evaluateMoneyExpression,
  sanitizeMoneyExpressionInput,
} from './moneyExpression'

describe('moneyExpression', () => {
  it('evaluates a single money value', () => {
    expect(evaluateMoneyExpression('123.456')).toEqual({ ok: true, value: 123.46, hasOperator: false })
  })

  it('evaluates addition and subtraction with money rounding', () => {
    expect(evaluateMoneyExpression('0.1+0.2-0.03')).toEqual({ ok: true, value: 0.27, hasOperator: true })
    expect(evaluateMoneyExpression('100+20.5-1.005')).toEqual({ ok: true, value: 119.49, hasOperator: true })
  })

  it('marks empty and trailing-operator expressions as not ready', () => {
    expect(evaluateMoneyExpression('')).toEqual({ ok: false, reason: 'empty', hasOperator: false })
    expect(evaluateMoneyExpression('100+')).toEqual({ ok: false, reason: 'incomplete', hasOperator: true })
  })

  it('rejects malformed expressions', () => {
    expect(evaluateMoneyExpression('100..1')).toEqual({ ok: false, reason: 'invalid', hasOperator: false })
    expect(evaluateMoneyExpression('100+-20')).toEqual({ ok: false, reason: 'invalid', hasOperator: true })
  })

  it('sanitizes pasted money text', () => {
    expect(sanitizeMoneyExpressionInput('¥1,000.20 ＋ 5－3元')).toBe('1000.20+5-3')
  })

  it('appends operators and replaces trailing operators', () => {
    expect(appendMoneyExpressionOperator('100', '+')).toBe('100+')
    expect(appendMoneyExpressionOperator('100+', '-')).toBe('100-')
    expect(appendMoneyExpressionOperator('100.00', '+')).toBe('100.00+')
    expect(appendMoneyExpressionOperator('', '+')).toBe('')
  })
})
