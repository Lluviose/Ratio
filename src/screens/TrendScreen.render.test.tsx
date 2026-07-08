import { act, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MONTH_START_DAY_KEY } from '../lib/monthStart'
import { SAVINGS_GOAL_KEY, type SavingsGoal } from '../lib/savingsGoal'
import type { Snapshot } from '../lib/snapshots'
import { realThemeOptions } from '../lib/themes'
import type { TrendChartSeries } from './TrendChart'
import type { TrendPoint } from './trendGoalLines'
import { TrendScreen } from './TrendScreen'

const chartState = vi.hoisted(() => ({
  charts: [] as Array<{ data: TrendPoint[]; series: TrendChartSeries[] }>,
}))

vi.mock('./TrendChart', async (importOriginal) => {
  const original = await importOriginal<typeof import('./TrendChart')>()
  return {
    ...original,
    TrendChart: (props: { data: TrendPoint[]; series: TrendChartSeries[] }) => {
      chartState.charts.push({ data: props.data, series: props.series })
      return <div data-testid="trend-chart" />
    },
  }
})

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
    chartState.charts.length = 0
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

  it('connects recorded net and debt lines and starts the goal path at the latest record', async () => {
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

    const chart = chartState.charts.at(-1)
    expect(chart).toBeDefined()
    const series = chart!.series
    expect(series.some((s) => s.key === 'net')).toBe(true)

    const chartData = chart!.data
    const latestPoint = chartData.find((point) => point.dateKey === '2026-06-05')
    expect(chartData.find((point) => point.dateKey === '2026-05-07')?.net).toBe(110000)
    expect(latestPoint?.net).toBe(120000)
    // 设定目标日已过，目标路径线起点移到最新记录日，不再合成设定目标日点
    expect(chartData.find((point) => point.dateKey === '2026-05-08')).toBeUndefined()
    // 目标路径线从最新记录日出发，起点对齐实际净值
    expect(latestPoint?.goalComparison).toBe(120000)

    expect(series.find((s) => s.key === 'net')?.connectNulls).toBe(true)
    expect(series.find((s) => s.key === 'debt')?.connectNulls).toBe(true)
    expect(series.find((s) => s.key === 'goalComparison')?.connectNulls).toBe(false)
  })
})
