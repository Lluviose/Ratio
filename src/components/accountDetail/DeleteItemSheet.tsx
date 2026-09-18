import type { Account } from '../../lib/accounts'
import type { AccountOp } from '../../lib/accountOps'
import { companionOpIdsForItem, findOnlyItemOpeningTransfer } from '../../lib/accountCost'
import { buildLatestSetBalanceAtMap, buildOpRollbackPlan } from '../../lib/opRollback'
import { useOverlay } from '../../lib/overlay'
import { hapticWarning } from '../../lib/haptics'
import { BottomSheet } from '../BottomSheet'
import { formatCny, formatSigned } from './format'

export function DeleteItemSheet(props: {
  open: boolean
  account: Account
  accounts: Account[]
  ops: AccountOp[]
  onClose: () => void
  onDeleted: () => void
  onDelete: (id: string) => void
  onDeleteOp: (id: string) => void
  onAdjust: (id: string, delta: number) => void
}) {
  const { open, account, accounts, ops, onClose, onDeleted, onDelete, onDeleteOp, onAdjust } = props
  const { toast } = useOverlay()
  const purchase = open ? findOnlyItemOpeningTransfer(account, ops) : null
  const peer = purchase ? accounts.find((a) => a.id === purchase.fromId) : undefined
  const rollback = purchase ? buildOpRollbackPlan(purchase, {
    latestSetBalanceAtByAccountId: buildLatestSetBalanceAtMap(ops),
    getAccountBalance: (id) => accounts.find((a) => a.id === id)?.balance,
  }).find((target) => target.accountId === purchase.fromId) : undefined
  const blockedReason = !peer
    ? '付款账户已删除，无法回滚交易。'
    : peer.archivedAt
      ? '付款物品已归档，请先取消归档再回滚交易。'
      : !rollback?.canRollback
        ? '付款账户已有后续余额校准或回滚后余额会为负，无法回滚交易。'
        : null

  const remove = (rollBack: boolean) => {
    if (rollBack && (!purchase || !rollback || blockedReason)) return
    hapticWarning()
    if (rollBack && purchase && rollback) {
      onAdjust(rollback.accountId, rollback.delta)
      for (const id of companionOpIdsForItem(ops, account.id, purchase.id)) onDeleteOp(id)
      onDeleteOp(purchase.id)
    }
    onDelete(account.id)
    onClose()
    onDeleted()
    toast(rollBack ? `已删除「${account.name}」并回滚交易` : `已删除「${account.name}」（交易记录保留）`, { tone: 'success' })
  }

  return (
    <BottomSheet open={open} title="删除物品" onClose={onClose} hideHandle sheetStyle={{ maxHeight: '72vh' }}>
      <div className="muted" style={{ fontSize: 13, fontWeight: 500, lineHeight: 1.55 }}>
        删除「{account.name}」（净值 {formatCny(account.balance)}）后无法恢复。
        {purchase ? (
          <p style={{ marginTop: 10 }}>
            此物品仅有一笔新建购入记录，是否同时回滚交易？
            {blockedReason ?? `回滚会删除购入及附属原值记录，并调整「${peer!.name}」余额 ${formatSigned(rollback!.delta)}。`}
          </p>
        ) : null}
        <p style={{ marginTop: 10 }}>仅删除物品会保留交易记录，其他账户余额不变。</p>
      </div>
      <div className="stack" style={{ gap: 10, marginTop: 14 }}>
        <button type="button" className="ghostBtn" onClick={onClose}>取消</button>
        <button type="button" className="dangerBtn" onClick={() => remove(false)}>仅删除物品</button>
        {purchase ? (
          <button type="button" className="dangerBtn" disabled={Boolean(blockedReason)} onClick={() => remove(true)}>
            删除并回滚交易
          </button>
        ) : null}
      </div>
    </BottomSheet>
  )
}
