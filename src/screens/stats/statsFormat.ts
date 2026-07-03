import { formatCny } from '../../lib/format'
import { normalizeMoney } from '../../lib/money'
import { shouldShowYearForDateKeys } from '../../lib/dateSeries'
import type { CSSProperties } from 'react'
import type { NetChangePace, SavingsGoalSummary } from '../../lib/savingsGoal'

/** Semantic tones shared across the stats cards. */
export const TONE = {
  good: '#10b981',
  bad: '#ef4444',
  warn: '#f59e0b',
  alert: '#f97316',
} as const

/** Inset panel used for period rows / slider shells — matches the tile glass. */
export const insetPanelStyle = {
  minWidth: 0,
  border: '1px solid rgba(15, 23, 42, 0.06)',
  borderRadius: 14,
  padding: 12,
  background: 'rgba(248, 250, 252, 0.66)',
  boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.76)',
} satisfies CSSProperties

export function clampProgress(value: number) {
  return Math.max(0, Math.min(1, value))
}

export function formatPct(value: number | null) {
  if (value == null || !Number.isFinite(value)) return '—'
  return `${Math.round(value * 100)}%`
}

export function formatX(value: number | null) {
  if (value == null) return '—'
  if (!Number.isFinite(value)) return '∞'
  return `${value.toFixed(2)}x`
}

export function formatDelta(value: number) {
  const abs = Math.abs(value)
  const text = formatCny(abs)
  if (value > 0) return `+${text}`
  if (value < 0) return `-${text}`
  return text
}

export function formatAbsCny(value: number) {
  return formatCny(Math.abs(value))
}

export function formatNullableCny(value: number | null) {
  return value == null ? '—' : formatCny(value)
}

export function debtAmountTone(value: number) {
  return value > 0 ? TONE.bad : undefined
}

export function debtDeltaTone(value: number | null) {
  if (value == null || value === 0 || !Number.isFinite(value)) return undefined
  return value > 0 ? TONE.bad : TONE.good
}

export function formatPaceSource(
  method: NetChangePace['method'] | null | undefined,
  snapshotCount: number | null | undefined,
  sampleDays: number | null | undefined,
) {
  if (!method || !snapshotCount || !sampleDays) return '样本跨度不足，暂不估算'
  const methodText = {
    'recent-window': '按近期快照估算',
    'monthly-close': '按月度收盘估算',
    'monthly-smoothed': '按月度波动平滑',
    'long-window': '按长期跨度估算',
  }[method]
  return `${methodText} · ${snapshotCount}条/${sampleDays}天`
}

export function formatNetChangePaceSource(pace: NetChangePace | null | undefined) {
  return pace ? formatPaceSource(pace.method, pace.snapshotCount, pace.sampleDays) : formatPaceSource(null, null, null)
}

export function formatSummaryPaceSource(summary: SavingsGoalSummary) {
  return formatPaceSource(summary.avgDailyNetChangeMethod, summary.avgDailyNetChangeSnapshotCount, summary.avgDailyNetChangeSampleDays)
}

export function formatGoalDate(dateKey: string | null | undefined) {
  if (!dateKey) return '未设置'
  const d = new Date(`${dateKey}T00:00:00`)
  if (Number.isNaN(d.getTime())) return dateKey
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`
}

export function formatShortGoalDate(dateKey: string | null | undefined, contextDateKeys: Array<string | null | undefined> = []) {
  if (!dateKey) return '未设置'
  const d = new Date(`${dateKey}T00:00:00`)
  if (Number.isNaN(d.getTime())) return dateKey
  if (shouldShowYearForDateKeys([dateKey, ...contextDateKeys])) return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`
  return `${d.getMonth() + 1}月${d.getDate()}日`
}

export function formatCompactDateRange(startDateKey: string, endDateKey: string) {
  const start = new Date(`${startDateKey}T00:00:00`)
  const end = new Date(`${endDateKey}T00:00:00`)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return `${startDateKey} 至 ${endDateKey}`
  if (start.getFullYear() === end.getFullYear()) {
    return `${start.getFullYear()}/${start.getMonth() + 1}/${start.getDate()}-${end.getMonth() + 1}/${end.getDate()}`
  }
  return `${start.getFullYear()}/${start.getMonth() + 1}/${start.getDate()}-${end.getFullYear()}/${end.getMonth() + 1}/${end.getDate()}`
}

export function parseMoneyInput(value: string) {
  const normalized = value.replace(/[,\s￥¥]/g, '')
  const parsed = Number(normalized)
  if (!Number.isFinite(parsed)) return null
  return normalizeMoney(parsed)
}

export function formatGoalInputAmount(value: number) {
  const normalized = normalizeMoney(value)
  if (Number.isInteger(normalized)) return String(normalized)
  return normalized.toFixed(2).replace(/\.?0+$/, '')
}

export function formatMonthlyIncomeInput(value: number) {
  return value > 0 ? formatGoalInputAmount(value) : ''
}
