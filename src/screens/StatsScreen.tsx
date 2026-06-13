import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { CalendarDays, CircleDollarSign, Info, Pencil, RotateCcw, Save, Sparkles, Target, X } from 'lucide-react'
import { BottomSheet } from '../components/BottomSheet'
import { PillTabs } from '../components/PillTabs'
import { formatCny } from '../lib/format'
import { normalizeMoney } from '../lib/money'
import {
  SAVINGS_GOAL_KEY,
  SAVINGS_PACE_ALGORITHM_KEY,
  coerceSavingsGoal,
  coerceSavingsPaceAlgorithm,
  defaultGoalDate,
  diffDateDays,
  getSavingsGoalSummary,
  getSavingsProjectionStartDate,
  isDateKey,
  todayDateKey,
  type NetChangePace,
  type SavingsGoal,
  type SavingsGoalSummary,
  type SavingsPaceAlgorithm,
} from '../lib/savingsGoal'
import { DEFAULT_MONTH_START_DAY, MONTH_START_DAY_KEY, clampMonthStartDay } from '../lib/monthStart'
import type { ThemeColors } from '../lib/themes'
import type { Snapshot } from '../lib/snapshots'
import { buildSavingsSimulationPlan } from '../lib/savingsGoalSimulation'
import {
  MONTHLY_ESTIMATED_INCOME_KEY,
  buildMonthlyDisposablePlan,
  coerceMonthlyEstimatedIncome,
  type MonthlyDisposablePlan,
} from '../lib/monthlyDisposable'
import { useLocalStorageState } from '../lib/useLocalStorageState'
import { shouldShowYearForDateKeys } from '../lib/dateSeries'
import {
  buildCurrentSnapshotStats,
  buildStatsRangeView,
  getLatestSnapshot,
  type StatsRangeId,
} from '../lib/snapshotDerived'
import {
  cardEntranceAnimate,
  cardEntranceInitial,
  cardEntranceTransition,
  fadeUpAnimate,
  fadeUpInitial,
  progressFillTransition,
  quickFade,
  scaleInAnimate,
  scaleInInitial,
  screenTransition,
  subtleLift,
  tooltipExit,
} from '../lib/motionPresets'

type RangeId = StatsRangeId

const statsPageInitial = {
  opacity: 0,
  y: 20,
}

const statsPageTransition = {
  duration: 0.4,
}

const twoColumnGridStyle = {
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
  gap: 10,
} satisfies CSSProperties

const compactTwoColumnGridStyle = {
  ...twoColumnGridStyle,
  gap: 8,
} satisfies CSSProperties

const compactTwoColumnGridTop14Style = {
  ...compactTwoColumnGridStyle,
  marginTop: 14,
} satisfies CSSProperties

const compactTwoColumnGridTop12Style = {
  ...compactTwoColumnGridStyle,
  marginTop: 12,
} satisfies CSSProperties

const cardTitleStyle = {
  fontWeight: 700,
  fontSize: 15,
  marginBottom: 11,
  letterSpacing: 0,
} satisfies CSSProperties

const metricTileStyle = {
  minWidth: 0,
  border: '1px solid rgba(15, 23, 42, 0.06)',
  borderRadius: 14,
  padding: 12,
  background: 'linear-gradient(180deg, rgba(255, 255, 255, 0.76), rgba(248, 250, 252, 0.7))',
  boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.82), 0 6px 16px -16px rgba(15, 23, 42, 0.36)',
  backdropFilter: 'blur(14px) saturate(1.04)',
  WebkitBackdropFilter: 'blur(14px) saturate(1.04)',
} satisfies CSSProperties

const compactMetricTileStyle = {
  ...metricTileStyle,
  borderRadius: 13,
  padding: 10,
  background: 'linear-gradient(180deg, rgba(255, 255, 255, 0.72), rgba(248, 250, 252, 0.66))',
} satisfies CSSProperties

const metricLabelStyle = {
  fontSize: 11,
  fontWeight: 650,
  color: 'rgba(71, 85, 105, 0.82)',
  overflowWrap: 'anywhere',
} satisfies CSSProperties

const metricValueStyle = {
  fontSize: 16,
  fontWeight: 700,
  marginTop: 4,
  lineHeight: 1.18,
  overflowWrap: 'anywhere',
} satisfies CSSProperties

const metricSubStyle = {
  fontSize: 11,
  fontWeight: 560,
  marginTop: 4,
  color: 'rgba(71, 85, 105, 0.72)',
  overflowWrap: 'anywhere',
} satisfies CSSProperties

const compactMetricLabelStyle = {
  fontSize: 10,
  fontWeight: 650,
  color: 'rgba(71, 85, 105, 0.82)',
} satisfies CSSProperties

const compactMetricValueStyle = {
  fontSize: 14,
  fontWeight: 700,
  marginTop: 3,
  lineHeight: 1.18,
  overflowWrap: 'anywhere',
} satisfies CSSProperties

const compactMetricSubStyle = {
  fontSize: 10,
  fontWeight: 550,
  color: 'rgba(71, 85, 105, 0.7)',
  marginTop: 3,
} satisfies CSSProperties

type MetricGridLayout = 'regular' | 'compactTop12' | 'compactTop14'

const metricGridStyles = {
  regular: twoColumnGridStyle,
  compactTop12: compactTwoColumnGridTop12Style,
  compactTop14: compactTwoColumnGridTop14Style,
} satisfies Record<MetricGridLayout, CSSProperties>

const cardScaleTransition = (delay: number) => ({ delay })

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

function formatPaceSource(method: NetChangePace['method'] | null | undefined, snapshotCount: number | null | undefined, sampleDays: number | null | undefined) {
  if (!method || !snapshotCount || !sampleDays) return '样本跨度不足，暂不估算'
  const methodText = {
    'recent-window': '按近期快照估算',
    'monthly-close': '按月度收盘估算',
    'monthly-smoothed': '按月度波动平滑',
    'long-window': '按长期跨度估算',
  }[method]
  return `${methodText} · ${snapshotCount}条/${sampleDays}天`
}

function formatNetChangePaceSource(pace: NetChangePace | null | undefined) {
  return pace ? formatPaceSource(pace.method, pace.snapshotCount, pace.sampleDays) : formatPaceSource(null, null, null)
}

function formatSummaryPaceSource(summary: SavingsGoalSummary) {
  return formatPaceSource(summary.avgDailyNetChangeMethod, summary.avgDailyNetChangeSnapshotCount, summary.avgDailyNetChangeSampleDays)
}

function debtAmountTone(value: number) {
  return value > 0 ? '#ef4444' : undefined
}

function debtDeltaTone(value: number | null) {
  if (value == null || value === 0 || !Number.isFinite(value)) return undefined
  return value > 0 ? '#ef4444' : '#10b981'
}

function formatCoverageRatio(value: number | null, debt: number) {
  if (debt <= 0) return '无负债'
  return formatX(value)
}

function formatCoverageSub(label: string, debt: number) {
  return debt <= 0 ? '暂无负债压力' : label
}

