import { beforeEach, describe, expect, it } from 'vitest'
import { buildAiFinancialContext, readResponseContent } from './ai'

describe('buildAiFinancialContext', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('builds a derived financial summary from snapshots and local records', () => {
    localStorage.setItem('ratio.accounts', JSON.stringify([
      { id: 'cash', type: 'cash', name: '现金', balance: 20000, updatedAt: '2026-06-01T00:00:00.000Z' },
      { id: 'fund', type: 'fund', name: '基金', balance: 50000, updatedAt: '2026-06-01T00:00:00.000Z' },
      { id: 'loan', type: 'loan', name: '贷款', balance: 30000, updatedAt: '2026-06-01T00:00:00.000Z' },
    ]))
    localStorage.setItem('ratio.snapshots', JSON.stringify([
      { date: '2026-05-01', cash: 18000, invest: 42000, fixed: 0, receivable: 0, debt: 32000, net: 28000 },
      { date: '2026-06-01', cash: 20000, invest: 50000, fixed: 0, receivable: 0, debt: 30000, net: 40000 },
    ]))
    localStorage.setItem('ratio.accountOps', JSON.stringify([
      { id: 'op1', kind: 'adjust', at: '2026-06-01T00:00:00.000Z', accountType: 'cash', accountId: 'cash', delta: 1000, before: 19000, after: 20000 },
      { id: 'op2', kind: 'transfer', at: '2026-05-20T00:00:00.000Z', accountType: 'cash', fromId: 'cash', toId: 'fund', amount: 500, fromBefore: 20500, fromAfter: 20000, toBefore: 49500, toAfter: 50000 },
    ]))
    localStorage.setItem('ratio.ledger', JSON.stringify([
      { id: 'tx1', type: 'income', amount: 3000, category: '工资', account: '现金', date: '2026-06-01', note: '' },
      { id: 'tx2', type: 'expense', amount: 800, category: '餐饮', account: '现金', date: '2026-05-31', note: '' },
    ]))
    localStorage.setItem('ratio.savingsGoal', JSON.stringify({
      targetAmount: 100000,
      targetDate: '2026-12-31',
      startDate: '2026-05-01',
      startNetWorth: 28000,
      createdAt: '2026-05-01T00:00:00.000Z',
    }))

    const context = buildAiFinancialContext()

    expect(context.schema).toBe('ratio.ai.financial-context.v1')
    expect(context.summary.current.netWorth).toBe(40000)
    expect(context.summary.current.totalAssets).toBe(70000)
    expect(context.summary.current.debt).toBe(30000)
    expect(context.summary.allocation.find((item) => item.groupId === 'invest')?.percentOfAssets).toBeCloseTo(50000 / 70000)
    expect(context.summary.activity.recentAdjustNet).toBe(1000)
    expect(context.summary.activity.recentTransferAmount).toBe(500)
    expect(context.summary.activity.ledgerNet).toBe(2200)
    expect(context.summary.savingsGoal?.targetAmount).toBe(100000)
  })

  it('trims evidence sections while keeping omission counts explicit', () => {
    localStorage.setItem('ratio.accounts', JSON.stringify([
      { id: 'a', type: 'cash', name: 'a', balance: 1, updatedAt: '' },
      { id: 'b', type: 'fund', name: 'b', balance: 2, updatedAt: '' },
      { id: 'c', type: 'loan', name: 'c', balance: 3, updatedAt: '' },
    ]))
    localStorage.setItem('ratio.snapshots', JSON.stringify([
      { date: '2026-06-01', cash: 1, invest: 0, fixed: 0, receivable: 0, debt: 0 },
      { date: '2026-06-02', cash: 2, invest: 0, fixed: 0, receivable: 0, debt: 0 },
      { date: '2026-06-03', cash: 3, invest: 0, fixed: 0, receivable: 0, debt: 0 },
    ]))
    localStorage.setItem('ratio.accountOps', JSON.stringify([
      { id: 'op1', kind: 'adjust', at: '2026-06-03T00:00:00.000Z', accountType: 'cash', accountId: 'a', delta: 1, before: 0, after: 1 },
      { id: 'op2', kind: 'adjust', at: '2026-06-02T00:00:00.000Z', accountType: 'cash', accountId: 'a', delta: 1, before: 0, after: 1 },
      { id: 'op3', kind: 'adjust', at: '2026-06-01T00:00:00.000Z', accountType: 'cash', accountId: 'a', delta: 1, before: 0, after: 1 },
    ]))

    const context = buildAiFinancialContext(localStorage, { maxAccounts: 2, maxSnapshots: 2, maxRecentOps: 2 })
    const accounts = context.sections.find((section) => section.id === 'accounts.top')
    const snapshots = context.sections.find((section) => section.id === 'snapshots.recent')
    const ops = context.sections.find((section) => section.id === 'accountOps.recent')

    expect(accounts?.includedItems).toBe(2)
    expect(accounts?.omittedItems).toBe(1)
    expect(snapshots?.includedItems).toBe(2)
    expect(snapshots?.omittedItems).toBe(1)
    expect(ops?.includedItems).toBe(2)
    expect(ops?.omittedItems).toBe(1)
  })

  it('marks invalid stored JSON without sending raw parse errors as facts', () => {
    localStorage.setItem('ratio.accounts', '{bad json')

    const context = buildAiFinancialContext()

    expect(context.summary.counts.accounts).toBe(0)
    expect(context.summary.dataQuality.invalidStorageKeys).toContain('ratio.accounts')
  })
})

describe('readResponseContent', () => {
  it('reads OpenAI-compatible message content', () => {
    expect(readResponseContent({ choices: [{ message: { content: 'hello' } }] })).toBe('hello')
  })

  it('reads text and output_text fallbacks', () => {
    expect(readResponseContent({ choices: [{ text: 'choice text' }] })).toBe('choice text')
    expect(readResponseContent({ output_text: 'output text' })).toBe('output text')
  })

  it('returns undefined for empty or unsupported responses', () => {
    expect(readResponseContent({ choices: [] })).toBeUndefined()
    expect(readResponseContent(null)).toBeUndefined()
  })
})
