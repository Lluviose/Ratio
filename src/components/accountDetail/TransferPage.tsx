import type { ComponentPropsWithoutRef, Ref } from 'react'
import { motion } from 'framer-motion'
import { SegmentedControl } from '../SegmentedControl'
import type { Account } from '../../lib/accounts'
import type { TransferOp } from '../../lib/accountOps'
import { moneyEquals } from '../../lib/money'
import {
  evaluateMoneyExpression,
  sanitizeMoneyExpressionInput,
  type MoneyExpressionOperator,
} from '../../lib/moneyExpression'
import { MoneyExpressionKeypad, MoneyExpressionPreview } from './MoneyExpressionControls'
import { formatCny } from './format'

export type TransferDirection = 'out' | 'in'

// 转账页：编辑已有转账时只允许改金额（方向与对方账户锁定）
export function TransferPage(props: {
  account: Account
  editingOp: TransferOp | null
  direction: TransferDirection
  peerId: string
  amount: string
  selectablePeers: Account[]
  expressionInputProps: ComponentPropsWithoutRef<'input'>
  inputRef: Ref<HTMLInputElement>
  onChangeDirection: (direction: TransferDirection) => void
  onChangePeer: (peerId: string) => void
  onChangeAmount: (value: string) => void
  onOperator: (operator: MoneyExpressionOperator) => void
  onClearExpression: () => void
  onSubmit: () => void
}) {
  const {
    account,
    editingOp,
    direction,
    peerId,
    amount,
    selectablePeers,
    expressionInputProps,
    inputRef,
    onChangeDirection,
    onChangePeer,
    onChangeAmount,
    onOperator,
    onClearExpression,
    onSubmit,
  } = props

  const transferAmountTrimmed = amount.trim()
  const transferExpression = evaluateMoneyExpression(amount)
  const transferParsed = transferExpression.ok ? transferExpression.value : 0
  const hasValidTransferAmount = transferAmountTrimmed !== '' && transferExpression.ok && transferParsed > 0
  const isTransferNoop = Boolean(editingOp && hasValidTransferAmount && moneyEquals(transferParsed, editingOp.amount))
  const canSubmitTransfer = hasValidTransferAmount && (editingOp ? !isTransferNoop : Boolean(peerId))

  return (
    <>
      <div className="mt-4 text-[34px] font-black tracking-tight text-slate-900">
        {formatCny(account.balance)}
      </div>

      <div className="mt-5">
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <SegmentedControl
            options={[
              { value: 'out', label: '转出' },
              { value: 'in', label: '转入' },
            ]}
            value={direction}
            onChange={(v) => {
              if (editingOp) return
              onChangeDirection(v as TransferDirection)
            }}
          />
        </div>
        {editingOp ? (
          <div className="mt-2 text-center text-[11px] font-semibold text-slate-400">
            仅支持修改金额
          </div>
        ) : null}

        <div className="mt-4 stack" style={{ gap: 12 }}>
          <label className="field">
            <div className="fieldLabel">对方账户</div>
            <select
              className="select"
              value={peerId}
              disabled={Boolean(editingOp)}
              onChange={(e) => onChangePeer(e.target.value)}
            >
              <option value="">请选择</option>
              {selectablePeers.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>

          <div className="field">
            <div className="fieldLabel">金额</div>
            <div className="relative">
              <input
                ref={inputRef}
                className="input"
                {...expressionInputProps}
                placeholder="0.00"
                value={amount}
                onChange={(e) => onChangeAmount(sanitizeMoneyExpressionInput(e.target.value))}
                style={{ fontSize: 20, fontWeight: 900, paddingLeft: 24 }}
              />
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted-text)] font-black">¥</span>
            </div>
            <MoneyExpressionPreview show={transferAmountTrimmed !== ''} result={transferExpression} />
            <MoneyExpressionKeypad onOperator={onOperator} onClear={onClearExpression} />
          </div>
        </div>

        <motion.button
          type="button"
          onClick={onSubmit}
          disabled={!canSubmitTransfer}
          whileTap={{ scale: canSubmitTransfer ? 0.99 : 1 }}
          className={`mt-6 w-full h-14 rounded-[22px] font-semibold text-[16px] transition-colors ${canSubmitTransfer ? 'bg-slate-900 text-white shadow-sm' : 'bg-slate-200 text-slate-400'}`}
        >
          {editingOp ? '保存修改' : '完成'}
        </motion.button>
      </div>
    </>
  )
}
