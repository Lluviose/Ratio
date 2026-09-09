import { expect, test, type Page } from '@playwright/test'

// 阻止 Service Worker 注册：其首次激活会触发 controllerchange 自刷新（见 src/pwa.ts），
// 页面重载会打断动画中的断言。page.route 拦截不到 SW 脚本请求，必须用 context 选项。
test.use({ serviceWorkers: 'block' })

const accounts = [
  { id: 'e2e-bank', type: 'bank_card', name: 'Salary Card', balance: 8000, updatedAt: '2026-06-08T00:00:00.000Z' },
  { id: 'e2e-cash', type: 'cash', name: 'Wallet Cash', balance: 2000, updatedAt: '2026-06-08T00:00:00.000Z' },
  // A second category ensures expansion actually changes geometry (the single
  // full-size category's no-motion close fallback is covered by the unit test).
  { id: 'e2e-fund', type: 'fund', name: 'Index Fund', balance: 5000, updatedAt: '2026-06-08T00:00:00.000Z' },
]

async function seedApp(page: Page) {
  await page.addInitScript((seededAccounts) => {
    if ('serviceWorker' in navigator) {
      try {
        Object.defineProperty(ServiceWorkerContainer.prototype, 'register', {
          value: () => new Promise(() => {}),
        })
      } catch {
        // 忽略：个别引擎不允许重写，此时依赖 serviceWorkers: 'block'
      }
    }
    window.localStorage.setItem('ratio.tourSeen', 'true')
    window.localStorage.setItem('ratio.accounts', JSON.stringify(seededAccounts))
    window.localStorage.setItem('ratio.accountOps', JSON.stringify([]))
    window.localStorage.setItem(
      'ratio.snapshots',
      JSON.stringify([
        {
          date: '2026-06-08',
          cash: 10000,
          invest: 5000,
          fixed: 0,
          receivable: 0,
          debt: 0,
          net: 15000,
        },
      ]),
    )
  }, accounts)
}

async function gotoRatioPage(page: Page) {
  const scroller = page.getByTestId('home-scroller')
  await expect(scroller).toBeVisible()

  // 等待主页滚动器完成初始化（aria-hidden 翻转、定位到列表页），避免初始化把我们的滚动位置抢回去
  await expect
    .poll(() =>
      scroller.evaluate(
        (el) =>
          el.getAttribute('aria-hidden') === 'false' &&
          el.clientWidth > 0 &&
          Math.abs(el.scrollLeft - el.clientWidth * 2) < 2,
      ),
    )
    .toBe(true)

  for (let attempt = 0; attempt < 5; attempt += 1) {
    await scroller.evaluate((el) => {
      el.scrollTo({ left: el.clientWidth, behavior: 'instant' })
      el.dispatchEvent(new Event('scroll', { bubbles: true }))
    })
    const reachedRatio = await scroller.evaluate((el) => Math.abs(el.scrollLeft - el.clientWidth) < 2)
    if (reachedRatio) break
    await page.waitForTimeout(120)
  }

  await expect
    .poll(() => scroller.evaluate((el) => Math.abs(el.scrollLeft - el.clientWidth) < 2))
    .toBe(true)
}

test.beforeEach(async ({ page }) => {
  await seedApp(page)
  await page.goto('/', { waitUntil: 'domcontentloaded' })
})

test('expands a category block into its breakdown chart and collapses back', async ({ page }) => {
  await gotoRatioPage(page)

  const hit = page.getByRole('button', { name: '展开流动资金占比详情' })
  await hit.click()

  const panel = page.getByTestId('ratio-breakdown-panel')
  await expect(panel).toBeVisible()

  // 头部：大类名称与总额（复刻标签中也含大类名，取第一个）
  await expect(panel.getByText('流动资金').first()).toBeVisible()
  await expect(panel.getByText('¥10,000').first()).toBeVisible()

  // 分段：两种类型及类内占比（数字滚动结束后）
  await expect(panel.getByText('银行卡')).toBeVisible()
  await expect(panel.getByText('现金')).toBeVisible()
  await expect(panel.getByText('80%').first()).toBeVisible()
  await expect(panel.getByText('20%').first()).toBeVisible()

  await panel.getByRole('button', { name: '收起占比详情' }).click()
  // toBeHidden 的页内轮询依赖 rAF，Windows 无头 WebKit 空闲节流时会饿死；
  // expect.poll 每次从 Node 侧发起新求值，不受页面节流影响
  await expect.poll(() => panel.count(), { timeout: 10_000 }).toBe(0)

  // 收起后可再次展开
  await hit.click()
  await expect(page.getByTestId('ratio-breakdown-panel')).toBeVisible()
})

test('closes the breakdown when tapping the scrim or leaving the ratio page', async ({ page }) => {
  await gotoRatioPage(page)

  const hit = page.getByRole('button', { name: '展开流动资金占比详情' })
  await hit.click()

  const panel = page.getByTestId('ratio-breakdown-panel')
  await expect(panel).toBeVisible()

  // 点击顶部遮罩区域（面板之外）收起
  await page.getByTestId('ratio-breakdown-scrim').click({ position: { x: 60, y: 24 } })
  await expect.poll(() => panel.count(), { timeout: 10_000 }).toBe(0)

  // 再次展开后，滑回列表页应自动收起
  await hit.click()
  await expect(panel).toBeVisible()
  await page.getByTestId('home-scroller').evaluate((el) => {
    el.scrollLeft = el.clientWidth * 2
    el.dispatchEvent(new Event('scroll', { bubbles: true }))
  })
  await expect.poll(() => panel.count(), { timeout: 10_000 }).toBe(0)
})

test('first expansion uses native transforms without changing layout size', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await gotoRatioPage(page)
  await page.getByRole('button', { name: '展开流动资金占比详情' }).click()
  const panel = page.getByTestId('ratio-breakdown-panel')
  await expect(panel).toBeVisible()
  const sampled = await panel.evaluate(async (element) => {
    const node = element as HTMLElement
    const sizes: string[] = []
    const properties = new Set<string>()
    for (let frame = 0; frame < 12; frame++) {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
      sizes.push(`${node.offsetWidth}x${node.offsetHeight}`)
      for (const animation of node.getAnimations()) {
        const effect = animation.effect as KeyframeEffect
        for (const keyframe of effect.getKeyframes()) {
          for (const key of Object.keys(keyframe)) properties.add(key)
        }
      }
    }
    return { sizes: [...new Set(sizes)], properties: [...properties] }
  })
  expect(sampled.sizes).toHaveLength(1)
  expect(sampled.properties).toContain('transform')
  expect(sampled.properties).not.toContain('width')
  expect(sampled.properties).not.toContain('height')

  // Close before the spring has necessarily settled: no jump to the fully-open
  // rectangle, and both the panel and the unscaled source replica must be removed.
  await panel.getByRole('button', { name: '收起占比详情' }).dispatchEvent('click')
  await expect.poll(() => panel.count()).toBe(0)
  await expect(page.getByTestId('ratio-breakdown-origin')).toHaveCount(0)
})
