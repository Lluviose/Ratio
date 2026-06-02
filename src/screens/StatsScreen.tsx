import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { CalendarDays, Pencil, RotateCcw, Target } from 'lucide-react'
import { BottomSheet } from '../components/BottomSheet'
import { PillTabs } from '../components/PillTabs'
import { formatCny } from '../lib/format'
import { addMoney, normalizeMoney, subtractMoney } from '../lib/money'
import {
  SAVINGS_GOAL_KEY,
  coerceSavingsGoal,
  defaultGoalDate,
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
    <div style={{ border: '1px solid var(--hairline)', borderRadius: 18, padding: 12, background: 'var(--card)' }}>
      <div style={{ fontSize: 11, fontWeight: 900, color: 'var(--muted-text)' }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 950, marginTop: 4, color: valueColor ?? 'var(--text)' }}>{value}</div>
      {sub ? <div style={{ fontSize: 11, fontWeight: 850, marginTop: 4, color: 'var(--muted-text)' }}>{sub}</div> : null}
    </div>
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
          style={{ rotate: -90, transformOrigin: '50% 50%' }}
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
        <div style={{ fontSize: 24, fontWeight: 950, lineHeight: 1 }}>{pct}%</div>
        <div style={{ fontSize: 10, fontWeight: 900, color: 'var(--muted-text)', marginTop: 4 }}>进度</div>
      </div>
    </div>
  )
}

