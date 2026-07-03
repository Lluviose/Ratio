import { motion } from 'framer-motion'
import { ShieldCheck } from 'lucide-react'
import { formatCny } from '../../lib/format'
import { allocateIntegerPercents } from '../../lib/percent'
import { progressFillTransition } from '../../lib/motionPresets'
import type { CurrentSnapshotStats } from '../../lib/snapshotDerived'
import { safeRatio } from '../../lib/snapshotDerived'
import type { ThemeColors } from '../../lib/themes'
import { TONE, formatPct, formatShortGoalDate, formatX } from './statsFormat'
import { GlowCard, MetricGrid, MetricTile, SubsectionLabel } from './statsUi'

type CompositionSegmentId = 'liquid' | 'invest' | 'fixed' | 'receivable'

const COMPOSITION_META: Array<{ id: CompositionSegmentId; label: string }> = [
  { id: 'liquid', label: '流动资金' },
  { id: 'invest', label: '投资' },
  { id: 'fixed', label: '固定资产' },
  { id: 'receivable', label: '应收款' },
]

function debtToAssetsTone(ratio: number | null) {
  if (ratio == null || !Number.isFinite(ratio)) return undefined
  if (ratio > 0.6) return TONE.bad
  if (ratio > 0.4) return TONE.warn
  return undefined
}

function coverageTone(ratio: number | null) {
  if (ratio == null) return undefined
  if (!Number.isFinite(ratio)) return undefined
  return ratio < 1 ? TONE.bad : TONE.good
}

export function SnapshotInsightCard(props: { stats: CurrentSnapshotStats; colors: ThemeColors }) {
  const { stats, colors } = props
  const { snapshot } = stats
  const hasDebt = snapshot.debt > 0

  const amounts: Record<CompositionSegmentId, number> = {
    liquid: Math.max(0, snapshot.cash),
    invest: Math.max(0, snapshot.invest),
    fixed: Math.max(0, snapshot.fixed),
    receivable: Math.max(0, snapshot.receivable),
  }
  const compositionTotal = amounts.liquid + amounts.invest + amounts.fixed + amounts.receivable
  const percents = allocateIntegerPercents(
    COMPOSITION_META.map((meta) => ({ id: meta.id, amount: amounts[meta.id] })),
  )
  const segments = COMPOSITION_META
    .map((meta) => ({ ...meta, amount: amounts[meta.id], pct: percents[meta.id] ?? 0 }))
    .filter((segment) => segment.amount > 0)
  const liquidShare = stats.assets > 0 ? safeRatio(stats.currentAssets, stats.assets) : null

  return (
    <GlowCard>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'baseline' }}>
        <div style={{ fontWeight: 800, fontSize: 14 }}>资产结构</div>
        <div className="muted" style={{ fontSize: 11, fontWeight: 650, flex: '0 0 auto' }}>
          最新快照 · {formatShortGoalDate(snapshot.date)}
        </div>
      </div>

      <div style={{ marginTop: 12, display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0 }}>
          <div className="muted" style={{ fontSize: 11, fontWeight: 700 }}>总资产</div>
          <div style={{ fontSize: 22, fontWeight: 800, marginTop: 3, overflowWrap: 'anywhere' }}>{formatCny(stats.assets)}</div>
        </div>
        <div style={{ flex: '0 0 auto', textAlign: 'right', fontSize: 12, fontWeight: 650 }}>
          <div>
            <span className="muted">净资产 </span>
            <span style={{ fontWeight: 800 }}>{formatCny(snapshot.net)}</span>
          </div>
          <div style={{ marginTop: 3 }}>
            <span className="muted">负债 </span>
            <span style={{ fontWeight: 800, color: hasDebt ? TONE.bad : undefined }}>{formatCny(snapshot.debt)}</span>
          </div>
        </div>
      </div>

      {compositionTotal > 0 && segments.length > 0 ? (
        <div style={{ marginTop: 12, display: 'grid', gap: 10 }}>
          <motion.div
            initial={{ scaleX: 0, opacity: 0.4 }}
            animate={{ scaleX: 1, opacity: 1 }}
            transition={progressFillTransition}
            style={{
              display: 'flex',
              height: 14,
              borderRadius: 999,
              overflow: 'hidden',
              background: 'rgba(100,116,139,0.14)',
              transformOrigin: 'left center',
            }}
          >
            {segments.map((segment) => (
              <div
                key={segment.id}
                style={{
                  flexGrow: segment.amount,
                  flexBasis: 0,
                  height: '100%',
                  background: colors[segment.id],
                  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.25)',
                }}
              />
            ))}
          </motion.div>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: '6px 12px' }}>
            {segments.map((segment) => (
              <div key={segment.id} style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0, fontSize: 11, fontWeight: 650 }}>
                <span style={{ width: 8, height: 8, borderRadius: 999, background: colors[segment.id], flex: '0 0 auto' }} />
                <span className="muted" style={{ flex: '0 0 auto' }}>{segment.label}</span>
                <span style={{ marginLeft: 'auto', textAlign: 'right', overflowWrap: 'anywhere' }}>
                  {formatCny(segment.amount)}
                  <span className="muted" style={{ marginLeft: 4 }}>{segment.pct}%</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="muted" style={{ marginTop: 12, fontSize: 12, fontWeight: 600 }}>
          最新快照没有正资产，记录账户余额后展示构成。
        </div>
      )}

      <SubsectionLabel>安全垫与杠杆</SubsectionLabel>
      {hasDebt ? (
        <MetricGrid marginTop={10}>
          <MetricTile
            compact
            label="资产负债率"
            value={formatPct(stats.ratios.debtToAssets)}
            valueColor={debtToAssetsTone(stats.ratios.debtToAssets)}
            sub="负债 / 总资产"
          />
          <MetricTile
            compact
            label="净流动资产"
            value={formatCny(stats.netLiquid)}
            valueColor={stats.netLiquid < 0 ? TONE.bad : undefined}
            sub="流动资产 − 负债"
          />
          <MetricTile
            compact
            label="流动比"
            value={formatX(stats.coverage.current)}
            valueColor={coverageTone(stats.coverage.current)}
            sub="流动资产 / 负债"
          />
          <MetricTile
            compact
            label="速动比"
            value={formatX(stats.coverage.quick)}
            valueColor={coverageTone(stats.coverage.quick)}
            sub="(现金+投资) / 负债"
          />
          <MetricTile
            compact
            label="现金覆盖"
            value={formatX(stats.coverage.cash)}
            valueColor={coverageTone(stats.coverage.cash)}
            sub="现金 / 负债"
          />
          <MetricTile
            compact
            label="净资产率"
            value={formatPct(stats.ratios.netToAssets)}
            sub="净资产 / 总资产"
          />
        </MetricGrid>
      ) : (
        <>
          <div
            style={{
              marginTop: 10,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              fontSize: 12,
              fontWeight: 700,
              color: TONE.good,
            }}
          >
            <ShieldCheck size={15} strokeWidth={2.6} />
            当前无负债，资产即净资产
          </div>
          <MetricGrid marginTop={10}>
            <MetricTile
              compact
              label="流动资产占比"
              value={formatPct(liquidShare)}
              sub="流动+投资+应收 / 总资产"
            />
            <MetricTile
              compact
              label="可随时动用"
              value={formatCny(snapshot.cash)}
              sub="现金类资产"
            />
          </MetricGrid>
        </>
      )}
    </GlowCard>
  )
}
