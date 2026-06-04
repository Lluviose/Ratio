import { dateKeyToUtcDays } from './savingsGoal'

export type DateSeriesPoint = {
  dateKey: string
  dateValue?: number | null
}

function getDateYear(dateKey: string | null | undefined) {
  if (!dateKey) return null
  const match = /^(\d{4})/.exec(dateKey)
  if (!match) return null
  const year = Number(match[1])
  return Number.isFinite(year) ? year : null
}

export function shouldShowYearForDateKeys(dateKeys: Array<string | null | undefined>) {
  const years = new Set<number>()
  for (const dateKey of dateKeys) {
    const year = getDateYear(dateKey)
    if (year != null) years.add(year)
  }
  if (years.size > 1) return true
  const [year] = Array.from(years)
  return year != null && year !== new Date().getFullYear()
}

export function getMaxDateValue(points: readonly DateSeriesPoint[]): number | null {
  return points.reduce<number | null>((max, point) => {
    const value = typeof point.dateValue === 'number' ? point.dateValue : dateKeyToUtcDays(point.dateKey)
    if (value == null) return max
    return max == null ? value : Math.max(max, value)
  }, null)
}
