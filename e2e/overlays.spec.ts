import { expect, test, type Locator, type Page } from '@playwright/test'
import postcss from 'postcss'

// iOS renders a wider localized native date editor than the default en-US fixture.
test.use({ locale: 'zh-CN' })

async function seedApp(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('ratio.tourSeen', 'true')
    localStorage.setItem('ratio.accounts', JSON.stringify([
      { id: 'bank', type: 'bank_card', name: '测试银行卡', balance: 30000, updatedAt: '2026-06-01T00:00:00.000Z' },
      { id: 'archived', type: 'other_fixed', name: '已归档相机', cost: 5000, balance: 2000, acquiredAt: '2026-05-01', archivedAt: '2026-06-01T00:00:00.000Z', updatedAt: '2026-06-01T00:00:00.000Z' },
    ]))
    localStorage.setItem('ratio.savingsGoal', JSON.stringify({
      targetAmount: 100000, targetDate: '2099-12-31', startDate: '2026-06-01',
      startNetWorth: 20000, createdAt: '2026-06-01T00:00:00.000Z',
    }))
  })
}

async function expectNoHorizontalOverflow(locator: Locator) {
  await expect.poll(() => locator.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1)
}

async function expectHittable(locator: Locator) {
  await expect.poll(() => locator.evaluate((element) => {
    const rect = element.getBoundingClientRect()
    return element.contains(document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2))
  })).toBe(true)
}

async function expectBoundedNativeDate(input: Locator) {
  await input.scrollIntoViewIfNeeded()
  const geometry = await input.evaluate((element) => {
    const field = element.parentElement!
    const body = element.closest('.sheetBody, .addAccountPanel')!
    const bounds = element.getBoundingClientRect()
    const fieldBounds = field.getBoundingClientRect()
    const bodyBounds = body.getBoundingClientRect()
    const fieldStyle = getComputedStyle(field)
    const bodyStyle = getComputedStyle(body)
    const style = getComputedStyle(element)
    return {
      left: bounds.left,
      right: bounds.right,
      fieldLeft: fieldBounds.left + parseFloat(fieldStyle.paddingLeft),
      fieldRight: fieldBounds.right - parseFloat(fieldStyle.paddingRight),
      bodyLeft: bodyBounds.left + parseFloat(bodyStyle.paddingLeft),
      bodyRight: bodyBounds.right - parseFloat(bodyStyle.paddingRight),
      appearance: style.appearance || style.getPropertyValue('-webkit-appearance'),
      boxSizing: style.boxSizing,
      fontSize: parseFloat(style.fontSize),
      height: bounds.height,
    }
  })
  expect(geometry.left).toBeGreaterThanOrEqual(Math.max(geometry.fieldLeft, geometry.bodyLeft) - 1)
  expect(geometry.right).toBeLessThanOrEqual(Math.min(geometry.fieldRight, geometry.bodyRight) + 1)
  expect(geometry.appearance).toBe('none')
  expect(geometry.boxSizing).toBe('border-box')
  expect(geometry.fontSize).toBeGreaterThanOrEqual(16)
  expect(geometry.height).toBeGreaterThanOrEqual(44)
  await expectHittable(input)
}

async function expectOpaqueSheet(sheet: Locator) {
  const surface = await sheet.evaluate((element) => {
    const style = getComputedStyle(element)
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 1
    const context = canvas.getContext('2d')!
    context.fillStyle = style.backgroundColor
    context.fillRect(0, 0, 1, 1)
    return {
      alpha: context.getImageData(0, 0, 1, 1).data[3],
      backdrop: style.backdropFilter || style.getPropertyValue('-webkit-backdrop-filter'),
      backgroundImage: style.backgroundImage,
    }
  })
  expect(surface.alpha).toBe(255)
  expect(surface.backdrop).toBe('none')
  expect(surface.backgroundImage).toBe('none')
}

