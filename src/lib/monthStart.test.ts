import { describe, expect, it } from 'vitest'
import { clampMonthStartDay, formatMonthKeyLabel, monthKeyForDateKey } from './monthStart'

describe('monthStart', () => {
  describe('clampMonthStartDay', () => {
    it('clamps to [1, 28] and floors', () => {
      expect(clampMonthStartDay(undefined)).toBe(1)
      expect(clampMonthStartDay(NaN)).toBe(1)
      expect(clampMonthStartDay(0)).toBe(1)
      expect(clampMonthStartDay(1)).toBe(1)
      expect(clampMonthStartDay(15.8)).toBe(15)
      expect(clampMonthStartDay(28)).toBe(28)
      expect(clampMonthStartDay(29)).toBe(28)
    })
  })

  describe('monthKeyForDateKey', () => {
    it('uses calendar month when startDay=1', () => {
      expect(monthKeyForDateKey('2026-01-01', 1)).toBe('2026-01')
      expect(monthKeyForDateKey('2026-12-31', 1)).toBe('2026-12')
    })

    it('shifts early days into previous month', () => {
      expect(monthKeyForDateKey('2026-01-04', 5)).toBe('2025-12')
      expect(monthKeyForDateKey('2026-01-05', 5)).toBe('2026-01')
    })

    it('handles year boundaries', () => {
      expect(monthKeyForDateKey('2026-01-01', 10)).toBe('2025-12')
      expect(monthKeyForDateKey('2026-01-10', 10)).toBe('2026-01')
    })

    it('clamps invalid startDay inputs', () => {
      expect(monthKeyForDateKey('2026-03-01', 0)).toBe('2026-03')
      expect(monthKeyForDateKey('2026-03-01', 99)).toBe('2026-02')
    })
  })

  describe('formatMonthKeyLabel', () => {
    it('formats monthKey as M月', () => {
      expect(formatMonthKeyLabel('2026-02')).toBe('2月')
      expect(formatMonthKeyLabel('2026-11')).toBe('11月')
      expect(formatMonthKeyLabel('bad')).toBe('bad')
    })
  })
})

