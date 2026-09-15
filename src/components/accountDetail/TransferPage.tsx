import type { ComponentPropsWithoutRef, Ref } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { PackagePlus } from 'lucide-react'
import { SegmentedControl } from '../SegmentedControl'
import { accountTypeOptions, defaultAccountName, type Account, type AccountTypeId } from '../../lib/accounts'
import type { TransferOp } from '../../lib/accountOps'
import { moneyEquals } from '../../lib/money'
import {
  evaluateMoneyExpression,
  sanitizeMoneyExpressionInput,
  type MoneyExpressionOperator,
} from '../../lib/moneyExpression'
import { exitTransition, smoothTransition } from '../../lib/motionPresets'
import { MoneyExpressionKeypad, MoneyExpressionPreview } from './MoneyExpressionControls'
import { formatCny } from './format'

export type TransferDirection = 'out' | 'in'

// 「对方账户」下拉里的虚拟选项：转出时直接新建一件物品（购入固定资产）
export const NEW_ITEM_PEER_ID = '__new_item__'

const itemTypeOptions = accountTypeOptions.filter((t) => t.groupId === 'fixed')

// 转账页：编辑已有转账时只允许改金额（方向与对方账户锁定）
export function TransferPage(props: {
  account: Account
  editingOp: TransferOp | null
  direction: TransferDirection
  peerId: string
  amount: string
  selectablePeers: Account[]
  // 转出时允许选择「新建物品」作为转入方
  allowNewItem: boolean
  newItemType: AccountTypeId
  newItemName: string
  expressionInputProps: ComponentPropsWithoutRef<'input'>
  inputRef: Ref<HTMLInputElement>
  onChangeDirection: (direction: TransferDirection) => void
  onChangePeer: (peerId: string) => void
  onChangeAmount: (value: string) => void
  onChangeNewItemType: (type: AccountTypeId) => void
  onChangeNewItemName: (name: string) => void
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
    allowNewItem,
    newItemType,
    newItemName,
    expressionInputProps,
    inputRef,
    onChangeDirection,
    onChangePeer,
    onChangeAmount,
    onChangeNewItemType,
    onChangeNewItemName,
    onOperator,
    onClearExpression,
    onSubmit,
  } = props

  const transferAmountTrimmed = amount.trim()
  const transferExpression = evaluateMoneyExpression(amount)
  const transferParsed = transferExpression.ok ? transferExpression.value : 0
  const hasValidTransferAmount = transferAmountTrimmed !== '' && transferExpression.ok && transferParsed > 0
  const isTransferNoop = Boolean(editingOp && hasValidTransferAmount && moneyEquals(transferParsed, editingOp.amount))
  const isNewItem = peerId === NEW_ITEM_PEER_ID && allowNewItem && direction === 'out'
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
            <div className="fieldLabel">{direction === 'out' ? '转入到' : '从哪转入'}</div>
            <select
              className="select"
              value={peerId}
              disabled={Boolean(editingOp)}
              onChange={(e) => onChangePeer(e.target.value)}
              aria-label="对方账户"
            >
              <option value="">请选择</option>
              {allowNewItem && direction === 'out' && !editingOp ? (
                <option value={NEW_ITEM_PEER_ID}>＋ 新建物品（购入固定资产）</option>
              ) : null}
              {selectablePeers.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>

          <AnimatePresence initial={false}>
            {isNewItem ? (
              <motion.div
                key="new-item"
                layout
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 4, transition: exitTransition }}
                transition={smoothTransition}
                className="overflow-hidden"
              >
                <div className="rounded-[20px] border border-white/70 bg-white/60 px-3.5 pt-3 pb-3.5">
                  <div className="flex items-center gap-2 text-[12px] font-semibold text-slate-500">
                    <PackagePlus size={14} strokeWidth={2.6} />
                    <span>新建物品</span>
                  </div>
                  <div className="mt-2.5 flex justify-center">
                    <SegmentedControl
                      options={itemTypeOptions.map((t) => ({ value: t.id, label: t.name }))}
                      value={newItemType}
                      onChange={onChangeNewItemType}
                    />
                  </div>
                  <input
                    className="mt-3 w-full bg-transparent outline-none border-b border-slate-200/80 pb-2 text-[15px] font-bold text-slate-900 placeholder:text-slate-400"
                    placeholder={`${defaultAccountName(newItemType)}名称，如：家用车`}
                    value={newItemName}
                    onChange={(e) => onChangeNewItemName(e.target.value)}
                    aria-label="new item name"
                  />
                  <div className="mt-2 text-[11px] font-semibold text-slate-400">
                    转出金额将作为物品的原值与初始净值，购入日期记为今天
                  </div>
                </div>
              </motion.div>
            ) : null}
          </AnimatePresence>

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
                aria-label="transfer amount"
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
          {editingOp ? '保存修改' : isNewItem ? '新建并转入' : '完成'}
        </motion.button>
      </div>
    </>
  )
}
