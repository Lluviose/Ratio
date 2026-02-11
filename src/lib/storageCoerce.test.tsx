import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { useAccountOps } from './useAccountOps'
import { useAccounts } from './useAccounts'
import { useLedger } from './useLedger'
import { useSnapshots } from './useSnapshots'

describe('localStorage coercion', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('useAccounts falls back on invalid stored values', () => {
    localStorage.setItem('ratio.accounts', JSON.stringify(123))

    function Reader() {
      const { accounts } = useAccounts()
      return <div data-testid="value">{accounts.length}</div>
    }

    render(<Reader />)
    expect(screen.getByTestId('value')).toHaveTextContent('0')
  })

  it('useSnapshots falls back on invalid stored values', () => {
    localStorage.setItem('ratio.snapshots', JSON.stringify(123))

    function Reader() {
      const { snapshots } = useSnapshots()
      return <div data-testid="value">{snapshots.length}</div>
    }

    render(<Reader />)
    expect(screen.getByTestId('value')).toHaveTextContent('0')
  })

  it('useAccountOps falls back on invalid stored values', () => {
    localStorage.setItem('ratio.accountOps', JSON.stringify(123))

    function Reader() {
      const { ops } = useAccountOps()
      return <div data-testid="value">{ops.length}</div>
    }

    render(<Reader />)
    expect(screen.getByTestId('value')).toHaveTextContent('0')
  })

  it('useLedger coerces stored transactions', () => {
    localStorage.setItem(
      'ratio.ledger',
      JSON.stringify([
        {
          id: 't1',
          type: 'expense',
          amount: 10,
          category: 'food',
          account: 'cash',
          date: '2025-01-01',
          note: '',
        },
      ]),
    )

    function Reader() {
      const { transactions } = useLedger()
      return (
        <div>
          <div data-testid="len">{transactions.length}</div>
          <div data-testid="amount">{transactions[0]?.amount ?? ''}</div>
        </div>
      )
    }

    render(<Reader />)
    expect(screen.getByTestId('len')).toHaveTextContent('1')
    expect(screen.getByTestId('amount')).toHaveTextContent('-10')
  })

  it('normalizes account balances to cents when loading old data', async () => {
    localStorage.setItem(
      'ratio.accounts',
      JSON.stringify([
        {
          id: 'a1',
          type: 'cash',
          name: 'Cash',
          balance: 0.30000000000000004,
          updatedAt: '2025-01-01T00:00:00.000Z',
        },
      ]),
    )

    function Reader() {
      const { accounts } = useAccounts()
      return <div data-testid="balance">{accounts[0]?.balance ?? ''}</div>
    }

    render(<Reader />)
    expect(screen.getByTestId('balance')).toHaveTextContent('0.3')

    await waitFor(() => {
      const stored = JSON.parse(localStorage.getItem('ratio.accounts') ?? '[]') as Array<{ balance: number }>
      expect(stored[0]?.balance).toBe(0.3)
    })
  })

  it('normalizes account ops amounts to cents when loading old data', () => {
    localStorage.setItem(
      'ratio.accountOps',
      JSON.stringify([
        {
          id: 'op1',
          kind: 'adjust',
          at: '2025-01-01T00:00:00.000Z',
          accountType: 'cash',
          accountId: 'a1',
          delta: 0.105,
          before: 1,
          after: 1.105,
        },
      ]),
    )

    function Reader() {
      const { ops } = useAccountOps()
      const op = ops[0]
      return (
        <div>
          <div data-testid="delta">{op?.kind === 'adjust' ? op.delta : ''}</div>
          <div data-testid="after">{op?.kind === 'adjust' ? op.after : ''}</div>
        </div>
      )
    }

    render(<Reader />)
    expect(screen.getByTestId('delta')).toHaveTextContent('0.11')
    expect(screen.getByTestId('after')).toHaveTextContent('1.11')
  })

  it('normalizes snapshots to cents when loading old data', () => {
    localStorage.setItem(
      'ratio.snapshots',
      JSON.stringify([
        {
          date: '2025-01-01',
          net: 1.005,
          debt: 0,
          cash: 1.005,
          invest: 0,
          fixed: 0,
          receivable: 0,
          accounts: [{ id: 'a1', type: 'cash', name: 'Cash', balance: 1.005 }],
        },
      ]),
    )

    function Reader() {
      const { snapshots } = useSnapshots()
      const snapshot = snapshots[0]
      const accountBalance = snapshot?.accounts?.[0]?.balance ?? ''
      return (
        <div>
          <div data-testid="cash">{snapshot?.cash ?? ''}</div>
          <div data-testid="account">{accountBalance}</div>
        </div>
      )
    }

    render(<Reader />)
    expect(screen.getByTestId('cash')).toHaveTextContent('1.01')
    expect(screen.getByTestId('account')).toHaveTextContent('1.01')
  })
})
