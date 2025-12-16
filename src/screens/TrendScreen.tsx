import { useEffect, useMemo, useRef, useState } from 'react'
import { Line, LineChart, Tooltip, XAxis, YAxis } from 'recharts'
import { BottomSheet } from '../components/BottomSheet'
import { PillTabs } from '../components/PillTabs'
import { SegmentedControl } from '../components/SegmentedControl'
import { formatCny } from '../lib/format'
import type { Snapshot } from '../lib/snapshots'

type TrendMode = 'netDebt' | 'cashInvest'

type RangeId = '30d' | '6m' | '1y' | 'custom'

type TrendPoint = {
  date: string
  dateKey: string
  idx: number
  net: number
  debt: number
  cash: number
  invest: number
  fixed: number
  receivable: number
}

function toDateKey(d: Date) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function formatLabel(date: string) {
  // date is stored as YYYY-MM-DD
  const d = new Date(`${date}T00:00:00`)
  if (Number.isNaN(d.getTime())) return date
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${m}/${day}`
}

function pickMonthlyLast(snapshots: Snapshot[], monthCount: number) {
  const sorted = snapshots.slice().sort((a, b) => a.date.localeCompare(b.date))
  const byMonth = new Map<string, Snapshot>()

  for (const s of sorted) {
    const monthKey = s.date.slice(0, 7) // YYYY-MM
    const existing = byMonth.get(monthKey)
    if (!existing || s.date > existing.date) byMonth.set(monthKey, s)
  }

  const months = Array.from(byMonth.keys()).sort((a, b) => a.localeCompare(b))
  const picked = months.slice(Math.max(0, months.length - monthCount)).map((m) => byMonth.get(m)!)
  return picked
}

function toPoint(s: Snapshot, idx: number): TrendPoint {
  return {
    date: formatLabel(s.date),
    dateKey: s.date,
    idx,
    net: s.net,
    debt: s.debt,
    cash: s.cash,
    invest: s.invest,
    fixed: s.fixed,
    receivable: s.receivable,
  }
}

function formatDelta(value: number) {
  const abs = Math.abs(value)
  const text = formatCny(abs)
  if (value > 0) return `+${text}`
  if (value < 0) return `-${text}`
  return text
}

function pickTopChangingAccounts(prev: Snapshot | null, curr: Snapshot, limit: number) {
  if (!prev || !prev.accounts || !curr.accounts) return null

  const prevById = new Map<string, number>()
  for (const a of prev.accounts) prevById.set(a.id, a.balance)

  const currById = new Map<string, number>()
  for (const a of curr.accounts) currById.set(a.id, a.balance)

  const changes: { id: string; name: string; delta: number }[] = []

  for (const a of curr.accounts) {
    const before = prevById.get(a.id) ?? 0
    const delta = a.balance - before
    if (delta !== 0) changes.push({ id: a.id, name: a.name, delta })
  }

  for (const a of prev.accounts) {
    if (!currById.has(a.id)) {
      const delta = -a.balance
      if (delta !== 0) changes.push({ id: a.id, name: a.name, delta })
    }
  }

  changes.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
  return changes.slice(0, limit)
}

export function TrendScreen(props: { snapshots: Snapshot[] }) {
  const { snapshots } = props
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

  const view = useMemo(() => {
    if (!snapshots || snapshots.length === 0) return { points: [] as TrendPoint[], selected: [] as Snapshot[] }

    const sorted = snapshots.slice().sort((a, b) => a.date.localeCompare(b.date))

    let selected: Snapshot[] = []

    if (range === '30d') {
      const cutoff = new Date()
      cutoff.setDate(cutoff.getDate() - 30)
      const cutoffKey = toDateKey(cutoff)
      selected = sorted.filter((s) => s.date >= cutoffKey)
    } else if (range === '6m') {
      selected = pickMonthlyLast(sorted, 6)
    } else if (range === 'custom') {
      selected = sorted.slice(Math.max(0, sorted.length - 90))
    } else {
      selected = pickMonthlyLast(sorted, 12)
    }

    return { points: selected.map((s, idx) => toPoint(s, idx)), selected }
  }, [range, snapshots])

  const data = view.points

  const tooltip = (props: unknown) => {
    const active = Boolean((props as { active?: boolean } | null)?.active)
    const payload = (props as { payload?: readonly unknown[] } | null)?.payload
    if (!active || !payload || payload.length === 0) return null
    const p = (payload[0] as { payload?: TrendPoint } | undefined)?.payload
    if (!p) return null

    const idx = p.idx
    const currSnap = view.selected[idx]
    const prevSnap = idx > 0 ? view.selected[idx - 1] : null
    const topChanges = currSnap ? pickTopChangingAccounts(prevSnap, currSnap, 3) : null
    const canCompare = Boolean(prevSnap)
    const hasAccountDetails = Boolean(prevSnap?.accounts && currSnap?.accounts)

    const breakdown = (
      <div style={{ marginTop: 10 }}>
        <div style={{ height: 1, background: 'var(--hairline)', margin: '10px 0' }} />
        <div style={{ fontWeight: 850, fontSize: 12, color: 'var(--muted-text)', marginBottom: 8 }}>分组构成</div>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 12, fontWeight: 850 }}>
          <div style={{ color: 'var(--muted-text)' }}>流动资金</div>
          <div>{formatCny(p.cash)}</div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 12, fontWeight: 850, marginTop: 6 }}>
          <div style={{ color: 'var(--muted-text)' }}>投资</div>
          <div>{formatCny(p.invest)}</div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 12, fontWeight: 850, marginTop: 6 }}>
          <div style={{ color: 'var(--muted-text)' }}>固定资产</div>
          <div>{formatCny(p.fixed)}</div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 12, fontWeight: 850, marginTop: 6 }}>
          <div style={{ color: 'var(--muted-text)' }}>应收款</div>
          <div>{formatCny(p.receivable)}</div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 12, fontWeight: 850, marginTop: 6 }}>
          <div style={{ color: 'var(--muted-text)' }}>负债</div>
          <div style={{ opacity: 0.75 }}>{formatDelta(-p.debt)}</div>
        </div>
      </div>
    )

    const topChangePanel = (
      <div style={{ marginTop: 10 }}>
        <div style={{ height: 1, background: 'var(--hairline)', margin: '10px 0' }} />
        <div style={{ fontWeight: 850, fontSize: 12, color: 'var(--muted-text)', marginBottom: 8 }}>Top变动账户</div>
        {!canCompare ? (
          <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--muted-text)' }}>暂无对比快照</div>
        ) : !hasAccountDetails ? (
          <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--muted-text)' }}>旧快照无账户明细</div>
        ) : !topChanges || topChanges.length === 0 ? (
          <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--muted-text)' }}>无明显变动</div>
        ) : (
          <div style={{ display: 'grid', gap: 6 }}>
            {topChanges.map((c) => (
              <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 12, fontWeight: 850 }}>
                <div style={{ maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</div>
                <div style={{ color: c.delta > 0 ? '#47d16a' : c.delta < 0 ? '#ff6b57' : 'var(--muted-text)' }}>{formatDelta(c.delta)}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    )

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
            <div style={{ fontWeight: 900, fontSize: 14, opacity: 0.6 }}>负债 {formatDelta(-p.debt)}</div>
          </div>
          {breakdown}
          {topChangePanel}
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
        {breakdown}
        {topChangePanel}
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
              {chartWidth > 0 && data.length > 0 ? (
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
              ) : (
                <div className="muted" style={{ textAlign: 'center', paddingTop: 80, fontSize: 13, fontWeight: 800 }}>
                  暂无快照数据
                </div>
              )}
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
