import type { AccountTypeId } from './accounts'

export type AccountOpBase = {
  id: string
  at: string
  accountType: AccountTypeId
  note?: string
}

export type RenameAccountOp = AccountOpBase & {
  kind: 'rename'
  accountId: string
  beforeName: string
  afterName: string
}

export type SetBalanceOp = AccountOpBase & {
  kind: 'set_balance'
  accountId: string
  before: number
  after: number
}

export type AdjustBalanceOp = AccountOpBase & {
  kind: 'adjust'
  accountId: string
  delta: number
  before: number
  after: number
}

// 物品（固定资产）专用：减值/增值，delta<0 为计提减值、>0 为价值上调。
// 与 adjust 同样改动余额（净值），但不是现金流，统计口径必须排除。
export type RevalueOp = AccountOpBase & {
  kind: 'revalue'
  accountId: string
  delta: number
  before: number
  after: number
}

// 物品原值记录/修正：不改余额（净值），before 为 null 表示首次记录
export type SetCostOp = AccountOpBase & {
  kind: 'set_cost'
  accountId: string
  before: number | null
  after: number
}

export type TransferOp = AccountOpBase & {
  kind: 'transfer'
  fromId: string
  toId: string
  amount: number
  fromBefore: number
  fromAfter: number
  toBefore: number
  toAfter: number
}

export type AccountOp = RenameAccountOp | SetBalanceOp | AdjustBalanceOp | RevalueOp | SetCostOp | TransferOp

export type AccountOpInput =
  | Omit<RenameAccountOp, 'id'>
  | Omit<SetBalanceOp, 'id'>
  | Omit<AdjustBalanceOp, 'id'>
  | Omit<RevalueOp, 'id'>
  | Omit<SetCostOp, 'id'>
  | Omit<TransferOp, 'id'>