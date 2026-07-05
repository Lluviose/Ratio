import { describe, expect, it } from 'vitest'
import { coerceColorMode, resolveColorMode } from './colorMode'

describe('coerceColorMode', () => {
  it('accepts the three valid modes and falls back to system otherwise', () => {
    expect(coerceColorMode('light')).toBe('light')
    expect(coerceColorMode('dark')).toBe('dark')
    expect(coerceColorMode('system')).toBe('system')
    expect(coerceColorMode('blue')).toBe('system')
    expect(coerceColorMode(null)).toBe('system')
    expect(coerceColorMode(undefined)).toBe('system')
    expect(coerceColorMode(1)).toBe('system')
  })
})

describe('resolveColorMode', () => {
  it('fixed modes ignore the system preference', () => {
    expect(resolveColorMode('light', true)).toBe('light')
    expect(resolveColorMode('dark', false)).toBe('dark')
  })

  it('system mode follows the system preference', () => {
    expect(resolveColorMode('system', true)).toBe('dark')
    expect(resolveColorMode('system', false)).toBe('light')
  })
})
