import { expect, test, type Page } from '@playwright/test'

// 写路径 e2e：备份导出→导入 roundtrip、建账户→转账→期间增减完整旅程、
// 演示模式进出。此前全部 e2e 用例只读不写，这些「曾真实丢过数据」的路径
// （见 CHANGELOG 演示模式重入/落盘失败批次）只有单测在守。
//
// 交互约定（与 app-smoke 一致）：
// - 首页卡片/行是 framer-motion 触摸组件，用 dispatchEvent('click')；
// - 详情抽屉 close 按钮与动作按钮只挂 onPointerDown，用 pointerdown(touch)；
// - 导入备份/演示进出会整页刷新，刷新后要重新等首页初始化元素。

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

async function waitForAssetsHome(page: Page) {
  // fallback 首页换乘完成的标志（见 app-smoke 注释）
  await expect(page.getByRole('button', { name: '展开流动资金占比详情' })).toBeVisible({ timeout: 20_000 })
}

async function openSeededAccountDetail(page: Page) {
  const typeRow = page.getByRole('button', { name: 'account type bank_card' })
  if (!(await typeRow.isVisible())) {
    await page.getByRole('button', { name: 'account group liquid' }).dispatchEvent('click')
  }
  await expect(typeRow).toBeVisible()
  await typeRow.dispatchEvent('click')

  const accountRow = page.getByRole('button', { name: 'account E2E Account' })
  await expect(accountRow).toBeVisible()
  await accountRow.dispatchEvent('click')
  await expect(page.getByRole('button', { name: 'set balance action' })).toBeVisible()
}

// 详情抽屉的 more 与首页 mini bar 的 more 同名；rename 只存在于抽屉头部，
// 用它的父容器把定位收窄到抽屉内。
function sheetMoreButton(page: Page) {
  return page.getByRole('button', { name: 'rename' }).locator('..').getByRole('button', { name: 'more' })
}

async function pointerTap(page: Page, name: string) {
  await page.getByRole('button', { name }).dispatchEvent('pointerdown', {
    pointerType: 'touch',
    bubbles: true,
    cancelable: true,
  })
}

async function closeDetailSheet(page: Page) {
  await pointerTap(page, 'close')
  await expect(page.getByRole('button', { name: 'set balance action' })).toBeHidden()
}

async function openSettings(page: Page) {
  // 首页 mini bar 在滚动层之下，真实 click 可能被拦截，统一 dispatchEvent
  await page.getByRole('button', { name: 'more' }).dispatchEvent('click')
  await page.getByRole('button', { name: '设置' }).dispatchEvent('click')
  await expect(page.getByRole('button', { name: /导出备份/ })).toBeVisible()
}

test.beforeEach(async ({ page }) => {
  await seedApp(page)
  await page.goto('/', { waitUntil: 'domcontentloaded' })
})

