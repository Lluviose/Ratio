import { useEffect, useMemo, useRef, useState } from 'react'
import { Line, LineChart, Tooltip, XAxis, YAxis } from 'recharts'
import { motion } from 'framer-motion'
import { PillTabs } from '../components/PillTabs'
import { SegmentedControl } from '../components/SegmentedControl'
import { getGroupIdByAccountType, type AccountGroupId } from '../lib/accounts'
import { formatCny } from '../lib/format'
import { getGoalDeltaDisplay } from '../lib/goalDeltaDisplay'
import { subtractMoney } from '../lib/money'
import { clampMonthStartDay, DEFAULT_MONTH_START_DAY, formatMonthKeyLabel, MONTH_START_DAY_KEY, monthKeyForDateKey } from '../lib/monthStart'
import {
  SAVINGS_GOAL_KEY,
  addDaysToDateKey,
  coerceSavingsGoal,
  diffDateDays,
  getGoalComparisonValue,
  getLinearGoalValue,
  getSavingsGoalSummary,
  type SavingsGoal,
  type SavingsGoalSummary,
} from '../lib/savingsGoal'
import type { Snapshot } from '../lib/snapshots'
import { useLocalStorageState } from '../lib/useLocalStorageState'

type TrendMode = 'netDebt' | 'cashInvest'

type RangeId = '30d' | '6m' | '1y' | 'custom'

const RECENT_SNAPSHOT_LIMIT = 90
const DAYS_PER_MONTH = 30.4375

type TrendPoint = {
  date: string
  dateKey: string
  idx: number
  net: number | null
  debt: number | null
  cash: number | null
  invest: number | null
  fixed: number | null
  receivable: number | null
  goalTarget?: number | null
  goalComparison?: number | null
  projectedNet?: number | null
}

function toDateKey(d: Date) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function getDateYear(dateKey: string | null | undefined) {
  if (!dateKey) return null
  const m = /^(\d{4})/.exec(dateKey)
  if (!m) return null
  const year = Number(m[1])
  return Number.isFinite(year) ? year : null
}

function shouldShowYearForDateKeys(dateKeys: Array<string | null | undefined>) {
  const years = new Set<number>()
  for (const dateKey of dateKeys) {
    const year = getDateYear(dateKey)
    if (year != null) years.add(year)
  }
  if (years.size > 1) return true
  const [year] = Array.from(years)
  return year != null && year !== new Date().getFullYear()
}

