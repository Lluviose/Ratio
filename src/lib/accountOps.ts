import type { AccountTypeId } from './accounts'

export type AccountOpBase = {
  id: string
  at: string
  accountType: AccountTypeId
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

export type AccountOp = RenameAccountOp | SetBalanceOp | AdjustBalanceOp | TransferOp

export type AccountOpInput =
  | Omit<RenameAccountOp, 'id'>
  | Omit<SetBalanceOp, 'id'>
  | Omit<AdjustBalanceOp, 'id'>
  | Omit<TransferOp, 'id'>