const GOAL_MILESTONES = [0.25, 0.5, 0.75, 1] as const
const MILESTONE_STORAGE_PREFIX = 'ratio.savingsGoal.maxMilestone.'
const DAYS_PER_MONTH = 30.4375
const TARGET_GAP_TOLERANCE = 1
const PACE_ALGORITHM_OPTIONS: Array<{
  value: SavingsPaceAlgorithm
  label: string
  sub: string
}> = [
  { value: 'smart', label: '智能选择', sub: '按记录密度和波动自动取口径' },
  { value: 'recent-window', label: '近期快照', sub: '最近约半年一头一尾' },
  { value: 'monthly-close', label: '月度收盘', sub: '最近月度快照一头一尾' },
  { value: 'monthly-smoothed', label: '月度平滑', sub: '按月变化中位数抗波动' },
  { value: 'long-window', label: '长期平均', sub: '全部快照一头一尾' },
]

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
  if (summary.targetAmount <= 0) return null

  const currentProgress = clampProgress(summary.progress)
  const nextProgress = summary.isComplete
    ? 1
    : GOAL_MILESTONES.find((milestone) => currentProgress < milestone - 0.0001) ?? 1
  const amount = normalizeMoney(summary.targetAmount * nextProgress)

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

function formatGoalDate(dateKey: string | null | undefined) {
  if (!dateKey) return '未设置'
  const d = new Date(`${dateKey}T00:00:00`)
  if (Number.isNaN(d.getTime())) return dateKey
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`
}

function formatShortGoalDate(dateKey: string | null | undefined, contextDateKeys: Array<string | null | undefined> = []) {
  if (!dateKey) return '未设置'
  const d = new Date(`${dateKey}T00:00:00`)
  if (Number.isNaN(d.getTime())) return dateKey
  if (shouldShowYearForDateKeys([dateKey, ...contextDateKeys])) return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`
  return `${d.getMonth() + 1}月${d.getDate()}日`
}

