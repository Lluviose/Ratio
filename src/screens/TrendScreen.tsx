import { useEffect, useMemo, useRef, useState } from 'react'
import { CartesianGrid, Line, LineChart, ReferenceArea, ReferenceLine, Tooltip, XAxis, YAxis } from 'recharts'
import { AnimatePresence, motion } from 'framer-motion'
import { X } from 'lucide-react'
import { PillTabs } from '../components/PillTabs'
import { SegmentedControl } from '../components/SegmentedControl'
import { getGroupIdByAccountType, type AccountGroupId } from '../lib/accounts'
import { formatCny } from '../lib/format'
import { getGoalDeltaDisplay } from '../lib/goalDeltaDisplay'
import { subtractMoney } from '../lib/money'
import { clampMonthStartDay, DEFAULT_MONTH_START_DAY, MONTH_START_DAY_KEY } from '../lib/monthStart'
import { shouldShowYearForDateKeys } from '../lib/dateSeries'
import {
  cardEntranceAnimate,
  cardEntranceInitial,
  cardEntranceTransition,
  fadeUpAnimate,
  quickFade,
  screenTransition,
  tooltipExit,
} from '../lib/motionPresets'
import {
  SAVINGS_GOAL_KEY,
  SAVINGS_PACE_ALGORITHM_KEY,
  coerceSavingsGoal,
  coerceSavingsPaceAlgorithm,
  dateKeyToUtcDays,
  getSavingsGoalSummary,
  getSavingsProjectionStartDate,
  toDateKey,
  type SavingsGoal,
  type SavingsGoalSummary,
  type SavingsPaceAlgorithm,
} from '../lib/savingsGoal'
import type { Snapshot } from '../lib/snapshots'
import { withGoalTrendLines, type TrendPoint } from './trendGoalLines'
import { buildTrendChartDerived, buildTrendView, formatLabel, RECENT_SNAPSHOT_LIMIT, type RangeId } from './trendView'
import { useLocalStorageState } from '../lib/useLocalStorageState'

type TrendMode = 'netDebt' | 'cashInvest'
const DAYS_PER_MONTH = 30.4375
const CHART_HEIGHT = 252
const FORECAST_STROKE = '#059669'
const FORECAST_AREA_FILL = '#64748b'

const trendPageInitial = {
  opacity: 0,
  y: 20,
}

const trendPageTransition = {
  duration: 0.38,
}

const chartEntranceTransition = {
  ...cardEntranceTransition,
  delay: 0.08,
}