for (const screen of [
  { name: 'narrow-dark-glass', width: 320, height: 568, dark: true, glass: true },
  { name: 'phone', width: 390, height: 844, dark: false, glass: false },
  { name: 'wide-phone', width: 430, height: 932, dark: false, glass: true },
  { name: 'desktop', width: 1280, height: 800, dark: false, glass: false },
]) {
  test(`savings editor stays above navigation without overflow on ${screen.name}`, async ({ page }) => {
    await page.setViewportSize({ width: screen.width, height: screen.height })
    await page.emulateMedia({ colorScheme: screen.dark ? 'dark' : 'light' })
    await seedApp(page)
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await page.getByRole('button', { name: 'stats', exact: true }).click()
    await page.getByRole('button', { name: 'edit savings goal' }).scrollIntoViewIfNeeded()
    await page.evaluate((glass) => {
      if (glass) document.documentElement.dataset.systemGlass = '1'
      document.documentElement.style.setProperty('--safe-top', '59px')
      document.documentElement.style.setProperty('--safe-bottom', '34px')
    }, screen.glass)
    const background = page.locator('.content')
    const before = await background.evaluate((element) => ({ height: element.scrollHeight, top: element.scrollTop }))
    await page.getByRole('button', { name: 'edit savings goal' }).click()

    const dialog = page.locator('.sheetOverlay')
    await expect(dialog).toBeVisible()
    expect(await dialog.evaluate((element) => element.closest('.iosInsightsPage'))).toBeNull()
    expect(await dialog.evaluate((element) => getComputedStyle(element).position)).toMatch(/^(fixed|absolute)$/)
    expect(await background.evaluate((element) => element.scrollHeight)).toBe(before.height)
    // The scrim, not the navigation behind it, must receive taps at the bottom.
    await expect.poll(() => page.locator('.navBar').evaluate((nav) => {
      const rect = nav.getBoundingClientRect()
      return Boolean(document.elementFromPoint(rect.left + rect.width / 2, rect.bottom - 12)?.closest('.sheetOverlay'))
    })).toBe(true)

    const body = dialog.locator('.sheetBody')
    await expectOpaqueSheet(dialog.locator('.sheet'))
    const widthGap = await dialog.evaluate((element) => {
      const style = getComputedStyle(element)
      const available = element.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)
      return available - element.querySelector('.sheet')!.getBoundingClientRect().width
    })
    expect(Math.abs(widthGap)).toBeLessThanOrEqual(1)
    for (const element of [dialog, dialog.locator('.sheet'), body, dialog.locator('.stack').first()]) {
      await expectNoHorizontalOverflow(element)
    }
    await expectBoundedNativeDate(dialog.getByLabel('目标日期'))
    await dialog.getByLabel('目标日期').focus()
    await expectBoundedNativeDate(dialog.getByLabel('目标日期'))
    await body.evaluate((element) => { element.scrollLeft = 100 })
    expect(await body.evaluate((element) => element.scrollLeft)).toBe(0)

    await dialog.getByLabel('目标净资产').fill('120000')
    await dialog.getByLabel('目标日期').fill('2099-11-30')
    await dialog.getByRole('button', { name: '保存目标', exact: true }).click()
    await expect.poll(() => dialog.count()).toBe(0)
    await expect.poll(() => background.evaluate((element) => element.scrollTop)).toBe(before.top)
    await page.getByRole('button', { name: 'edit savings goal' }).click()
    await expect(dialog.getByLabel('目标净资产')).toHaveValue('120000')
    await expect(dialog.getByLabel('目标日期')).toHaveValue('2099-11-30')
    await dialog.getByRole('button', { name: '以当前净资产重设起点' }).click()
    await expect.poll(() => dialog.count()).toBe(0)
    await page.getByRole('button', { name: 'edit savings goal' }).click()
    const remove = dialog.getByRole('button', { name: '删除目标', exact: true })
    await remove.scrollIntoViewIfNeeded()
    await expectHittable(remove)
    await remove.click()
    await expect.poll(() => dialog.count()).toBe(0)
    await page.getByRole('button', { name: '设置目标', exact: true }).click()
    await dialog.getByLabel('目标净资产').fill('150000')
    await dialog.getByRole('button', { name: '保存目标', exact: true }).click()
    await expect.poll(() => dialog.count()).toBe(0)
  })
}

