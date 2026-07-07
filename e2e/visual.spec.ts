import { expect, test, type Page } from '@playwright/test'

// 视觉回归套件（仅本地，npm run test:visual）：
// - 独立 visual 项目运行，功能项目与 CI 均不执行（平台字体差异，基线随仓库仅对 win32 有效）
// - 确定性三板斧：固定 Date（clock.setFixedTime）、固定种子数据、prefers-reduced-motion
//   走应用自身的三层减弱动态支持；Service Worker 在项目配置中屏蔽
// - 基线更新：npm run test:visual:update（改主题/令牌/布局后有意识地重录）

const FIXED_NOW = new Date('2026-07-05T10:00:00+08:00')

const THEMES = ['matisse', 'matisse2', 'macke', 'mondrian', 'kandinsky', 'miro'] as const

// 与 lib/demoData 同源的紧凑生成器副本：视觉基线必须与演示数据演化解耦，
// 这里的数字一旦定下就不再跟随 demoData 调整（避免基线无谓翻新）。
function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a += 0x6d2b79f5
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function dateKeyDaysAgo(now: Date, days: number) {
  const d = new Date(now)
  d.setDate(d.getDate() - days)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function buildSeed() {
  const accounts = [
    { id: 'v-bank', type: 'bank_card', name: '工资卡', balance: 32806.5, updatedAt: '2026-07-04T10:24:00.000Z' },
    { id: 'v-online', type: 'online', name: '微信零钱', balance: 2458.72, updatedAt: '2026-07-03T10:24:00.000Z' },
    { id: 'v-fund', type: 'fund', name: '指数基金', balance: 86420.55, updatedAt: '2026-06-28T10:24:00.000Z' },
    { id: 'v-stock', type: 'stock', name: '港美股', balance: 24310, updatedAt: '2026-07-02T10:24:00.000Z' },
    { id: 'v-car', type: 'car', name: '家用车', balance: 118000, updatedAt: '2026-05-21T10:24:00.000Z' },
    { id: 'v-receivable', type: 'receivable', name: '借给老周', balance: 5000, updatedAt: '2026-06-15T10:24:00.000Z' },
    { id: 'v-loan', type: 'loan', name: '房贷', balance: 186000, updatedAt: '2026-06-30T10:24:00.000Z' },
    { id: 'v-credit', type: 'credit_card', name: '信用卡', balance: 6842.19, updatedAt: '2026-07-03T10:24:00.000Z' },
  ]

  const rand = mulberry32(20260705)
  const wiggle = (base: number, amp: number) => Math.round((base + (rand() - 0.5) * 2 * amp) * 100) / 100
  const snapshots: Array<Record<string, number | string>> = []
  const push = (daysAgo: number, s: { cash: number; invest: number; fixed: number; receivable: number; debt: number }) => {
    snapshots.push({
      date: dateKeyDaysAgo(FIXED_NOW, daysAgo),
      ...s,
      net: Math.round((s.cash + s.invest + s.fixed + s.receivable - s.debt) * 100) / 100,
    })
  }
  for (let m = 17; m >= 2; m -= 1) {
    const t = (17 - m) / 17
    push(m * 30, {
      cash: wiggle(28000 + t * 8500, 2400),
      invest: wiggle(66000 + t * 54600, 6200),
      fixed: 118000,
      receivable: m * 30 > 100 ? 0 : 5000,
      debt: wiggle(206000 - t * 13200, 2200),
    })
  }
  for (let d = 30; d >= 1; d -= 1) {
    const t = (30 - d) / 30
    const ease = 1 - (1 - t) * (1 - t)
    push(d, {
      cash: wiggle(35265.22 - (1 - ease) * 2400, 420),
      invest: wiggle(110730.55 - (1 - ease) * 5200, 900),
      fixed: 118000,
      receivable: 5000,
      debt: wiggle(192842.19 + (1 - ease) * 2600, 380),
    })
  }
  return { accounts, snapshots }
}

const SEED = buildSeed()

async function prepare(page: Page, opts: { theme: string; colorMode?: 'light' | 'dark' }) {
  await page.clock.setFixedTime(FIXED_NOW)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.addInitScript(
    (seed) => {
      localStorage.setItem('ratio.tourSeen', 'true')
      localStorage.setItem('ratio.accounts', JSON.stringify(seed.accounts))
      localStorage.setItem('ratio.accountOps', JSON.stringify([]))
      localStorage.setItem('ratio.snapshots', JSON.stringify(seed.snapshots))
      localStorage.setItem('ratio.theme', JSON.stringify(seed.theme))
      localStorage.setItem('ratio.colorMode', JSON.stringify(seed.colorMode))
    },
    { ...SEED, theme: opts.theme, colorMode: opts.colorMode ?? 'light' },
  )
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('button', { name: '展开流动资金占比详情' })).toBeVisible({ timeout: 15_000 })
  await page.waitForTimeout(600)
}