const detailExit = {
  opacity: 0,
  y: -4,
  scale: 0.98,
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
  const methodText = {
    'recent-window': '近期估算',
    'monthly-close': '月度估算',
    'monthly-smoothed': '平滑估算',
    'long-window': '长期估算',
  }[summary.avgDailyNetChangeMethod]
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
  const [paceAlgorithm] = useLocalStorageState<SavingsPaceAlgorithm>(SAVINGS_PACE_ALGORITHM_KEY, 'smart', {
    coerce: coerceSavingsPaceAlgorithm,
  })
  const [goal] = useLocalStorageState<SavingsGoal | null>(SAVINGS_GOAL_KEY, null, {
    coerce: coerceSavingsGoal,
  })
  const monthStartDay = clampMonthStartDay(monthStartDayRaw)

  const chartRef = useRef<HTMLDivElement | null>(null)
  const activePointRef = useRef<TrendPoint | null>(null)
  const [chartWidth, setChartWidth] = useState(0)
  const [selectedPointKey, setSelectedPointKey] = useState<string | null>(null)

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
    return buildTrendView(snapshots, range, monthStartDay)
  }, [monthStartDay, range, snapshots])

  const goalSummary = useMemo(
    () => getSavingsGoalSummary(goal, snapshots, { monthStartDay, algorithm: paceAlgorithm }),
    [goal, monthStartDay, paceAlgorithm, snapshots],
  )
  const goalTrendPoints = useMemo(
    () => withGoalTrendLines(view.points, goal, goalSummary, view.futureCadence, (dateKey) => formatLabel(dateKey, { showYear: view.showYear }), view.clipStartDate),
    [goal, goalSummary, view.clipStartDate, view.futureCadence, view.points, view.showYear],
  )
  const chartDerived = useMemo(
    () => buildTrendChartDerived({
      mode,
      viewPoints: view.points,
      goalTrendPoints,
      goalSummary,
      getSavingsProjectionStartDate,
    }),
    [goalSummary, goalTrendPoints, mode, view.points],
  )
  const {
    data,
    forecastStartDate,
    forecastStartValue,
    forecastArea,
    hasProjectionBridge,
    showYearInData,
    goalDateContext,
  } = chartDerived
  const xAxisDomainStart = view.domainStartDate ? dateKeyToUtcDays(view.domainStartDate) : null
  const xAxisDomain: [number | 'dataMin', 'dataMax'] = xAxisDomainStart == null
    ? ['dataMin', 'dataMax']
    : [xAxisDomainStart, 'dataMax']
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

  useEffect(() => {
    if (selectedPointKey && !data.some((point) => point.dateKey === selectedPointKey)) {
      setSelectedPointKey(null)
    }
  }, [data, selectedPointKey])

  const selectedPoint = selectedPointKey ? data.find((point) => point.dateKey === selectedPointKey) ?? null : null

  const renderTrendDetail = (p: TrendPoint, onClose?: () => void) => {
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
    const projectedNetForDetail = forecastStartDate && p.dateKey < forecastStartDate ? null : p.projectedNet
    const goalReferenceAtPoint = p.goalComparison ?? p.goalTarget
    const targetDeltaAtPoint = typeof p.net === 'number' && goalReferenceAtPoint != null ? p.net - goalReferenceAtPoint : null
    const targetDeltaDisplay = getGoalDeltaDisplay(targetDeltaAtPoint)
    const exactDateLabel = formatLabel(p.dateKey, { showYear: showYearInData })
    const tooltipDateLabel = p.date === exactDateLabel ? p.date : `${p.date}（${exactDateLabel}）`
    const detailHeader = (
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 8 }}>
        <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--muted-text)' }}>{tooltipDateLabel}</div>
        {onClose ? (
          <button
            type="button"
            className="iconBtn"
            onClick={onClose}
            aria-label="关闭趋势详情"
            style={{ width: 28, height: 28, flex: '0 0 auto' }}
          >
            <X size={15} strokeWidth={2.5} />
          </button>
        ) : null}
      </div>
    )

    const breakdown = hasBreakdown ? (
      <div style={{ marginTop: 10 }}>
        <div style={{ height: 1, background: 'var(--hairline)', margin: '10px 0' }} />
        <div style={{ fontWeight: 650, fontSize: 12, color: 'var(--muted-text)', marginBottom: 8 }}>分组构成</div>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 12, fontWeight: 650, marginTop: 6 }}>
          <div style={{ color: 'var(--muted-text)' }}>流动资金</div>
          <div style={{ color: colors.liquid }}>{formatMaybeCny(p.cash)}</div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 12, fontWeight: 650, marginTop: 6 }}>
          <div style={{ color: 'var(--muted-text)' }}>投资</div>
          <div style={{ color: colors.invest }}>{formatMaybeCny(p.invest)}</div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 12, fontWeight: 650, marginTop: 6 }}>
          <div style={{ color: 'var(--muted-text)' }}>固定资产</div>
          <div style={{ color: colors.fixed }}>{formatMaybeCny(p.fixed)}</div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 12, fontWeight: 650, marginTop: 6 }}>
          <div style={{ color: 'var(--muted-text)' }}>应收款</div>
          <div style={{ color: colors.receivable }}>{formatMaybeCny(p.receivable)}</div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 12, fontWeight: 650, marginTop: 6 }}>
          <div style={{ color: 'var(--muted-text)' }}>负债</div>
          <div style={{ opacity: 0.75, color: colors.debt }}>{formatMaybeCny(p.debt)}</div>
        </div>
      </div>
    ) : null

    const topChangePanel = currSnap ? (
      <div style={{ marginTop: 10 }}>
        <div style={{ height: 1, background: 'var(--hairline)', margin: '10px 0' }} />
        <div style={{ fontWeight: 650, fontSize: 12, color: 'var(--muted-text)', marginBottom: 8 }}>Top变动账户</div>
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted-text)', opacity: 0.75, marginTop: -6, marginBottom: 8 }}>
          基于相邻快照余额差（含流量/估值波动）
        </div>
        {!canCompare ? (
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted-text)' }}>暂无对比快照</div>
        ) : !hasAccountDetails ? (
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted-text)' }}>旧快照无账户明细</div>
        ) : !topChanges || topChanges.length === 0 ? (
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted-text)' }}>无明显变动</div>
        ) : (
          <div style={{ display: 'grid', gap: 6 }}>
            {topChanges.map((c) => (
              <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 12, fontWeight: 650 }}>
                <div style={{ maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</div>
                <div style={{ color: accountDeltaTone(c.delta, c.groupId) }}>{formatDelta(c.delta)}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    ) : null

    const goalPanel =
      mode === 'netDebt' && (p.goalTarget != null || p.goalComparison != null || projectedNetForDetail != null) ? (
        <div style={{ marginTop: 10 }}>
          <div style={{ height: 1, background: 'var(--hairline)', margin: '10px 0' }} />
          <div style={{ fontWeight: 650, fontSize: 12, color: 'var(--muted-text)', marginBottom: 8 }}>储蓄路径</div>
          {p.goalTarget != null ? (
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 12, fontWeight: 650, marginTop: 6 }}>
              <div style={{ color: 'var(--muted-text)' }}>目标路径</div>
              <div style={{ color: 'rgba(15,23,42,0.72)' }}>{formatCny(p.goalTarget)}</div>
            </div>
          ) : null}
          {p.goalTarget == null && p.goalComparison != null ? (
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 12, fontWeight: 650, marginTop: 6 }}>
              <div style={{ color: 'var(--muted-text)' }}>目标基准</div>
              <div style={{ color: 'rgba(15,23,42,0.72)' }}>{formatCny(p.goalComparison)}</div>
            </div>
          ) : null}
          {projectedNetForDetail != null ? (
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 12, fontWeight: 650, marginTop: 6 }}>
              <div style={{ color: 'var(--muted-text)' }}>预测速度</div>
              <div style={{ color: FORECAST_STROKE }}>{formatCny(projectedNetForDetail)}</div>
            </div>
          ) : null}
          {targetDeltaAtPoint != null ? (
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 12, fontWeight: 650, marginTop: 6 }}>
              <div style={{ color: 'var(--muted-text)' }}>{targetDeltaDisplay.label}</div>
              <div style={{ color: targetDeltaDisplay.tone ?? 'var(--text)' }}>{targetDeltaDisplay.value}</div>
            </div>
          ) : null}
        </div>
      ) : null

    if (mode === 'netDebt') {
      return (
        <div
          className="iosTrendDetailPanel"
          style={{
            minWidth: 180,
            width: '100%',
            maxWidth: 440,
            maxHeight: 'min(420px, calc(100vh - 220px))',
            overflowY: 'auto',
          }}
        >
          {detailHeader}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--primary)' }} />
            <div style={{ fontWeight: 700, fontSize: 14 }}>净资产 {formatMaybeCny(p.net)}</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'rgba(11, 15, 26, 0.2)' }} />
            <div style={{ fontWeight: 700, fontSize: 14, opacity: 0.6 }}>负债 {formatMaybeCny(p.debt)}</div>
          </div>
          {goalPanel}
          {breakdown}
          {topChangePanel}
        </div>
      )
    }

    return (
      <div
        className="iosTrendDetailPanel"
        style={{
          minWidth: 180,
          width: '100%',
          maxWidth: 440,
          maxHeight: 'min(420px, calc(100vh - 220px))',
          overflowY: 'auto',
        }}
      >
        {detailHeader}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: colors.liquid }} />
          <div style={{ fontWeight: 700, fontSize: 14 }}>流动资金 {formatMaybeCny(p.cash)}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--primary)' }} />
          <div style={{ fontWeight: 700, fontSize: 14, opacity: 0.8 }}>投资 {formatMaybeCny(p.invest)}</div>
        </div>
        {breakdown}
        {topChangePanel}
      </div>
    )
  }

  const getActivePointFromChartState = (state: unknown) => {
    const activePayload = (state as { activePayload?: readonly unknown[] } | null)?.activePayload
    return (activePayload?.[0] as { payload?: TrendPoint } | undefined)?.payload ?? null
  }

  const captureActivePoint = (props: unknown) => {
    const payload = (props as { payload?: readonly unknown[] } | null)?.payload
    activePointRef.current = (payload?.[0] as { payload?: TrendPoint } | undefined)?.payload ?? null
    return null
  }

  const handleChartClick = (state: unknown) => {
    const point = getActivePointFromChartState(state) ?? activePointRef.current
    if (!point) return
    setSelectedPointKey((current) => current === point.dateKey ? null : point.dateKey)
  }

  return (
    <div className="stack iosInsightsPage iosTrendPage" style={{ padding: '0 16px', overscrollBehavior: 'contain', touchAction: 'pan-y' }}>
      <motion.div
        initial={trendPageInitial}
        animate={fadeUpAnimate}
        transition={trendPageTransition}
      >
        <div className="iosTrendMode">
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
          className="iosTrendChartCard"
          style={{
            cursor: data.length > 0 ? 'pointer' : 'default',
          }}
          initial={cardEntranceInitial}
          animate={cardEntranceAnimate}
          transition={chartEntranceTransition}
        >
          {chartWidth > 0 && data.length > 0 ? (
            <LineChart width={chartWidth} height={CHART_HEIGHT} data={data} margin={{ top: 22, right: 12, bottom: 10, left: -2 }} onClick={handleChartClick}>
              <CartesianGrid vertical={false} stroke="rgba(100, 116, 139, 0.16)" strokeDasharray="2 10" />
              {forecastArea ? (
                <ReferenceArea x1={forecastArea.start} x2={forecastArea.end} fill={FORECAST_AREA_FILL} fillOpacity={0.055} strokeOpacity={0} />
              ) : null}
              {forecastStartValue != null ? (
                <ReferenceLine x={forecastStartValue} stroke="rgba(100, 116, 139, 0.34)" strokeWidth={1.5} strokeDasharray="4 7" />
              ) : null}
              <XAxis
                dataKey="dateValue"
                type="number"
                domain={xAxisDomain}
                tickFormatter={(value) => getDateTickLabel(value, data, showYearInData)}
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
                content={captureActivePoint}
                wrapperStyle={{ opacity: 0, visibility: 'hidden', pointerEvents: 'none' }}
                cursor={{ stroke: 'rgba(15, 23, 42, 0.16)', strokeWidth: 2, strokeDasharray: '4 6' }}
              />
              {mode === 'netDebt' ? (
                <>
                  {goalSummary ? (
                    <>
                      <Line
                        type="monotone"
                        dataKey="goalComparison"
                        stroke="rgba(15, 23, 42, 0.42)"
                        strokeWidth={2.25}
                        strokeDasharray="6 7"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        dot={false}
                        activeDot={false}
                        connectNulls={false}
                        animationDuration={900}
                        animationBegin={80}
                        animationEasing="ease-out"
                      />
                      <Line
                        type="linear"
                        dataKey="projectedBridgeNet"
                        stroke="rgba(15, 23, 42, 0.28)"
                        strokeWidth={2}
                        strokeDasharray="3 7"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        dot={false}
                        activeDot={false}
                        connectNulls={false}
                        animationDuration={700}
                        animationBegin={160}
                        animationEasing="ease-out"
                      />
                    </>
                  ) : null}
                  <Line
                    type="monotone"
                    dataKey="net"
                    stroke="var(--primary)"
                    strokeWidth={3.75}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    dot={{ r: 0, strokeWidth: 0, fill: 'var(--primary)' }}
                    activeDot={{ r: 6, strokeWidth: 4, stroke: 'rgba(255, 255, 255, 0.95)' }}
                    connectNulls={true}
                    animationDuration={1500}
                    animationBegin={80}
                    animationEasing="ease-out"
                  />
                  <Line
                    type="monotone"
                    dataKey="debt"
                    stroke={colors.debt}
                    strokeWidth={2.75}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    dot={false}
                    activeDot={{ r: 5, strokeWidth: 4, stroke: 'rgba(255, 255, 255, 0.95)' }}
                    connectNulls={true}
                    animationDuration={1500}
                    animationBegin={180}
                    animationEasing="ease-out"
                  />
                  {goalSummary ? (
                    <Line
                      type="linear"
                      dataKey="projectedNet"
                      stroke={FORECAST_STROKE}
                      strokeWidth={3}
                      strokeDasharray="7 8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      dot={false}
                      activeDot={{ r: 5, strokeWidth: 4, stroke: 'rgba(255, 255, 255, 0.95)', fill: FORECAST_STROKE }}
                      connectNulls={false}
                      animationDuration={900}
                      animationBegin={260}
                      animationEasing="ease-out"
                    />
                  ) : null}
                </>
              ) : (
                <>
                  <Line
                    type="monotone"
                    dataKey="cash"
                    stroke={colors.liquid}
                    strokeWidth={3.75}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    dot={false}
                    activeDot={{ r: 6, strokeWidth: 4, stroke: 'rgba(255, 255, 255, 0.95)' }}
                    connectNulls={true}
                    animationDuration={1500}
                    animationBegin={80}
                    animationEasing="ease-out"
                  />
                  <Line
                    type="monotone"
                    dataKey="invest"
                    stroke={colors.invest}
                    strokeWidth={3.75}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    dot={false}
                    activeDot={{ r: 6, strokeWidth: 4, stroke: 'rgba(255, 255, 255, 0.95)' }}
                    connectNulls={true}
                    animationDuration={1500}
                    animationBegin={180}
                    animationEasing="ease-out"
                  />
                </>
              )}
            </LineChart>
          ) : (
            <div className="muted" style={{ textAlign: 'center', paddingTop: 80, fontSize: 13, fontWeight: 600 }}>
              暂无快照数据
            </div>
          )}
        </motion.div>

        <AnimatePresence mode="wait">
          {selectedPoint ? (
            <motion.div
              key={`${mode}-${selectedPoint.dateKey}`}
              initial={{ opacity: 0, y: -6, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={detailExit}
              transition={screenTransition}
              style={{ display: 'flex', justifyContent: 'center', marginTop: 10, position: 'relative', zIndex: 3 }}
            >
              {renderTrendDetail(selectedPoint, () => setSelectedPointKey(null))}
            </motion.div>
          ) : null}
        </AnimatePresence>

        <AnimatePresence>
          {mode === 'netDebt' && goalSummary ? (
            <motion.div
              className="iosTrendGoalPanel"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={tooltipExit}
              transition={screenTransition}
              style={{
                marginTop: 12,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 700, color: 'var(--muted-text)' }}>
                  <span style={{ width: 18, borderTop: '2px dashed rgba(15,23,42,0.42)' }} />
                  目标路径
                </span>
                {hasProjectionBridge ? (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 700, color: 'var(--muted-text)' }}>
                    <span style={{ width: 18, borderTop: '2px dashed rgba(15,23,42,0.28)' }} />
                    记录延伸
                  </span>
                ) : null}
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 700, color: 'var(--muted-text)' }}>
                  <span style={{ width: 18, borderTop: `2px dashed ${FORECAST_STROKE}` }} />
                  预测速度
                </span>
              </div>
              <div style={{ fontSize: 11, fontWeight: 800, color: goalPaceColor }}>
                {goalPaceText}
              </div>
              </div>
              <div className="muted" style={{ fontSize: 11, fontWeight: 650 }}>
              目标 {formatCny(goalSummary.targetAmount)} · {formatGoalDate(goalSummary.targetDate, goalDateContext)}
              {goalSummary.projectedDate ? ` · 预计 ${formatGoalDate(goalSummary.projectedDate, goalDateContext)}` : ''}
              {goalDeltaText ? ` · ${goalDeltaText}` : ''}
              {` · ${formatGoalPaceSource(goalSummary)}`}
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>

        <div className="iosTrendRange">
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
        <AnimatePresence>
          {range === 'custom' ? (
            <motion.div
              className="muted"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={tooltipExit}
              transition={quickFade}
              style={{ textAlign: 'center', marginTop: 10, fontSize: 12, fontWeight: 600 }}
            >
            按最近 {RECENT_SNAPSHOT_LIMIT} 条快照展示
            </motion.div>
          ) : null}
        </AnimatePresence>
      </motion.div>
    </div>
  )
}

function getDateTickLabel(value: unknown, points: TrendPoint[], showYear: boolean) {
  const numeric = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(numeric)) return ''
  const rounded = Math.round(numeric)
  const point = points.find((p) => p.dateValue === rounded)
  if (point) return point.date

  const d = new Date(rounded * 86400000)
  if (Number.isNaN(d.getTime())) return ''
  return formatLabel(toDateKey(new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())), { showYear })
}
