import { normalizeMoney } from './money'

export type TxType = 'expense' | 'income'

export type Transaction = {
  id: string
  type: TxType
  amount: number
  category: string
  account: string
  date: string
  note: string
}

export function createId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

export function normalizeAmount(type: TxType, amount: number) {
  const abs = Number.isFinite(amount) ? normalizeMoney(Math.abs(amount)) : 0
  if (abs === 0) return 0
  return type === 'expense' ? -abs : abs
}