function formatCompactDateRange(startDateKey: string, endDateKey: string) {
  const start = new Date(`${startDateKey}T00:00:00`)
  const end = new Date(`${endDateKey}T00:00:00`)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return `${startDateKey} 至 ${endDateKey}`
  if (start.getFullYear() === end.getFullYear()) {
    return `${start.getFullYear()}/${start.getMonth() + 1}/${start.getDate()}-${end.getMonth() + 1}/${end.getDate()}`
  }
  return `${start.getFullYear()}/${start.getMonth() + 1}/${start.getDate()}-${end.getFullYear()}/${end.getMonth() + 1}/${end.getDate()}`
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

function MetricGrid(props: {
  children: ReactNode
  layout?: MetricGridLayout
}) {
  const { children, layout = 'regular' } = props
  return <div style={metricGridStyles[layout]}>{children}</div>
}

function MetricTile(props: {
  label: string
  value: string
  sub?: string
  valueColor?: string
  compact?: boolean
}) {
  const { label, value, sub, valueColor, compact = false } = props
  const valueStyle = compact
    ? { ...compactMetricValueStyle, color: valueColor }
    : { ...metricValueStyle, color: valueColor ?? 'var(--text)' }

  return (
    <motion.div
      className="iosMetricTile"
      style={compact ? compactMetricTileStyle : metricTileStyle}
      whileHover={subtleLift}
      transition={quickFade}
    >
      <div style={compact ? compactMetricLabelStyle : metricLabelStyle}>{label}</div>
      <div style={valueStyle}>{value}</div>
      {sub ? <div style={compact ? compactMetricSubStyle : metricSubStyle}>{sub}</div> : null}
    </motion.div>
  )
}

function formatMonthlyIncomeInput(value: number) {
  return value > 0 ? formatGoalInputAmount(value) : ''
}

function formatNullableCny(value: number | null) {
  return value == null ? '—' : formatCny(value)
}

function formatDisposableValue(value: number | null) {
  if (value == null) return '—'
  if (value < 0) return `缺 ${formatCny(Math.abs(value))}`
  return formatCny(value)
}

function getDisposableTone(value: number | null, color: string) {
  if (value == null) return 'var(--muted-text)'
  if (value < 0) return '#ef4444'
  if (value === 0) return 'var(--text)'
  return color
}

function getTargetSavingsSub(plan: MonthlyDisposablePlan, summary: SavingsGoalSummary | null) {
  if (!summary) return '设置储蓄目标后计算'
  if (plan.targetSource === 'complete') return '目标已完成'
  if (plan.targetSource === 'past-due') return summary.isDueToday ? '今日到期缺口' : '逾期目标缺口'
  if (plan.targetSource === 'current-period') return '按本期目标路径'
  return '等待本期路径'
}

function getDisposableSub(plan: MonthlyDisposablePlan) {
  if (plan.targetDisposable == null) return '等待目标'
  if (plan.isIncomeShort) return `收入还差 ${formatCny(plan.incomeGap ?? 0)}`
  return '预留本期目标后'
}

function getRemainingSavingsSub(plan: MonthlyDisposablePlan, summary: SavingsGoalSummary | null) {
  if (!summary) return '设置目标后计算'
  if (plan.currentPeriodRemaining == null) return '等待本期路径'
  if (plan.currentPeriodRemaining <= 0) return '本期已覆盖'
  return plan.targetSource === 'past-due' ? '目标缺口' : '扣除本期已增'
}

function MonthlyDisposableCard(props: {
  estimatedIncome: number
  summary: SavingsGoalSummary | null
  color: string
  onChange: (value: number) => void
}) {
  const { estimatedIncome, summary, color, onChange } = props
  const [inputValue, setInputValue] = useState(() => formatMonthlyIncomeInput(estimatedIncome))
  const [error, setError] = useState<string | null>(null)
  const plan = useMemo(
    () => buildMonthlyDisposablePlan(estimatedIncome, summary),
    [estimatedIncome, summary],
  )
  const disposableTone = getDisposableTone(plan.targetDisposable, color)
  const statusText = plan.targetDisposable == null
    ? '等待目标'
    : plan.isIncomeShort
      ? '收入不足'
      : '已预留'

  useEffect(() => {
    setInputValue(formatMonthlyIncomeInput(estimatedIncome))
    setError(null)
  }, [estimatedIncome])

  const saveIncome = () => {
    const parsed = inputValue.trim() ? parseMoneyInput(inputValue) : 0
    if (parsed == null || parsed < 0) {
      setError('请输入不小于 0 的收入金额')
      return
    }

    const next = coerceMonthlyEstimatedIncome(parsed)
    onChange(next)
    setInputValue(formatMonthlyIncomeInput(next))
    setError(null)
  }

  const clearIncome = () => {
    onChange(0)
    setInputValue('')
    setError(null)
  }

  return (
    <motion.div
      className="card"
      initial={cardEntranceInitial}
      animate={cardEntranceAnimate}
      transition={cardEntranceTransition}
      style={{ overflow: 'hidden', position: 'relative' }}
    >
      <motion.div
        aria-hidden="true"
        initial={{ opacity: 0 }}
        animate={{ opacity: plan.targetDisposable != null && plan.targetDisposable >= 0 ? 0.1 : 0.06 }}
        transition={{ duration: 0.35 }}
        style={{
          position: 'absolute',
          inset: 0,
          background: `linear-gradient(135deg, ${color}, transparent 66%)`,
          borderRadius: 'inherit',
          pointerEvents: 'none',
        }}
      />
      <div className="cardInner" style={{ position: 'relative' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
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
                flex: '0 0 auto',
              }}
            >
              <CircleDollarSign size={18} strokeWidth={2.7} />
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 800, fontSize: 15 }}>月度可支配</div>
              <div className="muted" style={{ fontSize: 11, fontWeight: 650, marginTop: 2 }}>
                按本期储蓄目标预留
              </div>
            </div>
          </div>
          <div
            style={{
              flex: '0 0 auto',
              borderRadius: 999,
              padding: '7px 10px',
              background: 'rgb(255 255 255 / 0.84)',
              border: '1px solid rgba(15, 23, 42, 0.06)',
              color: disposableTone,
              fontSize: 11,
              fontWeight: 800,
              boxShadow: '0 8px 20px -18px rgba(15, 23, 42, 0.36)',
            }}
          >
            {statusText}
          </div>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault()
            saveIncome()
          }}
          style={{ display: 'grid', gap: 8, marginTop: 14 }}
        >
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(0, 1fr) auto auto',
              gap: 8,
              alignItems: 'end',
            }}
          >
            <label className="field" style={{ minWidth: 0 }}>
              <div className="fieldLabel">预估月收入</div>
              <input
                className="input"
                inputMode="decimal"
                placeholder="例如 18000"
                value={inputValue}
                onChange={(e) => {
                  setInputValue(e.target.value)
                  setError(null)
                }}
              />
            </label>
            <button
              type="submit"
              className="iconBtn iconBtnPrimary"
              aria-label="保存预估月收入"
              title="保存预估月收入"
              style={{ width: 48, height: 48, alignSelf: 'end' }}
            >
              <Save size={18} strokeWidth={2.6} />
            </button>
            <button
              type="button"
              className="iconBtn"
              aria-label="清空预估月收入"
              title="清空预估月收入"
              onClick={clearIncome}
              style={{ width: 48, height: 48, alignSelf: 'end' }}
            >
              <X size={18} strokeWidth={2.6} />
            </button>
          </div>
          {error ? <div style={{ color: '#ef4444', fontSize: 12, fontWeight: 650 }}>{error}</div> : null}
        </form>

        <MetricGrid layout="compactTop12">
          <MetricTile
            compact
            label="预估月收入"
            value={formatCny(plan.estimatedIncome)}
            valueColor={plan.estimatedIncome > 0 ? 'var(--text)' : 'var(--muted-text)'}
            sub={plan.estimatedIncome > 0 ? '长期沿用' : '未填写'}
          />
          <MetricTile
            compact
            label="本期应存目标"
            value={formatNullableCny(plan.targetSavings)}
            valueColor={plan.targetSource === 'past-due' ? '#ef4444' : undefined}
            sub={getTargetSavingsSub(plan, summary)}
          />
          <MetricTile
            compact
            label="目标可支配"
            value={formatDisposableValue(plan.targetDisposable)}
            valueColor={disposableTone}
            sub={getDisposableSub(plan)}
          />
          <MetricTile
            compact
            label="本期还需存入"
            value={formatNullableCny(plan.currentPeriodRemaining)}
            valueColor={plan.currentPeriodRemaining != null && plan.currentPeriodRemaining > 0 ? '#ef4444' : '#10b981'}
            sub={getRemainingSavingsSub(plan, summary)}
          />
        </MetricGrid>
      </div>
    </motion.div>
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
  snapshotCount: number
  color: string
  onEdit: () => void
}) {
  const { summary, latestNetWorth, snapshotCount, color, onEdit } = props
  const [explainOpen, setExplainOpen] = useState(false)

  if (!summary) {
    return (
      <motion.div
        className="card"
        initial={cardEntranceInitial}
        animate={cardEntranceAnimate}
        transition={cardEntranceTransition}
        style={{ overflow: 'hidden', position: 'relative' }}
      >
        <div className="cardInner">
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted-text)' }}>本期储蓄状态</div>
              <div className="muted" style={{ fontSize: 12, fontWeight: 700, marginTop: 8 }}>当前净资产</div>
              <div style={{ fontSize: 26, fontWeight: 800, marginTop: 6, letterSpacing: 0, overflowWrap: 'anywhere' }}>{formatCny(latestNetWorth)}</div>
              <div className="muted" style={{ fontSize: 12, fontWeight: 650, marginTop: 6 }}>
                设置目标后，这里会显示本期还需存多少和本期进度。
              </div>
            </div>
            <button type="button" className="iconBtn" onClick={onEdit} aria-label="set savings goal">
              <Target size={18} strokeWidth={2.6} />
            </button>
          </div>
          <MetricGrid layout="compactTop14">
            <MetricTile label="当前净资产" value={formatCny(latestNetWorth)} sub="目标按净资产计算" />
            <MetricTile label="快照数量" value={`${snapshotCount}条`} sub="持续记录后会更准确" />
          </MetricGrid>
        </div>
      </motion.div>
    )
  }

  const progress = clampProgress(summary.progress)
  const periodRemaining = summary.currentPeriodRemaining
  const periodDelta = summary.currentPeriodDelta
  const periodProgressSub = summary.currentPeriodTarget == null
    ? '等待目标路径'
    : `已增 ${formatDelta(summary.currentPeriodActual)} / 本期目标 ${formatCny(summary.currentPeriodTarget)}`
  const paceDeltaDisplay = summary.isComplete
    ? { label: '目标状态', value: '已达成', tone: '#10b981', sub: '目标已覆盖' }
    : summary.isPastDue || summary.isDueToday
      ? { label: '目标缺口', value: formatCny(summary.remaining), tone: '#ef4444', sub: summary.isDueToday ? '今天到期' : '目标已逾期' }
      : periodDelta == null
        ? { label: '本期进度', value: '—', tone: undefined, sub: periodProgressSub }
        : periodDelta === 0
          ? { label: '本期进度', value: '按计划', tone: 'var(--text)', sub: periodProgressSub }
          : periodDelta > 0
            ? { label: '本期超出', value: formatDelta(periodDelta), tone: '#10b981', sub: periodProgressSub }
            : { label: '本期落后', value: `还差 ${formatCny(Math.abs(periodDelta))}`, tone: '#ef4444', sub: periodProgressSub }
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
    ? '#10b981'
    : summary.isPastDue || summary.isDueToday || summary.currentPeriodIsOnTrack === false
      ? '#ef4444'
      : 'var(--muted-text)'
  const heroLabel = summary.isComplete
    ? '当前净资产'
    : periodRemaining == null
      ? '距离目标还差'
      : periodRemaining > 0
        ? '本期还需存入'
        : '本期已达标'
  const heroValue = summary.isComplete
    ? formatCny(summary.currentNetWorth)
    : periodRemaining == null
      ? formatCny(summary.remaining)
      : periodRemaining > 0
        ? formatCny(periodRemaining)
        : formatDelta(Math.abs(periodDelta ?? 0))
  const heroSub = summary.isComplete
    ? '目标已覆盖'
    : summary.currentPeriodTarget == null
      ? `距离目标还差 ${formatCny(summary.remaining)}`
      : `本期已增 ${formatDelta(summary.currentPeriodActual)} · 距离总目标还差 ${formatCny(summary.remaining)}`
  const progressPct = `${Math.round(progress * 1000) / 10}%`
  const projectionSub = summary.avgDailyNetChange != null ? formatSummaryPaceSource(summary) : '等待更多快照'
  const goalDateContext = [summary.startDate, summary.latestDate, summary.targetDate, summary.projectedDate]
  const periodDateContext = [summary.currentPeriodStartDate, summary.currentPeriodEndDate, summary.startDate, summary.targetDate]
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
    <motion.div
      className="card"
      initial={cardEntranceInitial}
      animate={cardEntranceAnimate}
      transition={cardEntranceTransition}
      style={{ overflow: 'visible', position: 'relative' }}
    >
      <motion.div
        aria-hidden="true"
        initial={{ opacity: 0 }}
        animate={{ opacity: summary.isComplete || summary.currentPeriodIsOnTrack === true ? 0.14 : 0.08 }}
        transition={{ duration: 0.35 }}
        style={{
          position: 'absolute',
          inset: 0,
          background: `linear-gradient(135deg, ${color}, transparent 62%)`,
          borderRadius: 'inherit',
          pointerEvents: 'none',
        }}
      />
      <div className="cardInner" style={{ position: 'relative' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted-text)' }}>本期储蓄状态</div>
            <button
              type="button"
              onClick={() => setExplainOpen((open) => !open)}
              aria-label="查看本期储蓄状态计算"
              aria-expanded={explainOpen}
              aria-controls="savings-period-explain"
              title="查看本期储蓄状态计算"
              style={{
                width: 25,
                height: 25,
                borderRadius: 999,
                border: '1px solid var(--hairline)',
                background: 'rgb(255 255 255 / 0.84)',
                color: 'var(--muted-text)',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                flex: '0 0 auto',
              }}
            >
              <Info size={14} strokeWidth={2.5} />
            </button>
          </div>
          <div
            style={{
              flex: '0 0 auto',
              borderRadius: 999,
              padding: '7px 10px',
              background: 'rgb(255 255 255 / 0.84)',
              border: '1px solid var(--hairline)',
              color: statusTone,
              fontSize: 11,
              fontWeight: 800,
              whiteSpace: 'nowrap',
            }}
          >
            {statusText}
          </div>
        </div>
        <AnimatePresence>
          {explainOpen && periodExplain ? (
            <motion.div
              id="savings-period-explain"
              role="tooltip"
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={tooltipExit}
              transition={quickFade}
            style={{
              position: 'absolute',
              top: 43,
              left: 0,
              right: 0,
              zIndex: 12,
              borderRadius: 16,
              padding: 12,
              background: 'var(--card)',
              border: '1px solid var(--hairline)',
              boxShadow: '0 18px 44px rgb(15 23 42 / 0.18)',
              backdropFilter: 'blur(16px)',
              display: 'grid',
              gap: 8,
              fontSize: 11,
              fontWeight: 650,
              color: 'var(--muted-text)',
            }}
          >
            <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--text)' }}>
              {periodExplain.startLabel} 到 {periodExplain.endLabel}
            </div>
            <div>这是当前月度周期；周期终点取下一个月度开始日和目标日里更早的日期。</div>
            <div>总目标路径：{formatShortGoalDate(summary.startDate, periodDateContext)} 从 {formatCny(summary.startNetWorth)} 出发，到 {formatShortGoalDate(summary.targetDate, periodDateContext)} 达到 {formatCny(summary.targetAmount)}，中间按天平均推进。</div>
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
            </motion.div>
          ) : null}
        </AnimatePresence>
        <div className="muted" style={{ fontSize: 12, fontWeight: 700, marginTop: 10 }}>{heroLabel}</div>
        <motion.div
          key={heroValue}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={screenTransition}
          style={{ fontSize: 31, fontWeight: 800, marginTop: 5, letterSpacing: 0, overflowWrap: 'normal', wordBreak: 'keep-all' }}
        >
          {heroValue}
        </motion.div>
        <div className="muted" style={{ fontSize: 12, fontWeight: 650, marginTop: 6 }}>
          {heroSub}
        </div>

        <div style={{ marginTop: 16, display: 'grid', gap: 8 }}>
          <div style={{ height: 10, borderRadius: 999, background: 'rgba(100,116,139,0.14)', overflow: 'hidden' }}>
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: progressPct }}
              transition={{ ...progressFillTransition, duration: 0.55 }}
              style={{ height: '100%', borderRadius: 999, background: color, boxShadow: `0 0 12px -3px ${color}` }}
            />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 11, fontWeight: 650 }}>
            <span className="muted">目标 {formatCny(summary.targetAmount)}</span>
            <span style={{ color }}>{Math.round(progress * 100)}%</span>
          </div>
        </div>

        <MetricGrid layout="compactTop14">
          <MetricTile label={paceDeltaDisplay.label} value={paceDeltaDisplay.value} valueColor={paceDeltaDisplay.tone} sub={paceDeltaDisplay.sub} />
          <MetricTile label="预计达成" value={summary.isComplete ? '已达成' : summary.projectedDate ? formatShortGoalDate(summary.projectedDate, goalDateContext) : '暂无预测'} sub={projectionSub} />
        </MetricGrid>
      </div>
    </motion.div>
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
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted-text)' }}>下一里程碑</div>
        <div style={{ fontSize: 11, fontWeight: 800, color }}>{milestone.pct}%</div>
      </div>
      <div
        style={{
          position: 'relative',
          height: 12,
          borderRadius: 999,
          background: 'rgba(100,116,139,0.14)',
          overflow: 'hidden',
        }}
      >
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: progressPct }}
          transition={progressFillTransition}
          style={{ height: '100%', borderRadius: 999, background: color, boxShadow: `0 0 10px -3px ${color}` }}
        />
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
            background: '#fff',
            border: `2px solid ${color}`,
            marginLeft: -5,
            boxShadow: `0 1px 4px rgba(15, 23, 42, 0.18), 0 0 8px -2px ${color}`,
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
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 11, fontWeight: 650, flexWrap: 'wrap' }}>
        <span className="muted" style={{ minWidth: 0, flex: '1 1 176px' }}>{subtitle}</span>
        <span style={{ color: 'var(--muted-text)', flex: '0 0 auto' }}>
          {GOAL_MILESTONES.map((milestone) => `${Math.round(milestone * 100)}%`).join(' · ')}
        </span>
      </div>
    </div>
  )
}

