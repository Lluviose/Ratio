import { useEffect, useMemo, useRef, useState } from 'react'
import { Line, LineChart, Tooltip, XAxis, YAxis } from 'recharts'
import { BottomSheet } from '../components/BottomSheet'
import { PillTabs } from '../components/PillTabs'
import { SegmentedControl } from '../components/SegmentedControl'
import { formatCny } from '../lib/format'

type TrendMode = 'netDebt' | 'cashInvest'

type RangeId = '30d' | '6m' | '1y' | 'custom'

type TrendPoint = {
  date: string
  net: number
  debt: number
  cash: number
  invest: number
}

function buildMockTrend(): TrendPoint[] {
  return [
    { date: '2024/09', net: 520_000, debt: 900_000, cash: 180_000, invest: 320_000 },
    { date: '2024/11', net: 810_000, debt: 910_000, cash: 220_000, invest: 420_000 },
    { date: '2025/01', net: 860_000, debt: 980_000, cash: 260_000, invest: 450_000 },
    { date: '2025/03', net: 960_000, debt: 1_000_000, cash: 280_000, invest: 520_000 },
    { date: '2025/05', net: 1_020_000, debt: 1_000_000, cash: 310_000, invest: 560_000 },
    { date: '2025/07', net: 1_236_600, debt: 1_005_000, cash: 330_000, invest: 640_000 },
    { date: '2025/09', net: 1_310_000, debt: 1_010_000, cash: 350_000, invest: 700_000 },
  ]
}

