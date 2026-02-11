import { normalizeMoney } from './money'

export function formatMoney(value: number) {
  const abs = Math.abs(value)
  const sign = value < 0 ? '-' : ''
  if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(2)}m`
  if (abs >= 10_000) return `${sign}${Math.round(abs).toLocaleString('en-US')}`
  return `${sign}${abs.toLocaleString('en-US')}`
}

type FormatCnyOptions = {
  keepCents?: boolean
}

export function formatCny(value: number, options?: FormatCnyOptions) {
  const normalized = Number.isFinite(value) ? normalizeMoney(value) : 0
  const safeValue = Object.is(normalized, -0) ? 0 : normalized

  if (options?.keepCents) {
    return `\u00A5${safeValue.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }

  return `\u00A5${Math.round(safeValue).toLocaleString('zh-CN')}`
}
