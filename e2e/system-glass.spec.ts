import { expect, test } from '@playwright/test'

// Stock browsers cannot enable WKWebView's private material preference. Exercise
// the active-glass layout and data surfaces via the same document attribute;
// the native material itself still needs an iOS device check.
for (const mode of ['light', 'dark'] as const) {
  test(`system glass keeps ${mode} trend surfaces backed and navigation floating`, async ({ page }) => {
    await page.setViewportSize({ width: mode === 'light' ? 390 : 320, height: 844 })
    await page.emulateMedia({ colorScheme: mode, reducedMotion: 'no-preference' })
    await page.addInitScript(() => {
      localStorage.setItem('ratio.tourSeen', 'true')
      localStorage.setItem('ratio.accounts', JSON.stringify([{
        id: 'glass-account', type: 'bank_card', name: 'Glass account',
        balance: 30000, updatedAt: '2026-06-08T00:00:00.000Z',
      }]))
      localStorage.setItem('ratio.snapshots', JSON.stringify([
        { date: '2026-06-01', cash: 20000, invest: 0, fixed: 0, receivable: 0, debt: 0, net: 20000 },
        { date: '2026-06-08', cash: 30000, invest: 0, fixed: 0, receivable: 0, debt: 0, net: 30000 },
      ]))
      localStorage.setItem('ratio.savingsGoal', JSON.stringify({
        targetAmount: 100000, targetDate: '2027-12-31', startDate: '2026-06-01',
        startNetWorth: 20000, createdAt: '2026-06-01T00:00:00.000Z',
      }))
    })
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await page.getByRole('button', { name: 'trend', exact: true }).click()
    await expect(page.locator('.iosTrendGoalPanel')).toBeVisible()

    await page.evaluate(() => {
      document.documentElement.dataset.systemGlass = '1'
      document.documentElement.style.setProperty('--safe-bottom', '34px')
    })

    const nav = page.locator('.navBar')
    // The system material owns the capsule rim; a CSS border/inset highlight
    // paints a second full-width capsule inside it on iOS.
    await expect(nav).toHaveCSS('border-width', '0px')
    await expect(nav).toHaveCSS('box-shadow', 'none')
    const geometry = await nav.evaluate((element) => {
      const rect = element.getBoundingClientRect()
      const frame = document.querySelector('.appFrame')!.getBoundingClientRect()
      const style = getComputedStyle(element)
      return {
        leftGap: rect.left - frame.left, rightGap: frame.right - rect.right,
        bottomGap: frame.bottom - rect.bottom, height: rect.height,
        radius: parseFloat(style.borderRadius),
        itemsFit: [...element.querySelectorAll('.navItem')].every((item) => {
          const bounds = item.getBoundingClientRect()
          return bounds.left >= rect.left && bounds.right <= rect.right &&
            bounds.top >= rect.top && bounds.bottom <= rect.bottom && bounds.height >= 44
        }),
      }
    })
    expect(geometry.leftGap).toBeGreaterThan(0)
    expect(geometry.rightGap).toBeGreaterThan(0)
    expect(geometry.bottomGap).toBeGreaterThan(34)
    expect(geometry.radius).toBeGreaterThanOrEqual(geometry.height / 2)
    expect(geometry.itemsFit).toBe(true)

    await page.getByRole('img', { name: '净资产趋势图' }).click({ position: { x: 90, y: 120 } })
    await expect(page.locator('.iosTrendDetailPanel')).toBeVisible()
    const surfaces = await page.locator('.iosTrendChartCard, .iosTrendGoalPanel, .iosTrendDetailPanel').evaluateAll((elements) => {
      const canvas = document.createElement('canvas')
      canvas.width = canvas.height = 1
      const context = canvas.getContext('2d')!
      return elements.map((element) => {
        const style = getComputedStyle(element)
        context.clearRect(0, 0, 1, 1)
        context.fillStyle = style.backgroundColor
        context.fillRect(0, 0, 1, 1)
        return {
          alpha: context.getImageData(0, 0, 1, 1).data[3],
          backdrop: style.backdropFilter,
          material: style.getPropertyValue('-apple-visual-effect'),
        }
      })
    })
    expect(surfaces).toHaveLength(3)
    for (const surface of surfaces) {
      expect(surface.alpha).toBe(255)
      expect(surface.backdrop).toBe('none')
      expect(surface.material).not.toContain('glass-material')
    }

    await nav.getByRole('button', { name: '统计', exact: true }).click()
    await expect(nav.getByRole('button', { name: '统计', exact: true })).toHaveAttribute('aria-current', 'page')
    await page.evaluate(() => { delete document.documentElement.dataset.systemGlass })
    await expect(nav).toHaveCSS('bottom', '0px')
    await expect(nav).toHaveCSS('border-radius', '0px')
  })
}
