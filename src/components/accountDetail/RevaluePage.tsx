import { useId, type ComponentPropsWithoutRef, type Ref } from 'react'
import { motion } from 'framer-motion'
import { TrendingDown, TrendingUp } from 'lucide-react'
import type { Account } from '../../lib/accounts'
import type { RevalueOp } from '../../lib/accountOps'
import { canApplyBalanceDelta } from '../../lib/accountBalance'
import { formatRatioPercent, summarizeItemValue } from '../../lib/accountCost'
import { addMoney, moneyEquals, normalizeMoney, subtractMoney } from '../../lib/money'
import { RecordTimeRow } from './RecordTimeRow'
import { formatCny, formatSigned, normalizeNoteValue } from './format'

export type RevalueDirection = 'down' | 'up'

// 物品减值/增值页：与 AdjustPage 同一骨架，但语义是估值变动而非现金流。
// 默认方向为「减值」（固定资产的常态）；预览给出新净值与相对原值的减值比例。
export function RevaluePage(props: {
  account: Account
  editingOp: RevalueOp | null
  direction: RevalueDirection
  amount: string
  note: string
  canApplyDiff: boolean
  recordTime: string
  recordTimeMax: string
  amountInputProps: ComponentPropsWithoutRef<'input'>
  inputRef: Ref<HTMLInputElement>
  onChangeAmount: (value: string) => void
  onChangeNote: (value: string) => void
  onChangeRecordTime: (value: string) => void
  onChangeDirection: (direction: RevalueDirection) => void
  onSubmit: () => void
  onCancel: () => void
}) {
  const directionLayoutId = useId()
  const {
    account,
    editingOp,
    direction,
    amount,
    note,
    canApplyDiff,
    recordTime,
    recordTimeMax,
    amountInputProps,
    inputRef,
    onChangeAmount,
    onChangeNote,
    onChangeRecordTime,
    onChangeDirection,
    onSubmit,
    onCancel,
  } = props

  const trimmed = amount.trim()
  const parsedRaw = Number(trimmed)
  const parsed = normalizeMoney(parsedRaw)
  const hasValidAmount = trimmed !== '' && Number.isFinite(parsedRaw) && parsed > 0
  const newDelta = hasValidAmount ? (direction === 'down' ? -parsed : parsed) : 0
  const nextNote = normalizeNoteValue(note)
  const previewDiff = editingOp ? subtractMoney(newDelta, editingOp.delta) : newDelta
  const wouldGoNegative = hasValidAmount && canApplyDiff && !canApplyBalanceDelta(account.balance, previewDiff)
  const canSubmit = hasValidAmount && !wouldGoNegative
  const previewApplied = canApplyDiff ? previewDiff : 0
  const previewAfter = addMoney(account.balance, previewApplied)
  const previewSummary = summarizeItemValue(account.cost, previewAfter)
  const isNoop = Boolean(editingOp && canSubmit && moneyEquals(newDelta, editingOp.delta) && nextNote === editingOp.note)

  const options = [
    { id: 'down' as const, label: '减值', icon: TrendingDown },
    { id: 'up' as const, label: '增值', icon: TrendingUp },
  ]

  return (
    <>
      <div className="mt-4 flex items-baseline gap-2">
        <div className="text-[34px] font-black tracking-tight text-slate-900">¥</div>
        <input
          ref={inputRef}
          className="flex-1 min-w-0 bg-transparent outline-none text-[34px] font-black tracking-tight text-slate-900 placeholder:text-slate-400"
          {...amountInputProps}
          placeholder="0"
          value={amount}
          onChange={(e) => onChangeAmount(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              if (canSubmit && !isNoop) onSubmit()
            }
            if (e.key === 'Escape') {
              e.preventDefault()
              onCancel()
            }
          }}
          aria-label="revalue amount"
        />
      </div>

      <div className="mt-3 flex items-center justify-between gap-4">
        <input
          className="flex-1 min-w-0 bg-transparent outline-none text-[13px] font-medium text-slate-700 placeholder:text-slate-400"
          placeholder="备注，如：年度折旧 / 磕碰"
          value={note}
          onChange={(e) => onChangeNote(e.target.value)}
          aria-label="note"
        />
        <div className="text-[13px] font-semibold text-slate-700">{direction === 'down' ? '计提减值' : '价值上调'}</div>
      </div>

      <RecordTimeRow
        editingAt={editingOp ? editingOp.at : null}
        value={recordTime}
        max={recordTimeMax}
        onChange={onChangeRecordTime}
      />

      <div className="mt-2 text-[11px] font-semibold text-slate-400">
        减值/增值只改物品净值，不计入现金流统计
      </div>

      <div className="mt-4 flex rounded-full bg-slate-200/80 p-1">
        {options.map((item) => {
          const isActive = direction === item.id
          const Icon = item.icon
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onChangeDirection(item.id)}
              className="relative flex-1 h-11 rounded-full text-[15px] font-black"
              style={{ color: isActive ? 'var(--color-white)' : 'var(--text)' }}
              aria-pressed={isActive}
            >
              {isActive ? (
                <motion.div
                  layoutId={`${directionLayoutId}-revalue-direction`}
                  className="absolute inset-0 rounded-full bg-slate-900"
                  transition={{ type: 'spring', stiffness: 600, damping: 40 }}
                />
              ) : null}
              <span className="relative z-10 inline-flex items-center gap-1.5">
                <Icon size={15} strokeWidth={2.8} />
                {item.label}
              </span>
            </button>
          )
        })}
      </div>

      <div className="mt-3">
        <div className="text-[13px] font-semibold" style={{ color: 'var(--primary)' }}>
          {formatSigned(previewApplied)}
        </div>
        <div className="mt-1 text-[12px] font-medium text-slate-500">
          净值 {formatCny(previewAfter)}
          {previewSummary ? (
            <span className="text-slate-400">
              {' '}
              · 较原值{previewSummary.impairment < 0 ? '增值' : '减值'} {formatRatioPercent(previewSummary.impairmentRatio)}
            </span>
          ) : null}
        </div>
        {!canApplyDiff ? (
          <div className="mt-1 text-[11px] font-semibold text-slate-400">净值不会变（已在后续校准中固定）</div>
        ) : null}
        {wouldGoNegative ? <div className="mt-1 text-[11px] font-semibold text-rose-500">减值后净值不能为负</div> : null}
      </div>

      <motion.button
        type="button"
        onClick={onSubmit}
        disabled={!canSubmit || isNoop}
        whileTap={{ scale: canSubmit && !isNoop ? 0.99 : 1 }}
        className={`mt-6 w-full h-14 rounded-[22px] font-semibold text-[16px] transition-colors ${canSubmit && !isNoop ? 'bg-slate-900 text-white shadow-sm' : 'bg-slate-200 text-slate-400'}`}
      >
        {editingOp ? '保存修改' : '完成'}
      </motion.button>
    </>
  )
}