test('production native-material rules exclude dialogs and nested cards', async ({ page }) => {
  await seedApp(page)
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: 'stats', exact: true }).click()
  await page.getByRole('button', { name: 'edit savings goal' }).click()
  const stylesheets = await page.locator('link[rel="stylesheet"]').evaluateAll((links) => links.map((link) => (link as HTMLLinkElement).href))
  const selectors: string[] = []
  for (const url of stylesheets) {
    const response = await page.request.get(url)
    expect(response.ok()).toBe(true)
    postcss.parse(await response.text()).walkDecls('-apple-visual-effect', (declaration) => {
      if (declaration.value.includes('glass-material') && declaration.parent?.type === 'rule') {
        selectors.push(declaration.parent.selector)
      }
    })
  }
  expect(selectors.length).toBeGreaterThan(0)
  // Stock WebKit cannot enable the private @supports branch. Match the actual
  // production selectors directly so the native-only branch is still checked.
  const result = await page.evaluate((selectors) => {
    document.documentElement.dataset.systemGlass = '1'
    const fixture = document.createElement('div')
    fixture.className = 'iosInsightsPage iosStatsPage'
    fixture.innerHTML = '<div class="card"><div class="glassChrome"></div></div>'
    document.querySelector('.sheetBody')!.append(fixture)
    try {
      const matches = selectors.flatMap((selector) => [...document.querySelectorAll(selector)])
      return {
        dialogMatches: matches.filter((element) => element.closest('[role="dialog"]')).length,
        navigationMatches: matches.some((element) => element.matches('.navBar')),
        pageCardMatches: matches.some((element) => element.matches('.card') && !element.closest('[role="dialog"]')),
      }
    } finally {
      fixture.remove()
    }
  }, selectors)
  expect(result).toEqual({ dialogMatches: 0, navigationMatches: true, pageCardMatches: true })
  await expectOpaqueSheet(page.locator('.sheet'))
})

test('archived items live in settings and can be restored without losing item values', async ({ page }) => {
  await seedApp(page)
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await expect.poll(() => page.getByRole('button', { name: 'settings', exact: true }).count()).toBe(1)
  await expect(page.getByRole('button', { name: 'archived items', exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: 'settings', exact: true }).click()
  const archiveEntry = page.getByRole('button', { name: 'archived items', exact: true })
  await expect(archiveEntry).toContainText('1 件')
  await archiveEntry.click()
  await page.getByRole('button', { name: 'archived item 已归档相机', exact: true }).click()
  await expect.poll(() => page.locator('.sheetOverlay').count()).toBe(1)
  const detail = page.locator('.sheetOverlay')
  await detail.getByRole('button', { name: 'unarchive action' }).click()
  await expect(detail.getByText('¥5,000.00', { exact: true })).toBeVisible()
  await detail.getByRole('button', { name: 'close', exact: true }).click()
  await expect.poll(() => page.locator('.sheetOverlay').count()).toBe(0)
  await expect(archiveEntry).toContainText('0 件')
  await archiveEntry.click()
  await expect(page.getByText('暂无已归档物品')).toBeVisible()
  await page.locator('.sheetOverlay').getByRole('button', { name: 'close', exact: true }).click()
  await expect.poll(() => page.locator('.sheetOverlay').count()).toBe(0)
  // Reopening the detail through assets is covered by app-smoke's morph tests.
  await expect.poll(() => page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('ratio')
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    try {
      const accounts = await new Promise<string>((resolve, reject) => {
        const request = db.transaction('kv').objectStore('kv').get('ratio.accounts')
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
      })
      return JSON.parse(accounts).find((account: { id: string }) => account.id === 'archived')
    } finally {
      db.close()
    }
  })).toEqual(expect.objectContaining({ cost: 5000, balance: 2000, acquiredAt: '2026-05-01' }))
})

test('account date and record-time fields fit the narrow Chinese editor', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 })
  await seedApp(page)
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: 'settings', exact: true }).click()
  await page.getByRole('button', { name: 'archived items', exact: true }).click()
  await page.getByRole('button', { name: 'archived item 已归档相机', exact: true }).click()
  await expect.poll(() => page.locator('.sheetOverlay').count()).toBe(1)
  await page.getByRole('button', { name: 'unarchive action' }).click()
  await page.getByRole('button', { name: 'edit cost', exact: true }).click()
  const acquired = page.getByLabel('acquired date', { exact: true })
  await expectBoundedNativeDate(acquired)
  await acquired.fill('2026-04-30')
  await page.getByRole('button', { name: '保存修改', exact: true }).click()
  await expect.poll(() => acquired.count()).toBe(0)
  await page.getByRole('button', { name: 'set balance action', exact: true }).click()
  const recordTime = page.getByLabel('record time', { exact: true })
  await expectBoundedNativeDate(recordTime)
  await recordTime.focus()
  await expectBoundedNativeDate(recordTime)
  await expectOpaqueSheet(page.locator('.sheet'))
  await expectNoHorizontalOverflow(page.locator('.sheetBody'))
})

