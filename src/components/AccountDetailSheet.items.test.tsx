import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { AccountDetailSheet } from './AccountDetailSheet'
import { OverlayProvider } from './OverlayProvider'
import { useAccounts } from '../lib/useAccounts'
import { useAccountOps } from '../lib/useAccountOps'
import type { Account } from '../lib/accounts'
import type { AccountOp } from '../lib/accountOps'

const bank: Account = { id: 'bank', name: '银行卡', type: 'bank_card', balance: 5000, updatedAt: '' }
const item: Account = { id: 'item', name: '相机', type: 'other_fixed', balance: 2000, cost: 3000, updatedAt: '' }
const colors = { liquid: '#5b8def', invest: '#8b5cf6', fixed: '#f59e0b', receivable: '#10b981', debt: '#ef4444' }

function Harness({ id }: { id: string }) {
  const accounts = useAccounts()
  const ops = useAccountOps()
  return <OverlayProvider><AccountDetailSheet open accountId={id} accounts={accounts.accounts} ops={ops.ops} colors={colors}
    onClose={() => {}} onRename={accounts.renameAccount} onSetBalance={accounts.updateBalance} onAdjust={accounts.adjustBalance}
    onTransfer={accounts.transfer} onDelete={accounts.deleteAccount} onAddOp={ops.addOp} onDeleteOp={ops.deleteOp} onUpdateOp={ops.updateOp}
    onSetItemCost={accounts.updateItemCost} onCreateItem={accounts.addItem} onArchive={accounts.archiveAccount} onUnarchive={accounts.unarchiveAccount} />
  </OverlayProvider>
}

function storedAccounts(): Account[] { return JSON.parse(localStorage.getItem('ratio.accounts')!) }
function storedOps(): AccountOp[] { return JSON.parse(localStorage.getItem('ratio.accountOps')!) }
function openTransfer() {
  fireEvent.click(within(screen.getByRole('button', { name: 'rename' }).parentElement!).getByRole('button', { name: 'more' }))
  fireEvent.click(screen.getByRole('button', { name: '转账' }))
}

const purchase: AccountOp = {
  id: 'buy', kind: 'transfer', accountType: 'bank_card', at: '2026-09-14T00:00:01.000Z',
  fromId: bank.id, toId: item.id, amount: 2000, fromBefore: 7000, fromAfter: 5000, toBefore: 0, toAfter: 2000,
}
const purchaseCost: AccountOp = {
  id: 'cost', kind: 'set_cost', accountId: item.id, accountType: item.type,
  at: '2026-09-14T00:00:00.999Z', before: null, after: 2000,
}

function seedPurchase(accounts: Account[] = [bank, { ...item, cost: 2000 }], ops: AccountOp[] = [purchaseCost, purchase]) {
  localStorage.setItem('ratio.accounts', JSON.stringify(accounts))
  localStorage.setItem('ratio.accountOps', JSON.stringify(ops))
}

function openDeleteItem() {
  fireEvent.click(within(screen.getByRole('button', { name: 'rename' }).parentElement!).getByRole('button', { name: 'more' }))
  fireEvent.click(screen.getByRole('button', { name: '删除物品' }))
}

beforeEach(() => {
  localStorage.clear()
  localStorage.setItem('ratio.accounts', JSON.stringify([bank, item]))
})

