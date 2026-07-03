import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ChevronDown, Pencil, Save, Wallet, X } from 'lucide-react'
import { formatCny } from '../../lib/format'
import type { AccountOp } from '../../lib/accountOps'
import type { Snapshot } from '../../lib/snapshots'
import type { NetChangePace, SavingsGoalSummary, SavingsPaceAlgorithm } from '../../lib/savingsGoal'
import {
  buildDisposableEstimate,
  coerceMonthlyEstimatedIncome,
  type DisposableConfidence,
  type DisposableEstimate,
} from '../../lib/monthlyDisposable'
import { progressFillTransition, quickFade, screenTransition } from '../../lib/motionPresets'
import { TONE, formatDelta, formatMonthlyIncomeInput, formatNullableCny, parseMoneyInput } from './statsFormat'
import { ExplainPanel, ExplainTerm, GlowCard, HeaderBadge, InfoDot, MetricGrid, MetricTile } from './statsUi'

const CONFIDENCE_META: Record<DisposableConfidence, { short: string; label: string; tone: string }> = {
  high: { short: '高', label: '估算可信度较高', tone: TONE.good },
  medium: { short: '中', label: '估算可信度中等', tone: TONE.warn },
  low: { short: '低', label: '记录较少 · 仅供参考', tone: TONE.alert },
  none: { short: '—', label: '暂无足够数据', tone: 'var(--muted-text)' },
}

function disposableHeroTone(value: number | null, color: string) {
  if (value == null) return 'var(--muted-text)'
  if (value < 0) return TONE.bad
  if (value === 0) return 'var(--text)'
  return color
}

function formatDisposableHero(value: number | null) {
  if (value == null) return '—'
  if (value < 0) return `缺 ${formatCny(Math.abs(value))}`
  return formatCny(value)
}

function incomeSourceTag(source: DisposableEstimate['incomeSource']) {
  switch (source) {
    case 'manual':
      return '手动设定'
    case 'ops':
      return '按记录估算'
    case 'surplus':
      return '按净值推算'
    default:
      return '暂无估算'
  }
}

function disposableHeroSub(estimate: DisposableEstimate) {
  if (estimate.headlineMode === 'empty') return '记录更多余额变化后开始估算'
  if (estimate.headlineMode === 'surplus') {
    if (estimate.requiredSavings && estimate.requiredSavings > 0) {
      const slack = estimate.surplusSlack ?? 0
      return slack >= 0 ? `扣除本期目标后还可多花 ${formatCny(slack)}` : `距本期目标还差 ${formatCny(Math.abs(slack))}`
    }
    return '你最近实际存下的钱'
  }
  // Reconciled with the goal's actual this-period performance: the headline already
  // blends remaining income with the realized net-worth position, so describe the
  // outcome in the same language as the savings goal card.
  if (estimate.currentPeriodDelta != null) {
    if (estimate.isIncomeShort) return `距本期储蓄目标还差 ${formatCny(estimate.incomeGap)}`
    return `覆盖本期储蓄目标后余 ${formatCny(estimate.disposable ?? 0)}`
  }
  if (estimate.isIncomeShort) return `预估收入还差 ${formatCny(estimate.incomeGap)} 才够本期储蓄`
  if (estimate.requiredSavings && estimate.requiredSavings > 0) return `已预留本期目标 ${formatCny(estimate.requiredSavings)}`
  return '本月可自由支配的金额'
}

