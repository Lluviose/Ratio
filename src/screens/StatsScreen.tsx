import { useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { CalendarDays, Pencil, RotateCcw, Sparkles, Target } from 'lucide-react'
import { BottomSheet } from '../components/BottomSheet'
import { PillTabs } from '../components/PillTabs'
import { formatCny } from '../lib/format'
import { addMoney, normalizeMoney, subtractMoney } from '../lib/money'
import {
  SAVINGS_GOAL_KEY,
  addDaysToDateKey,
  coerceSavingsGoal,
  defaultGoalDate,
  diffDateDays,
  getSavingsGoalSummary,
  isDateKey,
  todayDateKey,
  type SavingsGoal,
  type SavingsGoalSummary,
} from '../lib/savingsGoal'
import type { ThemeColors } from '../lib/themes'
import type { Snapshot } from '../lib/snapshots'
import { useLocalStorageState } from '../lib/useLocalStorageState'

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
  return addMoney(addMoney(s.cash, s.invest), addMoney(s.fixed, s.receivable))
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

function formatAbsCny(value: number) {
  return formatCny(Math.abs(value))
}

const GOAL_MILESTONES = [0.25, 0.5, 0.75, 1] as const
const MILESTONE_STORAGE_PREFIX = 'ratio.savingsGoal.maxMilestone.'
const DAYS_PER_MONTH = 30.4375

type GoalMilestoneInfo = {
  progress: number
  pct: number
  amount: number
  amountLeft: number
}

function clampProgress(value: number) {
  return Math.max(0, Math.min(1, value))
}

function getNextGoalMilestone(summary: SavingsGoalSummary): GoalMilestoneInfo | null {
  const totalNeeded = summary.targetAmount - summary.startNetWorth
  if (totalNeeded <= 0) return null

  const currentProgress = clampProgress(summary.progress)
  const nextProgress = summary.isComplete
    ? 1
    : GOAL_MILESTONES.find((milestone) => currentProgress < milestone - 0.0001) ?? 1
  const amount = normalizeMoney(summary.startNetWorth + totalNeeded * nextProgress)

  return {
    progress: nextProgress,
    pct: Math.round(nextProgress * 100),
    amount,
    amountLeft: Math.max(0, normalizeMoney(amount - summary.currentNetWorth)),
  }
}

function getReachedGoalMilestone(progress: number) {
  const safeProgress = clampProgress(progress)
  for (let i = GOAL_MILESTONES.length - 1; i >= 0; i -= 1) {
    const milestone = GOAL_MILESTONES[i]
    if (safeProgress >= milestone - 0.0001) return milestone
  }
  return null
}

function getGoalMilestoneStorageKey(goal: SavingsGoal) {
  return `${MILESTONE_STORAGE_PREFIX}${goal.startDate}.${goal.startNetWorth}.${goal.targetAmount}.${goal.targetDate}`
}

function readSavedGoalMilestone(key: string) {
  try {
    const saved = Number(localStorage.getItem(key) ?? '0')
    return Number.isFinite(saved) ? saved : 0
  } catch {
    return 0
  }
}

function writeSavedGoalMilestone(key: string, milestone: number) {
  try {
    localStorage.setItem(key, String(milestone))
  } catch {
    // Ignore storage failures; the animation can simply replay later.
  }
}

function sortedSnapshots(snapshots: Snapshot[]) {
  return snapshots.slice().sort((a, b) => a.date.localeCompare(b.date))
}

function formatGoalDate(dateKey: string | null | undefined) {
  if (!dateKey) return '未设置'
  const d = new Date(`${dateKey}T00:00:00`)
  if (Number.isNaN(d.getTime())) return dateKey
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`
}

function parseMoneyInput(value: string) {
  const normalized = value.replace(/[,\s￥¥]/g, '')
  const parsed = Number(normalized)
  if (!Number.isFinite(parsed)) return null
  return normalizeMoney(parsed)
}

function formatGoalInputAmount(value: number) {
  const normalized = normalizeMoney(value)
  if (Number.isInteger(normalized)) return String(normalized)
  return normalized.toFixed(2).replace(/\.?0+$/, '')
}

function MetricTile(props: {
  label: string
  value: string
  sub?: string
  valueColor?: string
}) {
  const { label, value, sub, valueColor } = props
  return (
    <div style={{ minWidth: 0, border: '1px solid var(--hairline)', borderRadius: 18, padding: 12, background: 'var(--card)' }}>
      <div style={{ fontSize: 11, fontWeight: 900, color: 'var(--muted-text)', overflowWrap: 'anywhere' }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 950, marginTop: 4, color: valueColor ?? 'var(--text)', overflowWrap: 'anywhere' }}>{value}</div>
      {sub ? <div style={{ fontSize: 11, fontWeight: 850, marginTop: 4, color: 'var(--muted-text)', overflowWrap: 'anywhere' }}>{sub}</div> : null}
    </div>
  )
}

function roundUpMoney(value: number, step: number) {
  if (!Number.isFinite(value) || value <= 0) return step
  return normalizeMoney(Math.ceil(value / step) * step)
}

function getSliderStep(max: number) {
  if (max <= 10000) return 100
  if (max <= 100000) return 500
  return 1000
}

function SavingsStatusCard(props: {
  summary: SavingsGoalSummary | null
  latestNetWorth: number
  rangeDeltaNet: number
  startDate: string
  endDate: string
  selectedCount: number
  color: string
  onEdit: () => void
}) {
  const { summary, latestNetWorth, rangeDeltaNet, startDate, endDate, selectedCount, color, onEdit } = props
  const rangeLabel = selectedCount >= 2 ? `${startDate} 至 ${endDate}` : endDate

  if (!summary) {
    return (
      <motion.div
        className="card"
        initial={{ opacity: 0, y: 12, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
        style={{ overflow: 'hidden', position: 'relative' }}
      >
        <div className="cardInner">
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 900, color: 'var(--muted-text)' }}>今日储蓄状态</div>
              <div style={{ fontSize: 26, fontWeight: 950, marginTop: 6, letterSpacing: 0, overflowWrap: 'anywhere' }}>{formatCny(latestNetWorth)}</div>
              <div className="muted" style={{ fontSize: 12, fontWeight: 850, marginTop: 6 }}>
                设置目标后，这里会显示本周需要存多少和目标节奏。
              </div>
            </div>
            <button type="button" className="iconBtn" onClick={onEdit} aria-label="set savings goal">
              <Target size={18} strokeWidth={2.6} />
            </button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 8, marginTop: 14 }}>
            <MetricTile label="区间净资产" value={formatDelta(rangeDeltaNet)} sub={rangeLabel} />
            <MetricTile label="快照数量" value={`${selectedCount}条`} sub="持续记录后会更准确" />
          </div>
        </div>
      </motion.div>
    )
  }

  const progress = clampProgress(summary.progress)
  const weeklyNeed = summary.requiredDaily == null ? null : normalizeMoney(summary.requiredDaily * 7)
  const targetDelta = summary.targetDeltaAtLatest
  const statusText = summary.isComplete
    ? '目标已达成'
    : summary.isPastDue
      ? '目标已逾期'
      : summary.isDueToday
        ? '今日到期'
        : summary.isOnTrack === true
          ? '跟得上目标'
          : summary.isOnTrack === false
            ? '低于目标节奏'
            : '等待更多快照'
  const statusTone = summary.isComplete || summary.isOnTrack === true
    ? '#10b981'
    : summary.isPastDue || summary.isDueToday || summary.isOnTrack === false
      ? '#ef4444'
      : 'var(--muted-text)'
  const heroLabel = summary.isComplete
    ? '当前净资产'
    : weeklyNeed == null
      ? '距离目标还差'
      : '本周建议存入'
  const heroValue = summary.isComplete
    ? formatCny(summary.currentNetWorth)
    : weeklyNeed == null
      ? formatCny(summary.remaining)
      : formatCny(weeklyNeed)
  const targetDeltaLabel = targetDelta == null || targetDelta >= 0 ? '领先目标' : '落后目标'
  const targetDeltaValue = targetDelta == null ? '—' : formatCny(Math.abs(targetDelta))
  const targetDeltaTone = targetDelta == null ? undefined : targetDelta >= 0 ? '#10b981' : '#ef4444'
  const progressPct = `${Math.round(progress * 1000) / 10}%`

  return (
    <motion.div
      className="card"
      initial={{ opacity: 0, y: 12, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
      style={{ overflow: 'hidden', position: 'relative' }}
    >
      <motion.div
        aria-hidden="true"
        initial={{ opacity: 0 }}
        animate={{ opacity: summary.isComplete || summary.isOnTrack === true ? 0.14 : 0.08 }}
        transition={{ duration: 0.35 }}
        style={{
          position: 'absolute',
          inset: 0,
          background: `linear-gradient(135deg, ${color}, transparent 62%)`,
          pointerEvents: 'none',
        }}
      />
      <div className="cardInner" style={{ position: 'relative' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 900, color: 'var(--muted-text)' }}>今日储蓄状态</div>
            <motion.div
              key={heroValue}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
              style={{ fontSize: 28, fontWeight: 950, marginTop: 6, letterSpacing: 0, overflowWrap: 'anywhere' }}
            >
              {heroValue}
            </motion.div>
            <div className="muted" style={{ fontSize: 12, fontWeight: 850, marginTop: 6 }}>
              {heroLabel} · 距离目标还差 {formatCny(summary.remaining)}
            </div>
          </div>
          <div
            style={{
              flex: '0 0 auto',
              borderRadius: 999,
              padding: '7px 10px',
              background: 'rgb(255 255 255 / 0.72)',
              border: '1px solid var(--hairline)',
              color: statusTone,
              fontSize: 11,
              fontWeight: 950,
            }}
          >
            {statusText}
          </div>
        </div>

        <div style={{ marginTop: 16, display: 'grid', gap: 8 }}>
          <div style={{ height: 10, borderRadius: 999, background: 'rgba(15,23,42,0.08)', overflow: 'hidden' }}>
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: progressPct }}
              transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
              style={{ height: '100%', borderRadius: 999, background: color, boxShadow: `0 0 18px ${color}` }}
            />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 11, fontWeight: 850 }}>
            <span className="muted">目标 {formatCny(summary.targetAmount)}</span>
            <span style={{ color }}>{Math.round(progress * 100)}%</span>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 8, marginTop: 14 }}>
          <MetricTile label={targetDeltaLabel} value={targetDeltaValue} valueColor={targetDeltaTone} sub={summary.latestDate ? `截至 ${formatGoalDate(summary.latestDate)}` : '等待快照'} />
          <MetricTile label="预计达成" value={summary.isComplete ? '已达成' : summary.projectedDate ? formatGoalDate(summary.projectedDate) : '暂无预测'} sub={rangeLabel} />
        </div>
      </div>
    </motion.div>
  )
}

function ProgressRing(props: { progress: number; color: string }) {
  const { progress, color } = props
  const size = 112
  const stroke = 11
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const safeProgress = Math.max(0, Math.min(1, progress))
  const pct = Math.round(safeProgress * 100)

  return (
    <div style={{ width: size, height: size, position: 'relative', flex: '0 0 auto' }}>
      <motion.div
        aria-hidden="true"
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{
          opacity: safeProgress >= 0.75 ? 0.12 : 0.06,
          scale: safeProgress >= 0.75 ? [1, 1.05, 1] : 1,
        }}
        transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
        style={{
          position: 'absolute',
          inset: 10,
          borderRadius: 999,
          background: color,
          filter: 'blur(10px)',
        }}
      />
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgba(15,23,42,0.08)"
          strokeWidth={stroke}
        />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: circumference * (1 - safeProgress) }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          style={{ rotate: -90, transformOrigin: '50% 50%', filter: safeProgress >= 1 ? `drop-shadow(0 0 8px ${color})` : undefined }}
        />
      </svg>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'column',
        }}
      >
        <motion.div
          key={pct}
          initial={{ opacity: 0, y: 5, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
          style={{ fontSize: 24, fontWeight: 950, lineHeight: 1 }}
        >
          {pct}%
        </motion.div>
        <div style={{ fontSize: 10, fontWeight: 900, color: 'var(--muted-text)', marginTop: 4 }}>进度</div>
      </div>
    </div>
  )
}

function SavingsMilestoneStrip(props: { summary: SavingsGoalSummary; color: string }) {
  const { summary, color } = props
  const milestone = getNextGoalMilestone(summary)
  if (!milestone) return null

  const currentProgress = clampProgress(summary.progress)
  const progressPct = `${Math.round(currentProgress * 1000) / 10}%`
  const subtitle = summary.isComplete
    ? '当前目标已完成'
    : milestone.amountLeft <= 0
      ? `已到达 ${milestone.pct}% 里程碑`
      : `再存 ${formatCny(milestone.amountLeft)} 到 ${formatCny(milestone.amount)}`

  return (
    <div style={{ marginTop: 12, display: 'grid', gap: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
        <div style={{ fontSize: 11, fontWeight: 900, color: 'var(--muted-text)' }}>下一里程碑</div>
        <div style={{ fontSize: 11, fontWeight: 950, color }}>{milestone.pct}%</div>
      </div>
      <div
        style={{
          position: 'relative',
          height: 12,
          borderRadius: 999,
          background: 'rgba(15,23,42,0.08)',
          overflow: 'hidden',
        }}
      >
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: progressPct }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          style={{ height: '100%', borderRadius: 999, background: color, boxShadow: `0 0 14px ${color}` }}
        />
        <motion.span
          aria-hidden="true"
          initial={{ opacity: 0, scale: 0.7 }}
          animate={{ opacity: 1, scale: [0.9, 1.18, 1] }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          style={{
            position: 'absolute',
            top: 1,
            left: progressPct,
            width: 10,
            height: 10,
            borderRadius: 999,
            background: '#fff',
            border: `2px solid ${color}`,
            marginLeft: -5,
            boxShadow: `0 0 12px ${color}`,
          }}
        />
        {GOAL_MILESTONES.map((milestone) => (
          <motion.span
            key={milestone}
            initial={{ scale: 0.82, opacity: 0.7 }}
            animate={{
              scale: currentProgress >= milestone - 0.0001 ? [1, 1.65, 1] : 1,
              opacity: currentProgress >= milestone - 0.0001 ? 1 : 0.7,
            }}
            transition={{ duration: 0.42, delay: currentProgress >= milestone - 0.0001 ? 0.12 : 0, ease: [0.16, 1, 0.3, 1] }}
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
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 11, fontWeight: 850 }}>
        <span className="muted">{subtitle}</span>
        <span style={{ color: 'var(--muted-text)' }}>
          {GOAL_MILESTONES.map((milestone) => `${Math.round(milestone * 100)}%`).join(' · ')}
        </span>
      </div>
    </div>
  )
}

function SavingsActionPanel(props: { summary: SavingsGoalSummary; color: string }) {
  const { summary, color } = props

  if (summary.isComplete) {
    return (
      <div style={{ marginTop: 12, borderRadius: 18, padding: 12, background: 'rgb(var(--primary-rgb) / 0.06)', fontSize: 12, fontWeight: 900 }}>
        目标已经完成，可以设置下一阶段目标。
      </div>
    )
  }

  const targetDelta = summary.targetDeltaAtLatest
  const projectedGap = summary.projectedNetAtTargetDate == null
    ? null
    : normalizeMoney(summary.projectedNetAtTargetDate - summary.targetAmount)

  const items = [
    {
      label: '每天需要',
      value: summary.requiredDaily == null ? '—' : formatCny(summary.requiredDaily),
      sub: summary.isPastDue ? '目标已逾期' : summary.isDueToday ? '今日到期' : '从今天起',
    },
    {
      label: '每周需要',
      value: summary.requiredDaily == null ? '—' : formatCny(summary.requiredDaily * 7),
      sub: '按 7 天估算',
    },
    {
      label: targetDelta == null || targetDelta >= 0 ? '领先目标' : '落后目标',
      value: targetDelta == null ? '—' : formatAbsCny(targetDelta),
      sub: summary.latestDate ? `截至 ${formatGoalDate(summary.latestDate)}` : '等待快照',
      tone: targetDelta == null ? 'var(--muted-text)' : targetDelta >= 0 ? '#10b981' : '#ef4444',
    },
    {
      label: projectedGap == null || projectedGap >= 0 ? '目标日余量' : '目标日缺口',
      value: projectedGap == null ? '—' : formatAbsCny(projectedGap),
      sub: summary.projectedNetAtTargetDate == null ? '等待更多快照' : '按当前速度',
      tone: projectedGap == null ? 'var(--muted-text)' : projectedGap >= 0 ? '#10b981' : '#ef4444',
    },
  ]

  return (
    <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 8 }}>
      {items.map((item) => (
        <div key={item.label} style={{ minWidth: 0, border: '1px solid var(--hairline)', borderRadius: 16, padding: 10, background: 'var(--bg)' }}>
          <div style={{ fontSize: 10, fontWeight: 900, color: 'var(--muted-text)' }}>{item.label}</div>
          <div style={{ fontSize: 14, fontWeight: 950, marginTop: 3, color: item.tone ?? color, overflowWrap: 'anywhere' }}>{item.value}</div>
          <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--muted-text)', marginTop: 3 }}>{item.sub}</div>
        </div>
      ))}
    </div>
  )
}

type FeedbackTile = {
  label: string
  value: string
  sub: string
  tone?: string
}

function buildSnapshotFeedback(goal: SavingsGoal, snapshots: Snapshot[], summary: SavingsGoalSummary): { latestDate: string; tiles: FeedbackTile[] } | null {
  const sorted = sortedSnapshots(snapshots)
  if (sorted.length < 2) return null

  const latest = sorted[sorted.length - 1]
  const previous = sorted[sorted.length - 2]
  const previousSummary = getSavingsGoalSummary(goal, sorted.slice(0, -1))
  if (!previousSummary) return null

  const netDelta = normalizeMoney(latest.net - previous.net)
  const targetDistanceChange = normalizeMoney(previousSummary.remaining - summary.remaining)
  const previousMilestone = getNextGoalMilestone(previousSummary)
  const currentMilestone = getNextGoalMilestone(summary)

  let projectionTile: FeedbackTile = {
    label: '预计达成',
    value: summary.projectedDate ? formatGoalDate(summary.projectedDate) : '继续记录',
    sub: '需要更多快照',
    tone: 'var(--muted-text)',
  }
  if (summary.isComplete) {
    projectionTile = { label: '预计达成', value: '已达成', sub: formatGoalDate(latest.date), tone: '#10b981' }
  } else if (previousSummary.projectedDate && summary.projectedDate) {
    const shift = diffDateDays(summary.projectedDate, previousSummary.projectedDate)
    projectionTile = {
      label: '预计达成',
      value: shift == null || shift === 0 ? '日期稳定' : shift > 0 ? `提前 ${shift} 天` : `延后 ${Math.abs(shift)} 天`,
      sub: formatGoalDate(summary.projectedDate),
      tone: shift == null || shift === 0 ? 'var(--text)' : shift > 0 ? '#10b981' : '#ef4444',
    }
  } else if (summary.projectedDate) {
    projectionTile = { label: '预计达成', value: formatGoalDate(summary.projectedDate), sub: '已形成预测', tone: '#10b981' }
  }

  let milestoneTile: FeedbackTile = {
    label: '下一里程碑',
    value: currentMilestone ? `${currentMilestone.pct}%` : '等待目标',
    sub: currentMilestone ? `还差 ${formatCny(currentMilestone.amountLeft)}` : '目标已覆盖当前阶段',
    tone: 'var(--muted-text)',
  }
  if (summary.isComplete) {
    milestoneTile = { label: '下一里程碑', value: '100%', sub: '当前目标已完成', tone: '#10b981' }
  } else if (previousMilestone && currentMilestone) {
    if (previousMilestone.progress !== currentMilestone.progress && summary.progress >= previousMilestone.progress - 0.0001) {
      milestoneTile = {
        label: '下一里程碑',
        value: `越过 ${previousMilestone.pct}%`,
        sub: `下一站 ${currentMilestone.pct}%`,
        tone: '#10b981',
      }
    } else if (previousMilestone.progress === currentMilestone.progress) {
      const distanceDelta = normalizeMoney(previousMilestone.amountLeft - currentMilestone.amountLeft)
      milestoneTile = {
        label: '下一里程碑',
        value: distanceDelta === 0 ? `${currentMilestone.pct}%` : distanceDelta > 0 ? `近了 ${formatCny(distanceDelta)}` : `远了 ${formatCny(Math.abs(distanceDelta))}`,
        sub: `还差 ${formatCny(currentMilestone.amountLeft)}`,
        tone: distanceDelta === 0 ? 'var(--text)' : distanceDelta > 0 ? '#10b981' : '#ef4444',
      }
    }
  }

  return {
    latestDate: latest.date,
    tiles: [
      {
        label: '本次净资产',
        value: formatDelta(netDelta),
        sub: `较 ${formatGoalDate(previous.date)}`,
        tone: netDelta === 0 ? 'var(--text)' : netDelta > 0 ? '#10b981' : '#ef4444',
      },
      {
        label: '距离目标',
        value: targetDistanceChange === 0 ? '保持不变' : targetDistanceChange > 0 ? `近了 ${formatCny(targetDistanceChange)}` : `远了 ${formatCny(Math.abs(targetDistanceChange))}`,
        sub: `还差 ${formatCny(summary.remaining)}`,
        tone: targetDistanceChange === 0 ? 'var(--text)' : targetDistanceChange > 0 ? '#10b981' : '#ef4444',
      },
      projectionTile,
      milestoneTile,
    ],
  }
}

function SnapshotFeedbackCard(props: { feedback: { latestDate: string; tiles: FeedbackTile[] } }) {
  const { feedback } = props

  return (
    <motion.div
      className="card"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="cardInner">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
          <div>
            <div style={{ fontWeight: 950, fontSize: 14 }}>快照反馈</div>
            <div className="muted" style={{ fontSize: 11, fontWeight: 850, marginTop: 3 }}>{formatGoalDate(feedback.latestDate)}</div>
          </div>
          <Sparkles size={18} strokeWidth={2.6} color="var(--primary)" />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 8, marginTop: 12 }}>
          {feedback.tiles.map((tile) => (
            <div key={tile.label} style={{ minWidth: 0, border: '1px solid var(--hairline)', borderRadius: 16, padding: 10, background: 'var(--bg)' }}>
              <div style={{ fontSize: 10, fontWeight: 900, color: 'var(--muted-text)' }}>{tile.label}</div>
              <div style={{ fontSize: 14, fontWeight: 950, marginTop: 3, color: tile.tone ?? 'var(--text)', overflowWrap: 'anywhere' }}>{tile.value}</div>
              <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--muted-text)', marginTop: 3 }}>{tile.sub}</div>
            </div>
          ))}
        </div>
      </div>
    </motion.div>
  )
}

function formatProjectionShift(simulatedDate: string | null, summary: SavingsGoalSummary) {
  if (!simulatedDate) return { text: '暂不可达', sub: '提高月存额后再看', tone: '#ef4444' }

  if (summary.projectedDate) {
    const shift = diffDateDays(simulatedDate, summary.projectedDate)
    if (shift == null || shift === 0) return { text: '预测不变', sub: formatGoalDate(simulatedDate), tone: 'var(--text)' }
    return {
      text: shift > 0 ? `提前 ${shift} 天` : `延后 ${Math.abs(shift)} 天`,
      sub: formatGoalDate(simulatedDate),
      tone: shift > 0 ? '#10b981' : '#ef4444',
    }
  }

  const targetShift = diffDateDays(simulatedDate, summary.targetDate)
  if (targetShift == null || targetShift === 0) return { text: '踩中目标日', sub: formatGoalDate(simulatedDate), tone: '#10b981' }
  return {
    text: targetShift > 0 ? `早 ${targetShift} 天` : `晚 ${Math.abs(targetShift)} 天`,
    sub: formatGoalDate(simulatedDate),
    tone: targetShift > 0 ? '#10b981' : '#ef4444',
  }
}

function SavingsSliderControl(props: {
  label: string
  value: number
  max: number
  step: number
  color: string
  helper: string
  onChange: (value: number) => void
}) {
  const { label, value, max, step, color, helper, onChange } = props
  const safeMax = Math.max(step, max)
  const safeValue = Math.max(0, Math.min(value, safeMax))
  const progress = clampProgress(safeValue / safeMax)
  const progressPct = `${Math.round(progress * 1000) / 10}%`

  return (
    <div style={{ minWidth: 0, border: '1px solid var(--hairline)', borderRadius: 18, padding: 12, background: 'var(--bg)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'baseline' }}>
        <div style={{ fontSize: 11, fontWeight: 900, color: 'var(--muted-text)' }}>{label}</div>
        <div style={{ fontSize: 14, fontWeight: 950, color, overflowWrap: 'anywhere' }}>
          {formatCny(safeValue)}
        </div>
      </div>
      <div style={{ position: 'relative', marginTop: 12, height: 30, display: 'flex', alignItems: 'center' }}>
        <div style={{ position: 'absolute', left: 0, right: 0, height: 8, borderRadius: 999, background: 'rgba(15,23,42,0.08)', overflow: 'hidden' }}>
          <motion.div
            initial={false}
            animate={{ width: progressPct }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            style={{ height: '100%', borderRadius: 999, background: color }}
          />
        </div>
        <input
          className="savingsRange"
          type="range"
          min={0}
          max={safeMax}
          step={step}
          value={safeValue}
          onChange={(e) => onChange(normalizeMoney(Number(e.target.value)))}
          aria-label={label}
          style={{
            position: 'relative',
            width: '100%',
            color,
          }}
        />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 10, fontWeight: 800, color: 'var(--muted-text)' }}>
        <span>{helper}</span>
        <span>最高 {formatCny(safeMax)}</span>
      </div>
    </div>
  )
}

function SavingsGoalSimulatorCard(props: { summary: SavingsGoalSummary; color: string }) {
  const { summary, color } = props
  const [monthlyExtraValue, setMonthlyExtraValue] = useState(0)
  const [oneTimeValue, setOneTimeValue] = useState(0)

  if (summary.isComplete) return null

  const monthlyMax = roundUpMoney(Math.max(5000, summary.remaining / 6, (summary.requiredMonthly ?? 0) * 2), 500)
  const oneTimeMax = roundUpMoney(Math.max(5000, summary.remaining), 1000)
  const monthlyStep = getSliderStep(monthlyMax)
  const oneTimeStep = getSliderStep(oneTimeMax)
  const monthlyExtra = Math.min(Math.max(0, normalizeMoney(monthlyExtraValue)), monthlyMax)
  const oneTime = Math.min(Math.max(0, normalizeMoney(oneTimeValue)), oneTimeMax)
  const baseDate = summary.latestDate ?? todayDateKey()
  const simulatedDaily = normalizeMoney((summary.avgDailyNetChange ?? 0) + monthlyExtra / DAYS_PER_MONTH)
  const remainingAfterBoost = Math.max(0, normalizeMoney(summary.targetAmount - summary.currentNetWorth - oneTime))
  const simulatedDate = remainingAfterBoost <= 0
    ? baseDate
    : simulatedDaily > 0
      ? addDaysToDateKey(baseDate, Math.ceil(remainingAfterBoost / simulatedDaily))
      : null
  const daysToTarget = diffDateDays(baseDate, summary.targetDate)
  const simulatedNetAtTarget = daysToTarget == null || daysToTarget < 0
    ? null
    : normalizeMoney(summary.currentNetWorth + oneTime + simulatedDaily * daysToTarget)
  const targetGap = simulatedNetAtTarget == null ? null : normalizeMoney(simulatedNetAtTarget - summary.targetAmount)
  const shift = formatProjectionShift(simulatedDate, summary)

  const reset = () => {
    setMonthlyExtraValue(0)
    setOneTimeValue(0)
  }

  return (
    <motion.div
      className="card"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="cardInner">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
          <div>
            <div style={{ fontWeight: 950, fontSize: 14 }}>目标模拟器</div>
            <div className="muted" style={{ fontSize: 11, fontWeight: 850, marginTop: 3 }}>基于当前速度</div>
          </div>
          <button type="button" className="iconBtn" onClick={reset} aria-label="reset savings simulator">
            <RotateCcw size={16} strokeWidth={2.5} />
          </button>
        </div>

        <div style={{ display: 'grid', gap: 10, marginTop: 14 }}>
          <SavingsSliderControl
            label="每月多存"
            value={monthlyExtra}
            max={monthlyMax}
            step={monthlyStep}
            color={color}
            helper="影响长期速度"
            onChange={setMonthlyExtraValue}
          />
          <SavingsSliderControl
            label="一次性存入"
            value={oneTime}
            max={oneTimeMax}
            step={oneTimeStep}
            color={color}
            helper="立即缩短距离"
            onChange={setOneTimeValue}
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 8, marginTop: 12 }}>
          <div style={{ minWidth: 0, border: '1px solid var(--hairline)', borderRadius: 16, padding: 10, background: 'var(--bg)' }}>
            <div style={{ fontSize: 10, fontWeight: 900, color: 'var(--muted-text)' }}>模拟达成</div>
            <div style={{ fontSize: 14, fontWeight: 950, marginTop: 3, color: shift.tone, overflowWrap: 'anywhere' }}>
              {simulatedDate ? formatGoalDate(simulatedDate) : '暂不可达'}
            </div>
            <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--muted-text)', marginTop: 3 }}>{shift.text}</div>
          </div>
          <div style={{ minWidth: 0, border: '1px solid var(--hairline)', borderRadius: 16, padding: 10, background: 'var(--bg)' }}>
            <div style={{ fontSize: 10, fontWeight: 900, color: 'var(--muted-text)' }}>{targetGap == null || targetGap >= 0 ? '目标日余量' : '目标日缺口'}</div>
            <div style={{ fontSize: 14, fontWeight: 950, marginTop: 3, color: targetGap == null ? 'var(--muted-text)' : targetGap >= 0 ? '#10b981' : '#ef4444', overflowWrap: 'anywhere' }}>
              {targetGap == null ? '—' : formatAbsCny(targetGap)}
            </div>
            <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--muted-text)', marginTop: 3 }}>{targetGap == null ? '目标日已过' : shift.sub}</div>
          </div>
        </div>

        <div style={{ marginTop: 12, borderRadius: 16, padding: '10px 12px', background: 'rgb(var(--primary-rgb) / 0.06)', display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
          <div style={{ fontSize: 12, fontWeight: 900, color: 'var(--muted-text)' }}>模拟月增速</div>
          <div style={{ fontSize: 12, fontWeight: 950, color }}>{formatDelta(simulatedDaily * DAYS_PER_MONTH)}/月</div>
        </div>
      </div>
    </motion.div>
  )
}

function SavingsMilestoneCelebration(props: { milestone: number; color: string }) {
  const { milestone, color } = props
  const pct = Math.round(milestone * 100)

  return (
    <motion.div
      className="card"
      initial={{ opacity: 0, y: 12, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -8, scale: 0.98 }}
      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      style={{ overflow: 'hidden', position: 'relative' }}
    >
      <div className="cardInner">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <motion.div
            animate={{ rotate: [0, -8, 8, 0], scale: [1, 1.08, 1] }}
            transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
            style={{
              width: 38,
              height: 38,
              borderRadius: 16,
              background: 'rgb(var(--primary-rgb) / 0.12)',
              color,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flex: '0 0 auto',
            }}
          >
            <Sparkles size={19} strokeWidth={2.6} />
          </motion.div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 950, fontSize: 15 }}>达成 {pct}% 里程碑</div>
            <div className="muted" style={{ fontSize: 12, fontWeight: 850, marginTop: 3 }}>储蓄目标又向前推进了一段</div>
          </div>
        </div>
      </div>
      {[0, 1, 2, 3].map((index) => (
        <motion.span
          key={index}
          initial={{ opacity: 0, y: 12, scale: 0.6 }}
          animate={{ opacity: [0, 1, 0], y: [-2, -20 - index * 4], scale: [0.7, 1, 0.8] }}
          transition={{ duration: 1.4, delay: 0.12 + index * 0.1, ease: 'easeOut' }}
          style={{
            position: 'absolute',
            right: 28 + index * 18,
            bottom: 18 + (index % 2) * 12,
            width: 7,
            height: 7,
            borderRadius: 999,
            background: index % 2 === 0 ? color : '#10b981',
          }}
        />
      ))}
    </motion.div>
  )
}

function SavingsGoalCard(props: {
  goal: SavingsGoal | null
  summary: SavingsGoalSummary | null
  color: string
  onEdit: () => void
}) {
  const { goal, summary, color, onEdit } = props

  if (!goal || !summary) {
    return (
      <motion.div
        className="card"
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.02 }}
      >
        <div className="cardInner">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: 16,
                background: 'rgb(var(--primary-rgb) / 0.12)',
                color: 'var(--primary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Target size={20} strokeWidth={2.6} />
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontWeight: 950, fontSize: 15 }}>储蓄目标</div>
              <div className="muted" style={{ marginTop: 3, fontSize: 12, fontWeight: 800 }}>
                设置一个净资产目标，趋势页会显示目标路径。
              </div>
            </div>
          </div>
          <button type="button" className="primaryBtn" style={{ marginTop: 14 }} onClick={onEdit}>
            设置目标
          </button>
        </div>
      </motion.div>
    )
  }

  const statusText = summary.isComplete
    ? '已达成'
    : summary.isPastDue
      ? '已逾期'
      : summary.isDueToday
        ? '今日到期'
        : summary.isOnTrack === true
          ? '节奏正常'
          : summary.isOnTrack === false
            ? '需要提速'
            : '等待更多快照'

  const projectedText = summary.isComplete
    ? '已达成'
    : summary.projectedDate
      ? formatGoalDate(summary.projectedDate)
      : '暂无预测'

  return (
    <motion.div
      className="card"
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: 0.02 }}
    >
      <div className="cardInner">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 15,
                background: 'rgb(var(--primary-rgb) / 0.12)',
                color,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Target size={18} strokeWidth={2.7} />
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 950, fontSize: 15 }}>储蓄目标</div>
              <div className="muted" style={{ fontSize: 11, fontWeight: 850, marginTop: 2 }}>
                目标日 {formatGoalDate(summary.targetDate)}
              </div>
            </div>
          </div>
          <button type="button" className="iconBtn" onClick={onEdit} aria-label="edit savings goal">
            <Pencil size={16} strokeWidth={2.5} />
          </button>
        </div>

        <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginTop: 16 }}>
          <ProgressRing progress={summary.progress} color={color} />
          <div style={{ minWidth: 0, flex: 1 }}>
            <div className="muted" style={{ fontSize: 11, fontWeight: 900 }}>目标净资产</div>
            <div style={{ fontSize: 22, fontWeight: 950, marginTop: 3, overflowWrap: 'anywhere' }}>{formatCny(summary.targetAmount)}</div>
            <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 12, fontWeight: 850 }}>
                <span className="muted">还差</span>
                <span>{formatCny(summary.remaining)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 12, fontWeight: 850 }}>
                <span className="muted">每月需存</span>
                <span>{summary.requiredMonthly == null ? '—' : formatCny(summary.requiredMonthly)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 12, fontWeight: 850 }}>
                <span className="muted">预计达成</span>
                <span>{projectedText}</span>
              </div>
            </div>
          </div>
        </div>

        <div
          style={{
            marginTop: 14,
            borderRadius: 18,
            border: '1px solid var(--hairline)',
            padding: '10px 12px',
            display: 'flex',
            justifyContent: 'space-between',
            gap: 12,
            alignItems: 'center',
            background: 'rgb(var(--primary-rgb) / 0.05)',
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 900, color: 'var(--muted-text)' }}>{statusText}</div>
          <div style={{ fontSize: 12, fontWeight: 950, color }}>
            {summary.paceDailyDelta == null ? '继续记录快照' : `${summary.paceDailyDelta >= 0 ? '+' : ''}${formatCny(summary.paceDailyDelta)}/天`}
          </div>
        </div>

        <SavingsMilestoneStrip summary={summary} color={color} />
        <SavingsActionPanel summary={summary} color={color} />
      </div>
    </motion.div>
  )
}

function SavingsGoalSheet(props: {
  open: boolean
  goal: SavingsGoal | null
  currentNetWorth: number
  onClose: () => void
  onSave: (goal: SavingsGoal) => void
  onClear: () => void
}) {
  const { open, goal, currentNetWorth, onClose, onSave, onClear } = props
  const [targetAmount, setTargetAmount] = useState('')
  const [targetDate, setTargetDate] = useState(defaultGoalDate())
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setTargetAmount(goal ? formatGoalInputAmount(goal.targetAmount) : '')
    setTargetDate(goal?.targetDate ?? defaultGoalDate())
    setError(null)
  }, [goal, open])

  const submit = (resetStart: boolean) => {
    const parsed = parseMoneyInput(targetAmount)
    if (parsed == null || parsed <= 0) {
      setError('请输入正确的目标金额')
      return
    }
    if (!isDateKey(targetDate)) {
      setError('请选择正确的目标日期')
      return
    }
    if (targetDate < todayDateKey()) {
      setError('目标日期不能早于今天')
      return
    }

    const nowIso = new Date().toISOString()
    onSave({
      targetAmount: parsed,
      targetDate,
      startDate: goal && !resetStart ? goal.startDate : todayDateKey(),
      startNetWorth: goal && !resetStart ? goal.startNetWorth : normalizeMoney(currentNetWorth),
      createdAt: goal?.createdAt ?? nowIso,
      updatedAt: nowIso,
    })
    onClose()
  }

  return (
    <BottomSheet open={open} title="储蓄目标" onClose={onClose}>
      <div className="stack" style={{ gap: 16 }}>
        <div className="muted" style={{ fontSize: 12, fontWeight: 800 }}>
          目标按净资产计算。保存后，趋势页会显示从起点到目标日的目标路径。
        </div>

        <label className="field">
          <div className="fieldLabel">目标净资产</div>
          <input
            className="input"
            inputMode="decimal"
            placeholder="例如 300000"
            value={targetAmount}
            onChange={(e) => setTargetAmount(e.target.value)}
          />
        </label>

        <label className="field">
          <div className="fieldLabel">目标日期</div>
          <input className="input" type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} />
        </label>

        <div
          style={{
            border: '1px solid var(--hairline)',
            borderRadius: 18,
            padding: 12,
            display: 'grid',
            gap: 8,
            background: 'var(--bg)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 900 }}>
            <CalendarDays size={15} />
            起点
          </div>
          <div className="muted" style={{ fontSize: 12, fontWeight: 800 }}>
            {goal ? `${formatGoalDate(goal.startDate)} · ${formatCny(goal.startNetWorth)}` : `今天 · ${formatCny(currentNetWorth)}`}
          </div>
        </div>

        {error ? <div style={{ color: '#ef4444', fontSize: 12, fontWeight: 850 }}>{error}</div> : null}

        <button type="button" className="primaryBtn" onClick={() => submit(false)}>
          保存目标
        </button>

        {goal ? (
          <button type="button" className="ghostBtn" onClick={() => submit(true)}>
            <RotateCcw size={17} strokeWidth={2.5} />
            以当前净资产重设起点
          </button>
        ) : null}

        {goal ? (
          <button
            type="button"
            className="ghostBtn"
            style={{ color: '#ef4444' }}
            onClick={() => {
              onClear()
              onClose()
            }}
          >
            删除目标
          </button>
        ) : null}
      </div>
    </BottomSheet>
  )
}

export function StatsScreen(props: { snapshots: Snapshot[]; colors: ThemeColors }) {
  const { snapshots, colors } = props
  const [range, setRange] = useState<RangeId>('6m')
  const [goal, setGoal] = useLocalStorageState<SavingsGoal | null>(SAVINGS_GOAL_KEY, null, {
    coerce: coerceSavingsGoal,
  })
  const [goalSheetOpen, setGoalSheetOpen] = useState(false)
  const [celebrationMilestone, setCelebrationMilestone] = useState<number | null>(null)
  const celebrationKeyRef = useRef<string | null>(null)

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
      net: subtractMoney(end.net, start.net),
      assets: subtractMoney(assetsEnd, assetsStart),
      debt: subtractMoney(end.debt, start.debt),
      cash: subtractMoney(end.cash, start.cash),
      invest: subtractMoney(end.invest, start.invest),
      fixed: subtractMoney(end.fixed, start.fixed),
      receivable: subtractMoney(end.receivable, start.receivable),
    }

    const days = diffDays(start.date, end.date)

    const currentAssets = addMoney(addMoney(end.cash, end.invest), end.receivable)
    const quickAssets = addMoney(end.cash, end.invest)
    const netLiquid = subtractMoney(end.cash, end.debt)

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
      avgDailyNet: days && days > 0 ? normalizeMoney(delta.net / days) : null,
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
  }, [range, snapshots])

  const goalSummary = useMemo(() => getSavingsGoalSummary(goal, snapshots), [goal, snapshots])
  const latestNetWorth = goalSummary?.currentNetWorth ?? view?.end.net ?? 0
  const snapshotFeedback = useMemo(() => {
    if (!goal || !goalSummary) return null
    return buildSnapshotFeedback(goal, snapshots, goalSummary)
  }, [goal, goalSummary, snapshots])

  useEffect(() => {
    if (!goal || !goalSummary) {
      setCelebrationMilestone(null)
      return
    }

    const reached = getReachedGoalMilestone(goalSummary.progress)
    if (reached == null) {
      setCelebrationMilestone(null)
      return
    }

    const key = getGoalMilestoneStorageKey(goal)
    const celebrationKey = `${key}.${reached}`
    if (celebrationKeyRef.current !== celebrationKey) {
      const saved = readSavedGoalMilestone(key)
      if (reached <= saved) {
        setCelebrationMilestone(null)
        return
      }
      celebrationKeyRef.current = celebrationKey
      writeSavedGoalMilestone(key, reached)
    }

    setCelebrationMilestone(reached)

    const timer = window.setTimeout(() => setCelebrationMilestone(null), 5200)
    return () => window.clearTimeout(timer)
  }, [goal, goalSummary])

  return (
    <div className="stack" style={{ padding: '0 16px calc(92px + var(--safe-bottom))' }}>
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
            <SavingsStatusCard
              summary={goalSummary}
              latestNetWorth={latestNetWorth}
              rangeDeltaNet={view.delta.net}
              startDate={view.start.date}
              endDate={view.end.date}
              selectedCount={view.selectedCount}
              color={colors.invest}
              onEdit={() => setGoalSheetOpen(true)}
            />

            <SavingsGoalCard
              goal={goal}
              summary={goalSummary}
              color={colors.invest}
              onEdit={() => setGoalSheetOpen(true)}
            />

            {celebrationMilestone != null ? (
              <SavingsMilestoneCelebration milestone={celebrationMilestone} color={colors.invest} />
            ) : null}

            {snapshotFeedback ? <SnapshotFeedbackCard feedback={snapshotFeedback} /> : null}

            {goalSummary ? <SavingsGoalSimulatorCard summary={goalSummary} color={colors.invest} /> : null}

            <motion.div
              className="card"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.05 }}
            >
              <div className="cardInner">
                <div style={{ fontWeight: 950, fontSize: 14, marginBottom: 10 }}>资产负债概览</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 10 }}>
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
                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 10 }}>
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
                <div className="muted" style={{ marginTop: -6, marginBottom: 10, fontSize: 11, fontWeight: 800 }}>
                  基于快照差值（含流量/估值波动）
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 10 }}>
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
                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 10 }}>
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

      <SavingsGoalSheet
        open={goalSheetOpen}
        goal={goal}
        currentNetWorth={latestNetWorth}
        onClose={() => setGoalSheetOpen(false)}
        onSave={setGoal}
        onClear={() => setGoal(null)}
      />
    </div>
  )
}
