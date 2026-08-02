import { formatCny as formatCnyBase } from '../../lib/format'
import { normalizeMoney } from '../../lib/money'

export function formatTime(iso: string) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${d.getMonth() + 1}月${d.getDate()}日 ${hh}:${mm}`
}

export function formatCny(value: number) {
  return formatCnyBase(value, { keepCents: true })
}

// datetime-local 输入框的取值格式（本地时区、分钟精度）
export function toDatetimeLocalValue(date: Date) {
  if (Number.isNaN(date.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function formatSigned(amount: number) {
  if (amount > 0) return `+${formatCny(amount)}`
  if (amount < 0) return `-${formatCny(Math.abs(amount))}`
  return formatCny(amount)
}

export function toMoneyInputValue(value: number) {
  const normalized = normalizeMoney(value)
  if (Number.isInteger(normalized)) return String(normalized)
  return normalized.toFixed(2).replace(/\.?0+$/, '')
}

export function normalizeNoteValue(value: string) {
  const note = value.trim()
  return note ? note : undefined
}