function formatProjectionShift(simulatedDate: string | null, summary: SavingsGoalSummary) {
  if (!simulatedDate) return { text: '暂不可达', sub: '提高月存额后再看', tone: '#ef4444' }
  const dateContext = [summary.startDate, summary.latestDate, summary.targetDate, summary.projectedDate, simulatedDate]

  if (summary.projectedDate) {
    const shift = diffDateDays(simulatedDate, summary.projectedDate)
    if (shift == null || shift === 0) return { text: '预测不变', sub: formatShortGoalDate(simulatedDate, dateContext), tone: 'var(--text)' }
    return {
      text: shift > 0 ? `提前 ${shift} 天` : `延后 ${Math.abs(shift)} 天`,
      sub: formatShortGoalDate(simulatedDate, dateContext),
      tone: shift > 0 ? '#10b981' : '#ef4444',
    }
  }

  const targetShift = diffDateDays(simulatedDate, summary.targetDate)
  if (targetShift == null || targetShift === 0) return { text: '踩中目标日', sub: formatShortGoalDate(simulatedDate, dateContext), tone: '#10b981' }
  return {
    text: targetShift > 0 ? `早 ${targetShift} 天` : `晚 ${Math.abs(targetShift)} 天`,
    sub: formatShortGoalDate(simulatedDate, dateContext),
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
    <div
      style={{
        minWidth: 0,
        border: '1px solid rgba(15, 23, 42, 0.06)',
        borderRadius: 14,
        padding: 12,
        background: 'rgba(248, 250, 252, 0.66)',
        boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.76)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'baseline' }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted-text)' }}>{label}</div>
        <div style={{ fontSize: 14, fontWeight: 800, color, overflowWrap: 'anywhere' }}>
          {formatCny(safeValue)}
        </div>
      </div>
      <div style={{ position: 'relative', marginTop: 12, height: 30, display: 'flex', alignItems: 'center' }}>
        <div style={{ position: 'absolute', left: 0, right: 0, height: 8, borderRadius: 999, background: 'rgba(100,116,139,0.14)', overflow: 'hidden' }}>
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
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 10, fontWeight: 600, color: 'var(--muted-text)' }}>
        <span>{helper}</span>
        <span>最高 {formatCny(safeMax)}</span>
      </div>
    </div>
  )
}

