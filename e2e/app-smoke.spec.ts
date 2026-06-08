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
  await expect(accountTypeCard(page)).toBeVisible()
}

function accountTypeCard(page: Page) {
  return page.getByRole('button').filter({ hasText: '12,345' }).filter({ hasNotText: 'E2E Account' }).last()
}

async function openAccountDetail(page: Page) {
  await accountTypeCard(page).dispatchEvent('click')
  await page.getByRole('button', { name: 'account type bank_card' }).dispatchEvent('click')
  await page.getByRole('button', { name: 'account E2E Account' }).dispatchEvent('click')
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

  await page.route(/\/assets\/StatsScreen-.*\.js$/, async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 900))
    await route.continue()
  })

  await page.getByRole('button', { name: 'stats' }).click()
  await page.getByRole('button', { name: 'back' }).first().click()

  await expectAssetsHomeVisible(page)
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
