import { render, screen } from '@testing-library/react'
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
})

