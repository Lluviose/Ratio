/// <reference types="node" />
import { readFileSync } from 'node:fs'
import postcss from 'postcss'
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

describe('native material selectors', () => {
  afterEach(() => {
    document.body.replaceChildren()
    delete document.documentElement.dataset.systemGlass
  })

  it('never grants native material to dialogs or nested cards, even when supported', () => {
    document.documentElement.dataset.systemGlass = '1'
    document.body.innerHTML = `
      <div class="iosInsightsPage iosStatsPage">
        <div id="page-card" class="card"></div>
        <div id="page-chrome" class="glassChrome"></div>
        <nav id="page-nav" class="navBar"></nav>
        <section role="dialog" class="sheet card glassChrome">
          <div class="card"><div class="glassChrome"></div></div>
        </section>
      </div>
      <section role="dialog" class="addAccountOverlay">
        <div class="iosInsightsPage iosStatsPage"><div class="card"></div></div>
      </section>
      <section role="dialog"><div class="card glassChrome navBar"></div></section>
    `
    const css = postcss.parse(readFileSync('src/index.css', 'utf8'))
    const selectors: string[] = []
    css.walkDecls('-apple-visual-effect', (declaration) => {
      if (declaration.value.includes('glass-material') && declaration.parent?.type === 'rule') {
        selectors.push(declaration.parent.selector)
      }
    })
    expect(selectors.length).toBeGreaterThan(0)
    const matched = selectors.flatMap((selector) => [...document.querySelectorAll(selector)])
    expect(matched.some((element) => element.closest('[role="dialog"]'))).toBe(false)
    for (const id of ['page-card', 'page-chrome', 'page-nav']) {
      expect(matched).toContain(document.getElementById(id))
    }
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