export function DisposableCard(props: {
  snapshots: Snapshot[]
  accountOps: AccountOp[]
  summary: SavingsGoalSummary | null
  latestSnapshot: Snapshot | null
  monthStartDay: number
  paceAlgorithm: SavingsPaceAlgorithm
  manualIncome: number
  pace: NetChangePace | null
  color: string
  onChangeIncome: (value: number) => void
}) {
  const { snapshots, accountOps, summary, latestSnapshot, monthStartDay, paceAlgorithm, manualIncome, pace, color, onChangeIncome } = props
  const estimate = useMemo(
    () =>
      buildDisposableEstimate({
        snapshots,
        accountOps,
        summary,
        monthStartDay,
        paceAlgorithm,
        manualIncome,
        latestSnapshot,
        pace,
      }),
    [snapshots, accountOps, summary, monthStartDay, paceAlgorithm, manualIncome, latestSnapshot, pace],
  )

  const [explainOpen, setExplainOpen] = useState(false)
  const [editIncome, setEditIncome] = useState(false)
  const [inputValue, setInputValue] = useState(() => formatMonthlyIncomeInput(manualIncome))
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setInputValue(formatMonthlyIncomeInput(manualIncome))
    setError(null)
  }, [manualIncome])

  const saveIncome = () => {
    const parsed = inputValue.trim() ? parseMoneyInput(inputValue) : 0
    if (parsed == null || parsed < 0) {
      setError('请输入不小于 0 的收入金额')
      return
    }
    onChangeIncome(coerceMonthlyEstimatedIncome(parsed))
    setError(null)
    setEditIncome(false)
  }

  const clearIncome = () => {
    onChangeIncome(0)
    setInputValue('')
    setError(null)
  }

  const confidence = CONFIDENCE_META[estimate.confidence]
  const isEmpty = estimate.headlineMode === 'empty'
  const isSurplus = estimate.headlineMode === 'surplus'

  const heroLabel = isSurplus ? '本月净结余' : '本月可支配'
  const heroValueRaw = isSurplus ? estimate.monthlySurplus : estimate.disposable
  const heroValue = isEmpty
    ? '—'
    : isSurplus
      ? formatCny(estimate.monthlySurplus ?? 0)
      : formatDisposableHero(estimate.disposable)
  const heroTone = isEmpty
    ? 'var(--muted-text)'
    : isSurplus
      ? (estimate.monthlySurplus ?? 0) >= 0
        ? color
        : TONE.bad
      : disposableHeroTone(estimate.disposable, color)

  // Decomposition bar: where the base amount (income, or realized surplus) goes.
  // In reconciled mode the "pot" is the realized net-worth growth plus the income
  // still expected this period, measured against the period's required increment;
  // pot − reserveNeed then equals the reconciled disposable.
  const reconciled = !isSurplus && !isEmpty && estimate.currentPeriodDelta != null
  const baseAmount = isSurplus
    ? estimate.monthlySurplus ?? 0
    : reconciled
      ? Math.max(0, (estimate.currentPeriodActual ?? 0) + (estimate.remainingExpectedIncome ?? 0))
      : estimate.estimatedIncome ?? 0
  const reserveNeed = reconciled ? estimate.currentPeriodTarget ?? 0 : estimate.requiredSavings ?? 0
  const showBar = !isEmpty && baseAmount > 0 && reserveNeed > 0
  const barTotal = Math.max(baseAmount, reserveNeed, 1)
  const coveredReserve = Math.min(baseAmount, reserveNeed)
  const freePart = Math.max(0, baseAmount - reserveNeed)
  const shortfallPart = Math.max(0, reserveNeed - baseAmount)
  const freeLabel = isSurplus ? '可多花' : '可支配'
  const reserveLabel = reconciled ? '本期应存' : '预留目标'
  const accentOpacity = isEmpty ? 0.05 : (heroValueRaw ?? 0) >= 0 ? 0.1 : 0.06

  return (
    <GlowCard color={color} glowOpacity={accentOpacity}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <HeaderBadge color={color}>
            <Wallet size={18} strokeWidth={2.7} />
          </HeaderBadge>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <div style={{ fontWeight: 800, fontSize: 15 }}>月度可支配</div>
              <InfoDot
                open={explainOpen}
                onToggle={() => setExplainOpen((open) => !open)}
                controls="disposable-explain"
                label="查看可支配估算说明"
                size={22}
              />
            </div>
            <div className="muted" style={{ fontSize: 11, fontWeight: 650, marginTop: 2 }}>
              {isEmpty ? '记录后智能估算' : '基于记录智能估算'}
            </div>
          </div>
        </div>
        <div
          style={{
            flex: '0 0 auto',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            borderRadius: 999,
            padding: '6px 10px',
            background: 'rgb(255 255 255 / 0.84)',
            border: '1px solid rgba(15, 23, 42, 0.06)',
            boxShadow: '0 8px 20px -18px rgba(15, 23, 42, 0.36)',
          }}
          title={confidence.label}
        >
          <span style={{ width: 7, height: 7, borderRadius: 999, background: confidence.tone, flex: '0 0 auto' }} />
          <span style={{ fontSize: 11, fontWeight: 800, color: confidence.tone, whiteSpace: 'nowrap' }}>
            {estimate.confidence === 'none' ? '数据不足' : `估算 ${confidence.short}`}
          </span>
        </div>
      </div>

      <ExplainPanel id="disposable-explain" open={explainOpen}>
        <div><ExplainTerm>可支配</ExplainTerm> = 本期尚需收入 + 已实现净值对本期目标的差额。月初是“预估收入−目标”的预测；月末收入到账后与储蓄目标卡的本期缺口一致。</div>
        <div><ExplainTerm>预估月收入</ExplainTerm>：优先用你手动设置的金额；否则按流动账户的变动记录估算（已排除转账和投资估值波动）；记录不足时用净资产增长反推。</div>
        <div><ExplainTerm>预估月支出</ExplainTerm>：取近几个月流动账户净流出的中位数，抗单月波动。</div>
        <div><ExplainTerm>月度结余</ExplainTerm>：净资产的月均增长，代表你实际存下的钱。</div>
        <div><ExplainTerm>本期应存</ExplainTerm>：储蓄目标路径在本月要求增加的净值；月末用它和已实现净值对账，避免预算停在期初预测。</div>
        <div>收入/支出来自现金流量，结余来自净资产，口径不同、不一定相等；记录越多越准。</div>
      </ExplainPanel>

      <div style={{ marginTop: 12 }}>
        <div className="muted" style={{ fontSize: 12, fontWeight: 700 }}>{heroLabel}</div>
        <motion.div
          key={`${heroLabel}-${heroValue}`}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={screenTransition}
          style={{ fontSize: 30, fontWeight: 800, marginTop: 4, letterSpacing: 0, color: heroTone, overflowWrap: 'anywhere' }}
        >
          {heroValue}
        </motion.div>
        <div className="muted" style={{ fontSize: 12, fontWeight: 600, marginTop: 5 }}>{disposableHeroSub(estimate)}</div>
        {estimate.limitedByLiquidity ? (
          <div style={{ marginTop: 6, fontSize: 11, fontWeight: 700, color: TONE.alert }}>
            可动用现金仅 {formatCny(estimate.liquidBuffer)}，留意现金流
          </div>
        ) : null}
      </div>

      {showBar ? (
        <div style={{ marginTop: 14, display: 'grid', gap: 8 }}>
          <div style={{ display: 'flex', height: 12, borderRadius: 999, overflow: 'hidden', background: 'rgba(100,116,139,0.14)' }}>
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${(coveredReserve / barTotal) * 100}%` }}
              transition={progressFillTransition}
              style={{ height: '100%', background: 'rgba(245, 158, 11, 0.85)' }}
            />
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${(freePart / barTotal) * 100}%` }}
              transition={progressFillTransition}
              style={{ height: '100%', background: color }}
            />
            {shortfallPart > 0 ? (
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${(shortfallPart / barTotal) * 100}%` }}
                transition={progressFillTransition}
                style={{ height: '100%', background: 'rgba(239,68,68,0.85)' }}
              />
            ) : null}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 11, fontWeight: 650, flexWrap: 'wrap' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 8, height: 8, borderRadius: 999, background: 'rgba(245, 158, 11, 0.9)' }} />
              <span className="muted">{reserveLabel} {formatCny(reserveNeed)}</span>
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 8, height: 8, borderRadius: 999, background: shortfallPart > 0 ? 'rgba(239,68,68,0.9)' : color }} />
              <span style={{ color: shortfallPart > 0 ? TONE.bad : color }}>
                {shortfallPart > 0 ? `缺口 ${formatCny(shortfallPart)}` : `${freeLabel} ${formatCny(freePart)}`}
              </span>
            </span>
          </div>
        </div>
      ) : null}

      <MetricGrid marginTop={14}>
        <MetricTile
          compact
          label="预估月收入"
          value={formatNullableCny(estimate.estimatedIncome)}
          valueColor={estimate.estimatedIncome != null ? 'var(--text)' : 'var(--muted-text)'}
          sub={incomeSourceTag(estimate.incomeSource)}
        />
        <MetricTile
          compact
          label="预估月支出"
          value={formatNullableCny(estimate.estimatedExpense)}
          sub={estimate.estimatedExpense != null ? '近月净流出中位' : '变动记录不足'}
        />
        <MetricTile
          compact
          label="月度结余"
          value={estimate.monthlySurplus == null ? '—' : formatDelta(estimate.monthlySurplus)}
          valueColor={estimate.monthlySurplus == null ? 'var(--muted-text)' : estimate.monthlySurplus >= 0 ? TONE.good : TONE.bad}
          sub="净资产月均增长"
        />
        <MetricTile
          compact
          label="可动用现金"
          value={formatCny(estimate.liquidBuffer)}
          sub={estimate.monthsOfExpenseCovered != null ? `约覆盖 ${estimate.monthsOfExpenseCovered} 个月支出` : '当前流动资金'}
        />
      </MetricGrid>

      <div style={{ marginTop: 12 }}>
        <button
          type="button"
          className="ghostBtn"
          onClick={() => setEditIncome((open) => !open)}
          aria-expanded={editIncome}
          style={{ justifyContent: 'space-between' }}
        >
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
            <Pencil size={15} strokeWidth={2.5} />
            <span style={{ overflowWrap: 'anywhere' }}>
              {manualIncome > 0 ? `已手动设置月收入 ${formatCny(manualIncome)}` : '手动设置月收入（可选）'}
            </span>
          </span>
          <ChevronDown
            size={16}
            strokeWidth={2.5}
            style={{ transform: editIncome ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s ease', flex: '0 0 auto' }}
          />
        </button>
        <AnimatePresence>
          {editIncome ? (
            <motion.form
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={quickFade}
              onSubmit={(e) => {
                e.preventDefault()
                saveIncome()
              }}
              style={{ overflow: 'hidden', display: 'grid', gap: 8, marginTop: 8 }}
            >
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto auto', gap: 8, alignItems: 'end', paddingTop: 2 }}>
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
                <button type="submit" className="iconBtn iconBtnPrimary" aria-label="保存预估月收入" title="保存预估月收入" style={{ width: 48, height: 48, alignSelf: 'end' }}>
                  <Save size={18} strokeWidth={2.6} />
                </button>
                <button type="button" className="iconBtn" aria-label="清空预估月收入" title="清空预估月收入" onClick={clearIncome} style={{ width: 48, height: 48, alignSelf: 'end' }}>
                  <X size={18} strokeWidth={2.6} />
                </button>
              </div>
              <div className="muted" style={{ fontSize: 11, fontWeight: 600 }}>设置后将作为收入基准；留空则完全由记录估算。</div>
              {error ? <div style={{ color: TONE.bad, fontSize: 12, fontWeight: 650 }}>{error}</div> : null}
            </motion.form>
          ) : null}
        </AnimatePresence>
      </div>
    </GlowCard>
  )
}
