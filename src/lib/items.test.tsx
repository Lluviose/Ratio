import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import type { Account } from './accounts'
import { useAccounts } from './useAccounts'
import { normalizeStoredDateKey, summarizeItemValue, summarizeItemValueTotals, todayDateKey, dateKeyFromTimestamp, findItemOpenedByTransfer, companionOpIdsForItem, findPurchaseCostOp } from './accountCost'
import { buildSnapshot } from './snapshots'
import { buildAiFinancialContext } from './ai'
import { coerceStoredAccountOps } from './accountOpsStorage'
import { buildOpRollbackPlan } from './opRollback'
import { buildRatioBackup, restoreRatioBackup } from './backup'

const bank: Account = { id: 'bank', type: 'bank_card', name: '银行卡', balance: 10000, updatedAt: '' }
const item: Account = { id: 'item', type: 'other_fixed', name: '相机', balance: 2000, cost: 3000, acquiredAt: '2026-09-01', updatedAt: '' }

beforeEach(() => localStorage.clear())

describe('物品金额、归档与持久化', () => {
  it('在同一事件内新建物品并转账，金额只转移一次且净资产不变', () => {
    localStorage.setItem('ratio.accounts', JSON.stringify([bank]))
    const { result } = renderHook(() => useAccounts())
    act(() => {
      const created = result.current.addItem({ type: 'other_fixed', name: '相机', cost: 2345.67, net: 0 })
      result.current.transfer(bank.id, created.id, 2345.67)
    })
    expect(result.current.accounts.find((a) => a.id === bank.id)?.balance).toBe(7654.33)
    expect(result.current.accounts.find((a) => a.name === '相机')).toMatchObject({ balance: 2345.67, cost: 2345.67 })
    expect(result.current.grouped.netWorth).toBe(10000)
    expect(JSON.parse(localStorage.getItem('ratio.accounts')!)).toEqual(result.current.accounts)
  })

  it('原值修正不改净值，非零物品归档退出快照和 AI 汇总，备份恢复后可找回', () => {
    localStorage.setItem('ratio.accounts', JSON.stringify([bank, item]))
    const { result, unmount } = renderHook(() => useAccounts())
    act(() => result.current.updateItemCost(item.id, 3500, '2026-08-31'))
    expect(result.current.grouped.netWorth).toBe(12000)
    act(() => result.current.archiveAccount(item.id))
    expect(result.current.grouped.netWorth).toBe(10000)
    expect(buildSnapshot('2026-09-15', result.current.accounts)).toMatchObject({ net: 10000, fixed: 0, accounts: [{ id: bank.id }] })
    expect(buildAiFinancialContext().summary.current.netWorth).toBe(10000)
    const backup = buildRatioBackup()
    unmount()
    localStorage.clear()
    restoreRatioBackup(backup)
    const restored = renderHook(() => useAccounts())
    expect(restored.result.current.archivedAccounts[0]).toMatchObject({ cost: 3500, balance: 2000, acquiredAt: '2026-08-31' })
    act(() => restored.result.current.unarchiveAccount(item.id))
    expect(restored.result.current.grouped.netWorth).toBe(12000)
    expect(restored.result.current.archivedAccounts).toHaveLength(0)
  })

  it('转出全部净值后可归档，归档物品不可作为新转账目标', () => {
    localStorage.setItem('ratio.accounts', JSON.stringify([bank, item]))
    const { result } = renderHook(() => useAccounts())
    act(() => {
      result.current.transfer(item.id, bank.id, 2000)
      result.current.archiveAccount(item.id)
    })
    expect(result.current.grouped.netWorth).toBe(12000)
    expect(result.current.archivedAccounts[0]).toMatchObject({ balance: 0, cost: 3000 })
    act(() => result.current.transfer(bank.id, item.id, 100))
    expect(result.current.archivedAccounts[0].balance).toBe(0)
    expect(result.current.grouped.netWorth).toBe(12000)
  })

  it('拒绝无效物品金额，兼容没有原值的旧账户并忽略普通账户的物品字段', () => {
    localStorage.setItem('ratio.accounts', JSON.stringify([{ ...bank, cost: 200, archivedAt: '2026-09-01' }, { ...item, cost: null, acquiredAt: '2026-02-30', archivedAt: 'invalid' }]))
    const { result } = renderHook(() => useAccounts())
    expect(result.current.activeAccounts).toHaveLength(2)
    expect(result.current.accounts.every((a) => a.cost === undefined && a.acquiredAt === undefined)).toBe(true)
    for (const cost of [NaN, Infinity, -1, 0, 0.001]) {
      expect(() => result.current.addItem({ type: 'other_fixed', cost })).toThrow()
    }
    expect(() => result.current.addItem({ type: 'cash', cost: 1 })).toThrow()
    expect(result.current.accounts).toHaveLength(2)
  })

  it('减值、增值按分计算；汇总排除未记录原值与已归档物品', () => {
    expect(summarizeItemValue(0.3, 0.1)?.impairment).toBe(0.2)
    expect(summarizeItemValue(100, 120)?.impairment).toBe(-20)
    expect(summarizeItemValue(undefined, 200)).toBeNull()
    expect(summarizeItemValueTotals([item, { ...item, id: 'archived', archivedAt: '2026-09-01' }, { ...item, id: 'old', cost: undefined }])).toEqual({ counted: 1, cost: 3000, net: 2000, impairment: 1000 })
    expect(normalizeStoredDateKey('2026-02-30')).toBeUndefined()
    expect(normalizeStoredDateKey('2024-02-29')).toBe('2024-02-29')
  })

  it('ISO 时间戳转本地日历日，不切片 UTC', () => {
    const local = new Date(2026, 8, 14, 21, 0, 0)
    const iso = local.toISOString()
    expect(dateKeyFromTimestamp(iso)).toBe('2026-09-14')
    expect(dateKeyFromTimestamp(iso)).toBe(todayDateKey(local))
    expect(dateKeyFromTimestamp('not-a-date')).toBeUndefined()
    expect(dateKeyFromTimestamp('2026-09-15T00:30:00.000Z')).toBe(todayDateKey(new Date('2026-09-15T00:30:00.000Z')))
  })

  it('新建并转入的开户转账可识别，有后续金额历史则不删物品', () => {
    const opened: Account = { ...item, balance: 1500, cost: 1500 }
    const purchase = {
      id: 'buy',
      kind: 'transfer' as const,
      accountType: 'bank_card' as const,
      at: '2026-09-15T00:00:00.000Z',
      fromId: bank.id,
      toId: opened.id,
      amount: 1500,
      fromBefore: 5000,
      fromAfter: 3500,
      toBefore: 0,
      toAfter: 1500,
    }
    const costOp = {
      id: 'cost',
      kind: 'set_cost' as const,
      accountId: opened.id,
      accountType: opened.type,
      at: '2026-09-15T00:00:00.000Z',
      before: null,
      after: 1500,
    }
    expect(findItemOpenedByTransfer(purchase, [bank, opened], [costOp, purchase])).toMatchObject({ id: opened.id })
    expect(companionOpIdsForItem([costOp, purchase], opened.id, purchase.id)).toEqual(['cost'])
    expect(findItemOpenedByTransfer(purchase, [bank, { ...opened, archivedAt: '2026-09-15T00:00:00.000Z' }], [costOp, purchase])).toBeNull()
    expect(
      findItemOpenedByTransfer(purchase, [bank, opened], [
        costOp,
        purchase,
        { id: 'loss', kind: 'revalue', accountId: opened.id, accountType: opened.type, at: '2026-09-16T00:00:00.000Z', before: 1500, after: 1200, delta: -300 },
      ]),
    ).toBeNull()
    expect(
      findItemOpenedByTransfer(
        { ...purchase, id: 'later', toBefore: 1500, toAfter: 1800, amount: 300, fromBefore: 3500, fromAfter: 3200 },
        [bank, { ...opened, balance: 1800 }],
        [purchase, { ...purchase, id: 'later', toBefore: 1500, toAfter: 1800, amount: 300, fromBefore: 3500, fromAfter: 3200 }],
      ),
    ).toBeNull()
  })

  it('手工建的物品原值与转入金额不同时，删除转账不删物品；购入原值记录按金额定位', () => {
    // 先建「汽车」原值 100000、净值 0，再从银行卡转入 20000 首付：转账不是开户购入，不能连物品一起删
    const car: Account = { id: 'car', type: 'other_fixed', name: '汽车', balance: 20000, cost: 100000, acquiredAt: '2024-05-01', updatedAt: '' }
    const costOp = { id: 'cost', kind: 'set_cost' as const, accountId: car.id, accountType: car.type, at: '2026-09-15T00:00:00.000Z', before: null, after: 100000 }
    const deposit = {
      id: 'deposit', kind: 'transfer' as const, accountType: 'bank_card' as const, at: '2026-09-15T00:00:01.000Z',
      fromId: bank.id, toId: car.id, amount: 20000, fromBefore: 50000, fromAfter: 30000, toBefore: 0, toAfter: 20000,
    }
    expect(findItemOpenedByTransfer(deposit, [bank, car], [costOp, deposit])).toBeNull()
    // 原值等于转账金额（新建并转入）或旧账户没有原值时仍视为开户购入
    expect(findItemOpenedByTransfer(deposit, [bank, { ...car, cost: 20000 }], [{ ...costOp, after: 20000 }, deposit])).toMatchObject({ id: car.id })
    // 当前原值即使相等，历史里的不同原值仍说明它不是这次转账创建的物品。
    expect(findItemOpenedByTransfer(deposit, [bank, { ...car, cost: 20000 }], [costOp, deposit])).toBeNull()
    expect(findItemOpenedByTransfer(deposit, [bank, { ...car, cost: undefined }], [deposit])).toMatchObject({ id: car.id })

    expect(findPurchaseCostOp([costOp, deposit], car.id, 100000)).toMatchObject({ id: 'cost' })
    expect(findPurchaseCostOp([costOp, deposit], car.id, 20000)).toBeNull()
    // 只匹配首次记录（before 为 null），后续修正记录不算
    expect(findPurchaseCostOp([{ ...costOp, before: 90000 }], car.id, 100000)).toBeNull()
  })

  it('原值和减值操作保留在备份中；减值回滚尊重后续余额校准', () => {
    const ops = coerceStoredAccountOps([
      { id: 'cost', kind: 'set_cost', accountId: item.id, accountType: item.type, at: '2026-09-01T00:00:00.000Z', before: null, after: 3000 },
      { id: 'loss', kind: 'revalue', accountId: item.id, accountType: item.type, at: '2026-09-02T00:00:00.000Z', before: 3000, after: 2000, delta: -1000 },
    ])
    expect(ops).toHaveLength(2)
    localStorage.setItem('ratio.accountOps', JSON.stringify(ops))
    const backup = buildRatioBackup()
    localStorage.clear()
    restoreRatioBackup(backup)
    expect(coerceStoredAccountOps(JSON.parse(localStorage.getItem('ratio.accountOps')!))).toEqual(ops)
    const loss = ops.find((op) => op.kind === 'revalue')!
    const ctx = { latestSetBalanceAtByAccountId: new Map<string, string>(), getAccountBalance: () => 2000 }
    expect(buildOpRollbackPlan(loss, ctx)).toEqual([{ accountId: item.id, delta: 1000, canRollback: true }])
    ctx.latestSetBalanceAtByAccountId.set(item.id, '2026-09-03T00:00:00.000Z')
    expect(buildOpRollbackPlan(loss, ctx)[0].canRollback).toBe(false)
  })
})