test('creates an account, transfers into it, adjusts it, and persists across reload', async ({ page }) => {
  await waitForAssetsHome(page)

  // 新建现金账户「旅程现金」
  await page.getByRole('button', { name: 'add' }).click()
  await expect(page.getByText('添加资产')).toBeVisible()
  await page.getByRole('button', { name: /^流动资金/ }).click()
  await page.getByRole('button', { name: '现金', exact: true }).click()
  const nameInput = page.getByPlaceholder('现金')
  await expect(nameInput).toBeVisible()
  await nameInput.fill('旅程现金')
  await page.getByRole('button', { name: '确认' }).click()

  // 创建后直接进入「修改余额」录初始余额
  const balanceInput = page.locator('input[aria-label="set balance"]')
  await expect(balanceInput).toBeVisible()
  await balanceInput.fill('500')
  await page.getByRole('button', { name: '完成', exact: true }).last().click()
  await expect(page.getByRole('button', { name: 'set balance action' })).toBeVisible()

  // 转出 200 到种子账户
  await sheetMoreButton(page).click()
  await page.getByRole('button', { name: '转账' }).click()
  await page.getByLabel('对方账户').selectOption({ label: 'E2E Account' })
  await page.getByPlaceholder('0.00').fill('200')
  await page.getByRole('button', { name: '完成', exact: true }).last().click()
  await expect(page.getByRole('button', { name: 'set balance action' })).toBeVisible()

  // 期间增减 +50
  await pointerTap(page, 'adjust balance action')
  const adjustInput = page.locator('input[aria-label="adjust amount"]')
  await expect(adjustInput).toBeVisible()
  await adjustInput.fill('50')
  await page.getByRole('button', { name: '完成', exact: true }).last().click()
  await expect(page.getByRole('button', { name: 'set balance action' })).toBeVisible()

  // 500 - 200 + 50 = 350：操作历史首行显示当前余额
  await expect(page.getByText('余额 ¥350.00').first()).toBeVisible()
  await closeDetailSheet(page)

  // 整页刷新后数据仍在（IndexedDB 落盘），操作历史三条齐全
  await page.reload({ waitUntil: 'domcontentloaded' })
  await waitForAssetsHome(page)
  const cashRow = page.getByRole('button', { name: 'account 旅程现金' })
  if (!(await cashRow.isVisible())) {
    const cashTypeRow = page.getByRole('button', { name: 'account type cash' })
    if (!(await cashTypeRow.isVisible())) {
      await page.getByRole('button', { name: 'account group liquid' }).dispatchEvent('click')
    }
    await expect(cashTypeRow).toBeVisible()
    await cashTypeRow.dispatchEvent('click')
  }
  await expect(cashRow).toBeVisible()
  await cashRow.dispatchEvent('click')
  await expect(page.getByRole('button', { name: 'set balance action' })).toBeVisible()
  await expect(page.getByText('余额 ¥350.00').first()).toBeVisible()
})

test('exports a backup and importing it rolls the data back', async ({ page }) => {
  await waitForAssetsHome(page)

  // 先导出基线备份
  await openSettings(page)
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: /导出备份/ }).click(),
  ])
  expect(download.suggestedFilename()).toMatch(/^ratio-backup-.*\.json$/)
  const backupPath = await download.path()

  // 回首页改数据：期间增减 +100（产生一条操作记录）
  await page.getByRole('button', { name: 'back' }).click()
  await waitForAssetsHome(page)
  await openSeededAccountDetail(page)
  await pointerTap(page, 'adjust balance action')
  const adjustInput = page.locator('input[aria-label="adjust amount"]')
  await expect(adjustInput).toBeVisible()
  await adjustInput.fill('100')
  await page.getByRole('button', { name: '完成', exact: true }).last().click()
  await expect(page.getByText('余额 ¥12,445.00').first()).toBeVisible()
  await closeDetailSheet(page)

  // 导入基线备份：确认弹窗展示内容预检计数，确认后整页刷新
  await openSettings(page)
  await page.locator('input[type="file"]').setInputFiles(backupPath!)
  await expect(page.getByText(/该备份包含/)).toBeVisible()
  await page.getByRole('button', { name: '继续导入' }).click()

  // 刷新后数据回到导出时点：调整记录消失，余额还原
  await waitForAssetsHome(page)
  await openSeededAccountDetail(page)
  await expect(page.getByText('暂无操作')).toBeVisible()
  await expect(page.getByText('余额 ¥12,445.00')).toHaveCount(0)
})

test('enters demo mode and exits back to the real data', async ({ page }) => {
  await waitForAssetsHome(page)

  await openSettings(page)
  await page.getByRole('button', { name: '试试演示数据' }).click()
  await page.getByRole('button', { name: '进入演示' }).click()

  // 进入演示会整页刷新，刷新后出现退出徽章，展示的是演示账本
  const exitBadge = page.getByRole('button', { name: 'exit demo mode' })
  await expect(exitBadge).toBeVisible({ timeout: 20_000 })
  await waitForAssetsHome(page)
  await expect(page.getByRole('button', { name: 'account E2E Account' })).toHaveCount(0)

  // 退出演示：确认后再次整页刷新，真实数据完整回归
  await exitBadge.click()
  await page.getByRole('button', { name: '退出并恢复' }).click()
  await expect(page.getByRole('button', { name: 'exit demo mode' })).toHaveCount(0, { timeout: 20_000 })
  await waitForAssetsHome(page)
  await openSeededAccountDetail(page)
  await expect(page.getByText('暂无操作')).toBeVisible()
})
