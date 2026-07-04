import type { AccountOp } from './accountOps'
import { canApplyBalanceDelta } from './accountBalance'
import { subtractMoney } from './money'

// 回滚语义（金融不变量）：删除/编辑一条历史操作时，只有当该账户在这条操作
// 之后没有更晚的 set_balance 校准时，才允许把差额回写到当前余额——
// 后续校准意味着用户已确认过「那之后的真实余额」，回写会破坏这次确认。

export function buildLatestSetBalanceAtMap(ops: readonly AccountOp[]): Map<string, string> {
  const m = new Map<string, string>()
  for (const op of ops) {
    if (op.kind !== 'set_balance') continue
    const prev = m.get(op.accountId)
    if (!prev || op.at.localeCompare(prev) > 0) m.set(op.accountId, op.at)
  }
  return m
}

export function canRollbackBalance(
  latestSetBalanceAtByAccountId: ReadonlyMap<string, string>,
  accountId: string,
  at: string,
): boolean {
  const latest = latestSetBalanceAtByAccountId.get(accountId)
  if (!latest) return true
  return latest.localeCompare(at) <= 0
}

export type OpRollbackTarget = {
  accountId: string
  delta: number
  canRollback: boolean
}

export type OpRollbackContext = {
  latestSetBalanceAtByAccountId: ReadonlyMap<string, string>
  // 返回 undefined 表示账户已不存在（不可回滚）
  getAccountBalance: (accountId: string) => number | undefined
}

// 删除一条操作时的回滚计划：列出每个受影响账户的回写差额与可回滚性。
// delta 为 0 的账户也会列出（UI 需要区分「受影响」与「实际回写」）。
export function buildOpRollbackPlan(op: AccountOp, ctx: OpRollbackContext): OpRollbackTarget[] {
  const canRollbackTarget = (accountId: string, delta: number) => {
    if (!canRollbackBalance(ctx.latestSetBalanceAtByAccountId, accountId, op.at)) return false
    const balance = ctx.getAccountBalance(accountId)
    if (balance === undefined) return false
    return canApplyBalanceDelta(balance, delta)
  }

  if (op.kind === 'adjust') {
    const delta = subtractMoney(0, op.delta)
    return [{ accountId: op.accountId, delta, canRollback: canRollbackTarget(op.accountId, delta) }]
  }

  if (op.kind === 'set_balance') {
    const delta = subtractMoney(op.before, op.after)
    return [{ accountId: op.accountId, delta, canRollback: canRollbackTarget(op.accountId, delta) }]
  }

  if (op.kind === 'transfer') {
    const fromDelta = subtractMoney(op.fromBefore, op.fromAfter)
    const toDelta = subtractMoney(op.toBefore, op.toAfter)
    return [
      { accountId: op.fromId, delta: fromDelta, canRollback: canRollbackTarget(op.fromId, fromDelta) },
      { accountId: op.toId, delta: toDelta, canRollback: canRollbackTarget(op.toId, toDelta) },
    ]
  }

  return []
}