async function gotoRatioPage(page: Page) {
  const scroller = page.getByTestId('home-scroller')
  await expect
    .poll(() =>
      scroller.evaluate(
        (el) => el.getAttribute('aria-hidden') === 'false' && el.clientWidth > 0 && Math.abs(el.scrollLeft - el.clientWidth * 2) < 2,
      ),
    )
    .toBe(true)
  for (let attempt = 0; attempt < 5; attempt += 1) {
    await scroller.evaluate((el) => {
      el.scrollTo({ left: el.clientWidth, behavior: 'instant' })
      el.dispatchEvent(new Event('scroll', { bubbles: true }))
    })
    if (await scroller.evaluate((el) => Math.abs(el.scrollLeft - el.clientWidth) < 2)) break
    await page.waitForTimeout(120)
  }
  await expect.poll(() => scroller.evaluate((el) => Math.abs(el.scrollLeft - el.clientWidth) < 2)).toBe(true)
  await page.waitForTimeout(500)
}

async function gotoStats(page: Page) {
  await page.getByRole('button', { name: 'stats' }).dispatchEvent('click')
  await expect(page.locator('.iosInsightsPage').first()).toBeVisible({ timeout: 10_000 })
  // 等图表与懒加载卡片渲染完
  await page.waitForTimeout(1400)
}

const SHOT = { maxDiffPixelRatio: 0.02 } as const

for (const theme of THEMES) {
  test(`theme ${theme}: home list`, async ({ page }) => {
    await prepare(page, { theme })
    await expect(page).toHaveScreenshot(`${theme}-home.png`, SHOT)
  })

  test(`theme ${theme}: ratio page`, async ({ page }) => {
    await prepare(page, { theme })
    await gotoRatioPage(page)
    await expect(page).toHaveScreenshot(`${theme}-ratio.png`, SHOT)
  })

  test(`theme ${theme}: stats`, async ({ page }) => {
    await prepare(page, { theme })
    await gotoStats(page)
    await expect(page).toHaveScreenshot(`${theme}-stats.png`, SHOT)
  })
}

test('dark mode: home list', async ({ page }) => {
  await prepare(page, { theme: 'matisse2', colorMode: 'dark' })
  await expect(page).toHaveScreenshot('dark-home.png', SHOT)
})

test('dark mode: ratio page', async ({ page }) => {
  await prepare(page, { theme: 'matisse2', colorMode: 'dark' })
  await gotoRatioPage(page)
  await expect(page).toHaveScreenshot('dark-ratio.png', SHOT)
})

test('dark mode: stats', async ({ page }) => {
  await prepare(page, { theme: 'matisse2', colorMode: 'dark' })
  await gotoStats(page)
  await expect(page).toHaveScreenshot('dark-stats.png', SHOT)
})

test('dark mode: settings', async ({ page }) => {
  await prepare(page, { theme: 'matisse2', colorMode: 'dark' })
  await page.getByRole('button', { name: 'more' }).dispatchEvent('click')
  await page.getByText('设置').dispatchEvent('click')
  await page.waitForTimeout(900)
  await expect(page).toHaveScreenshot('dark-settings.png', SHOT)
})
