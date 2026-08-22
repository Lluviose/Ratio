import { afterEach, describe, expect, it, vi } from 'vitest'
import { applyDocumentSystemGlass, coerceSystemGlass, isSystemGlassCssSupported } from './systemGlass'

describe('coerceSystemGlass', () => {
  it('only accepts boolean true', () => {
    expect(coerceSystemGlass(true)).toBe(true)
    expect(coerceSystemGlass(false)).toBe(false)
    expect(coerceSystemGlass('true')).toBe(false)
    expect(coerceSystemGlass(1)).toBe(false)
    expect(coerceSystemGlass(null)).toBe(false)
    expect(coerceSystemGlass(undefined)).toBe(false)
  })
})

describe('isSystemGlassCssSupported', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('is false when CSS.supports is missing', () => {
    vi.stubGlobal('CSS', undefined)
    expect(isSystemGlassCssSupported()).toBe(false)
  })

  it('asks CSS.supports for the private property', () => {
    const supports = vi.fn().mockReturnValue(true)
    vi.stubGlobal('CSS', { supports })
    expect(isSystemGlassCssSupported()).toBe(true)
    expect(supports).toHaveBeenCalledWith('-apple-visual-effect', '-apple-system-glass-material')
  })
})

describe('applyDocumentSystemGlass', () => {
  afterEach(() => {
    delete document.documentElement.dataset.systemGlass
    vi.unstubAllGlobals()
  })

  it('does not set the attribute when CSS is unsupported', () => {
    vi.stubGlobal('CSS', { supports: () => false })
    applyDocumentSystemGlass(true)
    expect(document.documentElement.dataset.systemGlass).toBeUndefined()
  })

  it('sets data-system-glass when enabled and supported', () => {
    vi.stubGlobal('CSS', { supports: () => true })
    applyDocumentSystemGlass(true)
    expect(document.documentElement.dataset.systemGlass).toBe('1')
    applyDocumentSystemGlass(false)
    expect(document.documentElement.dataset.systemGlass).toBeUndefined()
  })
})
