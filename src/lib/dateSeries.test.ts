import { describe, expect, it, vi } from 'vitest'
import { getMaxDateValue, shouldShowYearForDateKeys } from './dateSeries'

describe('dateSeries', () => {
  it('finds the max chart date value from explicit values and date keys', () => {
    expect(getMaxDateValue([
      { dateKey: '2026-01-01', dateValue: 10 },
      { dateKey: '2026-02-01' },
      { dateKey: 'not-a-date' },
    ])).toBeGreaterThan(10)
    expect(getMaxDateValue([{ dateKey: 'not-a-date' }])).toBeNull()
  })

  it('shows years when dates span multiple years or a non-current year', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-05T12:00:00.000Z'))

    expect(shouldShowYearForDateKeys(['2026-01-01', '2026-12-31'])).toBe(false)
    expect(shouldShowYearForDateKeys(['2025-12-31', '2026-01-01'])).toBe(true)
    expect(shouldShowYearForDateKeys(['2025-06-01'])).toBe(true)
    expect(shouldShowYearForDateKeys([null, undefined, 'not-a-date'])).toBe(false)

    vi.useRealTimers()
  })
})
