import { fireEvent, render, screen, waitFor } from '@testing-library/react'
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

  it('normalizes ledger amounts to cents when loading old data', () => {
    localStorage.setItem(
      'ratio.ledger',
      JSON.stringify([
        {
          id: 't1',
          type: 'expense',
          amount: 0.30000000000000004,
          category: 'food',
          account: 'cash',
          date: '2025-01-01',
          note: '',
        },
      ]),
    )

    function Reader() {
      const { transactions } = useLedger()
      return <div data-testid="amount">{transactions[0]?.amount ?? ''}</div>
    }

    render(<Reader />)
    expect(screen.getByTestId('amount')).toHaveTextContent('-0.3')
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

  it('migrates legacy negative account balances to the non-negative model', async () => {
    localStorage.setItem(
      'ratio.accounts',
      JSON.stringify([
        {
          id: 'cash1',
          type: 'cash',
          name: 'Cash',
          balance: -12.34,
          updatedAt: '2025-01-01T00:00:00.000Z',
        },
        {
          id: 'debt1',
          type: 'credit_card',
          name: 'Credit Card',
          balance: -56.78,
          updatedAt: '2025-01-01T00:00:00.000Z',
        },
      ]),
    )

    function Reader() {
      const { accounts } = useAccounts()
      return (
        <div>
          <div data-testid="cash">{accounts.find((a) => a.id === 'cash1')?.balance ?? ''}</div>
          <div data-testid="debt">{accounts.find((a) => a.id === 'debt1')?.balance ?? ''}</div>
        </div>
      )
    }

    render(<Reader />)

    expect(screen.getByTestId('cash')).toHaveTextContent('0')
    expect(screen.getByTestId('debt')).toHaveTextContent('56.78')

    await waitFor(() => {
      const stored = JSON.parse(localStorage.getItem('ratio.accounts') ?? '[]') as Array<{ id: string; balance: number }>
      expect(stored.find((a) => a.id === 'cash1')?.balance).toBe(0)
      expect(stored.find((a) => a.id === 'debt1')?.balance).toBe(56.78)
    })
  })

  it('prevents account operations from producing negative balances', async () => {
    localStorage.setItem(
      'ratio.accounts',
      JSON.stringify([
        {
          id: 'cash1',
          type: 'cash',
          name: 'Cash',
          balance: 50,
          updatedAt: '2025-01-01T00:00:00.000Z',
        },
        {
          id: 'cash2',
          type: 'bank_card',
          name: 'Bank',
          balance: 200,
          updatedAt: '2025-01-01T00:00:00.000Z',
        },
        {
          id: 'debt1',
          type: 'credit_card',
          name: 'Credit Card',
          balance: 100,
          updatedAt: '2025-01-01T00:00:00.000Z',
        },
      ]),
    )

    function Harness() {
      const { accounts, updateBalance, adjustBalance, transfer } = useAccounts()
      const cash = accounts.find((a) => a.id === 'cash1')?.balance ?? ''
      const bank = accounts.find((a) => a.id === 'cash2')?.balance ?? ''
      const debt = accounts.find((a) => a.id === 'debt1')?.balance ?? ''

      return (
        <div>
          <div data-testid="balances">{JSON.stringify({ cash, bank, debt })}</div>
          <button type="button" onClick={() => updateBalance('cash1', -1)}>
            negative set
          </button>
          <button type="button" onClick={() => adjustBalance('cash1', -60)}>
            negative adjust
          </button>
          <button type="button" onClick={() => transfer('cash1', 'cash2', 60)}>
            overdraft asset transfer
          </button>
          <button type="button" onClick={() => transfer('cash2', 'debt1', 150)}>
            overpay debt transfer
          </button>
        </div>
      )
    }

    render(<Harness />)

    const readBalances = () => JSON.parse(screen.getByTestId('balances').textContent ?? '{}') as Record<string, number>
    expect(readBalances()).toEqual({ cash: 50, bank: 200, debt: 100 })

    fireEvent.click(screen.getByRole('button', { name: 'negative set' }))
    await waitFor(() => expect(readBalances()).toEqual({ cash: 50, bank: 200, debt: 100 }))

    fireEvent.click(screen.getByRole('button', { name: 'negative adjust' }))
    await waitFor(() => expect(readBalances()).toEqual({ cash: 50, bank: 200, debt: 100 }))

    fireEvent.click(screen.getByRole('button', { name: 'overdraft asset transfer' }))
    await waitFor(() => expect(readBalances()).toEqual({ cash: 50, bank: 200, debt: 100 }))

    fireEvent.click(screen.getByRole('button', { name: 'overpay debt transfer' }))
    await waitFor(() => expect(readBalances()).toEqual({ cash: 50, bank: 200, debt: 100 }))
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

  it('keeps loading legacy account ops without note fields', async () => {
    localStorage.setItem(
      'ratio.accountOps',
      JSON.stringify([
        {
          id: 'op1',
          kind: 'set_balance',
          at: '2025-01-01T00:00:00.000Z',
          accountType: 'cash',
          accountId: 'a1',
          before: 10,
          after: 12,
        },
      ]),
    )

    function Reader() {
      const { ops } = useAccountOps()
      const op = ops[0]
      return (
        <div>
          <div data-testid="len">{ops.length}</div>
          <div data-testid="kind">{op?.kind ?? ''}</div>
          <div data-testid="note">{op?.note ?? 'missing'}</div>
        </div>
      )
    }

    render(<Reader />)
    expect(screen.getByTestId('len')).toHaveTextContent('1')
    expect(screen.getByTestId('kind')).toHaveTextContent('set_balance')
    expect(screen.getByTestId('note')).toHaveTextContent('missing')

    await waitFor(() => {
      const stored = JSON.parse(localStorage.getItem('ratio.accountOps') ?? '[]') as Array<Record<string, unknown>>
      expect(stored).toHaveLength(1)
      expect(stored[0]).not.toHaveProperty('note')
    })
  })

  it('migrates negative account op balance fields', async () => {
    localStorage.setItem(
      'ratio.accountOps',
      JSON.stringify([
        {
          id: 'op1',
          kind: 'set_balance',
          at: '2025-01-01T00:00:00.000Z',
          accountType: 'credit_card',
          accountId: 'debt1',
          before: -10,
          after: -20,
        },
        {
          id: 'op2',
          kind: 'transfer',
          at: '2025-01-02T00:00:00.000Z',
          accountType: 'cash',
          fromId: 'cash1',
          toId: 'debt1',
          amount: -30,
          fromBefore: 100,
          fromAfter: -20,
          toBefore: 50,
          toAfter: -10,
        },
      ]),
    )

    function Reader() {
      const { ops } = useAccountOps()
      const setBalance = ops.find((op) => op.id === 'op1')
      const transfer = ops.find((op) => op.id === 'op2')
      return (
        <div>
          <div data-testid="setBalance">
            {setBalance?.kind === 'set_balance' ? JSON.stringify({ before: setBalance.before, after: setBalance.after }) : ''}
          </div>
          <div data-testid="transfer">
            {transfer?.kind === 'transfer'
              ? JSON.stringify({
                  amount: transfer.amount,
                  fromBefore: transfer.fromBefore,
                  fromAfter: transfer.fromAfter,
                  toBefore: transfer.toBefore,
                  toAfter: transfer.toAfter,
                })
              : ''}
          </div>
        </div>
      )
    }

    render(<Reader />)

    expect(JSON.parse(screen.getByTestId('setBalance').textContent ?? '{}')).toEqual({ before: 10, after: 20 })
    expect(JSON.parse(screen.getByTestId('transfer').textContent ?? '{}')).toEqual({
      amount: 30,
      fromBefore: 100,
      fromAfter: 0,
      toBefore: 50,
      toAfter: 0,
    })

    await waitFor(() => {
      const stored = JSON.parse(localStorage.getItem('ratio.accountOps') ?? '[]') as Array<Record<string, unknown>>
      const setBalance = stored.find((op) => op.id === 'op1') as Record<string, unknown> | undefined
      const transfer = stored.find((op) => op.id === 'op2') as Record<string, unknown> | undefined
      expect(setBalance?.before).toBe(10)
      expect(setBalance?.after).toBe(20)
      expect(transfer?.amount).toBe(30)
      expect(transfer?.fromAfter).toBe(0)
      expect(transfer?.toAfter).toBe(0)
    })
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
