import { useState } from 'react'
import { motion } from 'framer-motion'
import { Pencil, Target } from 'lucide-react'
import { formatCny } from '../../lib/format'
import { normalizeMoney } from '../../lib/money'
import { DAYS_PER_MONTH, type SavingsGoal, type SavingsGoalSummary } from '../../lib/savingsGoal'
import { progressFillTransition, screenTransition } from '../../lib/motionPresets'
import {
  TONE,
  clampProgress,
  formatDelta,
  formatShortGoalDate,
  formatSummaryPaceSource,
  insetPanelStyle,
} from './statsFormat'
import { ExplainPanel, ExplainTerm, GlowCard, HeaderBadge, InfoDot, MetricGrid, MetricTile, StatusChip } from './statsUi'
import { GOAL_MILESTONES, getNextGoalMilestone } from './useMilestoneCelebration'

function GoalProgressTrack(props: { progress: number; color: string }) {
  const { progress, color } = props
  const progressPct = `${Math.round(progress * 1000) / 10}%`

  return (
    <div style={{ position: 'relative', height: 12 }}>
      <div style={{ position: 'absolute', inset: 0, borderRadius: 999, background: 'rgba(100,116,139,0.14)', overflow: 'hidden' }}>
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: progressPct }}
          transition={{ ...progressFillTransition, duration: 0.55 }}
          style={{ height: '100%', borderRadius: 999, background: color, boxShadow: `0 0 12px -3px ${color}` }}
        />
      </div>
      <motion.span
        aria-hidden="true"
        initial={{ opacity: 0, scale: 0.7 }}
        animate={{ opacity: 1, scale: [0.9, 1.18, 1] }}
        transition={progressFillTransition}
        style={{
          position: 'absolute',
          top: 1,
          left: progressPct,
          width: 10,
          height: 10,
          borderRadius: 999,
          background: 'var(--surface-elevated)',
          border: `2px solid ${color}`,
          marginLeft: -5,
          boxShadow: `0 1px 4px rgba(15, 23, 42, 0.18), 0 0 8px -2px ${color}`,
        }}
      />
      {GOAL_MILESTONES.filter((milestone) => milestone < 1).map((milestone) => (
        <motion.span
          key={milestone}
          initial={{ scale: 0.82, opacity: 0.7 }}
          animate={{
            scale: progress >= milestone - 0.0001 ? [1, 1.65, 1] : 1,
            opacity: progress >= milestone - 0.0001 ? 1 : 0.7,
          }}
          transition={{ duration: 0.42, delay: progress >= milestone - 0.0001 ? 0.12 : 0, ease: [0.16, 1, 0.3, 1] }}
          style={{
            position: 'absolute',
            top: 2,
            bottom: 2,
            left: `${milestone * 100}%`,
            width: 2,
            borderRadius: 999,
            marginLeft: -1,
            background: 'rgb(255 255 255 / 0.78)',
          }}
        />
      ))}
    </div>
  )
}

