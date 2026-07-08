import { describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach } from 'vitest'
import { TrendChart, type TrendChartSeries } from './TrendChart'
import { buildYTicks, monotonePath } from './trendChartMath'
import type { TrendPoint } from './trendGoalLines'

afterEach(cleanup)

describe('buildYTicks', () => {
  it('生成 1/2/2.5/5×10^k 整步长且完整覆盖数据域', () => {
    const { ticks, domainMin, domainMax } = buildYTicks(0, 262_000, 5)
    expect(domainMin).toBe(0)
    expect(domainMax).toBeGreaterThanOrEqual(262_000)
    const step = ticks[1] - ticks[0]
    const unit = step / 10 ** Math.floor(Math.log10(step))
    expect([1, 2, 2.5, 5]).toContain(unit)
    for (let i = 1; i < ticks.length; i += 1) {
      expect(ticks[i] - ticks[i - 1]).toBeCloseTo(step)
    }
    expect(ticks[0]).toBe(domainMin)
    expect(ticks[ticks.length - 1]).toBeCloseTo(domainMax)
  })

  it('零跨度/异常输入退化为最小可用域', () => {
    const flat = buildYTicks(5, 5, 5)
    expect(flat.domainMax).toBeGreaterThan(flat.domainMin)
    expect(flat.ticks.length).toBeGreaterThanOrEqual(2)
  })
})

describe('monotonePath', () => {
  it('路径经过每个数据点，段数 = 点数 - 1', () => {
    const pts = [
      { x: 0, y: 100 },
      { x: 50, y: 80 },
      { x: 100, y: 90 },
      { x: 150, y: 20 },
    ]
    const d = monotonePath(pts)
    expect(d.startsWith(`M${pts[0].x},${pts[0].y}`)).toBe(true)
    expect(d.match(/C/g)?.length).toBe(pts.length - 1)
    for (const p of pts.slice(1)) {
      expect(d).toContain(`${p.x},${p.y}`)
    }
  })

  it('单调递增数据的控制点不越过相邻数据点的 y（不过冲）', () => {
    const pts = [
      { x: 0, y: 200 },
      { x: 100, y: 150 },
      { x: 200, y: 40 },
      { x: 300, y: 30 },
    ]
    const d = monotonePath(pts)
    const ys = [...d.matchAll(/[C,](-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/g)].map((m) => Number(m[2]))
    const yMin = Math.min(...pts.map((p) => p.y))
    const yMax = Math.max(...pts.map((p) => p.y))
    for (const y of ys) {
      expect(y).toBeGreaterThanOrEqual(yMin - 1e-6)
      expect(y).toBeLessThanOrEqual(yMax + 1e-6)
    }
  })
})

function makePoint(overrides: Partial<TrendPoint> & { dateKey: string; dateValue: number }): TrendPoint {
  return {
    date: overrides.dateKey,
    idx: 0,
    net: null,
    debt: null,
    cash: null,
    invest: null,
    fixed: null,
    receivable: null,
    ...overrides,
  }
}

describe('TrendChart', () => {
  const data: TrendPoint[] = [
    makePoint({ dateKey: '2026-07-01', dateValue: 20635, net: 100_000, debt: 50_000 }),
    makePoint({ dateKey: '2026-07-02', dateValue: 20636, net: 110_000, debt: 49_000 }),
    makePoint({ dateKey: '2026-07-03', dateValue: 20637, net: null, debt: 48_000 }),
    makePoint({ dateKey: '2026-07-04', dateValue: 20638, net: 130_000, debt: 47_000 }),
  ]
  const series: TrendChartSeries[] = [
    { key: 'net', getValue: (p) => p.net, stroke: 'red', strokeWidth: 3, curve: 'monotone', connectNulls: true, activeDot: { r: 6 } },
    { key: 'debt', getValue: (p) => p.debt, stroke: 'blue', strokeWidth: 2, curve: 'monotone', connectNulls: true, activeDot: { r: 5 } },
  ]

  const renderChart = (onSelectPoint: (p: TrendPoint) => void = () => {}, selectedPointKey: string | null = null) =>
    render(
      <TrendChart
        width={400}
        height={252}
        data={data}
        series={series}
        xDomainStart={null}
        forecastArea={{ start: 20636, end: 20638 }}
        forecastStartValue={20636}
        formatXTick={(v) => String(v)}
        formatYTick={(v) => `${Math.round(v / 10000)}w`}
        selectedPointKey={selectedPointKey}
        onSelectPoint={onSelectPoint}
        animKey="netDebt-1y"
      />,
    )

  it('为每个系列渲染一条路径，connectNulls 跳过空值不断线', () => {
    const { container } = renderChart()
    const paths = container.querySelectorAll('path[stroke]')
    expect(paths.length).toBe(2)
    // net 有一个 null，connectNulls 后仍是单段路径（一个 M）
    const netPath = paths[0].getAttribute('d') ?? ''
    expect(netPath.match(/M/g)?.length).toBe(1)
  })

  it('点击按 x 最近点回调；选中点渲染 cursor 与高亮点', () => {
    const selected: TrendPoint[] = []
    const { container } = renderChart((p) => selected.push(p))
    const svg = container.querySelector('svg')!
    // jsdom 的 getBoundingClientRect 返回 0，clientX 即图内坐标；plotLeft=58 附近是最左的点
    fireEvent.click(svg, { clientX: 60 })
    expect(selected.map((p) => p.dateKey)).toEqual(['2026-07-01'])

    const { container: withSelection } = renderChart(() => {}, '2026-07-04')
    // cursor 虚线 + 两个系列各一个高亮圆点
    expect(withSelection.querySelectorAll('line[stroke-dasharray="4 6"]').length).toBe(1)
    expect(withSelection.querySelectorAll('circle').length).toBe(2)
  })

  it('渲染网格线、参考区与预测分界线', () => {
    const { container } = renderChart()
    expect(container.querySelectorAll('line[stroke-dasharray="2 10"]').length).toBeGreaterThanOrEqual(2)
    expect(container.querySelector('rect[fill="#64748b"]')).not.toBeNull()
    expect(container.querySelectorAll('line[stroke-dasharray="4 7"]').length).toBe(1)
  })

  it('y 轴刻度按 formatYTick 渲染且覆盖 0 基线', () => {
    const { container } = renderChart()
    const labels = [...container.querySelectorAll('text')].map((t) => t.textContent)
    expect(labels).toContain('0w')
  })
})
