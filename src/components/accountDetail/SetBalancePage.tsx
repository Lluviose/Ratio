import type { ComponentPropsWithoutRef, Ref } from 'react'
import { motion } from 'framer-motion'
import type { Account } from '../../lib/accounts'
import type { SetBalanceOp } from '../../lib/accountOps'
import { canApplyBalanceDelta, isNegativeAccountBalance } from '../../lib/accountBalance'
import { moneyEquals, normalizeMoney, subtractMoney } from '../../lib/money'
import {
  evaluateMoneyExpression,
  sanitizeMoneyExpressionInput,
  type MoneyExpressionOperator,
} from '../../lib/moneyExpression'
import { MoneyExpressionKeypad, MoneyExpressionPreview } from './MoneyExpressionControls'
import { formatCny, normalizeNoteValue } from './format'

// 修改余额页：支持 +/- 表达式输入；校验/预览派生值在页内计算，提交时父组件独立复核
export function SetBalancePage(props: {
  account: Account
  editingOp: SetBalanceOp | null
  value: string
  note: string
  // editingOp 存在时：该操作之后是否没有更晚的 set_balance 校准（可回写差额）
  canApplyDiff: boolean
  expressionInputProps: ComponentPropsWithoutRef<'input'>
  inputRef: Ref<HTMLInputElement>
  onChangeValue: (value: string) => void
  onChangeNote: (value: string) => void
  onOperator: (operator: MoneyExpressionOperator) => void
  onClearExpression: () => void
  onSubmit: () => void
  onCancel: () => void
}) {
  const {
    account,
    editingOp,
    value,
    note,
    canApplyDiff,
    expressionInputProps,
    inputRef,
    onChangeValue,
    onChangeNote,
    onOperator,
    onClearExpression,
    onSubmit,
    onCancel,
  } = props

  const setBalanceValueTrimmed = value.trim()
  const setBalanceExpression = evaluateMoneyExpression(value)
  const setBalanceParsed = setBalanceExpression.ok ? setBalanceExpression.value : 0
  const hasValidSetBalanceAmount =
    setBalanceValueTrimmed !== '' &&
    setBalanceExpression.ok &&
    !isNegativeAccountBalance(setBalanceParsed)
  const nextNote = normalizeNoteValue(note)
  const setBalanceNoopValue = normalizeMoney(editingOp ? editingOp.after : account.balance)
  const setBalanceEditDiff = editingOp ? subtractMoney(setBalanceParsed, editingOp.after) : 0
  const wouldSetBalanceGoNegative =
    Boolean(editingOp) &&
    hasValidSetBalanceAmount &&
    canApplyDiff &&
    !canApplyBalanceDelta(account.balance, setBalanceEditDiff)
  const canSubmitSetBalance = hasValidSetBalanceAmount && !wouldSetBalanceGoNegative
  const isSetBalanceNoop = Boolean(
    editingOp &&
      canSubmitSetBalance &&
      moneyEquals(setBalanceParsed, setBalanceNoopValue) &&
      nextNote === editingOp.note,
  )

  return (
    <>
      <div className="mt-4">
        <div className="flex items-baseline gap-2 min-w-0">
          <div className="text-[34px] font-black tracking-tight text-slate-900">¥</div>
          <input
            ref={inputRef}
            className="flex-1 min-w-0 bg-transparent outline-none text-[34px] font-black tracking-tight text-slate-900 placeholder:text-slate-400"
            {...expressionInputProps}
            placeholder="0"
            value={value}
            autoFocus
            onChange={(e) => onChangeValue(sanitizeMoneyExpressionInput(e.target.value))}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                if (canSubmitSetBalance && !isSetBalanceNoop) onSubmit()
              }
              if (e.key === 'Escape') {
                e.preventDefault()
                onCancel()
              }
            }}
            aria-label="set balance"
          />
        </div>
        <MoneyExpressionPreview show={setBalanceValueTrimmed !== ''} result={setBalanceExpression} />
        <MoneyExpressionKeypad onOperator={onOperator} onClear={onClearExpression} />
      </div>

      <div className="mt-3 flex items-center justify-between gap-4">
        <input
          className="flex-1 min-w-0 bg-transparent outline-none text-[13px] font-medium text-slate-700 placeholder:text-slate-400"
          placeholder="备注"
          value={note}
          onChange={(e) => onChangeNote(e.target.value)}
          aria-label="note"
        />
        <div className="text-[13px] font-semibold text-slate-700">修改余额</div>
      </div>

      <div className="mt-3 flex items-center justify-between text-[12px] font-medium text-slate-400">
        <div>当前余额</div>
        <div className="text-slate-500">{formatCny(account.balance)}</div>
      </div>
      {editingOp && !canApplyDiff ? (
        <div className="mt-1 text-[11px] font-semibold text-slate-400">
          余额不会变（已在后续校准中固定）
        </div>
      ) : null}
      {setBalanceExpression.ok && isNegativeAccountBalance(setBalanceParsed) ? (
        <div className="mt-1 text-[11px] font-semibold text-rose-500">
          余额不能为负
        </div>
      ) : null}
      {wouldSetBalanceGoNegative ? (
        <div className="mt-1 text-[11px] font-semibold text-rose-500">
          保存后余额不能为负
        </div>
      ) : null}

      <motion.button
        type="button"
        onClick={onSubmit}
        disabled={!canSubmitSetBalance || isSetBalanceNoop}
        whileTap={{ scale: canSubmitSetBalance && !isSetBalanceNoop ? 0.99 : 1 }}
        className={`mt-6 w-full h-14 rounded-[22px] font-semibold text-[16px] transition-colors ${canSubmitSetBalance && !isSetBalanceNoop ? 'bg-slate-900 text-white shadow-sm' : 'bg-slate-200 text-slate-400'}`}
      >
        {editingOp ? '保存修改' : '完成'}
      </motion.button>
    </>
  )
}
