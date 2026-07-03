import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { Account, AccountGroupId } from '../lib/accounts'
import { AssetsRatioPage, type RatioPageBlock } from './AssetsRatioPage'

const FakeIcon = (props: { size?: number }) => <svg data-testid="type-icon" width={props.size} />
const getIcon = () => FakeIcon

const blocks: RatioPageBlock[] = [
  {
    id: 'liquid',
    name: '流动资金',
    tone: '#f5d18a',
    amount: 1000,
    percent: 59,
    rect: { x: 94, y: 64, w: 296, h: 400 },
    displayHeight: 368,
    corner: { tl: 0, tr: 32, bl: 0, br: 0 },
  },
  {
    id: 'invest',
    name: '投资',
    tone: '#ff6b57',
    amount: 700,
    percent: 41,
    rect: { x: 94, y: 464, w: 296, h: 236 },
    displayHeight: 236,
    corner: { tl: 0, tr: 32, bl: 0, br: 32 },
  },
]

function account(id: string, type: Account['type'], balance: number): Account {
  return { id, type, name: id, balance, updatedAt: '2026-01-01T00:00:00.000Z' }
}

const accountsByGroup: Partial<Record<AccountGroupId, Account[]>> = {
  liquid: [account('bank', 'bank_card', 800), account('cash', 'cash', 200)],
  invest: [account('fund', 'fund', 700)],
}

function renderPage(overrides?: Partial<Parameters<typeof AssetsRatioPage>[0]>) {
  const props: Parameters<typeof AssetsRatioPage>[0] = {
    onBack: () => {},
    blocks,
    accountsByGroup,
    getIcon,
    hideAmounts: false,
    viewport: { w: 390, h: 700 },
    active: true,
    ...overrides,
  }
  return render(<AssetsRatioPage {...props} />)
}

describe('AssetsRatioPage', () => {
  it('renders a hit area for each block', () => {
    renderPage()
    expect(screen.getByRole('button', { name: '展开流动资金占比详情' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '展开投资占比详情' })).toBeInTheDocument()
  })

  it('disables hit areas while the page is not active', () => {
    renderPage({ active: false })
    const hit = screen.getByRole('button', { name: '展开流动资金占比详情' })
    expect(hit.style.pointerEvents).toBe('none')
  })

  it('expands a block into its breakdown panel', async () => {
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: '展开流动资金占比详情' }))

    const panel = await screen.findByRole('dialog', { name: '流动资金占比详情' })
    expect(panel).toBeInTheDocument()
    expect(screen.getByText('银行卡')).toBeInTheDocument()
    expect(screen.getByText('现金')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '收起占比详情' })).toBeInTheDocument()

    // 展开期间命中区域禁用，避免重复展开
    const hit = screen.getByRole('button', { name: '展开投资占比详情' })
    expect(hit.style.pointerEvents).toBe('none')
  })

  it('masks amounts in the breakdown when hideAmounts is on', async () => {
    renderPage({ hideAmounts: true })
    fireEvent.click(screen.getByRole('button', { name: '展开流动资金占比详情' }))

    await screen.findByRole('dialog', { name: '流动资金占比详情' })
    expect(screen.queryByText(/¥/)).not.toBeInTheDocument()
    expect(screen.getAllByText('*****').length).toBeGreaterThan(0)
  })

  it('collapses the panel via the close button', async () => {
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: '展开流动资金占比详情' }))
    await screen.findByRole('dialog', { name: '流动资金占比详情' })

    fireEvent.click(screen.getByRole('button', { name: '收起占比详情' }))
    await waitFor(
      () => expect(screen.queryByRole('dialog', { name: '流动资金占比详情' })).not.toBeInTheDocument(),
      { timeout: 4000 },
    )

    const hit = screen.getByRole('button', { name: '展开流动资金占比详情' })
    expect(hit.style.pointerEvents).toBe('auto')
  })

  it('keeps the closing overlay interactive until the panel unmounts', async () => {
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: '展开流动资金占比详情' }))
    const panel = await screen.findByRole('dialog', { name: '流动资金占比详情' })

    fireEvent.click(screen.getByRole('button', { name: '收起占比详情' }))

    expect(panel.style.pointerEvents).toBe('auto')
    expect(screen.getByTestId('ratio-breakdown-scrim').style.pointerEvents).toBe('auto')
  })

  it('auto-collapses when the page becomes inactive', async () => {
    const view = renderPage()
    fireEvent.click(screen.getByRole('button', { name: '展开流动资金占比详情' }))
    await screen.findByRole('dialog', { name: '流动资金占比详情' })

    view.rerender(
      <AssetsRatioPage
        onBack={() => {}}
        blocks={blocks}
        accountsByGroup={accountsByGroup}
        getIcon={getIcon}
        hideAmounts={false}
        viewport={{ w: 390, h: 700 }}
        active={false}
      />,
    )

    await waitFor(
      () => expect(screen.queryByRole('dialog', { name: '流动资金占比详情' })).not.toBeInTheDocument(),
      { timeout: 4000 },
    )
  })
})
