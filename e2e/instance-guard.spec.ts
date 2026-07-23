import { expect, test, type Page } from '@playwright/test'

// 单实例守卫 e2e（P0-5）：同一浏览器上下文里第二个标签页会被拦截，
// 「在此标签页继续」steal 接管后原标签页冻结。Web Locks 按 origin 共享，
// Playwright 各测试的独立 context 互不可见，因此其余 e2e 不受守卫影响。

const account = {
  id: 'e2e-account-1',
  type: 'bank_card',
  name: 'E2E Account',
  balance: 12345,
  updatedAt: '2026-06-08T00:00:00.000Z',
}

async function seedApp(page: Page) {
  await page.addInitScript((seededAccount) => {
    window.localStorage.setItem('ratio.tourSeen', 'true')
    window.localStorage.setItem('ratio.accounts', JSON.stringify([seededAccount]))
    window.localStorage.setItem('ratio.accountOps', JSON.stringify([]))
  }, account)
}

async function waitForAssetsHome(page: Page) {
  await expect(page.getByRole('button', { name: '展开流动资金占比详情' })).toBeVisible({ timeout: 20_000 })
}

test('second tab is gated and takeover freezes the first tab', async ({ page, context }) => {
  await seedApp(page)
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await waitForAssetsHome(page)

  // 同一 context 的第二个标签页：锁被占用，显示拦截页而不是应用
  const second = await context.newPage()
  await second.goto('/', { waitUntil: 'domcontentloaded' })
  await expect(second.getByText('Ratio 已在其他标签页打开')).toBeVisible({ timeout: 20_000 })
  await expect(second.getByRole('button', { name: '展开流动资金占比详情' })).toHaveCount(0)

  // 接管：第二页挂载应用，第一页冻结
  await second.getByRole('button', { name: '在此标签页继续' }).click()
  await waitForAssetsHome(second)
  await expect(page.getByText('本页已暂停')).toBeVisible({ timeout: 10_000 })

  // 冻结页「刷新此页」后回到拦截页（锁仍被第二页持有）
  await page.getByRole('button', { name: '刷新此页' }).click()
  await expect(page.getByText('Ratio 已在其他标签页打开')).toBeVisible({ timeout: 20_000 })
})
