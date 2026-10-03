import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { Account } from '../lib/accounts'
import { ItemArchiveSheet } from './ItemArchiveSheet'

const item: Account = {
  id: 'archived-camera', type: 'other_fixed', name: '相机', balance: 2000,
  cost: 5000, acquiredAt: '2026-05-01', archivedAt: '2026-06-01T00:00:00.000Z',
  updatedAt: '2026-06-01T00:00:00.000Z',
}

describe('已归档物品', () => {
  it('没有归档记录时仍可打开并显示空状态', () => {
    render(<ItemArchiveSheet open accounts={[]} onClose={vi.fn()} onPick={vi.fn()} />)
    expect(screen.getByText('暂无已归档物品')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'close' })).toBeInTheDocument()
  })

  it('打开记录时保留原值、净值和购入日期', () => {
    const onPick = vi.fn()
    render(<ItemArchiveSheet open accounts={[item]} onClose={vi.fn()} onPick={onPick} />)
    expect(screen.queryByText('暂无已归档物品')).not.toBeInTheDocument()
    expect(screen.getByText('¥2,000')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'archived item 相机' }))
    expect(onPick).toHaveBeenCalledWith(item)
  })

  it('归档列表沿用隐藏金额设置', () => {
    localStorage.setItem('ratio.hideAmounts', 'true')
    render(<ItemArchiveSheet open accounts={[item]} onClose={vi.fn()} onPick={vi.fn()} />)
    expect(screen.getByText('*****')).toBeInTheDocument()
    expect(screen.queryByText('¥2,000')).not.toBeInTheDocument()
  })
})
