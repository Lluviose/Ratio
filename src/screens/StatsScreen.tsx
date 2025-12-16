import { useEffect, useMemo, useRef, useState } from 'react'
import { Bar, BarChart, Tooltip, XAxis, YAxis } from 'recharts'
import { BottomSheet } from '../components/BottomSheet'
import { PillTabs } from '../components/PillTabs'
import { SegmentedControl } from '../components/SegmentedControl'
import { formatCny } from '../lib/format'

type StatsMode = 'invest' | 'cash'

type RangeId = '5w' | '6m' | '1y' | '4y'

type BarPoint = { label: string; accountDelta: number; pnl: number }

function buildMockBars(): BarPoint[] {
  return [
    { label: '4月', accountDelta: 78_000, pnl: 0 },
    { label: '5月', accountDelta: 30_000, pnl: 10_000 },
    { label: '6月', accountDelta: 82_600, pnl: 52_000 },
    { label: '7月', accountDelta: 42_000, pnl: 33_000 },
    { label: '8月', accountDelta: 6_000, pnl: 12_000 },
    { label: '9月', accountDelta: 2_000, pnl: 20_200 },
  ]
}

export function StatsScreen() {
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<StatsMode>('invest')
  const [range, setRange] = useState<RangeId>('6m')

  const chartRef = useRef<HTMLDivElement | null>(null)
  const [chartWidth, setChartWidth] = useState(0)

  useEffect(() => {
    if (!open) return
    const el = chartRef.current
    if (!el) return

    const update = () => setChartWidth(el.getBoundingClientRect().width)
    update()

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', update)
      return () => window.removeEventListener('resize', update)
    }

    const ro = new ResizeObserver(() => update())
    ro.observe(el)
    return () => ro.disconnect()
  }, [open])

  const data = useMemo(() => buildMockBars(), [])

  const totals = useMemo(() => {
    const accountDeltaTotal = data.reduce((s, d) => s + d.accountDelta, 0)
    const pnlTotal = data.reduce((s, d) => s + d.pnl, 0)
    return { accountDeltaTotal, pnlTotal }
  }, [data])

  const tooltip = (props: unknown) => {
    const active = Boolean((props as { active?: boolean } | null)?.active)
    const payload = (props as { payload?: readonly unknown[] } | null)?.payload
    if (!active || !payload || payload.length === 0) return null
    const p = (payload[0] as { payload?: BarPoint } | undefined)?.payload
    if (!p) return null
    return (
      <div
        style={{
          background: 'white',
          border: '1px solid rgba(11, 15, 26, 0.10)',
          padding: '10px 12px',
          borderRadius: 14,
          boxShadow: '0 10px 30px rgba(11, 15, 26, 0.12)',
          minWidth: 170,
        }}
      >
        <div style={{ fontWeight: 950, fontSize: 12 }}>{p.label}</div>
        <div style={{ marginTop: 6, fontWeight: 900, fontSize: 12 }}>账户变动 {formatCny(p.accountDelta)}</div>
        <div style={{ marginTop: 2, fontWeight: 900, fontSize: 12, opacity: 0.7 }}>持仓盈亏 {formatCny(p.pnl)}</div>
      </div>
    )
  }

  return (
    <div className="stack">
      <div className="card">
        <div className="cardInner">
          <div className="row">
            <div>
              <div style={{ fontWeight: 950, fontSize: 16 }}>投资损益</div>
              <div className="muted" style={{ marginTop: 4, fontSize: 12, fontWeight: 800 }}>
                科学打理，随时调整投资策略
              </div>
            </div>
            <button type="button" className="iconBtn iconBtnPrimary" onClick={() => setOpen(true)}>
              打开
            </button>
          </div>
        </div>
      </div>

      <BottomSheet open={open} title="收支统计" onClose={() => setOpen(false)}>
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <SegmentedControl
            options={[
              { value: 'invest', label: '投资变动' },
              { value: 'cash', label: '流动资金' },
            ]}
            value={mode}
            onChange={setMode}
          />
        </div>

        <div className="muted" style={{ marginTop: 12, fontSize: 12, fontWeight: 800, textAlign: 'center' }}>
          2025年4月至9月 · 账户变动合计 {formatCny(totals.accountDeltaTotal)}，持仓盈利 {formatCny(totals.pnlTotal)}
        </div>

        <div ref={chartRef} style={{ height: 210, marginTop: 12 }}>
          {chartWidth > 0 ? (
            <BarChart width={chartWidth} height={210} data={data} margin={{ top: 10, right: 10, bottom: 0, left: -6 }}>
              <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="rgba(11, 15, 26, 0.25)" />
              <YAxis
                tick={{ fontSize: 11 }}
                stroke="rgba(11, 15, 26, 0.25)"
                tickFormatter={(v) => `${Math.round(Number(v) / 1000)}k`}
              />
              <Tooltip content={tooltip} />
              <Bar dataKey="accountDelta" fill={mode === 'invest' ? 'var(--primary)' : '#47d16a'} radius={[10, 10, 0, 0]} />
              <Bar dataKey="pnl" fill="rgba(11, 15, 26, 0.20)" radius={[10, 10, 0, 0]} />
            </BarChart>
          ) : null}
        </div>

        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 14 }}>
          <PillTabs
            ariaLabel="range"
            options={[
              { value: '5w', label: '5周' },
              { value: '6m', label: '6月' },
              { value: '1y', label: '1年' },
              { value: '4y', label: '4年' },
            ]}
            value={range}
            onChange={setRange}
          />
        </div>
        {range === '4y' ? (
          <div className="muted" style={{ textAlign: 'center', marginTop: 10, fontSize: 12, fontWeight: 800 }}>
            这里可以接入更长周期统计
          </div>
        ) : null}
      </BottomSheet>
    </div>
  )
}
