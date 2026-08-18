import { expect, test, type Page } from '@playwright/test'

// AI 助手懒加载链路的可用性用例。历史事故：vendor-markdown 分包与 ai-assistant
// 分包互相 import 成环，顶层求值抛 TypeError，动态导入失败被 LazyLoadBoundary
// 吞掉——按钮点了只闪一下，面板永远打不开，而全套 e2e 没有任何用例点过 AI 按钮，
// 坏产物一路绿灯发上线。此用例守住「点按钮 → 面板真的打开」这条最短链路。

test.use({ serviceWorkers: 'block' })

async function seedApp(page: Page) {
  await page.addInitScript(() => {
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
    window.localStorage.setItem(
      'ratio.accounts',
      JSON.stringify([
        { id: 'e2e-bank', type: 'bank_card', name: 'Salary Card', balance: 8000, updatedAt: '2026-06-08T00:00:00.000Z' },
      ]),
    )
  })
}

test('AI assistant lazy chunk loads and the panel opens', async ({ page }) => {
  const chunkErrors: string[] = []
  page.on('pageerror', (error) => chunkErrors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error' && /TypeError|is not a function|Failed to fetch dynamically imported/i.test(message.text())) {
      chunkErrors.push(message.text())
    }
  })

  await seedApp(page)
  await page.goto('/', { waitUntil: 'domcontentloaded' })

  const aiButton = page.getByRole('button', { name: 'AI analysis' })
  await expect(aiButton).toBeVisible()
  await aiButton.click()

  // 面板打开即视为分包链路健康；未配置云端时显示引导文案而不是空面板
  await expect(page.getByText('AI 分析')).toBeVisible({ timeout: 15_000 })
  await expect(page.getByText('本次浏览会话会保留记录')).toBeVisible()

  expect(chunkErrors, `懒分包求值/加载错误：\n${chunkErrors.join('\n')}`).toEqual([])
})
