import { beforeEach, describe, expect, it } from 'vitest'
import { buildAiFinancialContext } from './ai'

describe('buildAiFinancialContext', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('includes the saved savings goal in the financial context', () => {
    localStorage.setItem('ratio.accounts', '[]')
    localStorage.setItem('ratio.savingsGoal', JSON.stringify({ targetAmount: 200000, targetDate: '2026-12-31' }))

    const context = buildAiFinancialContext()

    expect(context.data.savingsGoal).toEqual({ targetAmount: 200000, targetDate: '2026-12-31' })
  })
})
