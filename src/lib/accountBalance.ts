import type { AccountTypeId } from './accounts'
import { addMoney, normalizeMoney } from './money'

export function isDebtAccountType(type: AccountTypeId) {
  return type === 'credit_card' || type === 'loan' || type === 'payable' || type === 'other_debt'
}

export function isNegativeAccountBalance(value: number) {
  return normalizeMoney(value) < 0
}

export function normalizeStoredAccountBalance(type: AccountTypeId, value: unknown) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0

  const normalized = normalizeMoney(value)
  if (normalized >= 0) return normalized

  // Legacy debt entries were sometimes stored as negative numbers because users
  // naturally typed liabilities with a minus sign. The domain model stores debt
  // as a positive amount owed, so migrate those values to their absolute amount.
  return isDebtAccountType(type) ? normalizeMoney(Math.abs(normalized)) : 0
}

export function canApplyBalanceDelta(balance: number, delta: number) {
  return !isNegativeAccountBalance(addMoney(balance, delta))
}

export function applyAccountFlow(type: AccountTypeId, balance: number, flow: number) {
  if (isDebtAccountType(type)) return addMoney(balance, -flow)
  return addMoney(balance, flow)
}
