import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { RotateCcw } from 'lucide-react'
import { formatCny } from '../../lib/format'
import { normalizeMoney } from '../../lib/money'
import {
  DAYS_PER_MONTH,
  diffDateDays,
  getSavingsProjectionStartDate,
  type SavingsGoalSummary,
  type SavingsPaceAlgorithm,
} from '../../lib/savingsGoal'
import { buildSavingsSimulationPlan } from '../../lib/savingsGoalSimulation'
import { PillTabs } from '../../components/PillTabs'
import { TONE, clampProgress, formatAbsCny, formatDelta, formatShortGoalDate, formatSummaryPaceSource, insetPanelStyle } from './statsFormat'
import { ExplainPanel, ExplainTerm, GlowCard, InfoDot, MetricGrid, MetricTile, SubsectionLabel } from './statsUi'

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

function roundUpMoney(value: number, step: number) {
  if (!Number.isFinite(value) || value <= 0) return step
  return normalizeMoney(Math.ceil(value / step) * step)
}

function getSliderStep(max: number) {
  if (max <= 10000) return 100
  if (max <= 100000) return 500
  return 1000
}

function formatProjectionShift(simulatedDate: string | null, summary: SavingsGoalSummary) {
  if (!simulatedDate) return { text: '暂不可达', sub: '提高月存额后再看', tone: TONE.bad }
  const dateContext = [summary.startDate, summary.latestDate, summary.targetDate, summary.projectedDate, simulatedDate]

  if (summary.projectedDate) {
    const shift = diffDateDays(simulatedDate, summary.projectedDate)
    if (shift == null || shift === 0) return { text: '预测不变', sub: formatShortGoalDate(simulatedDate, dateContext), tone: 'var(--text)' }
    return {
      text: shift > 0 ? `提前 ${shift} 天` : `延后 ${Math.abs(shift)} 天`,
      sub: formatShortGoalDate(simulatedDate, dateContext),
      tone: shift > 0 ? TONE.good : TONE.bad,
    }
  }

  const targetShift = diffDateDays(simulatedDate, summary.targetDate)
  if (targetShift == null || targetShift === 0) return { text: '踩中目标日', sub: formatShortGoalDate(simulatedDate, dateContext), tone: TONE.good }
  return {
    text: targetShift > 0 ? `早 ${targetShift} 天` : `晚 ${Math.abs(targetShift)} 天`,
    sub: formatShortGoalDate(simulatedDate, dateContext),
    tone: targetShift > 0 ? TONE.good : TONE.bad,
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
    <div style={insetPanelStyle}>
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
          style={{ position: 'relative', width: '100%', color }}
        />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 10, fontWeight: 600, color: 'var(--muted-text)' }}>
        <span>{helper}</span>
        <span>最高 {formatCny(safeMax)}</span>
      </div>
    </div>
  )
}

function ForecastSimulator(props: { summary: SavingsGoalSummary; color: string; monthlyExtraValue: number; oneTimeValue: number; onChangeMonthly: (v: number) => void; onChangeOneTime: (v: number) => void }) {
  const { summary, color, monthlyExtraValue, oneTimeValue, onChangeMonthly, onChangeOneTime } = props

  const baseDate = getSavingsProjectionStartDate(summary.latestDate)
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
      ? TONE.good
      : TONE.bad
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
    ? TONE.bad
    : extraMonthlyNeededForDisplay != null && extraMonthlyNeededForDisplay > 0
      ? TONE.bad
      : TONE.good
  const targetDateLabel = `目标日 ${formatShortGoalDate(summary.targetDate, dateContext)}`

  return (
    <>
      <div style={{ display: 'grid', gap: 10, marginTop: 12 }}>
        <SavingsSliderControl
          label="每月多存"
          value={monthlyExtra}
          max={monthlyMax}
          step={monthlyStep}
          color={color}
          helper={`${formatDelta(monthlyExtra / DAYS_PER_MONTH)}/天`}
          onChange={onChangeMonthly}
        />
        <SavingsSliderControl
          label="一次性存入"
          value={oneTime}
          max={oneTimeMax}
          step={oneTimeStep}
          color={color}
          helper={`剩余 ${formatCny(plan.remainingAfterOneTime)}`}
          onChange={onChangeOneTime}
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 8, marginTop: 10 }}>
        <button
          type="button"
          className="ghostBtn"
          disabled={!canBoostMonthly}
          onClick={() => onChangeMonthly(targetMonthlyExtra)}
          style={{ justifyContent: 'center', opacity: canBoostMonthly ? 1 : 0.55 }}
        >
          {monthlyBoostButtonLabel}
        </button>
      </div>

      <MetricGrid marginTop={12}>
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
    </>
  )
}