test('type and account sorting use a single bounded sheet', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 })
  await seedApp(page)
  await page.addInitScript(() => localStorage.setItem('ratio.accountSort.mode', JSON.stringify('manual')))
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  const scroller = page.getByTestId('home-scroller')
  await expect.poll(() => scroller.getAttribute('aria-hidden')).toBe('false')
  await page.getByRole('button', { name: 'account group liquid', exact: true }).click()
  await page.getByRole('button', { name: 'sort menu', exact: true }).click()
  await page.getByRole('button', { name: '排序', exact: true }).click()
  let dialog = page.getByRole('dialog', { name: '排序 - 流动资金', exact: true })
  await expectOpaqueSheet(dialog.locator('.sheet'))
  await expectNoHorizontalOverflow(dialog.locator('.sheetBody'))
  await dialog.getByRole('button', { name: 'close', exact: true }).click()
  await expect.poll(() => dialog.count()).toBe(0)
  await page.getByRole('button', { name: 'account type bank_card', exact: true }).click()
  await page.getByRole('button', { name: 'more', exact: true }).click()
  await page.getByRole('button', { name: '排序', exact: true }).click()
  dialog = page.locator('.sheetOverlay')
  await expectOpaqueSheet(dialog.locator('.sheet'))
  await expectNoHorizontalOverflow(dialog.locator('.sheetBody'))
  await dialog.getByRole('button', { name: 'close', exact: true }).click()
  await expect.poll(() => dialog.count()).toBe(0)
})

test('settings confirmation covers navigation and can cancel on a short screen', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 480 })
  await seedApp(page)
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: 'settings', exact: true }).click()
  await page.getByRole('button', { name: '试试演示数据', exact: true }).click()
  const dialog = page.locator('.sheetOverlay')
  await expect(dialog.getByText('进入演示模式', { exact: true })).toBeVisible()
  await expectNoHorizontalOverflow(dialog.locator('.sheetBody'))
  const cancel = dialog.getByRole('button', { name: '取消', exact: true })
  await cancel.scrollIntoViewIfNeeded()
  await expectHittable(cancel)
  await cancel.click()
  await expect.poll(() => dialog.count()).toBe(0)
  await expect(page.getByRole('button', { name: '试试演示数据', exact: true })).toBeVisible()
})

test('new item form scrolls to its actions on a short dark screen', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 480 })
  await page.emulateMedia({ colorScheme: 'dark' })
  await seedApp(page)
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: 'add', exact: true }).click()
  await page.getByRole('button', { name: /固定资产/ }).click()
  await page.getByRole('button', { name: /其他固定资产/ }).click()
  await page.getByLabel('item cost').fill('5000')
  await expectBoundedNativeDate(page.getByLabel('item acquired date'))
  const cancel = page.getByRole('button', { name: '取消', exact: true })
  await cancel.scrollIntoViewIfNeeded()
  await expectHittable(cancel)
  const blank = page.getByTestId('add-sheet-blank')
  expect(await blank.evaluate((element) => getComputedStyle(element).backgroundColor)).not.toBe('rgb(255, 255, 255)')
  await cancel.click()
  await expect.poll(() => page.getByLabel('item cost').count()).toBe(0)
})

test('long notifications fit narrow screens and stay clickable over an open sheet', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 })
  await seedApp(page)
  await page.addInitScript(() => {
    sessionStorage.setItem('ratio.pendingToast.v1', JSON.stringify({
      message: `同步提示 https://example.test/${'long-backup-name-'.repeat(10)}`,
      options: { durationMs: 0, tone: 'danger' },
    }))
  })
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  const toast = page.locator('.toast')
  await expect(toast).toBeVisible()
  await expectNoHorizontalOverflow(toast)
  await expectNoHorizontalOverflow(page.locator('.toastViewport'))
  await expectHittable(toast.getByRole('button', { name: 'close', exact: true }))
  await toast.getByRole('button', { name: 'close', exact: true }).click()
  await expect.poll(() => toast.count()).toBe(0)
  await page.getByRole('button', { name: 'stats', exact: true }).click()
  await page.getByRole('button', { name: 'edit savings goal' }).click()
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('ratio:cloud-sync', { detail: { ok: false, code: 'backup_conflict' } })))
  await expect(toast).toContainText('自动备份暂停')
  await expectNoHorizontalOverflow(toast)
  await expectHittable(toast.getByRole('button', { name: 'close', exact: true }))
  await toast.getByRole('button', { name: 'close', exact: true }).click()
  await expect.poll(() => toast.count()).toBe(0)
  await expect(page.locator('.sheetOverlay')).toBeVisible()
})