export function SavingsOverviewCard(props: {
  goal: SavingsGoal | null
  summary: SavingsGoalSummary | null
  latestNetWorth: number
  snapshotCount: number
  color: string
  onEdit: () => void
}) {
  const { goal, summary, latestNetWorth, snapshotCount, color, onEdit } = props
  const [explainOpen, setExplainOpen] = useState(false)

  if (!goal || !summary) {
    return (
      <GlowCard color={color} glowOpacity={0.08}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <HeaderBadge color={color}>
            <Target size={18} strokeWidth={2.7} />
          </HeaderBadge>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontWeight: 800, fontSize: 15 }}>储蓄目标</div>
            <div className="muted" style={{ fontSize: 11, fontWeight: 650, marginTop: 2 }}>
              设置净资产目标，追踪进度与预计达成时间
            </div>
          </div>
        </div>
        <div className="muted" style={{ fontSize: 12, fontWeight: 700, marginTop: 14 }}>当前净资产</div>
        <div style={{ fontSize: 30, fontWeight: 800, marginTop: 4, letterSpacing: 0, overflowWrap: 'anywhere' }}>
          {formatCny(latestNetWorth)}
        </div>
        <div className="muted" style={{ fontSize: 12, fontWeight: 650, marginTop: 6 }}>
          已记录 {snapshotCount} 条快照 · 目标按净资产计算，设置后趋势页会显示目标路径
        </div>
        <button type="button" className="primaryBtn" style={{ marginTop: 14 }} onClick={onEdit}>
          设置目标
        </button>
      </GlowCard>
    )
  }

  const progress = clampProgress(summary.progress)
  const periodRemaining = summary.currentPeriodRemaining
  const periodDelta = summary.currentPeriodDelta
  const milestone = getNextGoalMilestone(summary)

  const statusText = summary.isComplete
    ? '目标已达成'
    : summary.isPastDue
      ? '目标已逾期'
      : summary.isDueToday
        ? '今日到期'
        : summary.currentPeriodIsOnTrack === true
          ? '本期达标'
          : summary.currentPeriodIsOnTrack === false
            ? '本期落后'
            : '等待更多快照'
  const statusTone = summary.isComplete || summary.currentPeriodIsOnTrack === true
    ? TONE.good
    : summary.isPastDue || summary.isDueToday || summary.currentPeriodIsOnTrack === false
      ? TONE.bad
      : 'var(--muted-text)'

  const goalDateContext = [summary.startDate, summary.latestDate, summary.targetDate, summary.projectedDate]
  const periodDateContext = [summary.currentPeriodStartDate, summary.currentPeriodEndDate, summary.startDate, summary.targetDate]

  const daysLeftText = summary.isPastDue
    ? '已逾期'
    : summary.isDueToday
      ? '今天到期'
      : summary.daysLeft != null
        ? `剩 ${summary.daysLeft} 天`
        : ''
  const headerSub = `目标日 ${formatShortGoalDate(summary.targetDate, goalDateContext)}${daysLeftText ? ` · ${daysLeftText}` : ''}`

  const heroSub = summary.isComplete
    ? '目标已覆盖'
    : `距目标还差 ${formatCny(summary.remaining)}`
  const latestText = summary.latestDate ? ` · 截至 ${formatShortGoalDate(summary.latestDate, goalDateContext)}` : ''

  const periodAction = summary.isComplete
    ? { label: '目标状态', value: '已达成', tone: TONE.good }
    : summary.isPastDue || summary.isDueToday
      ? { label: summary.isDueToday ? '今日到期缺口' : '目标缺口', value: formatCny(summary.remaining), tone: TONE.bad }
      : periodRemaining == null
        ? { label: '本期还需存入', value: '—', tone: 'var(--muted-text)' }
        : periodRemaining > 0
          ? { label: '本期还需存入', value: formatCny(periodRemaining), tone: TONE.bad }
          : { label: '本期已达标', value: formatDelta(Math.abs(periodDelta ?? 0)), tone: TONE.good }

  const periodProgressSub = summary.currentPeriodTarget == null
    ? '等待目标路径'
    : `已增 ${formatDelta(summary.currentPeriodActual)} / 本期目标 ${formatCny(summary.currentPeriodTarget)}`
  const paceDeltaDisplay = summary.isComplete
    ? { label: '目标状态', value: '已达成', tone: TONE.good, sub: '目标已覆盖' }
    : summary.isPastDue || summary.isDueToday
      ? { label: '目标缺口', value: formatCny(summary.remaining), tone: TONE.bad, sub: summary.isDueToday ? '今天到期' : '目标已逾期' }
      : periodDelta == null
        ? { label: '本期进度', value: '—', tone: undefined, sub: periodProgressSub }
        : periodDelta === 0
          ? { label: '本期进度', value: '按计划', tone: 'var(--text)', sub: periodProgressSub }
          : periodDelta > 0
            ? { label: '本期超出', value: formatDelta(periodDelta), tone: TONE.good, sub: periodProgressSub }
            : { label: '本期落后', value: `还差 ${formatCny(Math.abs(periodDelta))}`, tone: TONE.bad, sub: periodProgressSub }

  const gainedSinceStart = normalizeMoney(summary.currentNetWorth - summary.startNetWorth)
  const gainedTone = gainedSinceStart === 0 ? 'var(--text)' : gainedSinceStart > 0 ? color : TONE.bad
  const monthlyPace = summary.avgDailyNetChange == null ? null : normalizeMoney(summary.avgDailyNetChange * DAYS_PER_MONTH)
  const monthlyPaceSub = summary.isComplete
    ? '目标已覆盖'
    : summary.requiredMonthly != null
      ? `达标需 ${formatCny(summary.requiredMonthly)}/月`
      : formatSummaryPaceSource(summary)

  const progressPctText = `${Math.round(progress * 100)}%`
  const milestoneCaption = !milestone
    ? null
    : summary.isComplete
      ? '目标已完成，继续保持！'
      : milestone.amountLeft <= 0
        ? `已到达 ${milestone.pct}% 里程碑`
        : `下一里程碑 ${milestone.pct}% · 再存 ${formatCny(milestone.amountLeft)}`

  const periodStartLabel = formatShortGoalDate(summary.currentPeriodStartDate, periodDateContext)
  const periodEndLabel = summary.currentPeriodEndDate ? formatShortGoalDate(summary.currentPeriodEndDate, periodDateContext) : '目标已结束'
  const currentLabel = summary.latestDate ? formatShortGoalDate(summary.latestDate, periodDateContext) : '当前'
  const periodExplain = summary.currentPeriodTargetNetWorth == null
    ? null
    : {
        startLabel: periodStartLabel,
        endLabel: periodEndLabel,
        currentLabel,
        targetNetWorth: summary.currentPeriodTargetNetWorth,
        targetIncrease: normalizeMoney(summary.currentPeriodTargetNetWorth - summary.currentPeriodStartNetWorth),
        periodTarget: summary.currentPeriodTarget ?? 0,
        actual: summary.currentPeriodActual,
        remaining: periodRemaining ?? 0,
      }

  return (
    <GlowCard color={color} glowOpacity={summary.isComplete || summary.currentPeriodIsOnTrack === true ? 0.14 : 0.08}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <HeaderBadge color={color}>
            <Target size={18} strokeWidth={2.7} />
          </HeaderBadge>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 800, fontSize: 15 }}>储蓄目标</div>
            <div className="muted" style={{ fontSize: 11, fontWeight: 650, marginTop: 2, overflowWrap: 'anywhere' }}>{headerSub}</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: '0 0 auto' }}>
          <StatusChip text={statusText} tone={statusTone} />
          <button type="button" className="iconBtn" onClick={onEdit} aria-label="edit savings goal" style={{ width: 34, height: 34 }}>
            <Pencil size={15} strokeWidth={2.5} />
          </button>
        </div>
      </div>

      <div className="muted" style={{ fontSize: 12, fontWeight: 700, marginTop: 12 }}>当前净资产</div>
      <motion.div
        key={formatCny(summary.currentNetWorth)}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={screenTransition}
        style={{ fontSize: 31, fontWeight: 800, marginTop: 4, letterSpacing: 0, overflowWrap: 'normal', wordBreak: 'keep-all' }}
      >
        {formatCny(summary.currentNetWorth)}
      </motion.div>
      <div className="muted" style={{ fontSize: 12, fontWeight: 650, marginTop: 5 }}>
        {heroSub}
        {latestText}
      </div>

      <div
        style={{
          ...insetPanelStyle,
          marginTop: 12,
          padding: '10px 12px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 12,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <div style={{ width: 8, height: 8, borderRadius: 999, background: periodAction.tone, flex: '0 0 auto' }} />
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted-text)' }}>{periodAction.label}</div>
          {periodExplain ? (
            <InfoDot
              open={explainOpen}
              onToggle={() => setExplainOpen((open) => !open)}
              controls="savings-period-explain"
              label="查看本期储蓄状态计算"
              size={22}
            />
          ) : null}
        </div>
        <div style={{ fontSize: 15, fontWeight: 800, color: periodAction.tone, textAlign: 'right', overflowWrap: 'anywhere' }}>
          {periodAction.value}
        </div>
      </div>

      {periodExplain ? (
        <ExplainPanel id="savings-period-explain" open={explainOpen}>
          <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--text)' }}>
            {periodExplain.startLabel} 到 {periodExplain.endLabel}
          </div>
          <div>这是当前月度周期；周期终点取下一个月度开始日和目标日里更早的日期。</div>
          <div>
            <ExplainTerm>总目标路径</ExplainTerm>：{formatShortGoalDate(summary.startDate, periodDateContext)} 从 {formatCny(summary.startNetWorth)} 出发，到 {formatShortGoalDate(summary.targetDate, periodDateContext)} 达到 {formatCny(summary.targetAmount)}，中间按天平均推进。
          </div>
          <div>本期起点：{periodExplain.startLabel} 的净资产按 {formatCny(summary.currentPeriodStartNetWorth)} 计算。</div>
          <div>本期期末应达到：{periodExplain.endLabel} 的目标净资产是 {formatCny(periodExplain.targetNetWorth)}。</div>
          {periodExplain.targetIncrease <= 0 ? (
            <div>本期应增加：期初净资产已经高于本期期末要求，所以本期目标按 ¥0 计算。</div>
          ) : (
            <div>本期应增加：{formatCny(periodExplain.targetNetWorth)} - {formatCny(summary.currentPeriodStartNetWorth)} = {formatCny(periodExplain.periodTarget)}。</div>
          )}
          <div>当前已增加：{formatCny(summary.currentNetWorth)} - {formatCny(summary.currentPeriodStartNetWorth)} = {formatDelta(periodExplain.actual)}（截至 {periodExplain.currentLabel}）。</div>
          <div>
            本期还需：{periodExplain.remaining > 0
              ? `${formatCny(periodExplain.targetNetWorth)} - ${formatCny(summary.currentNetWorth)} = ${formatCny(periodExplain.remaining)}`
              : '当前净资产已达到本期期末要求。'}
          </div>
        </ExplainPanel>
      ) : null}

      <div style={{ marginTop: 14, display: 'grid', gap: 8 }}>
        <GoalProgressTrack progress={progress} color={color} />
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 11, fontWeight: 650 }}>
          <span className="muted">目标 {formatCny(summary.targetAmount)}</span>
          <span style={{ color }}>{progressPctText}</span>
        </div>
        {milestoneCaption ? (
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 11, fontWeight: 650, flexWrap: 'wrap' }}>
            <span className="muted" style={{ minWidth: 0, flex: '1 1 176px' }}>{milestoneCaption}</span>
            <span style={{ color: 'var(--muted-text)', flex: '0 0 auto' }}>
              {GOAL_MILESTONES.map((m) => `${Math.round(m * 100)}%`).join(' · ')}
            </span>
          </div>
        ) : null}
      </div>

      <MetricGrid marginTop={14}>
        <MetricTile compact label={paceDeltaDisplay.label} value={paceDeltaDisplay.value} valueColor={paceDeltaDisplay.tone} sub={paceDeltaDisplay.sub} />
        <MetricTile
          compact
          label="预计达成"
          value={summary.isComplete ? '已达成' : summary.projectedDate ? formatShortGoalDate(summary.projectedDate, goalDateContext) : '暂无预测'}
          sub={summary.avgDailyNetChange != null ? formatSummaryPaceSource(summary) : '等待更多快照'}
        />
        <MetricTile
          compact
          label="起点以来"
          value={formatDelta(gainedSinceStart)}
          valueColor={gainedTone}
          sub={`起点 ${formatShortGoalDate(summary.startDate, goalDateContext)} · ${formatCny(summary.startNetWorth)}`}
        />
        <MetricTile
          compact
          label="平均月增"
          value={monthlyPace == null ? '—' : `${formatDelta(monthlyPace)}/月`}
          valueColor={monthlyPace == null ? 'var(--muted-text)' : monthlyPace >= 0 ? 'var(--text)' : TONE.bad}
          sub={monthlyPaceSub}
        />
      </MetricGrid>
    </GlowCard>
  )
}