export function ForecastCard(props: {
  algorithm: SavingsPaceAlgorithm
  summary: SavingsGoalSummary | null
  color: string
  onChangeAlgorithm: (algorithm: SavingsPaceAlgorithm) => void
}) {
  const { algorithm, summary, color, onChangeAlgorithm } = props
  const [helpOpen, setHelpOpen] = useState(false)
  const [monthlyExtraValue, setMonthlyExtraValue] = useState(0)
  const [oneTimeValue, setOneTimeValue] = useState(0)

  const summarySignature = summary
    ? `${summary.currentNetWorth}.${summary.startDate}.${summary.startNetWorth}.${summary.targetAmount}.${summary.targetDate}`
    : 'none'
  useEffect(() => {
    setMonthlyExtraValue(0)
    setOneTimeValue(0)
  }, [summarySignature])

  const activeOption = PACE_ALGORITHM_OPTIONS.find((option) => option.value === algorithm) ?? PACE_ALGORITHM_OPTIONS[0]
  const paceText = summary?.avgDailyNetChange == null
    ? '样本不足'
    : `${formatDelta(summary.avgDailyNetChange * DAYS_PER_MONTH)}/月`
  const paceSub = summary ? formatSummaryPaceSource(summary) : '设置目标后用于预计达成'
  const showSimulator = summary != null && !summary.isComplete
  const hasAdjustment = monthlyExtraValue > 0 || oneTimeValue > 0

  const reset = () => {
    setMonthlyExtraValue(0)
    setOneTimeValue(0)
  }

  return (
    <GlowCard>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ fontWeight: 800, fontSize: 14 }}>预测与模拟</div>
            <InfoDot
              open={helpOpen}
              onToggle={() => setHelpOpen((open) => !open)}
              controls="forecast-card-help"
              label="查看预测与模拟说明"
              size={22}
            />
          </div>
          <div className="muted" style={{ fontSize: 11, fontWeight: 650, marginTop: 3 }}>{activeOption.sub}</div>
        </div>
        {showSimulator && hasAdjustment ? (
          <button type="button" className="iconBtn" onClick={reset} aria-label="reset savings simulator" style={{ width: 34, height: 34 }}>
            <RotateCcw size={15} strokeWidth={2.5} />
          </button>
        ) : null}
      </div>

      <ExplainPanel id="forecast-card-help" open={helpOpen}>
        <div><ExplainTerm>预估算法</ExplainTerm>：决定“预测基础增速”的口径，影响预计达成日、目标模拟和可支配估算。智能选择会按记录密度和波动自动挑选。</div>
        <div><ExplainTerm>每月多存</ExplainTerm>：按月金额折算成每日增速，影响模拟达成日和目标日缺口。</div>
        <div><ExplainTerm>一次性存入</ExplainTerm>：先直接减少距离目标还差的金额。</div>
        <div><ExplainTerm>按目标日设月存</ExplainTerm>：把每月多存调到刚好覆盖目标日缺口；如果滑块上限不够，会改为拉满月存。</div>
        <div><ExplainTerm>模拟达成</ExplainTerm>：按当前组合预计到达目标的日期。</div>
        <div><ExplainTerm>目标日结果</ExplainTerm>：显示目标日当天预计多出或少多少；接近刚好时显示“刚好达标”。</div>
        <div><ExplainTerm>预测月增速 / 还需月存</ExplainTerm>：分别表示模拟后的月度净资产增长速度，以及为了踩中目标日还要补的月存额。</div>
      </ExplainPanel>

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
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted-text)' }}>预测基础增速</div>
          <div className="muted" style={{ fontSize: 10, fontWeight: 650, marginTop: 3 }}>{paceSub}</div>
        </div>
        <div style={{ flex: '0 0 auto', fontSize: 15, fontWeight: 800, color: summary?.avgDailyNetChange == null ? 'var(--muted-text)' : 'var(--text)' }}>
          {paceText}
        </div>
      </div>

      <div style={{ marginTop: 10, overflowX: 'auto', paddingBottom: 2 }}>
        <PillTabs
          ariaLabel="savings pace algorithm"
          options={PACE_ALGORITHM_OPTIONS.map((option) => ({ value: option.value, label: option.label }))}
          value={algorithm}
          onChange={onChangeAlgorithm}
        />
      </div>

      {showSimulator ? (
        <>
          <SubsectionLabel>目标模拟</SubsectionLabel>
          <div className="muted" style={{ fontSize: 11, fontWeight: 650, marginTop: 6 }}>
            用一次性存入和每月多存，看目标日还差多少
          </div>
          <ForecastSimulator
            summary={summary}
            color={color}
            monthlyExtraValue={monthlyExtraValue}
            oneTimeValue={oneTimeValue}
            onChangeMonthly={setMonthlyExtraValue}
            onChangeOneTime={setOneTimeValue}
          />
        </>
      ) : (
        <div className="muted" style={{ marginTop: 10, fontSize: 11, fontWeight: 650 }}>
          {summary?.isComplete ? '目标已达成，模拟已收起。' : '设置储蓄目标后，可在这里模拟提前达成方案。'}
        </div>
      )}
    </GlowCard>
  )
}
