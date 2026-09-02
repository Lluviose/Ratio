import { expect, test, type Page } from '@playwright/test'

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
    window.localStorage.setItem(
      'ratio.snapshots',
      JSON.stringify([
        {
          date: '2026-06-08',
          cash: seededAccount.balance,
          invest: 0,
          fixed: 0,
          receivable: 0,
          debt: 0,
          net: seededAccount.balance,
        },
      ]),
    )
  }, account)
}

async function expectAssetsHomeVisible(page: Page) {
  await expect(page.getByRole('button', { name: 'stats' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'trend' })).toBeVisible()
  await expect(accountGroupCard(page)).toBeVisible()
}

function accountGroupCard(page: Page) {
  return page.getByRole('button', { name: 'account group liquid' })
}

async function openAccountDetail(page: Page) {
  // 等首页真正初始化：fallback 首页换乘真实首页前，滚动区带 aria-hidden，
  // 占比展开按钮对 getByRole 不可见。不等这一拍，dispatchEvent 可能解析到
  // 即将卸载的 fallback 节点——已卸载节点上的事件不会冒泡到 React 根，点击被吞。
  await expect(page.getByRole('button', { name: '展开流动资金占比详情' })).toBeVisible()

  // 幂等：分组已展开（重开流程）时不再点分组卡，否则会把它折叠回去
  const typeRow = page.getByRole('button', { name: 'account type bank_card' })
  if (!(await typeRow.isVisible())) {
    await accountGroupCard(page).dispatchEvent('click')
  }
  await expect(typeRow).toBeVisible()
  await typeRow.dispatchEvent('click')

  const accountRow = page.getByRole('button', { name: 'account E2E Account' })
  await expect(accountRow).toBeVisible()
  await accountRow.dispatchEvent('click')

  // 详情页动作按钮就位后再返回，避免向进场中的表单派发事件
  await expect(page.getByRole('button', { name: 'set balance action' })).toBeVisible()
}

test.beforeEach(async ({ page }) => {
  await seedApp(page)
  await page.goto('/', { waitUntil: 'domcontentloaded' })
})

test('returns from stats and trend to assets without blanking the home screen', async ({ page }) => {
  await expectAssetsHomeVisible(page)

  await page.getByRole('button', { name: 'stats' }).click()
  await expect(page.getByRole('button', { name: 'back' }).first()).toBeVisible()
  await page.getByRole('button', { name: 'back' }).first().click()
  await expectAssetsHomeVisible(page)

  await page.getByRole('button', { name: 'trend' }).click()
  await expect(page.getByRole('button', { name: 'back' }).first()).toBeVisible()
  await page.getByRole('button', { name: 'back' }).first().click()
  await expectAssetsHomeVisible(page)
})

test('returns to assets when backing out of stats before it finishes loading', async ({ page }) => {
  await expectAssetsHomeVisible(page)

  // The stats screen loads via a StatsScreen-* facade that pulls in the
  // screen-stats chunk (vite.config.ts advancedChunks); delay either file so
  // backing out mid-load is actually exercised.
  await page.route(/\/assets\/(?:StatsScreen|screen-stats)-.*\.js$/, async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 900))
    await route.continue()
  })

  await page.getByRole('button', { name: 'stats' }).click()
  await page.getByRole('button', { name: 'back' }).first().click()

  await expectAssetsHomeVisible(page)
})

test('keeps the trend loading skeleton backed while system glass is active', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'no-preference' })
  await page.route(/\/assets\/(?:TrendScreen|screen-trend)-.*\.js$/, async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 900))
    await route.continue()
  })
  await expectAssetsHomeVisible(page)
  await page.evaluate(() => {
    document.documentElement.dataset.systemGlass = '1'
  })

  await page.getByRole('button', { name: 'trend' }).click()

  const skeleton = page.locator('.screenSkeletonTrend')
  await expect(skeleton).toBeVisible()
  const styles = await skeleton.evaluate((element) => {
    const chart = element.querySelector<HTMLElement>('.skeletonChart')
    const block = element.querySelector<HTMLElement>('.skeletonBlock')
    if (!chart || !block) throw new Error('Trend skeleton surfaces are missing')

    const colorAlpha = (color: string) => {
      const canvas = document.createElement('canvas')
      canvas.width = 1
      canvas.height = 1
      const context = canvas.getContext('2d')
      if (!context) throw new Error('Canvas 2D context is unavailable')
      context.clearRect(0, 0, 1, 1)
      context.fillStyle = color
      context.fillRect(0, 0, 1, 1)
      return context.getImageData(0, 0, 1, 1).data[3]
    }

    const rootStyle = getComputedStyle(element)
    const chartStyle = getComputedStyle(chart)
    const blockStyle = getComputedStyle(block)
    const shimmerStyle = getComputedStyle(block, '::after')
    return {
      systemGlass: document.documentElement.dataset.systemGlass,
      rootBackground: rootStyle.backgroundColor,
      pageBackground: getComputedStyle(document.body).backgroundColor,
      rootAnimation: rootStyle.animationName,
      chartBackgroundAlpha: colorAlpha(chartStyle.backgroundColor),
      blockBackgroundAlpha: colorAlpha(blockStyle.backgroundColor),
      shimmerAnimation: shimmerStyle.animationName,
    }
  })

  expect(styles.systemGlass).toBe('1')
  expect(styles.rootBackground).toBe(styles.pageBackground)
  expect(styles.rootAnimation).toBe('none')
  expect(styles.chartBackgroundAlpha).toBe(255)
  expect(styles.blockBackgroundAlpha).toBe(255)
  expect(styles.shimmerAnimation).toContain('shimmerSweep')
  await expect(page.locator('.iosTrendPage')).toBeVisible({ timeout: 10_000 })
})

test('focuses the blank balance input when opening edit balance', async ({ page }) => {
  await expectAssetsHomeVisible(page)

  await openAccountDetail(page)
  await page.getByRole('button', { name: 'set balance action' }).dispatchEvent('pointerdown', {
    pointerType: 'touch',
    bubbles: true,
    cancelable: true,
  })

  const balanceInput = page.locator('input[aria-label="set balance"]')
  await expect(balanceInput).toBeVisible()
  await expect(balanceInput).toBeFocused()
  await expect(balanceInput).toHaveValue('')
})

test('does not focus a balance input when reopening account details normally', async ({ page }) => {
  await expectAssetsHomeVisible(page)

  await openAccountDetail(page)
  await page.getByRole('button', { name: 'set balance action' }).dispatchEvent('pointerdown', {
    pointerType: 'touch',
    bubbles: true,
    cancelable: true,
  })
  const balanceInput = page.locator('input[aria-label="set balance"]')
  await expect(balanceInput).toBeFocused()

  await page.getByRole('button', { name: 'close' }).dispatchEvent('pointerdown', {
    pointerType: 'touch',
    bubbles: true,
    cancelable: true,
  })
  await expect(balanceInput).toBeHidden()

  await openAccountDetail(page)
  await expect(page.getByRole('button', { name: 'set balance action' })).toBeVisible()
  await expect(page.locator('input[aria-label="set balance"]')).toHaveCount(0)
})