describe('物品详情完整写路径', () => {
  it('从物品删除入口回滚唯一购入，恢复付款余额并清理配套记录', async () => {
    seedPurchase()
    render(<Harness id="item" />)
    openDeleteItem()
    expect(await screen.findByText(/是否同时回滚交易/)).toBeInTheDocument()
    expect(storedAccounts()).toHaveLength(2)
    fireEvent.click(screen.getByRole('button', { name: '删除并回滚交易' }))
    await waitFor(() => expect(storedAccounts()).toEqual([{ ...bank, balance: 7000, updatedAt: expect.any(String) }]))
    expect(storedOps()).toEqual([])
  })

  it('选择仅删除物品时保留交易和付款余额', async () => {
    seedPurchase()
    render(<Harness id="item" />)
    openDeleteItem()
    fireEvent.click(await screen.findByRole('button', { name: '仅删除物品' }))
    await waitFor(() => expect(storedAccounts()).toEqual([bank]))
    expect(storedOps().map((op) => op.id).sort()).toEqual(['buy', 'cost'])
  })

  it('取消删除不改变物品、交易或付款余额', async () => {
    seedPurchase()
    const before = { accounts: storedAccounts(), ops: storedOps() }
    render(<Harness id="item" />)
    openDeleteItem()
    fireEvent.click(await screen.findByRole('button', { name: '取消' }))
    expect(storedAccounts()).toEqual(before.accounts)
    expect(storedOps()).toEqual(before.ops)
  })

  it.each(['校准', '缺失', '归档', '负余额'] as const)('付款账户%s时不能执行购入回滚', async (reason) => {
    const source: Account = reason === '归档'
      ? { ...bank, type: 'other_fixed', archivedAt: '2026-09-15T00:00:00.000Z' }
      : reason === '负余额' ? { ...bank, type: 'credit_card', balance: 1000 } : bank
    const buy = reason === '负余额' ? { ...purchase, fromBefore: 0, fromAfter: 2000 } : purchase
    const ops: AccountOp[] = [purchaseCost, buy]
    if (reason === '校准') ops.push({ id: 'calibrate', kind: 'set_balance', accountType: bank.type, accountId: bank.id, at: '2026-09-15T00:00:00.000Z', before: 5000, after: 5000 })
    seedPurchase([...(reason === '缺失' ? [] : [source]), { ...item, cost: 2000 }], ops)
    render(<Harness id="item" />)
    openDeleteItem()
    const rollback = await screen.findByRole('button', { name: '删除并回滚交易' })
    expect(rollback).toBeDisabled()
    fireEvent.click(rollback)
    expect(storedAccounts().some((a) => a.id === item.id)).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: '仅删除物品' }))
    await waitFor(() => expect(storedAccounts().some((a) => a.id === item.id)).toBe(false))
    expect(storedAccounts()).toEqual(reason === '缺失' ? [] : [source])
    expect(storedOps()).toHaveLength(ops.length)
  })

  it('信用卡购入回滚减少欠款，不增加余额', async () => {
    seedPurchase([{ ...bank, type: 'credit_card', balance: 2500 }, { ...item, cost: 2000 }], [
      purchaseCost, { ...purchase, accountType: 'credit_card', fromBefore: 500, fromAfter: 2500 },
    ])
    render(<Harness id="item" />)
    openDeleteItem()
    fireEvent.click(await screen.findByRole('button', { name: '删除并回滚交易' }))
    await waitFor(() => expect(storedAccounts()[0].balance).toBe(500))
    expect(storedOps()).toEqual([])
  })

  it('只有一条购入记录的旧物品也可回滚，保留付款账户的其他收支', async () => {
    const deposit: AccountOp = { id: 'income', kind: 'adjust', accountId: bank.id, accountType: bank.type, at: '2026-09-15T00:00:00.000Z', delta: 100.25, before: 5000, after: 5100.25 }
    seedPurchase([{ ...bank, balance: 5100.25 }, { ...item, cost: undefined }], [purchase, deposit])
    render(<Harness id="item" />)
    openDeleteItem()
    fireEvent.click(await screen.findByRole('button', { name: '删除并回滚交易' }))
    await waitFor(() => expect(storedAccounts()[0].balance).toBe(7100.25))
    expect(storedOps()).toEqual([deposit])
  })

  it.each(['零净值', '手工新建', '后续减值', '后续原值', '多笔转账', '改名', '已归档'] as const)('%s的物品不套用唯一购入回滚', async (kind) => {
    const current = { ...item, cost: 2000 }
    let ops: AccountOp[] = [purchaseCost, purchase]
    if (kind === '零净值') current.balance = 0
    if (kind === '已归档') Object.assign(current, { archivedAt: '2026-09-15T00:00:00.000Z' })
    if (kind === '手工新建') ops = [purchaseCost]
    if (kind === '后续减值') {
      current.balance = 1500
      ops.push({ id: 'loss', kind: 'revalue', accountId: item.id, accountType: item.type, at: '2026-09-15T00:00:00.000Z', delta: -500, before: 2000, after: 1500 })
    }
    if (kind === '后续原值') ops.push({ ...purchaseCost, id: 'correction', before: 2500 })
    if (kind === '多笔转账') ops.push({ ...purchase, id: 'second' })
    if (kind === '改名') ops.push({ id: 'rename', kind: 'rename', accountId: item.id, accountType: item.type, at: '2026-09-15T00:00:00.000Z', beforeName: '旧名', afterName: item.name })
    seedPurchase([bank, current], ops)
    render(<Harness id="item" />)
    openDeleteItem()
    expect(await screen.findByRole('button', { name: '仅删除物品' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '删除并回滚交易' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '仅删除物品' }))
    await waitFor(() => expect(storedAccounts()).toEqual([bank]))
    expect(storedOps()).toHaveLength(ops.length)
  })

  it('删除购入历史不会连带删除已有原值修正的物品', async () => {
    seedPurchase(undefined, [purchaseCost, purchase, { ...purchaseCost, id: 'correction', before: 2500 }])
    render(<Harness id="bank" />)
    fireEvent.click(screen.getByRole('button', { name: '删除记录' }))
    fireEvent.click(await screen.findByRole('button', { name: '删除并回滚' }))
    await waitFor(() => expect(storedAccounts().find((a) => a.id === item.id)).toMatchObject({ balance: 0, cost: 2000 }))
    expect(storedOps().map((op) => op.id).sort()).toEqual(['correction', 'cost'])
  })

  it('余额不足时拒绝新建并转入，不留下空物品或历史', async () => {
    render(<Harness id="bank" />)
    openTransfer()
    fireEvent.change(await screen.findByLabelText('对方账户'), { target: { value: '__new_item__' } })
    fireEvent.change(await screen.findByLabelText('new item name'), { target: { value: '不应创建' } })
    fireEvent.change(screen.getByLabelText('transfer amount'), { target: { value: '6000' } })
    fireEvent.click(screen.getByRole('button', { name: '新建并转入' }))
    expect(await screen.findByText('转账后余额不能为负')).toBeInTheDocument()
    expect(storedAccounts()).toEqual([bank, item])
    expect(storedOps()).toEqual([])
  })

  it('从对方账户编辑归档物品的转账历史时先要求取消归档', async () => {
    localStorage.setItem('ratio.accounts', JSON.stringify([bank, { ...item, balance: 0, archivedAt: '2026-09-15T00:00:00.000Z' }]))
    localStorage.setItem('ratio.accountOps', JSON.stringify([{ id: 'sale', kind: 'transfer', accountType: item.type, at: '2026-09-14T00:00:00.000Z', fromId: item.id, toId: bank.id, amount: 2000, fromBefore: 2000, fromAfter: 0, toBefore: 3000, toAfter: 5000 }]))
    render(<Harness id="bank" />)
    fireEvent.click(screen.getByText('从 相机 转入'))
    expect(await screen.findByText('请先取消相关物品的归档，再修改历史记录')).toBeInTheDocument()
    expect(screen.queryByLabelText('transfer amount')).not.toBeInTheDocument()
    expect(storedAccounts().find((a) => a.id === item.id)?.balance).toBe(0)
  })

  it('从银行卡新建物品并转入，不重复计入净资产且记录原值来源', async () => {
    render(<Harness id="bank" />)
    openTransfer()
    fireEvent.change(await screen.findByLabelText('对方账户'), { target: { value: '__new_item__' } })
    fireEvent.change(await screen.findByLabelText('new item name'), { target: { value: '镜头' } })
    fireEvent.change(screen.getByLabelText('transfer amount'), { target: { value: '1500' } })
    fireEvent.click(screen.getByRole('button', { name: '新建并转入' }))
    await waitFor(() => expect(storedAccounts().find((a) => a.name === '镜头')).toMatchObject({ cost: 1500, balance: 1500 }))
    expect(storedAccounts().find((a) => a.id === bank.id)?.balance).toBe(3500)
    expect(storedOps().map((op) => op.kind).sort()).toEqual(['set_cost', 'transfer'])
  })

  it('删除新建并转入的转账时连物品和原值记录一起删，银行卡回滚', async () => {
    render(<Harness id="bank" />)
    openTransfer()
    fireEvent.change(await screen.findByLabelText('对方账户'), { target: { value: '__new_item__' } })
    fireEvent.change(await screen.findByLabelText('new item name'), { target: { value: '镜头' } })
    fireEvent.change(screen.getByLabelText('transfer amount'), { target: { value: '1500' } })
    fireEvent.click(screen.getByRole('button', { name: '新建并转入' }))
    await waitFor(() => expect(storedAccounts().find((a) => a.name === '镜头')).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: '删除记录' }))
    fireEvent.click(await screen.findByRole('button', { name: '删除物品并回滚' }))
    await waitFor(() => expect(storedAccounts().find((a) => a.name === '镜头')).toBeUndefined())
    expect(storedAccounts().find((a) => a.id === bank.id)?.balance).toBe(5000)
    expect(storedAccounts().find((a) => a.id === item.id)).toMatchObject({ balance: 2000, cost: 3000 })
    expect(storedOps()).toEqual([])
  })

  it('修改购入转账金额时，物品原值和首次原值记录一并更新', async () => {
    render(<Harness id="bank" />)
    openTransfer()
    fireEvent.change(await screen.findByLabelText('对方账户'), { target: { value: '__new_item__' } })
    fireEvent.change(await screen.findByLabelText('new item name'), { target: { value: '镜头' } })
    fireEvent.change(screen.getByLabelText('transfer amount'), { target: { value: '1500' } })
    fireEvent.click(screen.getByRole('button', { name: '新建并转入' }))
    await waitFor(() => expect(storedAccounts().find((a) => a.name === '镜头')).toMatchObject({ cost: 1500, balance: 1500 }))

    fireEvent.click(screen.getByText('转出到 镜头'))
    fireEvent.change(await screen.findByLabelText('transfer amount'), { target: { value: '1800' } })
    fireEvent.click(screen.getByRole('button', { name: '保存修改' }))
    await waitFor(() => expect(storedAccounts().find((a) => a.name === '镜头')).toMatchObject({ cost: 1800, balance: 1800 }))
    expect(storedAccounts().find((a) => a.id === bank.id)?.balance).toBe(3200)
    const costOp = storedOps().find((op) => op.kind === 'set_cost')
    expect(costOp).toMatchObject({ before: null, after: 1800 })
    expect(storedOps().find((op) => op.kind === 'transfer')).toMatchObject({ amount: 1800, toAfter: 1800, fromAfter: 3200 })
  })

  it('删除转入手工建物品（原值与转账不同）的转账只回滚金额，保留物品和原值', async () => {
    const car: Account = { id: 'car', name: '汽车', type: 'other_fixed', balance: 20000, cost: 100000, acquiredAt: '2024-05-01', updatedAt: '' }
    localStorage.setItem('ratio.accounts', JSON.stringify([bank, car]))
    localStorage.setItem('ratio.accountOps', JSON.stringify([
      { id: 'cost', kind: 'set_cost', accountType: car.type, accountId: car.id, at: '2026-09-14T00:00:00.000Z', before: null, after: 100000 },
      { id: 'deposit', kind: 'transfer', accountType: 'bank_card', at: '2026-09-14T00:00:01.000Z', fromId: bank.id, toId: car.id, amount: 20000, fromBefore: 25000, fromAfter: 5000, toBefore: 0, toAfter: 20000 },
    ]))
    render(<Harness id="bank" />)
    fireEvent.click(screen.getByRole('button', { name: '删除记录' }))
    fireEvent.click(await screen.findByRole('button', { name: '删除并回滚' }))
    await waitFor(() => expect(storedAccounts().find((a) => a.id === bank.id)?.balance).toBe(25000))
    expect(storedAccounts().find((a) => a.id === car.id)).toMatchObject({ balance: 0, cost: 100000, acquiredAt: '2024-05-01' })
    expect(storedOps().map((op) => op.id)).toEqual(['cost'])
  })

  it('删除转入已有物品的转账只回滚金额，不删物品', async () => {
    localStorage.setItem('ratio.accountOps', JSON.stringify([{
      id: 'sale', kind: 'transfer', accountType: 'bank_card', at: '2026-09-14T00:00:00.000Z',
      fromId: bank.id, toId: item.id, amount: 200, fromBefore: 5200, fromAfter: 5000, toBefore: 1800, toAfter: 2000,
    }]))
    render(<Harness id="bank" />)
    fireEvent.click(screen.getByRole('button', { name: '删除记录' }))
    fireEvent.click(await screen.findByRole('button', { name: '删除并回滚' }))
    await waitFor(() => expect(storedAccounts().find((a) => a.id === bank.id)?.balance).toBe(5200))
    expect(storedAccounts().find((a) => a.id === item.id)).toMatchObject({ balance: 1800, cost: 3000 })
    expect(storedOps()).toEqual([])
  })

  it('归档日期按本地日历展示', async () => {
    const archivedAt = new Date(2026, 8, 14, 21, 0, 0).toISOString()
    localStorage.setItem('ratio.accounts', JSON.stringify([bank, { ...item, archivedAt }]))
    render(<Harness id="item" />)
    expect(await screen.findByText(/2026年9月14日/)).toBeInTheDocument()
  })

  it.each(['保留', '归档物品'])('全部转出后选择%s，原值和历史保持完整', async (choice) => {
    render(<Harness id="item" />)
    openTransfer()
    fireEvent.change(await screen.findByLabelText('对方账户'), { target: { value: 'bank' } })
    fireEvent.change(screen.getByLabelText('transfer amount'), { target: { value: '2000' } })
    fireEvent.click(screen.getByRole('button', { name: '完成' }))
    fireEvent.click(await screen.findByRole('button', { name: choice }))
    await waitFor(() => expect(Boolean(storedAccounts().find((a) => a.id === item.id)?.archivedAt)).toBe(choice === '归档物品'))
    expect(storedAccounts().find((a) => a.id === item.id)).toMatchObject({ cost: 3000, balance: 0 })
    expect(storedAccounts().find((a) => a.id === bank.id)?.balance).toBe(7000)
    expect(storedOps()).toHaveLength(1)
    if (choice === '归档物品') {
      fireEvent.click(await screen.findByRole('button', { name: 'unarchive action' }))
      await waitFor(() => expect(storedAccounts().find((a) => a.id === item.id)?.archivedAt).toBeUndefined())
    }
  })

  it('减值保留原值，随后修改原值只更新价值卡', async () => {
    render(<Harness id="item" />)
    fireEvent.click(screen.getByRole('button', { name: 'revalue action' }))
    fireEvent.change(await screen.findByLabelText('revalue amount'), { target: { value: '500' } })
    fireEvent.click(screen.getByRole('button', { name: '完成' }))
    await waitFor(() => expect(storedAccounts().find((a) => a.id === item.id)).toMatchObject({ cost: 3000, balance: 1500 }))
    fireEvent.click(await screen.findByRole('button', { name: 'edit cost' }))
    fireEvent.change(await screen.findByLabelText('set cost'), { target: { value: '3500' } })
    fireEvent.click(screen.getByRole('button', { name: '保存修改' }))
    await waitFor(() => expect(storedAccounts().find((a) => a.id === item.id)).toMatchObject({ cost: 3500, balance: 1500 }))
    expect(storedOps().map((op) => op.kind).sort()).toEqual(['revalue', 'set_cost'])
  })
})
