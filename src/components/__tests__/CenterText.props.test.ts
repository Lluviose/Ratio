import { describe, test } from 'vitest'
import * as fc from 'fast-check'
import { getCenterTextContent } from '../CenterText'

/**
 * **Feature: double-rose-chart, Property 2: Center text reflects selection state**
 * **Validates: Requirements 1.4**
 * 
 * For any selected Asset_Group, the center text SHALL contain:
 * - The group's name string
 * - The group's total amount formatted as currency
 */
describe('Property 2: Center text reflects selection state', () => {
  // Arbitrary for group selection
  const groupArb = fc.record({
    name: fc.string({ minLength: 1, maxLength: 20 }),
    amount: fc.integer({ min: 0, max: 10000000 })
  })

  test('when group is selected (no account), center text shows group name and amount', () => {
    fc.assert(
      fc.property(
        groupArb,
        fc.integer({ min: 0, max: 10000000 }), // netWorth
        (selectedGroup, netWorth) => {
          const result = getCenterTextContent(selectedGroup, null, netWorth)
          
          // Should show group name and amount
          return result.label === selectedGroup.name && result.amount === selectedGroup.amount
        }
      ),
      { numRuns: 100 }
    )
  })

  test('when nothing is selected, center text shows "净资产" and net worth', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -10000000, max: 10000000 }), // netWorth can be negative
        (netWorth) => {
          const result = getCenterTextContent(null, null, netWorth)
          
          // Should show "净资产" and net worth
          return result.label === '净资产' && result.amount === netWorth
        }
      ),
      { numRuns: 100 }
    )
  })

  test('center text content is deterministic for same inputs', () => {
    fc.assert(
      fc.property(
        fc.option(groupArb, { nil: undefined }),
        fc.integer({ min: 0, max: 10000000 }),
        (selectedGroup, netWorth) => {
          const group = selectedGroup ?? null
          const result1 = getCenterTextContent(group, null, netWorth)
          const result2 = getCenterTextContent(group, null, netWorth)
          
          return result1.label === result2.label && result1.amount === result2.amount
        }
      ),
      { numRuns: 100 }
    )
  })
})

/**
 * **Feature: double-rose-chart, Property 10: Account selection updates center text**
 * **Validates: Requirements 5.2**
 * 
 * For any selected Account, the center text SHALL contain:
 * - The account's name string
 * - The account's balance formatted as currency
 */
describe('Property 10: Account selection updates center text', () => {
  // Arbitrary for account selection
  const accountArb = fc.record({
    name: fc.string({ minLength: 1, maxLength: 30 }),
    balance: fc.integer({ min: 0, max: 10000000 })
  })

  // Arbitrary for group selection
  const groupArb = fc.record({
    name: fc.string({ minLength: 1, maxLength: 20 }),
    amount: fc.integer({ min: 0, max: 10000000 })
  })

  test('when account is selected, center text shows account name and balance', () => {
    fc.assert(
      fc.property(
        accountArb,
        fc.integer({ min: 0, max: 10000000 }), // netWorth
        (selectedAccount, netWorth) => {
          const result = getCenterTextContent(null, selectedAccount, netWorth)
          
          // Should show account name and balance
          return result.label === selectedAccount.name && result.amount === selectedAccount.balance
        }
      ),
      { numRuns: 100 }
    )
  })

  test('account selection takes priority over group selection', () => {
    fc.assert(
      fc.property(
        groupArb,
        accountArb,
        fc.integer({ min: 0, max: 10000000 }),
        (selectedGroup, selectedAccount, netWorth) => {
          const result = getCenterTextContent(selectedGroup, selectedAccount, netWorth)
          
          // Account should take priority - show account name and balance, not group
          return result.label === selectedAccount.name && result.amount === selectedAccount.balance
        }
      ),
      { numRuns: 100 }
    )
  })

  test('account selection takes priority over net worth display', () => {
    fc.assert(
      fc.property(
        accountArb,
        fc.integer({ min: 0, max: 10000000 }),
        (selectedAccount, netWorth) => {
          const result = getCenterTextContent(null, selectedAccount, netWorth)
          
          // Should NOT show "净资产" when account is selected
          return result.label !== '净资产' && result.label === selectedAccount.name
        }
      ),
      { numRuns: 100 }
    )
  })

  test('center text content is deterministic for account selection', () => {
    fc.assert(
      fc.property(
        fc.option(groupArb, { nil: undefined }),
        accountArb,
        fc.integer({ min: 0, max: 10000000 }),
        (selectedGroup, selectedAccount, netWorth) => {
          const group = selectedGroup ?? null
          const result1 = getCenterTextContent(group, selectedAccount, netWorth)
          const result2 = getCenterTextContent(group, selectedAccount, netWorth)
          
          return result1.label === result2.label && result1.amount === result2.amount
        }
      ),
      { numRuns: 100 }
    )
  })
})

/**
 * Combined selection state priority tests
 * Validates the complete selection priority: account > group > default
 */
describe('Selection state priority', () => {
  const accountArb = fc.record({
    name: fc.string({ minLength: 1, maxLength: 30 }),
    balance: fc.integer({ min: 0, max: 10000000 })
  })

  const groupArb = fc.record({
    name: fc.string({ minLength: 1, maxLength: 20 }),
    amount: fc.integer({ min: 0, max: 10000000 })
  })

  test('priority order: account > group > default (净资产)', () => {
    fc.assert(
      fc.property(
        groupArb,
        accountArb,
        fc.integer({ min: 0, max: 10000000 }),
        (group, account, netWorth) => {
          // Test all three states
          const withAccount = getCenterTextContent(group, account, netWorth)
          const withGroupOnly = getCenterTextContent(group, null, netWorth)
          const withNothing = getCenterTextContent(null, null, netWorth)
          
          // Account takes priority
          const accountPriority = withAccount.label === account.name && withAccount.amount === account.balance
          
          // Group takes priority when no account
          const groupPriority = withGroupOnly.label === group.name && withGroupOnly.amount === group.amount
          
          // Default shows net worth when nothing selected
          const defaultState = withNothing.label === '净资产' && withNothing.amount === netWorth
          
          return accountPriority && groupPriority && defaultState
        }
      ),
      { numRuns: 100 }
    )
  })
})
