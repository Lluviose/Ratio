import { expect, test } from '@playwright/test'

for (const rollback of [true, false]) {
  test(`deleting a newly purchased item ${rollback ? 'rolls back' : 'preserves'} the purchase`, async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('ratio.tourSeen', 'true')
      localStorage.setItem('ratio.accounts', JSON.stringify([
        { id: 'bank', type: 'bank_card', name: '购入银行卡', balance: 3500, updatedAt: '' },
        { id: 'item', type: 'other_fixed', name: '新镜头', balance: 1500, cost: 1500, updatedAt: '' },
      ]))
      localStorage.setItem('ratio.accountOps', JSON.stringify([
        { id: 'cost', kind: 'set_cost', accountId: 'item', accountType: 'other_fixed', before: null, after: 1500, at: '2026-09-14T00:00:00.000Z' },
        { id: 'buy', kind: 'transfer', accountType: 'bank_card', fromId: 'bank', toId: 'item', amount: 1500, fromBefore: 5000, fromAfter: 3500, toBefore: 0, toAfter: 1500, at: '2026-09-14T00:00:01.000Z' },
      ]))
    })
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('button', { name: '展开流动资金占比详情' })).toBeVisible()
    await page.getByRole('button', { name: 'account group fixed' }).dispatchEvent('click')
    await page.getByRole('button', { name: 'account type other_fixed' }).dispatchEvent('click')
    await page.getByRole('button', { name: 'account 新镜头' }).dispatchEvent('click')
    const more = page.getByRole('button', { name: 'rename' }).locator('..').getByRole('button', { name: 'more' })
    await more.click()
    await page.getByRole('button', { name: '删除物品', exact: true }).click()
    await expect(page.getByText(/是否同时回滚交易/)).toBeVisible()
    // 取消要关闭顶层确认，仍保留物品详情；再打开选择执行方式。
    await page.getByRole('button', { name: '取消', exact: true }).click()
    await expect.poll(() => page.getByRole('button', { name: '仅删除物品' }).count()).toBe(0)
    await more.click()
    await page.getByRole('button', { name: '删除物品', exact: true }).click()
    await page.getByRole('button', { name: rollback ? '删除并回滚交易' : '仅删除物品', exact: true }).click()
    await expect.poll(() => page.getByRole('button', { name: 'rename' }).count()).toBe(0)

    // 等待真实 IndexedDB 落盘后再刷新，检查跨页面保存的结果。
    const readStored = () => page.evaluate(async () => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('ratio')
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
      })
      try {
        const values = await Promise.all(['ratio.accounts', 'ratio.accountOps'].map((key) => new Promise<string>((resolve, reject) => {
          const request = db.transaction('kv').objectStore('kv').get(key)
          request.onsuccess = () => resolve(request.result)
          request.onerror = () => reject(request.error)
        })))
        return { accounts: JSON.parse(values[0]), ops: JSON.parse(values[1]) }
      } finally {
        db.close()
      }
    })
    const expected = { accounts: [expect.objectContaining({ id: 'bank', balance: rollback ? 5000 : 3500 })], ops: rollback ? [] : [expect.any(Object), expect.any(Object)] }
    await expect.poll(readStored).toEqual(expected)
    await page.reload({ waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('button', { name: '展开流动资金占比详情' })).toBeVisible()
    expect(await readStored()).toEqual(expected)
  })
}
