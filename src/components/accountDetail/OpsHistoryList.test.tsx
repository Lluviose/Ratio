import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { OpsHistoryList } from './OpsHistoryList'
import type { Account } from '../../lib/accounts'
import type { AccountOp } from '../../lib/accountOps'
import { formatCny } from './format'

const account: Account = {
  id: 'acc-1',
  type: 'other_liquid',
  name: '测试账户',
  balance: 1000,
  updatedAt: '2026-07-19T00:00:00.000Z',
}

// 按时间倒序构造（与父组件 relatedOps 的排序约定一致），每条 delta=1，
// note 唯一以便断言分页边界
function makeOps(count: number): AccountOp[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `op-${i}`,
    at: new Date(Date.UTC(2026, 5, 1) - i * 60_000).toISOString(),
    accountType: 'other_liquid',
    kind: 'adjust',
    accountId: 'acc-1',
    delta: 1,
    before: 0,
    after: 1,
    note: `标记${i}号`,
  }))
}

function renderList(relatedOps: AccountOp[]) {
  return render(
    <OpsHistoryList
      account={account}
      relatedOps={relatedOps}
      getAccountName={() => undefined}
      shouldStaggerOpsIntro={false}
      swipedOpId={null}
      setSwipedOpId={() => {}}
      suppressOpClickRef={{ current: false }}
      onEditOp={() => {}}
      onDeleteOp={() => {}}
    />,
  )
}

describe('OpsHistoryList', () => {
  it('长历史初始只渲染前 40 条，并显示剩余条数', () => {
    renderList(makeOps(100))

    expect(screen.getByText('标记0号')).toBeInTheDocument()
    expect(screen.getByText('标记39号')).toBeInTheDocument()
    expect(screen.queryByText('标记40号')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '加载更多（还有 60 条）' })).toBeInTheDocument()
  })

  it('加载更多补齐剩余条目，且分页边界处的余额回推连续', () => {
    renderList(makeOps(100))

    fireEvent.click(screen.getByRole('button', { name: '加载更多（还有 60 条）' }))

    expect(screen.getByText('标记40号')).toBeInTheDocument()
    expect(screen.getByText('标记99号')).toBeInTheDocument()
    expect(screen.queryByText(/加载更多/)).not.toBeInTheDocument()

    // 余额从当前余额向过去回推：第 i 条显示 1000 - i；
    // 第 40 条（分页揭示的第一条）必须接续前 40 条的累计，而不是从头算
    expect(screen.getByText(`余额 ${formatCny(1000)}`)).toBeInTheDocument()
    expect(screen.getByText(`余额 ${formatCny(1000 - 40)}`)).toBeInTheDocument()
  })

  it('短历史全量渲染，不出现加载更多按钮', () => {
    renderList(makeOps(3))

    expect(screen.getByText('标记2号')).toBeInTheDocument()
    expect(screen.queryByText(/加载更多/)).not.toBeInTheDocument()
  })
})
