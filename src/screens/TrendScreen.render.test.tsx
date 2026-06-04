import type { ReactNode } from 'react'
import { act, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MONTH_START_DAY_KEY } from '../lib/monthStart'
import { SAVINGS_GOAL_KEY, type SavingsGoal } from '../lib/savingsGoal'
import type { Snapshot } from '../lib/snapshots'
import { realThemeOptions } from '../lib/themes'
import { TrendScreen } from './TrendScreen'

type MockRechartsProps = {
  children?: ReactNode
  data?: Array<Record<string, unknown>>
  dataKey?: string
  connectNulls?: boolean
}

const rechartsState = vi.hoisted(() => ({
  charts: [] as Array<{ data: Array<Record<string, unknown>> }>,
  lines: [] as MockRechartsProps[],
}))

vi.mock('recharts', () => ({
  CartesianGrid: () => null,
  LineChart: (props: MockRechartsProps) => {
    rechartsState.charts.push({ data: props.data ?? [] })
    return <div data-testid="line-chart">{props.children}</div>
  },
  ReferenceArea: () => null,
  ReferenceLine: () => null,
  Tooltip: () => null,
  XAxis: () => null,
  YAxis: () => null,
  Line: (props: MockRechartsProps) => {
    rechartsState.lines.push(props)
    return <div data-testid={`line-${props.dataKey}`} />
  },
}))

const goal: SavingsGoal = {
  targetAmount: 200000,
  targetDate: '2026-12-31',
  startDate: '2026-05-08',
  startNetWorth: 110000,
  createdAt: '2026-05-08T00:00:00.000Z',
}

function snapshot(date: string, net: number): Snapshot {
  return {
    date,
    net,
    debt: 0,
    cash: net,
    invest: 0,
    fixed: 0,
    receivable: 0,
  }
}

describe('TrendScreen rendering', () => {
  beforeEach(() => {
    rechartsState.charts.length = 0
    rechartsState.lines.length = 0
    window.localStorage.clear()
    window.localStorage.setItem(SAVINGS_GOAL_KEY, JSON.stringify(goal))
    window.localStorage.setItem(MONTH_START_DAY_KEY, JSON.stringify(8))
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-05T12:00:00.000Z'))
    vi.stubGlobal('ResizeObserver', class ResizeObserverMock {
      observe() {}
      unobserve() {}
      disconnect() {}
    })
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      width: 360,
      height: 252,
      top: 0,
      right: 360,
      bottom: 252,
      left: 0,
      toJSON: () => ({}),
    } as DOMRect)
  })

  afterEach(() => {
    window.localStorage.clear()
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('connects recorded net and debt lines across synthetic goal points', async () => {
    render(
      <TrendScreen
        snapshots={[
          snapshot('2026-04-07', 100000),
          snapshot('2026-05-07', 110000),
          snapshot('2026-06-05', 120000),
        ]}
        colors={realThemeOptions[0]!.colors}
      />,
    )

    await act(async () => {
      await Promise.resolve()
    })

    expect(rechartsState.lines.some((line) => line.dataKey === 'net')).toBe(true)

    const chartData = rechartsState.charts.at(-1)?.data ?? []
    const goalStartPoint = chartData.find((point) => point.dateKey === '2026-05-08')
    expect(goalStartPoint?.net).toBeUndefined()
    expect(chartData.find((point) => point.dateKey === '2026-05-07')?.net).toBe(110000)
    expect(chartData.find((point) => point.dateKey === '2026-06-05')?.net).toBe(120000)

    expect(rechartsState.lines.find((line) => line.dataKey === 'net')?.connectNulls).toBe(true)
    expect(rechartsState.lines.find((line) => line.dataKey === 'debt')?.connectNulls).toBe(true)
    expect(rechartsState.lines.find((line) => line.dataKey === 'goalComparison')?.connectNulls).toBe(false)
  })
})
