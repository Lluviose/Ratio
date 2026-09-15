import type { ComponentPropsWithoutRef, Ref } from 'react'
import { motion } from 'framer-motion'
import type { Account } from '../../lib/accounts'
import { formatDateKey, formatRatioPercent, normalizeStoredDateKey, summarizeItemValue, todayDateKey } from '../../lib/accountCost'
import { moneyEquals, normalizeMoney } from '../../lib/money'
import {
  evaluateMoneyExpression,
  sanitizeMoneyExpressionInput,
  type MoneyExpressionOperator,
} from '../../lib/moneyExpression'
import { MoneyExpressionKeypad, MoneyExpressionPreview } from './MoneyExpressionControls'
import { formatCny, normalizeNoteValue } from './format'

// 记录/修正物品原值：只改 cost，不动净值。附带购入日期编辑。
export function SetCostPage(props: {
  account: Account
  value: string
  note: string
  acquiredAt: string
  expressionInputProps: ComponentPropsWithoutRef<'input'>
  inputRef: Ref<HTMLInputElement>
  onChangeValue: (value: string) => void
  onChangeNote: (value: string) => void
  onChangeAcquiredAt: (value: string) => void
  onOperator: (operator: MoneyExpressionOperator) => void
  onClearExpression: () => void
  onSubmit: () => void
  onCancel: () => void
}) {
  const {
    account,
    value,
    note,
    acquiredAt,
    expressionInputProps,
    inputRef,
    onChangeValue,
    onChangeNote,
    onChangeAcquiredAt,
    onOperator,
    onClearExpression,
    onSubmit,
    onCancel,
  } = props

  const trimmed = value.trim()
  const expression = evaluateMoneyExpression(value)
  const parsed = expression.ok ? normalizeMoney(expression.value) : 0
  const hasValidCost = trimmed !== '' && expression.ok && parsed > 0
  const isFirst = account.cost == null
  const nextNote = normalizeNoteValue(note)
  const acquiredUnchanged = (acquiredAt || '') === (account.acquiredAt ?? '')
  const isNoop = !isFirst && hasValidCost && moneyEquals(parsed, account.cost ?? 0) && acquiredUnchanged && !nextNote
  const dateValid = !acquiredAt || (Boolean(normalizeStoredDateKey(acquiredAt)) && acquiredAt <= todayDateKey())
  const canSubmit = hasValidCost && !isNoop && dateValid
  const preview = hasValidCost ? summarizeItemValue(parsed, account.balance) : null

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
                if (canSubmit) onSubmit()
              }
              if (e.key === 'Escape') {
                e.preventDefault()
                onCancel()
              }
            }}
            aria-label="set cost"
          />
        </div>
        <MoneyExpressionPreview show={trimmed !== ''} result={expression} />
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
        <div className="text-[13px] font-semibold text-slate-700">{isFirst ? '记录原值' : '修正原值'}</div>
      </div>

      <div className="mt-3 flex items-center justify-between gap-4">
        <div className="shrink-0 text-[12px] font-medium text-slate-400">购入日期</div>
        <input
          type="date"
          className="min-w-0 bg-transparent outline-none text-right text-[13px] font-semibold text-slate-700"
          value={acquiredAt}
          max={todayDateKey()}
          onChange={(e) => onChangeAcquiredAt(e.target.value)}
          aria-label="acquired date"
        />
      </div>

      <div className="mt-3 flex items-center justify-between text-[12px] font-medium text-slate-400">
        <div>当前净值</div>
        <div className="text-slate-500">{formatCny(account.balance)}</div>
      </div>
      {!isFirst ? (
        <div className="mt-1 flex items-center justify-between text-[12px] font-medium text-slate-400">
          <div>当前原值</div>
          <div className="text-slate-500">{formatCny(account.cost ?? 0)}</div>
        </div>
      ) : null}
      {preview ? (
        <motion.div
          key={`${preview.impairment < 0 ? 'gain' : 'loss'}-${formatRatioPercent(preview.impairmentRatio)}`}
          initial={{ opacity: 0, y: 2 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.14, ease: [0.16, 1, 0.3, 1] }}
          className="mt-1 text-[11px] font-semibold text-slate-400"
        >
          保存后{preview.impairment < 0 ? '累计增值' : '累计减值'} {formatCny(Math.abs(preview.impairment))}（
          {formatRatioPercent(preview.impairmentRatio)}）
          {acquiredAt ? ` · ${formatDateKey(acquiredAt)} 购入` : ''}
        </motion.div>
      ) : (
        <div className="mt-1 text-[11px] font-semibold text-slate-400">原值不影响净值，只用于计算累计减值</div>
      )}
      {expression.ok && trimmed !== '' && parsed <= 0 ? (
        <div className="mt-1 text-[11px] font-semibold text-rose-500">原值必须大于 0</div>
      ) : null}

      <motion.button
        type="button"
        onClick={onSubmit}
        disabled={!canSubmit}
        whileTap={{ scale: canSubmit ? 0.99 : 1 }}
        className={`mt-6 w-full h-14 rounded-[22px] font-semibold text-[16px] transition-colors ${canSubmit ? 'bg-slate-900 text-white shadow-sm' : 'bg-slate-200 text-slate-400'}`}
      >
        {isFirst ? '完成' : '保存修改'}
      </motion.button>
    </>
  )
}