function getProjectionGoalDate(summary: SavingsGoalSummary) {
  return getSavingsProjectionStartDate(summary.latestDate)
}

function SavingsGoalSimulatorCard(props: { summary: SavingsGoalSummary; color: string }) {
  const { summary, color } = props
  const [monthlyExtraValue, setMonthlyExtraValue] = useState(0)
  const [oneTimeValue, setOneTimeValue] = useState(0)
  const [helpOpen, setHelpOpen] = useState(false)

  useEffect(() => {
    setMonthlyExtraValue(0)
    setOneTimeValue(0)
  }, [summary.currentNetWorth, summary.startDate, summary.startNetWorth, summary.targetAmount, summary.targetDate])

  if (summary.isComplete) return null

  const baseDate = getProjectionGoalDate(summary)
  const baseDaily = normalizeMoney(summary.avgDailyNetChange ?? 0)
  const daysToTarget = diffDateDays(baseDate, summary.targetDate)
  const baseTargetShortfall = daysToTarget != null && daysToTarget > 0
    ? normalizeMoney(summary.targetAmount - summary.currentNetWorth - baseDaily * daysToTarget)
    : summary.remaining
  const monthlyNeededToHitTarget = daysToTarget != null && daysToTarget > 0
    ? Math.max(0, normalizeMoney((baseTargetShortfall / daysToTarget) * DAYS_PER_MONTH))
    : 0
  const monthlyMax = roundUpMoney(Math.max(5000, summary.remaining / 6, (summary.requiredMonthly ?? 0) * 1.6, monthlyNeededToHitTarget * 1.4), 500)
  const oneTimeMax = roundUpMoney(Math.max(5000, summary.remaining), 1000)
  const monthlyStep = getSliderStep(monthlyMax)
  const oneTimeStep = getSliderStep(oneTimeMax)
  const monthlyExtra = Math.min(Math.max(0, normalizeMoney(monthlyExtraValue)), monthlyMax)
  const oneTime = Math.min(Math.max(0, normalizeMoney(oneTimeValue)), oneTimeMax)
  const plan = buildSavingsSimulationPlan(summary, monthlyExtra, oneTime)
  const shift = formatProjectionShift(plan.simulatedDate, summary)
  const dateContext = [summary.startDate, summary.latestDate, summary.targetDate, summary.projectedDate, plan.simulatedDate]
  const targetMonthlyExtra = plan.extraMonthlyNeededForTarget == null
    ? monthlyExtra
    : Math.min(monthlyMax, normalizeMoney(monthlyExtra + plan.extraMonthlyNeededForTarget))
  const canBoostMonthly = plan.extraMonthlyNeededForTarget != null && plan.extraMonthlyNeededForTarget > 0 && targetMonthlyExtra > monthlyExtra
  const monthlyBoostButtonLabel = plan.extraMonthlyNeededForTarget != null && monthlyExtra + plan.extraMonthlyNeededForTarget > monthlyMax
    ? '拉满月存'
    : '按目标日设月存'
  const targetGapForDisplay = plan.targetGap == null
    ? null
    : Math.abs(plan.targetGap) <= TARGET_GAP_TOLERANCE
      ? 0
      : plan.targetGap
  const targetGapTone = targetGapForDisplay == null
    ? 'var(--muted-text)'
    : targetGapForDisplay >= 0
      ? '#10b981'
      : '#ef4444'
  const targetDateNeedsImmediateDeposit = daysToTarget === 0 && targetGapForDisplay != null && targetGapForDisplay < 0
  const extraMonthlyNeededForDisplay = targetGapForDisplay === 0 ? 0 : plan.extraMonthlyNeededForTarget
  const extraNeededText = targetDateNeedsImmediateDeposit
    ? '需当天补足'
    : extraMonthlyNeededForDisplay == null
      ? '目标日已过'
      : extraMonthlyNeededForDisplay <= 0
        ? '无需再补'
        : formatCny(extraMonthlyNeededForDisplay)
  const extraNeededLabel = targetDateNeedsImmediateDeposit ? '目标日补足' : '还需月存'
  const extraNeededSub = targetDateNeedsImmediateDeposit ? '月存已来不及' : '踩中目标日'
  const extraNeededTone = targetDateNeedsImmediateDeposit
    ? '#ef4444'
    : extraMonthlyNeededForDisplay != null && extraMonthlyNeededForDisplay > 0
      ? '#ef4444'
      : '#10b981'
  const targetDateLabel = `目标日 ${formatShortGoalDate(summary.targetDate, dateContext)}`

  const reset = () => {
    setMonthlyExtraValue(0)
    setOneTimeValue(0)
  }

  return (
    <motion.div
      className="card"
      initial={fadeUpInitial}
      animate={fadeUpAnimate}
      transition={cardEntranceTransition}
    >
      <div className="cardInner" style={{ position: 'relative' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ fontWeight: 800, fontSize: 14 }}>目标模拟器</div>
              <button
                type="button"
                onClick={() => setHelpOpen((open) => !open)}
                aria-label="查看目标模拟器说明"
                aria-expanded={helpOpen}
                aria-controls="savings-goal-simulator-help"
                title="查看目标模拟器说明"
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 999,
                  border: '1px solid var(--hairline)',
                  background: 'rgb(255 255 255 / 0.84)',
                  color: 'var(--muted-text)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flex: '0 0 auto',
                }}
              >
                <Info size={15} strokeWidth={2.5} />
              </button>
            </div>
            <div className="muted" style={{ fontSize: 11, fontWeight: 650, marginTop: 3 }}>用一次性存入和每月多存，模拟目标日还差多少</div>
          </div>
          <button type="button" className="iconBtn" onClick={reset} aria-label="reset savings simulator">
            <RotateCcw size={16} strokeWidth={2.5} />
          </button>
        </div>

        <AnimatePresence>
          {helpOpen ? (
            <motion.div
              id="savings-goal-simulator-help"
              role="tooltip"
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={tooltipExit}
              transition={quickFade}
            style={{
              position: 'absolute',
              top: 58,
              left: 0,
              right: 0,
              zIndex: 8,
              borderRadius: 16,
              padding: 12,
              background: 'var(--card)',
              border: '1px solid var(--hairline)',
              boxShadow: '0 18px 44px rgb(15 23 42 / 0.18)',
              backdropFilter: 'blur(16px)',
              maxHeight: 'min(360px, calc(100vh - 180px))',
              overflowY: 'auto',
              display: 'grid',
              gap: 7,
              fontSize: 11,
              fontWeight: 650,
              color: 'var(--muted-text)',
            }}
          >
            <div><span style={{ color: 'var(--text)', fontWeight: 800 }}>每月多存</span>：按月金额折算成每日增速，影响模拟达成日和目标日缺口。</div>
            <div><span style={{ color: 'var(--text)', fontWeight: 800 }}>一次性存入</span>：先直接减少距离目标还差的金额。</div>
            <div><span style={{ color: 'var(--text)', fontWeight: 800 }}>按目标日设月存</span>：把每月多存调到刚好覆盖目标日缺口；如果滑块上限不够，会改为拉满月存。</div>
            <div><span style={{ color: 'var(--text)', fontWeight: 800 }}>模拟达成</span>：按当前组合预计到达目标的日期。</div>
            <div><span style={{ color: 'var(--text)', fontWeight: 800 }}>目标日结果</span>：显示目标日当天预计多出或少多少；接近刚好时显示“刚好达标”。</div>
            <div><span style={{ color: 'var(--text)', fontWeight: 800 }}>预测月增速 / 还需月存</span>：分别表示模拟后的月度净资产增长速度，以及为了踩中目标日还要补的月存额。</div>
            </motion.div>
          ) : null}
        </AnimatePresence>

        <div style={{ display: 'grid', gap: 10, marginTop: 14 }}>
          <SavingsSliderControl
            label="每月多存"
            value={monthlyExtra}
            max={monthlyMax}
            step={monthlyStep}
            color={color}
            helper={`${formatDelta(monthlyExtra / DAYS_PER_MONTH)}/天`}
            onChange={setMonthlyExtraValue}
          />
          <SavingsSliderControl
            label="一次性存入"
            value={oneTime}
            max={oneTimeMax}
            step={oneTimeStep}
            color={color}
            helper={`剩余 ${formatCny(plan.remainingAfterOneTime)}`}
            onChange={setOneTimeValue}
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 8, marginTop: 10 }}>
          <button
            type="button"
            className="ghostBtn"
            disabled={!canBoostMonthly}
            onClick={() => setMonthlyExtraValue(targetMonthlyExtra)}
            style={{ justifyContent: 'center', opacity: canBoostMonthly ? 1 : 0.55 }}
          >
            {monthlyBoostButtonLabel}
          </button>
        </div>

        <MetricGrid layout="compactTop12">
          <MetricTile
            compact
            label="模拟达成"
            value={plan.simulatedDate ? formatShortGoalDate(plan.simulatedDate, dateContext) : '暂不可达'}
            valueColor={shift.tone}
            sub={shift.text}
          />
          <MetricTile
            compact
            label={targetGapForDisplay == null || targetGapForDisplay === 0 ? '目标日结果' : targetGapForDisplay > 0 ? '目标日余量' : '目标日缺口'}
            value={targetGapForDisplay == null ? '—' : targetGapForDisplay === 0 ? '刚好达标' : formatAbsCny(targetGapForDisplay)}
            valueColor={targetGapTone}
            sub={targetGapForDisplay == null ? '目标日已过' : targetDateLabel}
          />
          <MetricTile
            compact
            label="预测月增速"
            value={formatDelta(plan.simulatedMonthlyPace)}
            valueColor={color}
            sub={`原速 ${formatDelta(plan.baseMonthlyPace)}`}
          />
          <MetricTile compact label={extraNeededLabel} value={extraNeededText} valueColor={extraNeededTone} sub={extraNeededSub} />
        </MetricGrid>
      </div>
    </motion.div>
  )
}

