import { motion } from 'framer-motion'
import { PillTabs } from '../../components/PillTabs'
import { EmptyState } from '../../components/EmptyState'
import { formatCny } from '../../lib/format'
import type { StatsRangeId, StatsRangeView } from '../../lib/snapshotDerived'
import type { ThemeColors } from '../../lib/themes'
import { fadeUpAnimate, fadeUpInitial, cardEntranceTransition, screenTransition } from '../../lib/motionPresets'
import {
  debtDeltaTone,
  formatCompactDateRange,
  formatDelta,
  formatNetChangePaceSource,
  formatPct,
  formatShortGoalDate,
} from './statsFormat'
import { GlowCard, MetricGrid, MetricTile, SubsectionLabel } from './statsUi'
import { Sparkline } from './Sparkline'

const RANGE_OPTIONS: Array<{ value: StatsRangeId; label: string }> = [
  { value: '5w', label: '5周' },
  { value: '6m', label: '6月' },
  { value: '1y', label: '1年' },
  { value: '4y', label: '4年' },
]

export function RangeTrendSection(props: {
  view: StatsRangeView | null
  range: StatsRangeId
  onRangeChange: (range: StatsRangeId) => void
  colors: ThemeColors
}) {
  const { view, range, onRangeChange, colors } = props

  const headerSub = !view
    ? '记录第一条快照后开始统计'
    : view.rangeFallback
      ? view.selectedCount >= 2
        ? `所选区间不足 2 条快照，已显示全部：${formatCompactDateRange(view.start.date, view.end.date)} · ${view.selectedCount}条`
        : '所选区间不足 2 条快照，已显示全部记录'
      : view.selectedCount >= 2
        ? `${formatCompactDateRange(view.start.date, view.end.date)} · ${view.selectedCount}条快照${view.days != null ? ` · 跨度${view.days}天` : ''}`
        : `${formatShortGoalDate(view.end.date, [view.start.date])} · 仅 1 条快照`

  return (
    <>
      <motion.div
        className="iosStatsRangeHeader"
        initial={fadeUpInitial}
        animate={fadeUpAnimate}
        transition={cardEntranceTransition}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ minWidth: 0, flex: '1 1 160px' }}>
            <div style={{ fontSize: 12, fontWeight: 800 }}>区间趋势</div>
            <div className="muted" style={{ marginTop: 4, fontSize: 12, fontWeight: 600 }}>{headerSub}</div>
          </div>
          <div style={{ flex: '0 0 auto' }}>
            <PillTabs ariaLabel="asset stats range" options={RANGE_OPTIONS} value={range} onChange={onRangeChange} />
          </div>
        </div>
      </motion.div>

      {!view ? (
        <EmptyState
          variant="trend"
          title="暂无快照数据"
          hint="记录第一条余额后，这里会展示区间内的变化"
          paddingTop={14}
          paddingBottom={14}
        />
      ) : view.selectedCount < 2 ? (
        <GlowCard>
          <div className="muted" style={{ fontSize: 12, fontWeight: 700 }}>当前净资产</div>
          <div style={{ fontSize: 24, fontWeight: 800, marginTop: 4, overflowWrap: 'anywhere' }}>{formatCny(view.end.net)}</div>
          <div className="muted" style={{ fontSize: 12, fontWeight: 600, marginTop: 6 }}>
            再记录一条快照，就能比较区间内的变化和增长节奏。
          </div>
        </GlowCard>
      ) : (
        <GlowCard>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-end' }}>
            <div style={{ minWidth: 0 }}>
              <div className="muted" style={{ fontSize: 12, fontWeight: 700 }}>净资产变化</div>
              <motion.div
                key={`${view.start.date}-${view.end.date}-${view.delta.net}`}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={screenTransition}
                style={{ fontSize: 26, fontWeight: 800, marginTop: 4, overflowWrap: 'anywhere' }}
              >
                {formatDelta(view.delta.net)}
              </motion.div>
            </div>
            {view.growth.net != null ? (
              <div
                style={{
                  flex: '0 0 auto',
                  borderRadius: 999,
                  padding: '6px 10px',
                  background: 'rgb(255 255 255 / 0.84)',
                  border: '1px solid rgba(15, 23, 42, 0.06)',
                  fontSize: 12,
                  fontWeight: 800,
                  color: view.delta.net >= 0 ? colors.invest : '#ef4444',
                }}
              >
                {view.delta.net >= 0 ? '+' : ''}{formatPct(view.growth.net)}
              </div>
            ) : null}
          </div>

          <div style={{ marginTop: 12 }}>
            <Sparkline
              points={view.series.map((snapshot) => ({ date: snapshot.date, value: snapshot.net }))}
              color={colors.invest}
              height={76}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginTop: 8, fontSize: 11, fontWeight: 650 }}>
              <span className="muted" style={{ minWidth: 0 }}>
                {formatShortGoalDate(view.start.date, [view.end.date])} · {formatCny(view.start.net)}
              </span>
              <span style={{ textAlign: 'right', minWidth: 0 }}>
                {formatShortGoalDate(view.end.date, [view.start.date])} · {formatCny(view.end.net)}
              </span>
            </div>
          </div>

          <SubsectionLabel>构成与负债变化</SubsectionLabel>
          <MetricGrid marginTop={10}>
            <MetricTile
              compact
              label="总资产"
              value={formatDelta(view.delta.assets)}
              sub={view.growth.assets != null ? `增长率 ${formatPct(view.growth.assets)}` : view.assetsStart > 0 ? undefined : '起始资产≤0，未计算增长'}
            />
            <MetricTile
              compact
              label="负债"
              value={formatDelta(view.delta.debt)}
              valueColor={debtDeltaTone(view.delta.debt)}
              sub={view.growth.debt != null ? `增长率 ${formatPct(view.growth.debt)}` : view.start.debt > 0 ? undefined : '起始无负债'}
            />
            <MetricTile compact label="流动资金" value={formatDelta(view.delta.cash)} valueColor={colors.liquid} />
            <MetricTile compact label="投资" value={formatDelta(view.delta.invest)} valueColor={colors.invest} />
            <MetricTile compact label="固定资产" value={formatDelta(view.delta.fixed)} valueColor={colors.fixed} />
            <MetricTile compact label="应收款" value={formatDelta(view.delta.receivable)} valueColor={colors.receivable} />
          </MetricGrid>

          <SubsectionLabel>增长节奏</SubsectionLabel>
          <MetricGrid marginTop={10}>
            <MetricTile
              compact
              label="日均净资产变化"
              value={view.growth.avgDailyNet != null ? formatDelta(view.growth.avgDailyNet) : '—'}
              sub={formatNetChangePaceSource(view.netPace)}
            />
            <MetricTile
              compact
              label="快照数量"
              value={`${view.selectedCount}条`}
              sub={view.rangeFallback ? '所选区间不足，已用全部' : view.days != null ? `跨度 ${view.days} 天` : undefined}
            />
          </MetricGrid>
        </GlowCard>
      )}
    </>
  )
}
