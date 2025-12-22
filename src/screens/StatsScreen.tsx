import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { PillTabs } from '../components/PillTabs'
import { formatCny } from '../lib/format'
import type { ThemeColors } from '../lib/themes'
import type { Snapshot } from '../lib/snapshots'

type RangeId = '5w' | '6m' | '1y' | '4y'

function toDateKey(d: Date) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function dateKeyToUtcDays(dateKey: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey)
  if (!m) return null
  const year = Number(m[1])
  const month = Number(m[2]) - 1
  const day = Number(m[3])
  if (![year, month, day].every((v) => Number.isFinite(v))) return null
  return Math.floor(Date.UTC(year, month, day) / 86400000)
}

function diffDays(startDateKey: string, endDateKey: string): number | null {
  const start = dateKeyToUtcDays(startDateKey)
  const end = dateKeyToUtcDays(endDateKey)
  if (start == null || end == null) return null
  return Math.max(0, end - start)
}

function sumAssets(s: Snapshot) {
  return s.cash + s.invest + s.fixed + s.receivable
}

function safeDiv(numerator: number, denominator: number): number | null {
  if (![numerator, denominator].every((v) => Number.isFinite(v))) return null
  if (denominator === 0) return numerator === 0 ? 0 : Infinity
  return numerator / denominator
}

function safeGrowth(delta: number, base: number): number | null {
  if (![delta, base].every((v) => Number.isFinite(v))) return null
  if (base <= 0) return null
  return delta / base
}

function formatPct(value: number | null) {
  if (value == null || !Number.isFinite(value)) return '—'
  return `${Math.round(value * 100)}%`
}

function formatX(value: number | null) {
  if (value == null) return '—'
  if (!Number.isFinite(value)) return '∞'
  return `${value.toFixed(2)}x`
}

function formatDelta(value: number) {
  const abs = Math.abs(value)
  const text = formatCny(abs)
  if (value > 0) return `+${text}`
  if (value < 0) return `-${text}`
  return text
}

function MetricTile(props: {
  label: string
  value: string
  sub?: string
  valueColor?: string
}) {
  const { label, value, sub, valueColor } = props
  return (
    <div style={{ border: '1px solid var(--hairline)', borderRadius: 18, padding: 12, background: 'var(--card)' }}>
      <div style={{ fontSize: 11, fontWeight: 900, color: 'var(--muted-text)' }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 950, marginTop: 4, color: valueColor ?? 'var(--text)' }}>{value}</div>
      {sub ? <div style={{ fontSize: 11, fontWeight: 850, marginTop: 4, color: 'var(--muted-text)' }}>{sub}</div> : null}
    </div>
  )
}