function SavingsMilestoneStrip(props: { summary: SavingsGoalSummary; color: string }) {
  const { summary, color } = props
  const totalNeeded = summary.targetAmount - summary.startNetWorth
  if (totalNeeded <= 0) return null

  const currentProgress = Math.max(0, Math.min(1, summary.progress))
  const nextProgress = GOAL_MILESTONES.find((milestone) => currentProgress < milestone - 0.0001) ?? 1
  const milestoneAmount = normalizeMoney(summary.startNetWorth + totalNeeded * nextProgress)
  const amountLeft = Math.max(0, normalizeMoney(milestoneAmount - summary.currentNetWorth))
  const milestonePct = Math.round(nextProgress * 100)
  const progressPct = `${Math.round(currentProgress * 1000) / 10}%`
  const subtitle = summary.isComplete
    ? '当前目标已完成'
    : amountLeft <= 0
      ? `已到达 ${milestonePct}% 里程碑`
      : `再存 ${formatCny(amountLeft)} 到 ${formatCny(milestoneAmount)}`

  return (
    <div style={{ marginTop: 12, display: 'grid', gap: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
        <div style={{ fontSize: 11, fontWeight: 900, color: 'var(--muted-text)' }}>下一里程碑</div>
        <div style={{ fontSize: 11, fontWeight: 950, color }}>{milestonePct}%</div>
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
          style={{ height: '100%', borderRadius: 999, background: color }}
        />
        {GOAL_MILESTONES.map((milestone) => (
          <span
            key={milestone}
            style={{
              position: 'absolute',
              top: 2,
              bottom: 2,
              left: `${milestone * 100}%`,
              width: 2,
              borderRadius: 999,
              transform: 'translateX(-1px)',
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

type WaterfallContribution = {
  id: string
  label: string
  value: number
  color: string
}

function NetWorthWaterfallCard(props: {
  startNet: number
  endNet: number
  contributions: WaterfallContribution[]
}) {
  const { startNet, endNet, contributions } = props
  const width = 336
  const height = 178
  const top = 18
  const bottom = 38
  const left = 10
  const chartH = height - top - bottom

  const bars: Array<{ id: string; label: string; from: number; to: number; value: number; color: string; total?: boolean }> = []
  bars.push({ id: 'start', label: '期初', from: 0, to: startNet, value: startNet, color: 'rgba(15,23,42,0.72)', total: true })

  let running = startNet
  for (const item of contributions) {
    const next = normalizeMoney(running + item.value)
    bars.push({
      id: item.id,
      label: item.label,
      from: running,
      to: next,
      value: item.value,
      color: item.value >= 0 ? item.color : '#ef4444',
    })
    running = next
  }

  bars.push({ id: 'end', label: '期末', from: 0, to: endNet, value: endNet, color: 'var(--primary)', total: true })

  const allValues = bars.flatMap((bar) => [bar.from, bar.to, 0])
  const rawMin = Math.min(...allValues)
  const rawMax = Math.max(...allValues)
  const pad = Math.max(1000, (rawMax - rawMin) * 0.14)
  const min = rawMin - pad
  const max = rawMax + pad
  const range = Math.max(1, max - min)
  const barW = 26
  const gap = (width - left * 2 - barW * bars.length) / Math.max(1, bars.length - 1)
  const yFor = (value: number) => top + ((max - value) / range) * chartH
  const zeroY = yFor(0)
  const netDelta = normalizeMoney(endNet - startNet)

  return (
    <motion.div
      className="card"
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: 0.06 }}
    >
      <div className="cardInner">
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontWeight: 950, fontSize: 14 }}>净资产变化瀑布图</div>
            <div className="muted" style={{ fontSize: 11, fontWeight: 850, marginTop: 3 }}>拆解本区间净资产变化来源</div>
          </div>
          <div style={{ fontSize: 13, fontWeight: 950, color: netDelta >= 0 ? '#10b981' : '#ef4444' }}>{formatDelta(netDelta)}</div>
        </div>

        <div style={{ width: '100%', overflow: 'hidden', marginTop: 10 }}>
          <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} role="img" aria-label="net worth waterfall chart">
            <line x1={left} x2={width - left} y1={zeroY} y2={zeroY} stroke="rgba(15,23,42,0.12)" strokeDasharray="4 4" />
            {bars.map((bar, index) => {
              const x = left + index * (barW + gap)
              const yTop = yFor(Math.max(bar.from, bar.to))
              const yBottom = yFor(Math.min(bar.from, bar.to))
              const rectH = Math.max(2, yBottom - yTop)
              const nextBar = bars[index + 1]
              const connectorY = yFor(bar.to)
              const nextX = left + (index + 1) * (barW + gap)

              return (
                <g key={bar.id}>
                  {nextBar ? (
                    <line
                      x1={x + barW}
                      x2={nextX}
                      y1={connectorY}
                      y2={connectorY}
                      stroke="rgba(15,23,42,0.16)"
                      strokeWidth={1}
                    />
                  ) : null}
                  <motion.rect
                    x={x}
                    y={yTop}
                    width={barW}
                    height={rectH}
                    rx={7}
                    fill={bar.color}
                    initial={{ opacity: 0, y: yTop + 8 }}
                    animate={{ opacity: 1, y: yTop }}
                    transition={{ duration: 0.34, delay: 0.08 + index * 0.04, ease: [0.16, 1, 0.3, 1] }}
                  />
                  <text x={x + barW / 2} y={height - 16} textAnchor="middle" fontSize={10} fontWeight={800} fill="var(--muted-text)">
                    {bar.label}
                  </text>
                </g>
              )
            })}
          </svg>
        </div>

        <div style={{ display: 'grid', gap: 8, marginTop: 4 }}>
          {contributions.map((item) => (
            <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 12, fontWeight: 850 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--muted-text)' }}>
                <span style={{ width: 8, height: 8, borderRadius: 4, background: item.value >= 0 ? item.color : '#ef4444' }} />
                {item.label}
              </div>
              <div style={{ color: item.value >= 0 ? '#10b981' : '#ef4444' }}>{formatDelta(item.value)}</div>
            </div>
          ))}
        </div>
      </div>
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
            <div style={{ fontSize: 22, fontWeight: 950, marginTop: 3 }}>{formatCny(summary.targetAmount)}</div>
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
  const waterfallContributions = useMemo<WaterfallContribution[]>(() => {
    if (!view) return []
    const base = [
      { id: 'cash', label: '流动', value: view.delta.cash, color: colors.liquid },
      { id: 'invest', label: '投资', value: view.delta.invest, color: colors.invest },
      { id: 'fixed', label: '固定', value: view.delta.fixed, color: colors.fixed },
      { id: 'receivable', label: '应收', value: view.delta.receivable, color: colors.receivable },
      { id: 'debt', label: '负债', value: normalizeMoney(-view.delta.debt), color: colors.debt },
    ]
    const contributionTotal = normalizeMoney(base.reduce((sum, item) => sum + item.value, 0))
    const residual = normalizeMoney(view.delta.net - contributionTotal)
    if (Math.abs(residual) >= 0.01) {
      base.push({ id: 'other', label: '其他', value: residual, color: 'rgba(15,23,42,0.58)' })
    }
    return base
  }, [colors.debt, colors.fixed, colors.invest, colors.liquid, colors.receivable, view])

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
            <SavingsGoalCard
              goal={goal}
              summary={goalSummary}
              color={colors.invest}
              onEdit={() => setGoalSheetOpen(true)}
            />

            <NetWorthWaterfallCard
              startNet={view.start.net}
              endNet={view.end.net}
              contributions={waterfallContributions}
            />

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
                <div className="muted" style={{ marginTop: -6, marginBottom: 10, fontSize: 11, fontWeight: 800 }}>
                  基于快照差值（含流量/估值波动）
                </div>
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