function SavingsPaceAlgorithmCard(props: {
  algorithm: SavingsPaceAlgorithm
  summary: SavingsGoalSummary | null
  onChange: (algorithm: SavingsPaceAlgorithm) => void
}) {
  const { algorithm, summary, onChange } = props
  const activeOption = PACE_ALGORITHM_OPTIONS.find((option) => option.value === algorithm) ?? PACE_ALGORITHM_OPTIONS[0]
  const paceText = summary?.avgDailyNetChange == null
    ? '样本不足'
    : `${formatDelta(summary.avgDailyNetChange * DAYS_PER_MONTH)}/月`
  const paceSub = summary ? formatSummaryPaceSource(summary) : '设置目标后用于预计达成'

  return (
    <motion.div
      className="card"
      initial={fadeUpInitial}
      animate={fadeUpAnimate}
      transition={cardEntranceTransition}
    >
      <div className="cardInner">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 800, fontSize: 14 }}>预估算法</div>
            <div className="muted" style={{ fontSize: 11, fontWeight: 650, marginTop: 3 }}>{activeOption.sub}</div>
          </div>
          <div style={{ flex: '0 0 auto', textAlign: 'right' }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: summary?.avgDailyNetChange == null ? 'var(--muted-text)' : 'var(--text)' }}>{paceText}</div>
            <div className="muted" style={{ fontSize: 10, fontWeight: 650, marginTop: 3 }}>预测基础增速</div>
          </div>
        </div>

        <div style={{ marginTop: 12, overflowX: 'auto', paddingBottom: 2 }}>
          <PillTabs
            ariaLabel="savings pace algorithm"
            options={PACE_ALGORITHM_OPTIONS.map((option) => ({ value: option.value, label: option.label }))}
            value={algorithm}
            onChange={onChange}
          />
        </div>

        <div className="muted" style={{ marginTop: 10, fontSize: 11, fontWeight: 650 }}>{paceSub}，用于预计达成和目标模拟器</div>
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
      initial={cardEntranceInitial}
      animate={cardEntranceAnimate}
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
            <div style={{ fontWeight: 800, fontSize: 15 }}>达成 {pct}% 里程碑</div>
            <div className="muted" style={{ fontSize: 12, fontWeight: 650, marginTop: 3 }}>储蓄目标又向前推进了一段</div>
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
        initial={scaleInInitial}
        animate={scaleInAnimate}
        transition={cardScaleTransition(0.02)}
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
              <div style={{ fontWeight: 800, fontSize: 15 }}>储蓄目标</div>
              <div className="muted" style={{ marginTop: 3, fontSize: 12, fontWeight: 600 }}>
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

  const dateContext = [summary.startDate, summary.latestDate, summary.targetDate, summary.projectedDate]
  const latestText = summary.latestDate ? `截至 ${formatShortGoalDate(summary.latestDate, dateContext)}` : '等待快照'
  const gainedSinceStart = normalizeMoney(summary.currentNetWorth - summary.startNetWorth)
  const gainedTone = gainedSinceStart === 0 ? 'var(--text)' : gainedSinceStart > 0 ? color : '#ef4444'
  const safeProgress = clampProgress(summary.progress)
  const progressText = `${Math.round(safeProgress * 100)}%`

  return (
    <motion.div
      className="card"
      initial={scaleInInitial}
      animate={scaleInAnimate}
      transition={cardScaleTransition(0.02)}
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
              <div style={{ fontWeight: 800, fontSize: 15 }}>储蓄目标</div>
              <div className="muted" style={{ fontSize: 11, fontWeight: 650, marginTop: 2 }}>
                目标日 {formatShortGoalDate(summary.targetDate, dateContext)}
              </div>
            </div>
          </div>
          <button type="button" className="iconBtn" onClick={onEdit} aria-label="edit savings goal">
            <Pencil size={16} strokeWidth={2.5} />
          </button>
        </div>

        <div
          style={{
            marginTop: 12,
            borderRadius: 16,
            border: '1px solid rgba(15, 23, 42, 0.06)',
            padding: 12,
            background: 'rgba(248, 250, 252, 0.66)',
            boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.76)',
            display: 'grid',
            gap: 10,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-end' }}>
            <div style={{ minWidth: 0 }}>
              <div className="muted" style={{ fontSize: 11, fontWeight: 700 }}>目标净资产</div>
              <div style={{ fontSize: 21, fontWeight: 800, marginTop: 3, overflowWrap: 'anywhere' }}>{formatCny(summary.targetAmount)}</div>
            </div>
            <div style={{ flex: '0 0 auto', textAlign: 'right' }}>
              <motion.div
                key={progressText}
                initial={{ opacity: 0, y: 5, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={screenTransition}
                style={{ fontSize: 24, fontWeight: 800, lineHeight: 1, color }}
              >
                {progressText}
              </motion.div>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted-text)', marginTop: 4 }}>已完成</div>
            </div>
          </div>

          <div style={{ height: 1, background: 'var(--hairline)' }} />

          <div style={{ display: 'grid', gap: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'baseline', fontSize: 12, fontWeight: 650 }}>
              <span className="muted">当前净资产</span>
              <span style={{ fontSize: 15, fontWeight: 800, textAlign: 'right', overflowWrap: 'anywhere' }}>{formatCny(summary.currentNetWorth)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'baseline', fontSize: 12, fontWeight: 650 }}>
              <span className="muted">距离目标</span>
              <span style={{ fontSize: 15, fontWeight: 800, textAlign: 'right', overflowWrap: 'anywhere' }}>{formatCny(summary.remaining)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'baseline', fontSize: 12, fontWeight: 650 }}>
              <span className="muted">起点以来</span>
              <span style={{ color: gainedTone, fontSize: 15, fontWeight: 800, textAlign: 'right', overflowWrap: 'anywhere' }}>{formatDelta(gainedSinceStart)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 11, fontWeight: 650, flexWrap: 'wrap' }}>
              <span className="muted">{latestText}</span>
              <span className="muted">起点 {formatShortGoalDate(summary.startDate, dateContext)}</span>
            </div>
          </div>
        </div>

        <SavingsMilestoneStrip summary={summary} color={color} />
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
        <div className="muted" style={{ fontSize: 12, fontWeight: 600 }}>
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
            border: '1px solid rgba(15, 23, 42, 0.06)',
            borderRadius: 14,
            padding: 12,
            display: 'grid',
            gap: 8,
            background: 'rgba(248, 250, 252, 0.68)',
            boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.76)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 700 }}>
            <CalendarDays size={15} />
            起点
          </div>
          <div className="muted" style={{ fontSize: 12, fontWeight: 600 }}>
            {goal ? `${formatGoalDate(goal.startDate)} · ${formatCny(goal.startNetWorth)}` : `今天 · ${formatCny(currentNetWorth)}`}
          </div>
        </div>

        {error ? <div style={{ color: '#ef4444', fontSize: 12, fontWeight: 650 }}>{error}</div> : null}

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
  const [monthStartDayRaw] = useLocalStorageState<number>(MONTH_START_DAY_KEY, DEFAULT_MONTH_START_DAY)
  const [paceAlgorithm, setPaceAlgorithm] = useLocalStorageState<SavingsPaceAlgorithm>(SAVINGS_PACE_ALGORITHM_KEY, 'smart', {
    coerce: coerceSavingsPaceAlgorithm,
  })
  const [goal, setGoal] = useLocalStorageState<SavingsGoal | null>(SAVINGS_GOAL_KEY, null, {
    coerce: coerceSavingsGoal,
  })
  const [monthlyEstimatedIncome, setMonthlyEstimatedIncome] = useLocalStorageState<number>(MONTHLY_ESTIMATED_INCOME_KEY, 0, {
    coerce: coerceMonthlyEstimatedIncome,
  })
  const [goalSheetOpen, setGoalSheetOpen] = useState(false)
  const [celebrationMilestone, setCelebrationMilestone] = useState<number | null>(null)
  const celebrationKeyRef = useRef<string | null>(null)
  const monthStartDay = clampMonthStartDay(monthStartDayRaw)

  const view = useMemo(() => buildStatsRangeView(snapshots, range, monthStartDay), [monthStartDay, range, snapshots])

  const goalSummary = useMemo(
    () => getSavingsGoalSummary(goal, snapshots, { monthStartDay, algorithm: paceAlgorithm }),
    [goal, monthStartDay, paceAlgorithm, snapshots],
  )
  const latestSnapshot = useMemo(() => getLatestSnapshot(snapshots), [snapshots])
  const latestNetWorth = goalSummary?.currentNetWorth ?? latestSnapshot?.net ?? 0
  const currentStats = useMemo(() => buildCurrentSnapshotStats(latestSnapshot), [latestSnapshot])

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
    <div className="stack iosInsightsPage iosStatsPage" style={{ padding: '0 16px calc(92px + var(--safe-bottom))' }}>
      <motion.div initial={statsPageInitial} animate={fadeUpAnimate} transition={statsPageTransition}>
        <div className="stack iosStatsStack">
          <SavingsStatusCard
            summary={goalSummary}
            latestNetWorth={latestNetWorth}
            snapshotCount={snapshots.length}
            color={colors.invest}
            onEdit={() => setGoalSheetOpen(true)}
          />

          <MonthlyDisposableCard
            estimatedIncome={monthlyEstimatedIncome}
            summary={goalSummary}
            color={colors.invest}
            onChange={setMonthlyEstimatedIncome}
          />

          <SavingsGoalCard
            goal={goal}
            summary={goalSummary}
            color={colors.invest}
            onEdit={() => setGoalSheetOpen(true)}
          />

          <SavingsPaceAlgorithmCard
            algorithm={paceAlgorithm}
            summary={goalSummary}
            onChange={setPaceAlgorithm}
          />

          <AnimatePresence>
            {celebrationMilestone != null ? (
              <SavingsMilestoneCelebration milestone={celebrationMilestone} color={colors.invest} />
            ) : null}
          </AnimatePresence>

          {goalSummary ? <SavingsGoalSimulatorCard summary={goalSummary} color={colors.invest} /> : null}

          {currentStats ? (
            <>
              <motion.div
                className="card"
                initial={scaleInInitial}
                animate={scaleInAnimate}
                transition={cardScaleTransition(0.05)}
              >
                <div className="cardInner">
                  <div style={cardTitleStyle}>资产负债概览</div>
                  <MetricGrid>
                    <MetricTile label="总资产" value={formatCny(currentStats.assets)} />
                    <MetricTile label="净资产" value={formatCny(currentStats.snapshot.net)} />
                    <MetricTile label="负债" value={formatCny(currentStats.snapshot.debt)} valueColor={debtAmountTone(currentStats.snapshot.debt)} />
                    <MetricTile label="资产负债率" value={formatPct(currentStats.ratios.debtToAssets)} />
                  </MetricGrid>
                </div>
              </motion.div>

              <motion.div
                className="card"
                initial={scaleInInitial}
                animate={scaleInAnimate}
                transition={cardScaleTransition(0.1)}
              >
                <div className="cardInner">
                  <div style={cardTitleStyle}>流动性与杠杆</div>
                  <MetricGrid>
                    <MetricTile label="流动资产" value={formatCny(currentStats.currentAssets)} />
                    <MetricTile label="净流动资产" value={formatCny(currentStats.netLiquid)} />
                    <MetricTile label="流动比" value={formatCoverageRatio(currentStats.coverage.current, currentStats.snapshot.debt)} sub={formatCoverageSub('流动资产/负债', currentStats.snapshot.debt)} />
                    <MetricTile label="速动比" value={formatCoverageRatio(currentStats.coverage.quick, currentStats.snapshot.debt)} sub={formatCoverageSub('(现金+投资)/负债', currentStats.snapshot.debt)} />
                    <MetricTile label="现金覆盖" value={formatCoverageRatio(currentStats.coverage.cash, currentStats.snapshot.debt)} sub={formatCoverageSub('现金/负债', currentStats.snapshot.debt)} />
                    <MetricTile label="负债/净资产" value={formatX(currentStats.ratios.debtToNet)} />
                    <MetricTile label="净资产率" value={formatPct(currentStats.ratios.netToAssets)} />
                    <MetricTile label="权益乘数" value={formatX(currentStats.ratios.equityMultiplier)} />
                  </MetricGrid>
                </div>
              </motion.div>
            </>
          ) : null}

          {view ? (
            <>
              <div className="iosStatsRangeHeader">
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                  <div style={{ minWidth: 0, flex: '1 1 160px' }}>
                    <div style={{ fontSize: 12, fontWeight: 800 }}>区间统计范围</div>
                    <div className="muted" style={{ marginTop: 4, fontSize: 12, fontWeight: 600 }}>
                      {view.rangeFallback ? (
                        <>
                          所选区间不足 2 条快照，已显示 {formatCompactDateRange(view.start.date, view.end.date)} · 净资产{' '}
                          <span style={{ color: 'var(--text)' }}>{formatDelta(view.delta.net)}</span>
                        </>
                      ) : view.selectedCount >= 2 ? (
                        <>
                          {formatCompactDateRange(view.start.date, view.end.date)} · 净资产{' '}
                          <span style={{ color: 'var(--text)' }}>{formatDelta(view.delta.net)}</span>
                        </>
                      ) : (
                        <>
                          {formatShortGoalDate(view.end.date, [view.start.date])} · 净资产 <span style={{ color: 'var(--text)' }}>{formatCny(view.end.net)}</span>
                        </>
                      )}
                    </div>
                  </div>
                  <div style={{ flex: '0 0 auto' }}>
                    <PillTabs
                      ariaLabel="asset stats range"
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
                </div>
              </div>

              <motion.div
                className="card"
                initial={scaleInInitial}
                animate={scaleInAnimate}
                transition={cardScaleTransition(0.2)}
              >
                <div className="cardInner">
                  <div style={cardTitleStyle}>区间变化</div>
                  <div className="muted" style={{ marginTop: -6, marginBottom: 10, fontSize: 11, fontWeight: 600 }}>
                    基于快照差值（含流量/估值波动）
                  </div>
                  <MetricGrid>
                    <MetricTile label="净资产" value={formatDelta(view.delta.net)} />
                    <MetricTile label="总资产" value={formatDelta(view.delta.assets)} />
                    <MetricTile label="负债" value={formatDelta(view.delta.debt)} valueColor={debtDeltaTone(view.delta.debt)} />
                    <MetricTile label="流动资金" value={formatDelta(view.delta.cash)} valueColor={colors.liquid} />
                    <MetricTile label="投资" value={formatDelta(view.delta.invest)} valueColor={colors.invest} />
                    <MetricTile label="固定资产" value={formatDelta(view.delta.fixed)} valueColor={colors.fixed} />
                    <MetricTile label="应收款" value={formatDelta(view.delta.receivable)} valueColor={colors.receivable} />
                    <MetricTile
                      label="快照数量"
                      value={`${view.selectedCount}条`}
                      sub={view.rangeFallback ? '所选区间不足 2 条，已显示全部' : view.days != null ? `跨度 ${view.days} 天` : undefined}
                    />
                  </MetricGrid>
                </div>
              </motion.div>

              <motion.div
                className="card"
                initial={scaleInInitial}
                animate={scaleInAnimate}
                transition={cardScaleTransition(0.25)}
              >
                <div className="cardInner">
                  <div style={cardTitleStyle}>增长与节奏</div>
                  <MetricGrid>
                    <MetricTile label="净资产增长率" value={formatPct(view.growth.net)} sub={view.start.net > 0 ? undefined : '起始净资产≤0，未计算'} />
                    <MetricTile label="总资产增长率" value={formatPct(view.growth.assets)} sub={view.assetsStart > 0 ? undefined : '起始资产≤0，未计算'} />
                    <MetricTile label="负债增长率" value={formatPct(view.growth.debt)} valueColor={debtDeltaTone(view.growth.debt)} sub={view.start.debt > 0 ? undefined : '起始负债≤0，未计算'} />
                    <MetricTile label="日均净资产变化" value={view.growth.avgDailyNet != null ? formatDelta(view.growth.avgDailyNet) : '—'} sub={formatNetChangePaceSource(view.netPace)} />
                  </MetricGrid>
                </div>
              </motion.div>
            </>
          ) : (
            <div className="muted" style={{ padding: '14px 0', textAlign: 'center', fontSize: 12, fontWeight: 600 }}>
              暂无快照数据
            </div>
          )}
        </div>
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
