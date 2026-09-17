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

beforeEach(() => {
  localStorage.clear()
  localStorage.setItem('ratio.accounts', JSON.stringify([bank, item]))
})

describe('物品详情完整写路径', () => {
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
