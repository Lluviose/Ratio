import { describe, expect, it, beforeEach } from 'vitest'
import { getAccountTypeOption } from './accounts'
import { applyAccountFlow } from './accountBalance'
import { addMoney, moneyEquals } from './money'
import { buildDemoAccounts, buildDemoBackup, buildDemoOps, buildDemoSnapshots, enterDemoMode, exitDemoMode } from './demoData'
import { DEMO_STASH_KEY, isDemoModeActive } from './demoMode'

const NOW = new Date('2026-07-05T12:00:00.000Z')

describe('buildDemoAccounts', () => {
  it('uses valid account types and positive balances (debt stored as positive owed)', () => {
    const accounts = buildDemoAccounts(NOW)
    expect(accounts.length).toBeGreaterThanOrEqual(8)
    for (const a of accounts) {
      expect(() => getAccountTypeOption(a.type)).not.toThrow()
      expect(a.balance).toBeGreaterThanOrEqual(0)
      expect(Number.isFinite(a.balance)).toBe(true)
      expect(new Date(a.updatedAt).getTime()).toBeLessThanOrEqual(NOW.getTime())
    }
    // 覆盖全部五个分组
    const groups = new Set(accounts.map((a) => getAccountTypeOption(a.type).groupId))
    expect(groups).toEqual(new Set(['liquid', 'invest', 'fixed', 'receivable', 'debt']))
  })
})

describe('buildDemoOps', () => {
  it('op balances are self-consistent and reference existing demo accounts', () => {
    const accounts = new Map(buildDemoAccounts(NOW).map((a) => [a.id, a]))
    for (const op of buildDemoOps(NOW)) {
      if (op.kind === 'adjust') {
        expect(accounts.has(op.accountId)).toBe(true)
        expect(moneyEquals(addMoney(op.before, op.delta), op.after)).toBe(true)
        // after 与当前账户余额一致（操作历史与现状自洽）
        expect(moneyEquals(op.after, accounts.get(op.accountId)!.balance)).toBe(true)
      }
      if (op.kind === 'set_balance') {
        expect(moneyEquals(op.after, accounts.get(op.accountId)!.balance)).toBe(true)
      }
      if (op.kind === 'transfer') {
        const from = accounts.get(op.fromId)!
        const to = accounts.get(op.toId)!
        expect(moneyEquals(applyAccountFlow(from.type, op.fromBefore, -op.amount), op.fromAfter)).toBe(true)
        expect(moneyEquals(applyAccountFlow(to.type, op.toBefore, op.amount), op.toAfter)).toBe(true)
        expect(moneyEquals(op.fromAfter, from.balance)).toBe(true)
        expect(moneyEquals(op.toAfter, to.balance)).toBe(true)
      }
    }
  })
})

describe('buildDemoSnapshots', () => {
  it('spans about 18 months with ascending dates and consistent nets', () => {
    const snapshots = buildDemoSnapshots(NOW)
    expect(snapshots.length).toBeGreaterThanOrEqual(40)

    const dates = snapshots.map((s) => s.date)
    expect([...dates].sort()).toEqual(dates)
    expect(new Set(dates).size).toBe(dates.length)

    const spanDays = (new Date(dates[dates.length - 1]).getTime() - new Date(dates[0]).getTime()) / 86_400_000
    expect(spanDays).toBeGreaterThan(480)

    for (const s of snapshots) {
      const expectedNet = s.cash + s.invest + s.fixed + s.receivable - s.debt
      expect(Math.abs(s.net - expectedNet)).toBeLessThan(0.01)
      expect(s.debt).toBeGreaterThanOrEqual(0)
    }
  })

  it('is deterministic for the same date and ends near current account totals', () => {
    const a = buildDemoSnapshots(NOW)
    const b = buildDemoSnapshots(NOW)
    expect(a).toEqual(b)

    const last = a[a.length - 1]
    // 最近一天贴近当前账户组总额（±5%），今天的实时快照可无缝衔接
    expect(Math.abs(last.cash - 36565.22) / 36565.22).toBeLessThan(0.05)
    expect(Math.abs(last.invest - 120590.55) / 120590.55).toBeLessThan(0.05)
    expect(last.fixed).toBe(118000)
  })
})

describe('buildDemoBackup', () => {
  it('produces a restorable backup file without demo/cloud keys', () => {
    const storage = {
      getItem: (key: string) => (key === 'ratio.theme' ? '"macke"' : null),
    } as Storage
    const backup = buildDemoBackup(NOW, storage)
    expect(backup.schema).toBe('ratio.backup.v1')
    expect(Object.keys(backup.items)).toEqual(
      expect.arrayContaining(['ratio.accounts', 'ratio.accountOps', 'ratio.snapshots', 'ratio.tourSeen', 'ratio.theme']),
    )
    // 演示标记/暂存不进数据集
    for (const key of Object.keys(backup.items)) {
      expect(key.startsWith('ratio.demo')).toBe(false)
      expect(key.startsWith('ratio.cloudSync')).toBe(false)
    }
    // 每个条目都是合法 JSON 或原始字符串（与 localStorage 存储格式一致）
    expect(() => JSON.parse(backup.items['ratio.accounts'])).not.toThrow()
    expect(backup.items['ratio.theme']).toBe('"macke"')
  })
})

describe('enterDemoMode / exitDemoMode', () => {
  // jsdom 无 indexedDB：appStorage 运行在 localStorage 回退模式，直接读写 localStorage
  const realAccounts = JSON.stringify([
    { id: 'real-1', type: 'cash', name: '现金', balance: 88.5, updatedAt: NOW.toISOString() },
  ])

  beforeEach(() => {
    localStorage.clear()
  })

  it('round-trips real data byte-identically through enter → exit', () => {
    localStorage.setItem('ratio.accounts', realAccounts)
    localStorage.setItem('ratio.tourSeen', 'true')

    enterDemoMode(NOW)
    expect(isDemoModeActive()).toBe(true)
    expect(localStorage.getItem(DEMO_STASH_KEY)).toBeTruthy()
    // 演示数据已生效（不再是真实账户）
    expect(localStorage.getItem('ratio.accounts')).not.toBe(realAccounts)

    exitDemoMode()
    expect(isDemoModeActive()).toBe(false)
    expect(localStorage.getItem('ratio.accounts')).toBe(realAccounts)
    expect(localStorage.getItem(DEMO_STASH_KEY)).toBeNull()
  })

  it('refuses to re-enter while demo is active, keeping the original stash intact', () => {
    // 跨标签场景：另一标签已进入演示、本标签的按钮还是旧状态。
    // 再次进入若不拒绝，stash 会被演示数据覆盖 → 真实数据永久丢失
    localStorage.setItem('ratio.accounts', realAccounts)
    enterDemoMode(NOW)
    const stash = localStorage.getItem(DEMO_STASH_KEY)

    expect(() => enterDemoMode(NOW)).toThrow()
    expect(localStorage.getItem(DEMO_STASH_KEY)).toBe(stash)

    exitDemoMode()
    expect(localStorage.getItem('ratio.accounts')).toBe(realAccounts)
  })

  it('exit is a no-op when demo is not active (already exited in another tab)', () => {
    // stash 已被消费的退出重放绝不能落入 clearRatioStorage 分支
    localStorage.setItem('ratio.accounts', realAccounts)
    exitDemoMode()
    expect(localStorage.getItem('ratio.accounts')).toBe(realAccounts)
    expect(isDemoModeActive()).toBe(false)
  })
})