export function TrendScreen() {
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<TrendMode>('netDebt')
  const [range, setRange] = useState<RangeId>('1y')

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

  const data = useMemo(() => buildMockTrend(), [])

  const tooltip = (props: unknown) => {
    const active = Boolean((props as { active?: boolean } | null)?.active)
    const payload = (props as { payload?: readonly unknown[] } | null)?.payload
    if (!active || !payload || payload.length === 0) return null
    const p = (payload[0] as { payload?: TrendPoint } | undefined)?.payload
    if (!p) return null

    if (mode === 'netDebt') {
      return (
        <div
          style={{
            background: 'var(--card)',
            border: '1px solid var(--hairline)',
            padding: '12px 16px',
            borderRadius: 18,
            boxShadow: 'var(--shadow-hover)',
            minWidth: 180,
          }}
        >
          <div style={{ fontWeight: 800, fontSize: 13, color: 'var(--muted-text)', marginBottom: 8 }}>{p.date}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
             <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--primary)' }} />
             <div style={{ fontWeight: 900, fontSize: 14 }}>净资产 {formatCny(p.net)}</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
             <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'rgba(11, 15, 26, 0.2)' }} />
             <div style={{ fontWeight: 900, fontSize: 14, opacity: 0.6 }}>负债 {formatCny(-p.debt)}</div>
          </div>
        </div>
      )
    }

    return (
      <div
        style={{
          background: 'var(--card)',
          border: '1px solid var(--hairline)',
          padding: '12px 16px',
          borderRadius: 18,
          boxShadow: 'var(--shadow-hover)',
          minWidth: 180,
        }}
      >
        <div style={{ fontWeight: 800, fontSize: 13, color: 'var(--muted-text)', marginBottom: 8 }}>{p.date}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
             <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#47d16a' }} />
             <div style={{ fontWeight: 900, fontSize: 14 }}>流动资金 {formatCny(p.cash)}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
             <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--primary)' }} />
             <div style={{ fontWeight: 900, fontSize: 14, opacity: 0.8 }}>投资 {formatCny(p.invest)}</div>
        </div>
      </div>
    )
  }

  return (
    <div className="stack">
      <div className="card transition-transform active:scale-[0.98] cursor-pointer hover:shadow-lg" onClick={() => setOpen(true)}>
        <div className="cardInner">
          <div className="row">
            <div>
              <div style={{ fontWeight: 950, fontSize: 16 }}>观察趋势</div>
              <div className="muted" style={{ marginTop: 4, fontSize: 13, fontWeight: 700 }}>
                关注积累，见证资产增长
              </div>
            </div>
            <button type="button" className="iconBtn iconBtnPrimary" style={{ pointerEvents: 'none' }}>
              <div style={{ transform: 'rotate(-45deg)', fontSize: 16, fontWeight: 900 }}>→</div>
            </button>
          </div>
        </div>
      </div>

      <BottomSheet open={open} title="趋势图" onClose={() => setOpen(false)}>
        <div className="animate-[fadeIn_0.4s_ease-out]">
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <SegmentedControl
                options={[
                  { value: 'netDebt', label: '净资产与负债' },
                  { value: 'cashInvest', label: '流动资金与投资' },
                ]}
                value={mode}
                onChange={setMode}
              />
            </div>

            <div ref={chartRef} style={{ height: 240, marginTop: 24 }} className="animate-[scaleIn_0.5s_var(--ease-spring)]">
              {chartWidth > 0 ? (
                <LineChart width={chartWidth} height={240} data={data} margin={{ top: 10, right: 10, bottom: 0, left: -6 }}>
                  <XAxis 
                    dataKey="date" 
                    tick={{ fontSize: 11, fill: 'var(--muted-text)', fontWeight: 600 }} 
                    axisLine={false}
                    tickLine={false}
                    dy={10}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: 'var(--muted-text)', fontWeight: 600 }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v) => `${Math.round(Number(v) / 10000)}w`}
                    dx={-6}
                  />
                  <Tooltip 
                    content={tooltip} 
                    cursor={{ stroke: 'var(--hairline)', strokeWidth: 2, strokeDasharray: '4 4' }}
                  />
                  {mode === 'netDebt' ? (
                    <>
                      <Line 
                        type="monotone" 
                        dataKey="net" 
                        stroke="var(--primary)" 
                        strokeWidth={4} 
                        dot={{ r: 0, strokeWidth: 0, fill: 'var(--primary)' }}
                        activeDot={{ r: 6, strokeWidth: 3, stroke: '#fff' }}
                        animationDuration={1500}
                        animationEasing="ease-out"
                      />
                      <Line 
                        type="monotone" 
                        dataKey="debt" 
                        stroke="rgba(11, 15, 26, 0.2)" 
                        strokeWidth={3} 
                        dot={false}
                        activeDot={{ r: 5, strokeWidth: 3, stroke: '#fff' }}
                        animationDuration={1500}
                        animationEasing="ease-out"
                      />
                    </>
                  ) : (
                    <>
                      <Line 
                        type="monotone" 
                        dataKey="cash" 
                        stroke="#47d16a" 
                        strokeWidth={4} 
                        dot={false}
                        activeDot={{ r: 6, strokeWidth: 3, stroke: '#fff' }}
                        animationDuration={1500}
                        animationEasing="ease-out"
                      />
                      <Line 
                        type="monotone" 
                        dataKey="invest" 
                        stroke="var(--primary)" 
                        strokeWidth={4} 
                        dot={false}
                        activeDot={{ r: 6, strokeWidth: 3, stroke: '#fff' }}
                        animationDuration={1500}
                        animationEasing="ease-out"
                      />
                    </>
                  )}
                </LineChart>
              ) : null}
            </div>

            <div style={{ display: 'flex', justifyContent: 'center', marginTop: 24 }}>
              <PillTabs
                ariaLabel="range"
                options={[
                  { value: '30d', label: '30天' },
                  { value: '6m', label: '6月' },
                  { value: '1y', label: '1年' },
                  { value: 'custom', label: '自定义' },
                ]}
                value={range}
                onChange={setRange}
              />
            </div>
            {range === 'custom' ? (
              <div className="muted" style={{ textAlign: 'center', marginTop: 10, fontSize: 12, fontWeight: 800 }}>
                这里可以接入自定义日期范围选择
              </div>
            ) : null}
        </div>
      </BottomSheet>
    </div>
  )
}
