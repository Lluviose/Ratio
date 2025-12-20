import { useEffect, useMemo, useRef, useState } from 'react'
import { Bar, BarChart, Cell, Tooltip, XAxis, YAxis } from 'recharts'
import { motion } from 'framer-motion'
import { PillTabs } from '../components/PillTabs'
import { formatCny } from '../lib/format'
import { type ThemeColors } from '../lib/themes'
import type { Snapshot } from '../lib/snapshots'

type RangeId = '5w' | '6m' | '1y' | '4y'

type WaterfallPoint = {
  label: string
  range: [number, number]
  delta: number
  kind: 'total' | 'step'
}

function toDateKey(d: Date) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function formatDelta(value: number) {
  const abs = Math.abs(value)
  const text = formatCny(abs)
  if (value > 0) return `+${text}`
  if (value < 0) return `-${text}`
  return text
}

export function StatsScreen(props: { snapshots: Snapshot[]; colors: ThemeColors }) {
  const { snapshots, colors } = props
  const [range, setRange] = useState<RangeId>('6m')

  const chartRef = useRef<HTMLDivElement | null>(null)
  const [chartWidth, setChartWidth] = useState(0)

  useEffect(() => {
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
  }, [])

  const analysis = useMemo(() => {
    const empty = {
      start: null as Snapshot | null,
      end: null as Snapshot | null,
      points: [] as WaterfallPoint[],
      netDelta: 0,
      selectedCount: 0,
    }

    if (!snapshots || snapshots.length < 2) return empty

    const sorted = snapshots.slice().sort((a, b) => a.date.localeCompare(b.date))

    const cutoff = new Date()
    if (range === '5w') cutoff.setDate(cutoff.getDate() - 35)
    if (range === '6m') cutoff.setMonth(cutoff.getMonth() - 6)
    if (range === '1y') cutoff.setFullYear(cutoff.getFullYear() - 1)
    if (range === '4y') cutoff.setFullYear(cutoff.getFullYear() - 4)

    const cutoffKey = toDateKey(cutoff)
    let selected = sorted.filter((s) => s.date >= cutoffKey)
    if (selected.length < 2) selected = sorted

    const start = selected[0]
    const end = selected[selected.length - 1]

    const deltaCash = end.cash - start.cash
    const deltaInvest = end.invest - start.invest
    const deltaFixed = end.fixed - start.fixed
    const deltaReceivable = end.receivable - start.receivable
    const deltaDebt = end.debt - start.debt
    const debtContribution = -deltaDebt

    const points: WaterfallPoint[] = []
    const startTotal = start.net
    const endTotal = end.net

    points.push({
      label: '起始',
      range: [Math.min(0, startTotal), Math.max(0, startTotal)],
      delta: startTotal,
      kind: 'total',
    })

    let running = startTotal
    const pushStep = (label: string, delta: number) => {
      const next = running + delta
      points.push({
        label,
        range: [Math.min(running, next), Math.max(running, next)],
        delta,
        kind: 'step',
      })
      running = next
    }

    pushStep('流动资金', deltaCash)
    pushStep('投资', deltaInvest)
    pushStep('固定资产', deltaFixed)
    pushStep('应收款', deltaReceivable)
    pushStep('负债', debtContribution)

    points.push({
      label: '期末',
      range: [Math.min(0, endTotal), Math.max(0, endTotal)],
      delta: endTotal,
      kind: 'total',
    })

    return {
      start,
      end,
      points,
      netDelta: endTotal - startTotal,
      selectedCount: selected.length,
    }
  }, [range, snapshots])

  const liquidity = useMemo(() => {
    if (!analysis.end) return null
    const end = analysis.end
    const assets = end.cash + end.invest + end.fixed + end.receivable
    const debt = end.debt
    const debtRatio = assets > 0 ? debt / assets : 0
    const liquidRatio = assets > 0 ? end.cash / assets : 0
    const netLiquid = end.cash - debt
    return { assets, debt, debtRatio, liquidRatio, netLiquid }
  }, [analysis.end])

  const tooltip = (props: unknown) => {
    const active = Boolean((props as { active?: boolean } | null)?.active)
    const payload = (props as { payload?: readonly unknown[] } | null)?.payload
    if (!active || !payload || payload.length === 0) return null
    const p = (payload[0] as { payload?: WaterfallPoint } | undefined)?.payload
    if (!p) return null
    return (
      <div
        style={{
          background: 'var(--card)',
          border: '1px solid var(--hairline)',
          padding: '12px 16px',
          borderRadius: 18,
          boxShadow: 'var(--shadow-hover)',
          minWidth: 170,
        }}
      >
        <div style={{ fontWeight: 800, fontSize: 13, color: 'var(--muted-text)', marginBottom: 8 }}>{p.label}</div>
        {p.kind === 'total' ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--primary)' }} />
            <div style={{ fontWeight: 900, fontSize: 14 }}>净资产 {formatCny(p.delta)}</div>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: p.delta >= 0 ? '#47d16a' : '#ff6b57' }} />
            <div style={{ fontWeight: 900, fontSize: 14 }}>变动 {formatDelta(p.delta)}</div>
          </div>
        )}
      </div>
    )
  }

  const getBarColor = (p: WaterfallPoint) => {
    if (p.kind === 'total') return 'rgba(11, 15, 26, 0.18)'
    // Map label to color key
    const map: Record<string, keyof ThemeColors> = {
      '流动资金': 'liquid',
      '投资': 'invest',
      '固定资产': 'fixed',
      '应收款': 'receivable',
      '负债': 'debt'
    }
    if (p.label in map) {
      return colors[map[p.label]]
    }
    return p.delta >= 0 ? '#47d16a' : '#ff6b57'
  }

  return (
    <div className="stack" style={{ padding: '0 16px' }}>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <div className="muted" style={{ marginTop: 8, fontSize: 12, fontWeight: 800, textAlign: 'center', opacity: 0.7 }}>
          {analysis.start && analysis.end ? (
            <>
              {analysis.start.date} 至 {analysis.end.date} · 净资产变化{' '}
              <span style={{ color: 'var(--text)' }}>{formatDelta(analysis.netDelta)}</span>
            </>
          ) : (
            <>暂无足够快照数据</>
          )}
        </div>

        {liquidity ? (
          <motion.div
            className="card"
            style={{ marginTop: 16, background: 'rgba(255, 255, 255, 0.7)' }}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.1 }}
          >
            <div className="cardInner">
              <div style={{ fontWeight: 950, fontSize: 14, marginBottom: 10 }}>流动性指标</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div style={{ border: '1px solid var(--hairline)', borderRadius: 18, padding: 12, background: 'var(--card)' }}>
                  <div style={{ fontSize: 11, fontWeight: 900, color: 'var(--muted-text)' }}>负债率</div>
                  <div style={{ fontSize: 16, fontWeight: 950, marginTop: 4 }}>{Math.round(liquidity.debtRatio * 100)}%</div>
                </div>
                <div style={{ border: '1px solid var(--hairline)', borderRadius: 18, padding: 12, background: 'var(--card)' }}>
                  <div style={{ fontSize: 11, fontWeight: 900, color: 'var(--muted-text)' }}>流动性占比</div>
                  <div style={{ fontSize: 16, fontWeight: 950, marginTop: 4 }}>{Math.round(liquidity.liquidRatio * 100)}%</div>
                </div>
                <div style={{ border: '1px solid var(--hairline)', borderRadius: 18, padding: 12, background: 'var(--card)' }}>
                  <div style={{ fontSize: 11, fontWeight: 900, color: 'var(--muted-text)' }}>净资产</div>
                  <div style={{ fontSize: 14, fontWeight: 950, marginTop: 4 }}>{formatCny(analysis.end?.net ?? 0)}</div>
                </div>
                <div style={{ border: '1px solid var(--hairline)', borderRadius: 18, padding: 12, background: 'var(--card)' }}>
                  <div style={{ fontSize: 11, fontWeight: 900, color: 'var(--muted-text)' }}>净流动资产</div>
                  <div style={{ fontSize: 14, fontWeight: 950, marginTop: 4 }}>{formatCny(liquidity.netLiquid)}</div>
                </div>
              </div>
            </div>
          </motion.div>
        ) : null}

        <motion.div
          ref={chartRef}
          style={{ height: 240, marginTop: 16 }}
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: 'spring', damping: 20, stiffness: 100, delay: 0.2 }}
        >
          {chartWidth > 0 && analysis.points.length > 0 ? (
            <BarChart width={chartWidth} height={240} data={analysis.points} margin={{ top: 10, right: 10, bottom: 0, left: -6 }}>
              <XAxis
                dataKey="label"
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
                cursor={{ fill: 'rgba(11, 15, 26, 0.03)', radius: 8 }}
              />
              <Bar
                dataKey="range"
                fill="rgba(11, 15, 26, 0.12)"
                radius={[6, 6, 6, 6]}
                barSize={20}
                animationDuration={1000}
              >
                {analysis.points.map((p, i) => {
                  const fill = getBarColor(p)
                  return <Cell key={`${p.label}-${i}`} fill={fill} />
                })}
              </Bar>
            </BarChart>
          ) : (
            <div className="muted" style={{ textAlign: 'center', paddingTop: 90, fontSize: 13, fontWeight: 800 }}>
              暂无足够快照数据
            </div>
          )}
        </motion.div>

        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 24 }}>
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
      </motion.div>
    </div>
  )
}
