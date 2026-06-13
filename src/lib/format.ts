import { normalizeMoney } from './money'

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
