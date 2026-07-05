import type { ComponentPropsWithoutRef, Ref } from 'react'
import { motion } from 'framer-motion'
import type { Account } from '../../lib/accounts'
import type { AdjustBalanceOp } from '../../lib/accountOps'
import { canApplyBalanceDelta } from '../../lib/accountBalance'
import { addMoney, moneyEquals, normalizeMoney, subtractMoney } from '../../lib/money'
import { formatCny, formatSigned, normalizeNoteValue } from './format'

export type AdjustDirection = 'plus' | 'minus'

// 期间增减页：校验/预览等派生值在页内计算，提交时父组件会独立复核
export function AdjustPage(props: {
  account: Account
  editingOp: AdjustBalanceOp | null
  direction: AdjustDirection
  amount: string
  note: string
  // editingOp 存在时：该操作之后是否没有更晚的 set_balance 校准（可回写差额）
  canApplyDiff: boolean
  amountInputProps: ComponentPropsWithoutRef<'input'>
  inputRef: Ref<HTMLInputElement>
  onChangeAmount: (value: string) => void
  onChangeNote: (value: string) => void
  onChangeDirection: (direction: AdjustDirection) => void
  onSubmit: () => void
  onCancel: () => void
}) {
  const {
    account,
    editingOp,
    direction,
    amount,
    note,
    canApplyDiff,
    amountInputProps,
    inputRef,
    onChangeAmount,
    onChangeNote,
    onChangeDirection,
    onSubmit,
    onCancel,
  } = props

  const adjustAmountTrimmed = amount.trim()
  const adjustParsedRaw = Number(adjustAmountTrimmed)
  const adjustParsed = normalizeMoney(adjustParsedRaw)
  const hasValidAdjustAmount =
    adjustAmountTrimmed !== '' && Number.isFinite(adjustParsedRaw) && adjustParsed > 0
  const newAdjustDelta = hasValidAdjustAmount
    ? direction === 'plus'
      ? adjustParsed
      : -adjustParsed
    : 0
  const nextNote = normalizeNoteValue(note)
  const previewAdjustDiff = editingOp ? subtractMoney(newAdjustDelta, editingOp.delta) : newAdjustDelta
  const wouldAdjustGoNegative =
    hasValidAdjustAmount &&
    canApplyDiff &&
    !canApplyBalanceDelta(account.balance, previewAdjustDiff)
  const canSubmitAdjust = hasValidAdjustAmount && !wouldAdjustGoNegative
  const previewAdjustApplied = canApplyDiff ? previewAdjustDiff : 0
  const previewAdjustAfter = addMoney(account.balance, previewAdjustApplied)
  const isAdjustNoop = Boolean(
    editingOp && canSubmitAdjust && moneyEquals(newAdjustDelta, editingOp.delta) && nextNote === editingOp.note,
  )

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
              if (canSubmitAdjust && !isAdjustNoop) onSubmit()
            }
            if (e.key === 'Escape') {
              e.preventDefault()
              onCancel()
            }
          }}
          aria-label="adjust amount"
        />
      </div>

      <div className="mt-3 flex items-center justify-between gap-4">
        <input
          className="flex-1 min-w-0 bg-transparent outline-none text-[13px] font-medium text-slate-700 placeholder:text-slate-400"
          placeholder="备注"
          value={note}
          onChange={(e) => onChangeNote(e.target.value)}
          aria-label="note"
        />
        <div className="text-[13px] font-semibold text-slate-700">期间增减</div>
      </div>

      <div className="mt-2 text-[11px] font-semibold text-slate-400">
        “+”=期间净流入，“-”=期间净流出（非逐笔流水）
      </div>

      <div className="mt-4 flex rounded-full bg-slate-200/80 p-1">
        {(
          [
            { id: 'plus' as const, label: '+' },
            { id: 'minus' as const, label: '-' },
          ] as const
        ).map((item) => {
          const isActive = direction === item.id
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onChangeDirection(item.id)}
              className="relative flex-1 h-11 rounded-full text-[18px] font-black"
              style={{ color: isActive ? 'var(--color-white)' : 'var(--text)' }}
            >
              {isActive ? (
                <motion.div
                  layoutId="accountAdjustDirBg"
                  className="absolute inset-0 rounded-full bg-slate-900"
                  transition={{ type: 'spring', stiffness: 600, damping: 40 }}
                />
              ) : null}
              <span className="relative z-10">{item.label}</span>
            </button>
          )
        })}
      </div>

      <div className="mt-3">
        <div className="text-[13px] font-semibold" style={{ color: 'var(--primary)' }}>
          {formatSigned(previewAdjustApplied)}
        </div>
        <div className="mt-1 text-[12px] font-medium text-slate-500">
          余额 {formatCny(previewAdjustAfter)}
        </div>
        {editingOp && !canApplyDiff ? (
          <div className="mt-1 text-[11px] font-semibold text-slate-400">
            余额不会变（已在后续校准中固定）
          </div>
        ) : null}
        {wouldAdjustGoNegative ? (
          <div className="mt-1 text-[11px] font-semibold text-rose-500">
            操作后余额不能为负
          </div>
        ) : null}
      </div>

      <motion.button
        type="button"
        onClick={onSubmit}
        disabled={!canSubmitAdjust || isAdjustNoop}
        whileTap={{ scale: canSubmitAdjust && !isAdjustNoop ? 0.99 : 1 }}
        className={`mt-6 w-full h-14 rounded-[22px] font-semibold text-[16px] transition-colors ${canSubmitAdjust && !isAdjustNoop ? 'bg-slate-900 text-white shadow-sm' : 'bg-slate-200 text-slate-400'}`}
      >
        {editingOp ? '保存修改' : '完成'}
      </motion.button>
    </>
  )
}