function formatLabel(date: string, options?: { showYear?: boolean }) {
  // date is stored as YYYY-MM-DD
  const d = new Date(`${date}T00:00:00`)
  if (Number.isNaN(d.getTime())) return date
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const showYear = options?.showYear ?? shouldShowYearForDateKeys([date])
  if (showYear) return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`
  return `${m}/${day}`
}

function formatMonthLabel(monthKey: string, showYear: boolean) {
  const m = /^(\d{4})-(\d{2})$/.exec(monthKey)
  if (!m) return monthKey
  if (showYear) return `${Number(m[1])}/${Number(m[2])}`
  return formatMonthKeyLabel(monthKey)
}

function pickMonthlyLast(snapshots: Snapshot[], monthCount: number, monthStartDay: number) {
  const sorted = snapshots.slice().sort((a, b) => a.date.localeCompare(b.date))
  const byMonth = new Map<string, Snapshot>()

  for (const s of sorted) {
    const monthKey = monthKeyForDateKey(s.date, monthStartDay)
    byMonth.set(monthKey, s)
  }

  const months = Array.from(byMonth.keys()).sort((a, b) => a.localeCompare(b))
  const pickedKeys = months.slice(Math.max(0, months.length - monthCount))
  return pickedKeys.map((key) => ({ monthKey: key, snapshot: byMonth.get(key)! }))
}

function toPoint(s: Snapshot, idx: number, label: string): TrendPoint {
  return {
    date: label,
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

function formatMaybeCny(value: number | null | undefined) {
  return typeof value === 'number' && Number.isFinite(value) ? formatCny(value) : '—'
}

function formatGoalPaceSource(summary: SavingsGoalSummary) {
  if (summary.avgDailyNetChange == null || !summary.avgDailyNetChangeMethod) return '速度等待更多快照'
  const methodText = summary.avgDailyNetChangeMethod === 'monthly-close' ? '月度估算' : '快照估算'
  return `${methodText} ${formatDelta(summary.avgDailyNetChange * DAYS_PER_MONTH)}/月`
}

function accountDeltaTone(delta: number, groupId: AccountGroupId) {
  if (delta === 0) return 'var(--muted-text)'
  const improvesNetWorth = groupId === 'debt' ? delta < 0 : delta > 0
  return improvesNetWorth ? '#47d16a' : '#ff6b57'
}

function formatGoalDate(dateKey: string | null | undefined, contextDateKeys: Array<string | null | undefined> = []) {
  if (!dateKey) return '暂无'
  return formatLabel(dateKey, { showYear: shouldShowYearForDateKeys([dateKey, ...contextDateKeys]) })
}

function makeGoalPoint(dateKey: string, label?: string, showYear?: boolean): TrendPoint {
  return {
    date: label ?? formatLabel(dateKey, { showYear: showYear || shouldShowYearForDateKeys([dateKey]) }),
    dateKey,
    idx: -1,
    net: null,
    debt: null,
    cash: null,
    invest: null,
    fixed: null,
    receivable: null,
    goalTarget: null,
    goalComparison: null,
    projectedNet: null,
  }
}

function addFutureCheckpoints(
  ensurePoint: (dateKey: string, label?: string) => void,
  startDate: string,
  endDate: string,
  maxPoints = 8,
) {
  const days = diffDateDays(startDate, endDate)
  if (days == null || days <= 35) return

  const count = Math.min(maxPoints, Math.max(1, Math.floor(days / 45)))
  for (let i = 1; i <= count; i += 1) {
    const next = addDaysToDateKey(startDate, Math.round((days * i) / (count + 1)))
    if (next && next > startDate && next < endDate) ensurePoint(next)
  }
}

function withGoalTrendLines(points: TrendPoint[], goal: SavingsGoal | null, summary: SavingsGoalSummary | null, showYear: boolean) {
  if (!goal || !summary || points.length === 0) return points

  const firstDate = points[0]?.dateKey
  if (!firstDate) return points

  const byDate = new Map<string, TrendPoint>()
  for (const point of points) {
    byDate.set(point.dateKey, { ...point, goalTarget: null, goalComparison: null, projectedNet: null })
  }

  const ensurePoint = (dateKey: string, label?: string) => {
    if (dateKey < firstDate) return
    if (!byDate.has(dateKey)) byDate.set(dateKey, makeGoalPoint(dateKey, label, showYear))
  }

  ensurePoint(goal.targetDate, '目标')
  if (goal.startDate >= firstDate) ensurePoint(goal.startDate)
  if (summary.latestDate) addFutureCheckpoints(ensurePoint, summary.latestDate, goal.targetDate)

  let projectionEnd: string | null = null
  if (summary.latestDate && summary.avgDailyNetChange != null) {
    projectionEnd = goal.targetDate
    if (summary.projectedDate && summary.projectedDate > summary.latestDate && summary.projectedDate < goal.targetDate) {
      projectionEnd = summary.projectedDate
    }
    ensurePoint(summary.latestDate)
    ensurePoint(projectionEnd, projectionEnd === goal.targetDate ? '目标' : '预计')
    addFutureCheckpoints(ensurePoint, summary.latestDate, projectionEnd)
  }

  const merged = Array.from(byDate.values()).sort((a, b) => a.dateKey.localeCompare(b.dateKey))
  for (const point of merged) {
    point.goalTarget = getLinearGoalValue(goal, point.dateKey)
    point.goalComparison = point.dateKey >= goal.startDate ? getGoalComparisonValue(goal, point.dateKey) : null

    if (summary.latestDate && projectionEnd && summary.avgDailyNetChange != null) {
      const daysFromLatest = diffDateDays(summary.latestDate, point.dateKey)
      if (daysFromLatest != null && daysFromLatest >= 0 && point.dateKey <= projectionEnd) {
        point.projectedNet = summary.currentNetWorth + summary.avgDailyNetChange * daysFromLatest
      }
    }
  }

  return merged
}

function pickTopChangingAccounts(prev: Snapshot | null, curr: Snapshot, limit: number) {
  if (!prev || !prev.accounts || !curr.accounts) return null

  const prevById = new Map<string, number>()
  for (const a of prev.accounts) prevById.set(a.id, a.balance)

  const currById = new Map<string, number>()
  for (const a of curr.accounts) currById.set(a.id, a.balance)

  const changes: { id: string; name: string; delta: number; groupId: AccountGroupId }[] = []

  for (const a of curr.accounts) {
    const before = prevById.get(a.id) ?? 0
    const delta = subtractMoney(a.balance, before)
    if (delta !== 0) changes.push({ id: a.id, name: a.name, delta, groupId: getGroupIdByAccountType(a.type) })
  }

  for (const a of prev.accounts) {
    if (!currById.has(a.id)) {
      const delta = subtractMoney(0, a.balance)
      if (delta !== 0) changes.push({ id: a.id, name: a.name, delta, groupId: getGroupIdByAccountType(a.type) })
    }
  }

  changes.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
  return changes.slice(0, limit)
}

import { type ThemeColors } from '../lib/themes'

export function TrendScreen(props: { snapshots: Snapshot[]; colors: ThemeColors }) {
  const { snapshots, colors } = props
  const [mode, setMode] = useState<TrendMode>('netDebt')
  const [range, setRange] = useState<RangeId>('1y')
  const [monthStartDayRaw] = useLocalStorageState<number>(MONTH_START_DAY_KEY, DEFAULT_MONTH_START_DAY)
  const [goal] = useLocalStorageState<SavingsGoal | null>(SAVINGS_GOAL_KEY, null, {
    coerce: coerceSavingsGoal,
  })
  const monthStartDay = clampMonthStartDay(monthStartDayRaw)

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

  const view = useMemo(() => {
    if (!snapshots || snapshots.length === 0) return { points: [] as TrendPoint[], selected: [] as Snapshot[], showYear: false }

    const sorted = snapshots.slice().sort((a, b) => a.date.localeCompare(b.date))

    let selected: Snapshot[] = []
    let labels: string[] = []
    let showYear = false

    if (range === '30d') {
      const cutoff = new Date()
      cutoff.setDate(cutoff.getDate() - 30)
      const cutoffKey = toDateKey(cutoff)
      selected = sorted.filter((s) => s.date >= cutoffKey)
      showYear = shouldShowYearForDateKeys(selected.map((s) => s.date))
      labels = selected.map((s) => formatLabel(s.date, { showYear }))
    } else if (range === '6m') {
      const picked = pickMonthlyLast(sorted, 6, monthStartDay)
      selected = picked.map((x) => x.snapshot)
      showYear = shouldShowYearForDateKeys(picked.map((x) => x.monthKey))
      labels = picked.map((x) => formatMonthLabel(x.monthKey, showYear))
    } else if (range === 'custom') {
      selected = sorted.slice(Math.max(0, sorted.length - RECENT_SNAPSHOT_LIMIT))
      showYear = shouldShowYearForDateKeys(selected.map((s) => s.date))
      labels = selected.map((s) => formatLabel(s.date, { showYear }))
    } else {
      const picked = pickMonthlyLast(sorted, 12, monthStartDay)
      selected = picked.map((x) => x.snapshot)
      showYear = shouldShowYearForDateKeys(picked.map((x) => x.monthKey))
      labels = picked.map((x) => formatMonthLabel(x.monthKey, showYear))
    }

    return {
      points: selected.map((s, idx) => toPoint(s, idx, labels[idx] ?? formatLabel(s.date, { showYear }))),
      selected,
      showYear,
    }
  }, [monthStartDay, range, snapshots])

  const goalSummary = useMemo(() => getSavingsGoalSummary(goal, snapshots, { monthStartDay }), [goal, monthStartDay, snapshots])
  const goalTrendPoints = useMemo(() => withGoalTrendLines(view.points, goal, goalSummary, view.showYear), [goal, goalSummary, view.points, view.showYear])
  const data = mode === 'netDebt' ? goalTrendPoints : view.points
  const showYearInData = shouldShowYearForDateKeys(data.map((point) => point.dateKey))
  const goalDateContext = goalSummary
    ? [goalSummary.startDate, goalSummary.latestDate, goalSummary.targetDate, goalSummary.projectedDate]
    : []
  const goalPaceText = !goalSummary
    ? ''
    : goalSummary.isComplete
      ? '已达成'
      : goalSummary.isPastDue
        ? '已逾期'
        : goalSummary.isDueToday
          ? '今日到期'
          : goalSummary.isOnTrack === true
            ? '跟得上目标'
            : goalSummary.isOnTrack === false
              ? '低于目标节奏'
              : '等待更多快照'
  const goalPaceColor = !goalSummary
    ? 'var(--muted-text)'
    : goalSummary.isComplete || goalSummary.isOnTrack === true
      ? '#10b981'
      : goalSummary.isPastDue || goalSummary.isDueToday || goalSummary.isOnTrack === false
        ? '#ef4444'
        : 'var(--muted-text)'
  const goalDeltaText = goalSummary ? getGoalDeltaDisplay(goalSummary.targetDeltaAtLatest).inline : null

  const tooltip = (props: unknown) => {
    const active = Boolean((props as { active?: boolean } | null)?.active)
    const payload = (props as { payload?: readonly unknown[] } | null)?.payload
    if (!active || !payload || payload.length === 0) return null
    const p = (payload[0] as { payload?: TrendPoint } | undefined)?.payload
    if (!p) return null

    const idx = p.idx
    const currSnap = idx >= 0 ? view.selected[idx] ?? null : null
    const prevSnap = idx > 0 ? view.selected[idx - 1] : null
    const topChanges = currSnap ? pickTopChangingAccounts(prevSnap, currSnap, 3) : null
    const canCompare = Boolean(prevSnap)
    const hasAccountDetails = Boolean(prevSnap?.accounts && currSnap?.accounts)
    const hasBreakdown =
      typeof p.cash === 'number' &&
      typeof p.invest === 'number' &&
      typeof p.fixed === 'number' &&
      typeof p.receivable === 'number' &&
      typeof p.debt === 'number'
    const goalReferenceAtPoint = p.goalComparison ?? p.goalTarget
    const targetDeltaAtPoint = typeof p.net === 'number' && goalReferenceAtPoint != null ? p.net - goalReferenceAtPoint : null
    const targetDeltaDisplay = getGoalDeltaDisplay(targetDeltaAtPoint)
    const exactDateLabel = formatLabel(p.dateKey, { showYear: showYearInData })
    const tooltipDateLabel = p.date === exactDateLabel ? p.date : `${p.date}（${exactDateLabel}）`

    const breakdown = hasBreakdown ? (
      <div style={{ marginTop: 10 }}>
        <div style={{ height: 1, background: 'var(--hairline)', margin: '10px 0' }} />
        <div style={{ fontWeight: 850, fontSize: 12, color: 'var(--muted-text)', marginBottom: 8 }}>分组构成</div>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 12, fontWeight: 850, marginTop: 6 }}>
          <div style={{ color: 'var(--muted-text)' }}>流动资金</div>
          <div style={{ color: colors.liquid }}>{formatMaybeCny(p.cash)}</div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 12, fontWeight: 850, marginTop: 6 }}>
          <div style={{ color: 'var(--muted-text)' }}>投资</div>
          <div style={{ color: colors.invest }}>{formatMaybeCny(p.invest)}</div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 12, fontWeight: 850, marginTop: 6 }}>
          <div style={{ color: 'var(--muted-text)' }}>固定资产</div>
          <div style={{ color: colors.fixed }}>{formatMaybeCny(p.fixed)}</div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 12, fontWeight: 850, marginTop: 6 }}>
          <div style={{ color: 'var(--muted-text)' }}>应收款</div>
          <div style={{ color: colors.receivable }}>{formatMaybeCny(p.receivable)}</div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 12, fontWeight: 850, marginTop: 6 }}>
          <div style={{ color: 'var(--muted-text)' }}>负债</div>
          <div style={{ opacity: 0.75, color: colors.debt }}>{formatMaybeCny(p.debt)}</div>
        </div>
      </div>
    ) : null

    const topChangePanel = currSnap ? (
      <div style={{ marginTop: 10 }}>
        <div style={{ height: 1, background: 'var(--hairline)', margin: '10px 0' }} />
        <div style={{ fontWeight: 850, fontSize: 12, color: 'var(--muted-text)', marginBottom: 8 }}>Top变动账户</div>
        <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--muted-text)', opacity: 0.75, marginTop: -6, marginBottom: 8 }}>
          基于相邻快照余额差（含流量/估值波动）
        </div>
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
                <div style={{ color: accountDeltaTone(c.delta, c.groupId) }}>{formatDelta(c.delta)}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    ) : null

    const goalPanel =
      mode === 'netDebt' && (p.goalTarget != null || p.goalComparison != null || p.projectedNet != null) ? (
        <div style={{ marginTop: 10 }}>
          <div style={{ height: 1, background: 'var(--hairline)', margin: '10px 0' }} />
          <div style={{ fontWeight: 850, fontSize: 12, color: 'var(--muted-text)', marginBottom: 8 }}>储蓄路径</div>
          {p.goalTarget != null ? (
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 12, fontWeight: 850, marginTop: 6 }}>
              <div style={{ color: 'var(--muted-text)' }}>目标路径</div>
              <div style={{ color: 'rgba(15,23,42,0.72)' }}>{formatCny(p.goalTarget)}</div>
            </div>
          ) : null}
          {p.goalTarget == null && p.goalComparison != null ? (
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 12, fontWeight: 850, marginTop: 6 }}>
              <div style={{ color: 'var(--muted-text)' }}>目标基准</div>
              <div style={{ color: 'rgba(15,23,42,0.72)' }}>{formatCny(p.goalComparison)}</div>
            </div>
          ) : null}
          {p.projectedNet != null ? (
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 12, fontWeight: 850, marginTop: 6 }}>
              <div style={{ color: 'var(--muted-text)' }}>当前速度</div>
              <div style={{ color: '#10b981' }}>{formatCny(p.projectedNet)}</div>
            </div>
          ) : null}
          {targetDeltaAtPoint != null ? (
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 12, fontWeight: 850, marginTop: 6 }}>
              <div style={{ color: 'var(--muted-text)' }}>{targetDeltaDisplay.label}</div>
              <div style={{ color: targetDeltaDisplay.tone ?? 'var(--text)' }}>{targetDeltaDisplay.value}</div>
            </div>
          ) : null}
        </div>
      ) : null

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
          <div style={{ fontWeight: 800, fontSize: 13, color: 'var(--muted-text)', marginBottom: 8 }}>{tooltipDateLabel}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--primary)' }} />
            <div style={{ fontWeight: 900, fontSize: 14 }}>净资产 {formatMaybeCny(p.net)}</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'rgba(11, 15, 26, 0.2)' }} />
            <div style={{ fontWeight: 900, fontSize: 14, opacity: 0.6 }}>负债 {formatMaybeCny(p.debt)}</div>
          </div>
          {goalPanel}
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
        <div style={{ fontWeight: 800, fontSize: 13, color: 'var(--muted-text)', marginBottom: 8 }}>{tooltipDateLabel}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
             <div style={{ width: 8, height: 8, borderRadius: '50%', background: colors.liquid }} />
             <div style={{ fontWeight: 900, fontSize: 14 }}>流动资金 {formatMaybeCny(p.cash)}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
             <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--primary)' }} />
             <div style={{ fontWeight: 900, fontSize: 14, opacity: 0.8 }}>投资 {formatMaybeCny(p.invest)}</div>
        </div>
        {breakdown}
        {topChangePanel}
      </div>
    )
  }

  return (
    <div className="stack" style={{ padding: '0 16px', overscrollBehavior: 'contain', touchAction: 'pan-y' }}>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
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

        <motion.div
          ref={chartRef}
          style={{
            height: 240,
            marginTop: 24,
            position: 'relative',
            zIndex: 1,
            overscrollBehavior: 'contain',
            touchAction: 'pan-y',
            userSelect: 'none',
            WebkitUserSelect: 'none',
          }}
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: 'spring', damping: 20, stiffness: 100, delay: 0.1 }}
        >
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
                wrapperStyle={{ zIndex: 2, pointerEvents: 'none' }}
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
                    stroke={colors.debt}
                    strokeWidth={3}
                    dot={false}
                    activeDot={{ r: 5, strokeWidth: 3, stroke: '#fff' }}
                    animationDuration={1500}
                    animationEasing="ease-out"
                  />
                  {goalSummary ? (
                    <>
                      <Line
                        type="monotone"
                        dataKey="goalTarget"
                        stroke="rgba(15, 23, 42, 0.42)"
                        strokeWidth={2.5}
                        strokeDasharray="7 7"
                        dot={false}
                        activeDot={false}
                        connectNulls={false}
                        animationDuration={900}
                        animationEasing="ease-out"
                      />
                      <Line
                        type="monotone"
                        dataKey="projectedNet"
                        stroke="#10b981"
                        strokeWidth={3}
                        strokeDasharray="2 7"
                        dot={false}
                        activeDot={{ r: 5, strokeWidth: 3, stroke: '#fff' }}
                        connectNulls={false}
                        animationDuration={900}
                        animationEasing="ease-out"
                      />
                    </>
                  ) : null}
                </>
              ) : (
                <>
                  <Line
                    type="monotone"
                    dataKey="cash"
                    stroke={colors.liquid}
                    strokeWidth={4}
                    dot={false}
                    activeDot={{ r: 6, strokeWidth: 3, stroke: '#fff' }}
                    animationDuration={1500}
                    animationEasing="ease-out"
                  />
                  <Line
                    type="monotone"
                    dataKey="invest"
                    stroke={colors.invest}
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
        </motion.div>

        {mode === 'netDebt' && goalSummary ? (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            style={{
              marginTop: 12,
              border: '1px solid var(--hairline)',
              borderRadius: 18,
              padding: '10px 12px',
              background: 'var(--card)',
              display: 'grid',
              gap: 8,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 900, color: 'var(--muted-text)' }}>
                  <span style={{ width: 18, borderTop: '2px dashed rgba(15,23,42,0.42)' }} />
                  目标路径
                </span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 900, color: 'var(--muted-text)' }}>
                  <span style={{ width: 18, borderTop: '2px dashed #10b981' }} />
                  当前速度
                </span>
              </div>
              <div style={{ fontSize: 11, fontWeight: 950, color: goalPaceColor }}>
                {goalPaceText}
              </div>
            </div>
            <div className="muted" style={{ fontSize: 11, fontWeight: 850 }}>
              目标 {formatCny(goalSummary.targetAmount)} · {formatGoalDate(goalSummary.targetDate, goalDateContext)}
              {goalSummary.projectedDate ? ` · 预计 ${formatGoalDate(goalSummary.projectedDate, goalDateContext)}` : ''}
              {goalDeltaText ? ` · ${goalDeltaText}` : ''}
              {` · ${formatGoalPaceSource(goalSummary)}`}
            </div>
          </motion.div>
        ) : null}

        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 24, position: 'relative', zIndex: 0 }}>
          <PillTabs
            ariaLabel="range"
            options={[
              { value: '30d', label: '30天' },
              { value: '6m', label: '6月' },
              { value: '1y', label: '1年' },
              { value: 'custom', label: `近${RECENT_SNAPSHOT_LIMIT}条` },
            ]}
            value={range}
            onChange={setRange}
          />
        </div>
        {range === 'custom' ? (
          <div className="muted" style={{ textAlign: 'center', marginTop: 10, fontSize: 12, fontWeight: 800 }}>
            按最近 {RECENT_SNAPSHOT_LIMIT} 条快照展示
          </div>
        ) : null}
      </motion.div>
    </div>
  )
}
