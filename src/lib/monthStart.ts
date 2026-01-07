export const MONTH_START_DAY_KEY = 'ratio.monthStartDay' as const

export const DEFAULT_MONTH_START_DAY = 1 as const
export const MIN_MONTH_START_DAY = 1 as const
export const MAX_MONTH_START_DAY = 28 as const

export function clampMonthStartDay(value: unknown): number {
  if (typeof value !== 'number') return DEFAULT_MONTH_START_DAY
  if (!Number.isFinite(value)) return DEFAULT_MONTH_START_DAY
  const day = Math.floor(value)
  if (day < MIN_MONTH_START_DAY) return MIN_MONTH_START_DAY
  if (day > MAX_MONTH_START_DAY) return MAX_MONTH_START_DAY
  return day
}

export function monthKeyForDateKey(dateKey: string, monthStartDay: number): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey)
  if (!m) return dateKey.slice(0, 7)

  const year = Number(m[1])
  const month = Number(m[2])
  const day = Number(m[3])
  if (![year, month, day].every((v) => Number.isFinite(v))) return dateKey.slice(0, 7)

  const startDay = clampMonthStartDay(monthStartDay)
  if (day >= startDay) return `${m[1]}-${m[2]}`

  const prevYear = month === 1 ? year - 1 : year
  const prevMonth = month === 1 ? 12 : month - 1
  return `${String(prevYear).padStart(4, '0')}-${String(prevMonth).padStart(2, '0')}`
}

export function formatMonthKeyLabel(monthKey: string) {
  const m = /^(\d{4})-(\d{2})$/.exec(monthKey)
  if (!m) return monthKey
  return `${Number(m[2])}月`
}
