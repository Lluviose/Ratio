import type { AccountOp } from '../../lib/accountOps'
import { subtractMoney } from '../../lib/money'

export type OpDisplayInfo = {
  title: string
  // null 表示不涉及金额（如重命名）
  delta: number | null
}

// 操作在「某个账户视角」下的展示标题与金额变动（转账区分转入/转出方向）
export function describeOpForAccount(
  op: AccountOp,
  accountId: string,
  getAccountName: (id: string) => string | undefined,
): OpDisplayInfo {
  if (op.kind === 'rename') {
    return { title: `重命名：${op.beforeName} → ${op.afterName}`, delta: null }
  }
  if (op.kind === 'set_balance') {
    return { title: '修改余额', delta: subtractMoney(op.after, op.before) }
  }
  if (op.kind === 'adjust') {
    return { title: op.delta >= 0 ? '期间净流入' : '期间净流出', delta: op.delta }
  }
  if (accountId === op.fromId) {
    return { title: `转出到 ${getAccountName(op.toId) ?? '账户'}`, delta: subtractMoney(op.fromAfter, op.fromBefore) }
  }
  return { title: `从 ${getAccountName(op.fromId) ?? '账户'} 转入`, delta: subtractMoney(op.toAfter, op.toBefore) }
}
