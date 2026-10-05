import { expect, test } from '@playwright/test'

// Exercise the real lazy-loaded AI overlay without contacting an AI service.
// A short viewport + synthetic safe areas checks layout, not a native keyboard.
test.use({ serviceWorkers: 'block' })

for (const scenario of [
  { name: 'narrow and short', viewport: { width: 320, height: 300 }, mode: 'light' },
  { name: 'landscape dark', viewport: { width: 667, height: 300 }, mode: 'dark' },
] as const) {
  test(`AI privacy actions remain reachable: ${scenario.name}`, async ({ page }) => {
    await page.setViewportSize(scenario.viewport)
    const aiRequests: string[] = []
    await page.route('https://ai-overlay.invalid/**', (route) => {
      if (route.request().url().includes('/api/ai/chat')) aiRequests.push(route.request().url())
      return route.abort()
    })
    await page.addInitScript(({ mode }) => {
      if ('serviceWorker' in navigator) {
        try {
          Object.defineProperty(ServiceWorkerContainer.prototype, 'register', {
            value: () => new Promise(() => {}),
          })
        } catch {
          // Some engines only support the context-level service worker block.
        }
      }
      localStorage.setItem('ratio.tourSeen', 'true')
      localStorage.setItem('ratio.colorMode', JSON.stringify(mode))
      localStorage.setItem('ratio.accounts', JSON.stringify([
        { id: 'ai-overlay-bank', type: 'bank_card', name: 'Salary Card', balance: 8000, updatedAt: '2026-06-08T00:00:00.000Z' },
      ]))
      localStorage.setItem('ratio.cloudSync', JSON.stringify({
        // Long configured proxy paths must wrap and remain scrollable.
        serverUrl: `https://ai-overlay.invalid/${'long-proxy-path/'.repeat(18)}`,
        username: 'overlay-test',
        password: 'not-a-real-password',
        autoSync: false,
        telemetryEnabled: false,
        useCloudAi: true,
        registrationInvite: '',
      }))
    }, { mode: scenario.mode })
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('button', { name: 'AI analysis' })).toBeVisible()
    await page.evaluate(() => {
      const style = document.documentElement.style
      style.setProperty('--safe-top', '20px')
      style.setProperty('--safe-bottom', '24px')
      style.setProperty('--safe-left', '12px')
      style.setProperty('--safe-right', '12px')
    })
    await page.getByRole('button', { name: 'AI analysis' }).click()

    const privacy = page.getByRole('dialog', { name: '隐私提示' })
    const panel = page.getByRole('dialog', { name: 'AI 分析' })
    await expect(privacy).toBeVisible({ timeout: 15_000 })
    await expect(page.getByRole('button', { name: 'AI analysis', exact: true })).toHaveCount(0)
    await expect.poll(() => privacy.evaluate((element) => getComputedStyle(element).transform), { timeout: 15_000 }).toBe('none')
    await expect.poll(() => privacy.evaluate((element) => {
      const rect = element.getBoundingClientRect()
      return rect.top >= 36 && rect.bottom <= innerHeight - 40
        && rect.left >= 28 && rect.right <= innerWidth - 28
        && element.scrollHeight > element.clientHeight
        && element.scrollWidth <= element.clientWidth
    })).toBe(true)

    const surface = scenario.mode === 'dark' ? 'rgb(21, 28, 43)' : 'rgb(255, 255, 255)'
    for (const dialog of [privacy, panel]) {
      await expect(dialog).toHaveCSS('background-color', surface)
      await expect(dialog).toHaveCSS('backdrop-filter', 'none')
    }
    if (scenario.mode === 'dark') {
      // The opaque dark surface must retain the existing light slate text bridge.
      await expect(privacy.getByText('隐私提示', { exact: true })).toHaveCSS('color', 'rgb(242, 246, 252)')
      await expect(panel.getByText('AI 分析', { exact: true })).toHaveCSS('color', 'rgb(242, 246, 252)')
    }

    await privacy.evaluate((element) => { element.scrollTop = element.scrollHeight })
    await expect(privacy.getByRole('button', { name: '不同意' })).toBeInViewport({ ratio: 1 })
    await expect(privacy.getByRole('button', { name: '我已了解' })).toBeInViewport({ ratio: 1 })
    await privacy.getByRole('button', { name: '不同意' }).click()
    await expect.poll(() => page.getByRole('dialog').count(), { timeout: 15_000 }).toBe(0)

    await page.getByRole('button', { name: 'AI analysis' }).click()
    await expect(privacy).toBeVisible()
    await privacy.evaluate((element) => { element.scrollTop = element.scrollHeight })
    await privacy.getByRole('button', { name: '我已了解' }).click()
    await expect.poll(() => privacy.count(), { timeout: 15_000 }).toBe(0)
    const composer = panel.getByPlaceholder('输入你的问题...')
    await expect(composer).toBeEnabled()
    await expect(composer).toBeInViewport({ ratio: 1 })
    await expect(panel.getByRole('button', { name: 'send', exact: true })).toBeInViewport({ ratio: 1 })
    await expect.poll(() => panel.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1)
    expect(aiRequests).toEqual([])
  })
}