export function StatsScreen(props: { snapshots: Snapshot[]; colors: ThemeColors }) {
  const { snapshots, colors } = props
  const [range, setRange] = useState<RangeId>('6m')

  const view = useMemo(() => {
    if (!snapshots || snapshots.length === 0) return null

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

    const assetsStart = sumAssets(start)
    const assetsEnd = sumAssets(end)

    const delta = {
      net: end.net - start.net,
      assets: assetsEnd - assetsStart,
      debt: end.debt - start.debt,
      cash: end.cash - start.cash,
      invest: end.invest - start.invest,
      fixed: end.fixed - start.fixed,
      receivable: end.receivable - start.receivable,
    }

    const days = diffDays(start.date, end.date)

    const currentAssets = end.cash + end.invest + end.receivable
    const quickAssets = end.cash + end.invest
    const netLiquid = end.cash - end.debt

    const ratios = {
      debtToAssets: safeDiv(end.debt, assetsEnd),
      netToAssets: safeDiv(end.net, assetsEnd),
      debtToNet: end.net > 0 ? safeDiv(end.debt, end.net) : null,
      equityMultiplier: end.net > 0 ? safeDiv(assetsEnd, end.net) : null,
    }

    const coverage = {
      current: safeDiv(currentAssets, end.debt),
      quick: safeDiv(quickAssets, end.debt),
      cash: safeDiv(end.cash, end.debt),
    }

    const growth = {
      net: safeGrowth(delta.net, start.net),
      assets: safeGrowth(delta.assets, assetsStart),
      debt: safeGrowth(delta.debt, start.debt),
      avgDailyNet: days && days > 0 ? delta.net / days : null,
    }

    return {
      start,
      end,
      selectedCount: selected.length,
      assetsStart,
      assetsEnd,
      currentAssets,
      netLiquid,
      delta,
      days,
      ratios,
      coverage,
      growth,
    }
  }, [colors, range, snapshots])

  return (
    <div className="stack" style={{ padding: '0 16px' }}>
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
        <div className="muted" style={{ marginTop: 8, fontSize: 12, fontWeight: 800, textAlign: 'center', opacity: 0.7 }}>
          {view ? (
            view.selectedCount >= 2 ? (
              <>
                {view.start.date} 至 {view.end.date} · 净资产变化{' '}
                <span style={{ color: 'var(--text)' }}>{formatDelta(view.delta.net)}</span>
              </>
            ) : (
              <>
                {view.end.date} · 净资产 <span style={{ color: 'var(--text)' }}>{formatCny(view.end.net)}</span>
              </>
            )
          ) : (
            <>暂无快照数据</>
          )}
        </div>

        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 12 }}>
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

        {!view ? null : (
          <div className="stack" style={{ marginTop: 12 }}>
            <motion.div
              className="card"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.05 }}
            >
              <div className="cardInner">
                <div style={{ fontWeight: 950, fontSize: 14, marginBottom: 10 }}>资产负债概览</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <MetricTile label="总资产" value={formatCny(view.assetsEnd)} />
                  <MetricTile label="净资产" value={formatCny(view.end.net)} />
                  <MetricTile label="负债" value={formatDelta(-view.end.debt)} />
                  <MetricTile label="资产负债率" value={formatPct(view.ratios.debtToAssets)} />
                </div>
              </div>
            </motion.div>

            <motion.div
              className="card"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.1 }}
            >
              <div className="cardInner">
                <div style={{ fontWeight: 950, fontSize: 14, marginBottom: 10 }}>流动性与杠杆</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <MetricTile label="流动资产" value={formatCny(view.currentAssets)} />
                  <MetricTile label="净流动资产" value={formatCny(view.netLiquid)} />
                  <MetricTile label="流动比" value={formatX(view.coverage.current)} sub="流动资产/负债" />
                  <MetricTile label="速动比" value={formatX(view.coverage.quick)} sub="(现金+投资)/负债" />
                  <MetricTile label="现金覆盖" value={formatX(view.coverage.cash)} sub="现金/负债" />
                  <MetricTile label="负债/净资产" value={formatX(view.ratios.debtToNet)} />
                  <MetricTile label="净资产率" value={formatPct(view.ratios.netToAssets)} />
                  <MetricTile label="权益乘数" value={formatX(view.ratios.equityMultiplier)} />
                </div>
              </div>
            </motion.div>

            <motion.div
              className="card"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.2 }}
            >
              <div className="cardInner">
                <div style={{ fontWeight: 950, fontSize: 14, marginBottom: 10 }}>区间变化</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <MetricTile label="净资产" value={formatDelta(view.delta.net)} />
                  <MetricTile label="总资产" value={formatDelta(view.delta.assets)} />
                  <MetricTile label="负债" value={formatDelta(view.delta.debt)} />
                  <MetricTile label="流动资金" value={formatDelta(view.delta.cash)} valueColor={colors.liquid} />
                  <MetricTile label="投资" value={formatDelta(view.delta.invest)} valueColor={colors.invest} />
                  <MetricTile label="固定资产" value={formatDelta(view.delta.fixed)} valueColor={colors.fixed} />
                  <MetricTile label="应收款" value={formatDelta(view.delta.receivable)} valueColor={colors.receivable} />
                  <MetricTile label="快照数量" value={`${view.selectedCount}条`} sub={view.days != null ? `跨度 ${view.days} 天` : undefined} />
                </div>
              </div>
            </motion.div>

            <motion.div
              className="card"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.25 }}
            >
              <div className="cardInner">
                <div style={{ fontWeight: 950, fontSize: 14, marginBottom: 10 }}>增长与节奏</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <MetricTile label="净资产增长率" value={formatPct(view.growth.net)} sub={view.start.net > 0 ? undefined : '起始净资产≤0，未计算'} />
                  <MetricTile label="总资产增长率" value={formatPct(view.growth.assets)} sub={view.assetsStart > 0 ? undefined : '起始资产≤0，未计算'} />
                  <MetricTile label="负债增长率" value={formatPct(view.growth.debt)} sub={view.start.debt > 0 ? undefined : '起始负债≤0，未计算'} />
                  <MetricTile label="日均净资产变化" value={view.growth.avgDailyNet != null ? formatDelta(view.growth.avgDailyNet) : '—'} />
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </motion.div>
    </div>
  )
}
