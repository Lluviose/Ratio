import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import type { AccountOp, AdjustBalanceOp, SetBalanceOp, TransferOp } from './accountOps'
import { addMoney, normalizeMoney } from './money'
import { buildLatestSetBalanceAtMap, buildOpRollbackPlan, canRollbackBalance } from './opRollback'

function setBalanceOp(overrides: Partial<SetBalanceOp> = {}): SetBalanceOp {
  return {
    id: 'op-set',
    kind: 'set_balance',
    at: '2026-07-01T10:00:00.000Z',
    accountType: 'bank_card',
    accountId: 'a1',
    before: 100,
    after: 200,
    ...overrides,
  }
}

function adjustOp(overrides: Partial<AdjustBalanceOp> = {}): AdjustBalanceOp {
  return {
    id: 'op-adj',
    kind: 'adjust',
    at: '2026-07-01T10:00:00.000Z',
    accountType: 'bank_card',
    accountId: 'a1',
    delta: 50,
    before: 100,
    after: 150,
    ...overrides,
  }
}

function transferOp(overrides: Partial<TransferOp> = {}): TransferOp {
  return {
    id: 'op-tr',
    kind: 'transfer',
    at: '2026-07-01T10:00:00.000Z',
    accountType: 'bank_card',
    fromId: 'a1',
    toId: 'a2',
    amount: 30,
    fromBefore: 100,
    fromAfter: 70,
    toBefore: 10,
    toAfter: 40,
    ...overrides,
  }
}

describe('buildLatestSetBalanceAtMap', () => {
  it('keeps the latest set_balance timestamp per account and ignores other kinds', () => {
    const ops: AccountOp[] = [
      setBalanceOp({ id: '1', accountId: 'a1', at: '2026-07-01T10:00:00.000Z' }),
      setBalanceOp({ id: '2', accountId: 'a1', at: '2026-07-03T10:00:00.000Z' }),
      setBalanceOp({ id: '3', accountId: 'a1', at: '2026-07-02T10:00:00.000Z' }),
      setBalanceOp({ id: '4', accountId: 'a2', at: '2026-06-01T10:00:00.000Z' }),
      adjustOp({ id: '5', accountId: 'a3', at: '2026-07-04T10:00:00.000Z' }),
    ]
    const m = buildLatestSetBalanceAtMap(ops)
    expect(m.get('a1')).toBe('2026-07-03T10:00:00.000Z')
    expect(m.get('a2')).toBe('2026-06-01T10:00:00.000Z')
    expect(m.has('a3')).toBe(false)
  })
})

describe('canRollbackBalance', () => {
  it('allows rollback when the account has no set_balance calibration', () => {
    expect(canRollbackBalance(new Map(), 'a1', '2026-07-01T00:00:00.000Z')).toBe(true)
  })

  it('blocks rollback when a later calibration exists, allows when calibration is not later', () => {
    const m = new Map([['a1', '2026-07-02T00:00:00.000Z']])
    // 校准晚于该操作：不可回滚（用户已确认过之后的真实余额）
    expect(canRollbackBalance(m, 'a1', '2026-07-01T00:00:00.000Z')).toBe(false)
    // 校准早于或等于该操作：可回滚
    expect(canRollbackBalance(m, 'a1', '2026-07-02T00:00:00.000Z')).toBe(true)
    expect(canRollbackBalance(m, 'a1', '2026-07-03T00:00:00.000Z')).toBe(true)
    // 其他账户不受影响
    expect(canRollbackBalance(m, 'a2', '2026-07-01T00:00:00.000Z')).toBe(true)
  })
})

