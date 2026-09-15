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
