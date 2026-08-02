import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AccountDetailSheet } from './AccountDetailSheet'
import { OverlayProvider } from './OverlayProvider'
import type { Account } from '../lib/accounts'
import type { AccountOp } from '../lib/accountOps'
import type { ThemeColors } from '../lib/themes'
import { formatTime, toDatetimeLocalValue } from './accountDetail/format'

// 固定「现在」为本地时间 2026-08-02 10:00:30。只假 Date（定时器/rAF 保持真实），
// framer-motion 的动画调度不受影响；期望值都用本地时间构造，测试与时区无关。
const NOW = new Date(2026, 7, 2, 10, 0, 30)

const colors: ThemeColors = {
  liquid: '#5b8def',
  invest: '#8b5cf6',
  fixed: '#f59e0b',
  receivable: '#10b981',
  debt: '#ef4444',
}

const account: Account = {
  id: 'acc-1',
  type: 'other_liquid',
  name: '测试账户',
  balance: 1000,
  updatedAt: new Date(2026, 6, 1).toISOString(),
}

// 最近一次校准：本地 2026-08-01 12:00（回溯语义测试的分界线）
const calibrationAt = new Date(2026, 7, 1, 12, 0).toISOString()
const calibrationOp: AccountOp = {
  id: 'op-cal',
  kind: 'set_balance',
  at: calibrationAt,
  accountType: 'other_liquid',
  accountId: 'acc-1',
  before: 800,
  after: 1000,
}

function renderSheet(ops: AccountOp[] = []) {
  const onAddOp = vi.fn()
  const onSetBalance = vi.fn()
  const onAdjust = vi.fn()
  render(
    <OverlayProvider>
      <AccountDetailSheet
        open
        accountId="acc-1"
        accounts={[account]}
        ops={ops}
        onClose={() => {}}
        onRename={() => {}}
        onSetBalance={onSetBalance}
        onAdjust={onAdjust}
        onTransfer={() => {}}
        onDelete={() => {}}
        onAddOp={onAddOp}
        onDeleteOp={() => {}}
        onUpdateOp={() => {}}
        colors={colors}
      />
    </OverlayProvider>,
  )
  return { onAddOp, onSetBalance, onAdjust }
}

function openSetBalancePage() {
  fireEvent.click(screen.getByRole('button', { name: 'set balance action' }))
}

function openAdjustPage() {
  fireEvent.click(screen.getByRole('button', { name: 'adjust balance action' }))
}

function changeRecordTime(value: string) {
  fireEvent.change(screen.getByLabelText('record time'), { target: { value } })
}

function submit() {
  fireEvent.click(screen.getByRole('button', { name: '完成' }))
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('toDatetimeLocalValue', () => {
  it('输出本地时区分钟精度的 datetime-local 取值并补零', () => {
    expect(toDatetimeLocalValue(new Date(2026, 0, 5, 7, 8, 59))).toBe('2026-01-05T07:08')
    expect(toDatetimeLocalValue(new Date(Number.NaN))).toBe('')
  })
})

describe('AccountDetailSheet 记录时间', () => {
  it('未改动时间：修改余额仍用精确当前时刻并应用余额（既有行为不回归）', () => {
    const { onAddOp, onSetBalance } = renderSheet()

    openSetBalancePage()
    fireEvent.change(screen.getByLabelText('set balance'), { target: { value: '500' } })
    submit()

    expect(onAddOp).toHaveBeenCalledTimes(1)
    expect(onAddOp).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'set_balance', at: NOW.toISOString(), before: 1000, after: 500 }),
    )
    expect(onSetBalance).toHaveBeenCalledWith('acc-1', 500)
  })

  it('选择过去时间：记录写入所选时刻且正常应用余额', () => {
    const { onAddOp, onAdjust } = renderSheet()

    openAdjustPage()
    fireEvent.change(screen.getByLabelText('adjust amount'), { target: { value: '50' } })
    changeRecordTime('2026-08-01T09:30')
    submit()

    expect(onAddOp).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'adjust',
        at: new Date(2026, 7, 1, 9, 30).toISOString(),
        delta: 50,
      }),
    )
    expect(onAdjust).toHaveBeenCalledWith('acc-1', 50)
  })

  it('期间增减回溯到最近校准之前：页内提示、仅记录、不改余额', () => {
    const { onAddOp, onAdjust } = renderSheet([calibrationOp])

    openAdjustPage()
    fireEvent.change(screen.getByLabelText('adjust amount'), { target: { value: '50' } })
    changeRecordTime('2026-08-01T09:30')
    expect(screen.getByText('余额不会变（已在后续校准中固定）')).toBeInTheDocument()
    submit()

    expect(onAddOp).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'adjust',
        at: new Date(2026, 7, 1, 9, 30).toISOString(),
        delta: 50,
        before: 1000,
        after: 1050,
      }),
    )
    expect(onAdjust).not.toHaveBeenCalled()
    expect(screen.getByText('已记录（余额未变）')).toBeInTheDocument()
  })

  it('修改余额回溯到最近校准之前：仅记录、不改余额', () => {
    const { onAddOp, onSetBalance } = renderSheet([calibrationOp])

    openSetBalancePage()
    fireEvent.change(screen.getByLabelText('set balance'), { target: { value: '500' } })
    changeRecordTime('2026-08-01T09:30')
    submit()

    expect(onAddOp).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'set_balance',
        at: new Date(2026, 7, 1, 9, 30).toISOString(),
        before: 1000,
        after: 500,
      }),
    )
    expect(onSetBalance).not.toHaveBeenCalled()
    expect(screen.getByText('已记录（余额未变）')).toBeInTheDocument()
  })

  it('选了时间且金额等于当前余额：仍落一条记录（不再走无变化直接关闭）', () => {
    const { onAddOp, onSetBalance } = renderSheet()

    openSetBalancePage()
    fireEvent.change(screen.getByLabelText('set balance'), { target: { value: '1000' } })
    changeRecordTime('2026-08-01T09:30')
    submit()

    expect(onAddOp).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'set_balance', before: 1000, after: 1000 }),
    )
    expect(onSetBalance).not.toHaveBeenCalled()
  })

  it('未来时间被拒绝：提示且不产生记录', () => {
    const { onAddOp, onAdjust } = renderSheet()

    openAdjustPage()
    fireEvent.change(screen.getByLabelText('adjust amount'), { target: { value: '50' } })
    changeRecordTime('2026-08-03T10:00')
    submit()

    expect(screen.getByText('记录时间不能晚于现在')).toBeInTheDocument()
    expect(onAddOp).not.toHaveBeenCalled()
    expect(onAdjust).not.toHaveBeenCalled()
  })

  it('编辑历史记录：记录时间只读展示，不提供时间输入', () => {
    const adjustOp: AccountOp = {
      id: 'op-adjust',
      kind: 'adjust',
      at: new Date(2026, 7, 1, 9, 30).toISOString(),
      accountType: 'other_liquid',
      accountId: 'acc-1',
      delta: 50,
      before: 950,
      after: 1000,
    }
    renderSheet([adjustOp])

    fireEvent.click(screen.getByText('期间净流入'))

    // 历史列表（离场中）与编辑页可能同时在文档里，取存在性而非唯一性
    expect(screen.getAllByText(formatTime(adjustOp.at)).length).toBeGreaterThan(0)
    expect(screen.getByText('记录时间')).toBeInTheDocument()
    expect(screen.queryByLabelText('record time')).not.toBeInTheDocument()
  })
})