describe('buildOpRollbackPlan', () => {
  const ctxOf = (balances: Record<string, number>, latest?: Record<string, string>) => ({
    latestSetBalanceAtByAccountId: new Map(Object.entries(latest ?? {})),
    getAccountBalance: (id: string) => balances[id],
  })

  it('adjust：回写差额为 -delta', () => {
    const plan = buildOpRollbackPlan(adjustOp({ delta: 50 }), ctxOf({ a1: 150 }))
    expect(plan).toEqual([{ accountId: 'a1', delta: -50, canRollback: true }])
  })

  it('set_balance：回写差额为 before - after', () => {
    const plan = buildOpRollbackPlan(setBalanceOp({ before: 100, after: 200 }), ctxOf({ a1: 200 }))
    expect(plan).toEqual([{ accountId: 'a1', delta: -100, canRollback: true }])
  })

  it('transfer：from/to 两个目标，各自回到转账前', () => {
    const plan = buildOpRollbackPlan(transferOp(), ctxOf({ a1: 70, a2: 40 }))
    expect(plan).toEqual([
      { accountId: 'a1', delta: 30, canRollback: true },
      { accountId: 'a2', delta: -30, canRollback: true },
    ])
  })

  it('后续校准存在时目标不可回滚，但仍会列出（UI 需要区分受影响与实际回写）', () => {
    const plan = buildOpRollbackPlan(
      adjustOp({ at: '2026-07-01T00:00:00.000Z' }),
      ctxOf({ a1: 150 }, { a1: '2026-07-02T00:00:00.000Z' }),
    )
    expect(plan).toEqual([{ accountId: 'a1', delta: -50, canRollback: false }])
  })

  it('账户已删除时不可回滚', () => {
    const plan = buildOpRollbackPlan(adjustOp(), ctxOf({}))
    expect(plan[0].canRollback).toBe(false)
  })

  it('回写会使余额变负时不可回滚', () => {
    // 回写 -50，当前余额只有 20
    const plan = buildOpRollbackPlan(adjustOp({ delta: 50 }), ctxOf({ a1: 20 }))
    expect(plan[0].canRollback).toBe(false)
  })

  it('转账仅一侧受阻时另一侧仍可回滚', () => {
    // from 需要 +30（总是可行），to 需要 -30 但余额只有 5
    const plan = buildOpRollbackPlan(transferOp(), ctxOf({ a1: 70, a2: 5 }))
    expect(plan[0]).toEqual({ accountId: 'a1', delta: 30, canRollback: true })
    expect(plan[1]).toEqual({ accountId: 'a2', delta: -30, canRollback: false })
  })

  it('rename 操作没有回滚目标', () => {
    const op: AccountOp = {
      id: 'op-r',
      kind: 'rename',
      at: '2026-07-01T00:00:00.000Z',
      accountType: 'bank_card',
      accountId: 'a1',
      beforeName: 'A',
      afterName: 'B',
    }
    expect(buildOpRollbackPlan(op, ctxOf({ a1: 10 }))).toEqual([])
  })

  it('性质：adjust 的回写差额与 delta 在金额域内恰好互相抵消', () => {
    const amountArb = fc.double({ min: -1e9, max: 1e9, noNaN: true, noDefaultInfinity: true })
    fc.assert(
      fc.property(amountArb, fc.double({ min: 0, max: 2e9, noNaN: true, noDefaultInfinity: true }), (delta, balance) => {
        const d = normalizeMoney(delta)
        const plan = buildOpRollbackPlan(adjustOp({ delta: d }), ctxOf({ a1: normalizeMoney(balance) }))
        expect(plan).toHaveLength(1)
        expect(addMoney(plan[0].delta, d)).toBe(0)
      }),
    )
  })

  it('性质：可回滚的 set_balance 回写后余额恰好回到 before（以 after 为当前余额时）', () => {
    const amountArb = fc.double({ min: 0, max: 1e9, noNaN: true, noDefaultInfinity: true })
    fc.assert(
      fc.property(amountArb, amountArb, (before, after) => {
        const b = normalizeMoney(before)
        const a = normalizeMoney(after)
        const plan = buildOpRollbackPlan(setBalanceOp({ before: b, after: a }), ctxOf({ a1: a }))
        expect(plan).toHaveLength(1)
        if (plan[0].canRollback) {
          expect(addMoney(a, plan[0].delta)).toBe(b)
        }
      }),
    )
  })
})
