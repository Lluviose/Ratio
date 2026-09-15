import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { AddAccountScreen } from './AddAccountScreen'

const colors = { liquid: '#5b8def', invest: '#8b5cf6', fixed: '#f59e0b', receivable: '#10b981', debt: '#ef4444' }

function renderScreen(onPickItem = vi.fn()) {
  const onBack = vi.fn()
  const onPick = vi.fn()
  render(<AddAccountScreen onBack={onBack} onPick={onPick} onPickItem={onPickItem} colors={colors} />)
  return { onBack, onPick, onPickItem }
}

function openItemForm() {
  fireEvent.click(screen.getByRole('button', { name: /固定资产/ }))
  fireEvent.click(screen.getByRole('button', { name: /其他固定资产/ }))
}

describe('添加资产', () => {
  it('添加物品时点表单下方空白不退出，取消才关闭', async () => {
    const { onBack, onPickItem } = renderScreen()
    openItemForm()
    expect(screen.getByLabelText('item cost')).toBeInTheDocument()

    fireEvent.click(screen.getByTestId('add-sheet-blank'))
    expect(screen.getByLabelText('item cost')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('item cost'), { target: { value: '12000' } })
    expect(screen.getByLabelText('item cost')).toHaveValue('12000')
    expect(onPickItem).not.toHaveBeenCalled()
    expect(onBack).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: '取消' }))
    await waitFor(() => expect(screen.queryByLabelText('item cost')).not.toBeInTheDocument())
    expect(onBack).not.toHaveBeenCalled()
  })

  it('普通账户命名弹层仍可点下方空白关闭', async () => {
    renderScreen()
    fireEvent.click(screen.getByRole('button', { name: /流动资金/ }))
    fireEvent.click(screen.getByRole('button', { name: /^现金$/ }))
    expect(screen.getByPlaceholderText('现金')).toBeInTheDocument()

    fireEvent.click(screen.getByTestId('add-sheet-blank'))
    await waitFor(() => expect(screen.queryByPlaceholderText('现金')).not.toBeInTheDocument())
  })
})
