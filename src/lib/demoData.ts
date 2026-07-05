import {
  buildRatioBackup,
  parseRatioBackup,
  restoreRatioBackup,
  stringifyRatioBackup,
  clearRatioStorage,
  RATIO_BACKUP_SCHEMA_V1,
  type RatioBackupFile,
} from './backup'
import { cancelPendingCloudAutoSync, markCloudSyncClean } from './cloudSync'
import { DEMO_STASH_KEY, setDemoModeActive } from './demoMode'
import { addMoney, normalizeMoney } from './money'
import type { Account, AccountTypeId } from './accounts'
import type { AccountOp } from './accountOps'

// 演示数据模式：一键体验带 18 个月历史的真实感数据。
// 进入前把现有数据整体暂存（复用备份机制），退出时原样恢复；
// 暂存与标记键在备份排除前缀内（见 backup.ts / demoMode.ts），
// 云自动同步在演示期间被 cloudSync 的守卫挂起。

// 进入演示时保留的个人偏好（体验不被重置，且不属于「数据」）
const PRESERVED_PREFERENCE_KEYS = [
  'ratio.theme',
  'ratio.colorMode',
  'ratio.hideAmounts',
  'ratio.accountSortMode',
  'ratio.monthStartDay',
] as const

// 确定性伪随机（mulberry32）：同一天进入演示得到同一份数据
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

function isoDaysAgo(now: Date, days: number, hour = 10) {
  const d = new Date(now)
  d.setDate(d.getDate() - days)
  d.setHours(hour, 24, 0, 0)
  return d.toISOString()
}

function dateKeyDaysAgo(now: Date, days: number) {
  const d = new Date(now)
  d.setDate(d.getDate() - days)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

type DemoAccountSeed = {
  id: string
  type: AccountTypeId
  name: string
  balance: number
  daysAgoUpdated: number
}

const DEMO_ACCOUNT_SEEDS: DemoAccountSeed[] = [
  { id: 'demo-bank', type: 'bank_card', name: '工资卡 · 招商', balance: 32806.5, daysAgoUpdated: 1 },
  { id: 'demo-online', type: 'online', name: '微信零钱', balance: 2458.72, daysAgoUpdated: 2 },
  { id: 'demo-cash', type: 'cash', name: '现金', balance: 1300, daysAgoUpdated: 1 },
  { id: 'demo-fund', type: 'fund', name: '指数基金定投', balance: 86420.55, daysAgoUpdated: 7 },
  { id: 'demo-stock', type: 'stock', name: '港美股', balance: 24310, daysAgoUpdated: 3 },
  { id: 'demo-metal', type: 'metal', name: '黄金积存', balance: 9860, daysAgoUpdated: 12 },
  { id: 'demo-car', type: 'car', name: '家用车', balance: 118000, daysAgoUpdated: 45 },
  { id: 'demo-receivable', type: 'receivable', name: '借给老周', balance: 5000, daysAgoUpdated: 20 },
  { id: 'demo-loan', type: 'loan', name: '房贷', balance: 186000, daysAgoUpdated: 5 },
  { id: 'demo-credit', type: 'credit_card', name: '信用卡账单', balance: 6842.19, daysAgoUpdated: 2 },
]

export function buildDemoAccounts(now: Date): Account[] {
  return DEMO_ACCOUNT_SEEDS.map((seed) => ({
    id: seed.id,
    type: seed.type,
    name: seed.name,
    balance: seed.balance,
    updatedAt: isoDaysAgo(now, seed.daysAgoUpdated),
  }))
}

export function buildDemoOps(now: Date): AccountOp[] {
  // 与 buildDemoAccounts 的当前余额自洽（before + delta = after，after = 当前值）
  return [
    {
      id: 'demo-op-transfer',
      kind: 'transfer',
      at: isoDaysAgo(now, 7, 9),
      accountType: 'bank_card',
      fromId: 'demo-bank',
      toId: 'demo-fund',
      amount: 3000,
      fromBefore: 35806.5,
      fromAfter: 32806.5,
      toBefore: 83420.55,
      toAfter: 86420.55,
    },
    {
      id: 'demo-op-stock',
      kind: 'adjust',
      at: isoDaysAgo(now, 3, 20),
      accountType: 'stock',
      accountId: 'demo-stock',
      delta: 1240,
      before: 23070,
      after: 24310,
      note: '月度盈亏',
    },
    {
      id: 'demo-op-credit',
      kind: 'set_balance',
      at: isoDaysAgo(now, 2, 21),
      accountType: 'credit_card',
      accountId: 'demo-credit',
      before: 7500,
      after: 6842.19,
      note: '还款后校准',
    },
    {
      id: 'demo-op-cash',
      kind: 'adjust',
      at: isoDaysAgo(now, 1, 18),
      accountType: 'cash',
      accountId: 'demo-cash',
      delta: -200,
      before: 1500,
      after: 1300,
      note: '加油',
    },
  ]
}

type DemoSnapshot = {
  date: string
  cash: number
  invest: number
  fixed: number
  receivable: number
  debt: number
  net: number
}

// 18 个月历史：月末检查点 + 最近 30 天逐日，收敛到当前账户总额附近
export function buildDemoSnapshots(now: Date): DemoSnapshot[] {
  const rand = mulberry32(20260704)
  const wiggle = (base: number, amp: number) => normalizeMoney(base + (rand() - 0.5) * 2 * amp)

  // 当前各组目标值（与 DEMO_ACCOUNT_SEEDS 一致）
  const target = {
    cash: 36565.22,
    invest: 120590.55,
    fixed: 118000,
    receivable: 5000,
    debt: 192842.19,
  }

  const snapshots: DemoSnapshot[] = []
  const push = (daysAgo: number, s: Omit<DemoSnapshot, 'date' | 'net'>) => {
    const net = normalizeMoney(addMoney(addMoney(addMoney(s.cash, s.invest), addMoney(s.fixed, s.receivable)), -s.debt))
    snapshots.push({ date: dateKeyDaysAgo(now, daysAgo), ...s, net })
  }

  // 17 个月前 → 2 个月前：月度检查点（约每 30 天）
  const months = 17
  for (let m = months; m >= 2; m -= 1) {
    const t = (months - m) / months // 0 → 1
    push(m * 30, {
      cash: wiggle(28000 + t * 8500, 2400),
      // 投资：整体上行 + 波动
      invest: wiggle(66000 + t * 54600, 6200),
      // 家用车持有全程
      fixed: target.fixed,
      // 应收 3 个月前借出
      receivable: m * 30 > 100 ? 0 : target.receivable,
      // 贷款按月递减 + 信用卡波动；起点约 20.6 万，净值全程为正
      debt: wiggle(206000 - t * 13200, 2200),
    })
  }

  // 最近 30 天：逐日缓动到当前值
  for (let d = 30; d >= 1; d -= 1) {
    const t = (30 - d) / 30
    const ease = 1 - (1 - t) * (1 - t)
    push(d, {
      cash: wiggle(target.cash - (1 - ease) * 2400, 420),
      invest: wiggle(target.invest - (1 - ease) * 5200, 900),
      fixed: target.fixed,
      receivable: target.receivable,
      debt: wiggle(target.debt + (1 - ease) * 2600, 380),
    })
  }

  return snapshots
}

export function buildDemoBackup(now: Date, storage: Storage = localStorage): RatioBackupFile {
  const items: Record<string, string> = {
    'ratio.accounts': JSON.stringify(buildDemoAccounts(now)),
    'ratio.accountOps': JSON.stringify(buildDemoOps(now)),
    'ratio.snapshots': JSON.stringify(buildDemoSnapshots(now)),
    'ratio.tourSeen': 'true',
  }

  // 保留个人偏好，演示体验不重置主题/外观等
  for (const key of PRESERVED_PREFERENCE_KEYS) {
    try {
      const raw = storage.getItem(key)
      if (raw != null) items[key] = raw
    } catch {
      // 忽略读取失败
    }
  }

  return { schema: RATIO_BACKUP_SCHEMA_V1, createdAt: now.toISOString(), items }
}

// 进入演示：现有数据整体暂存 → 写入演示数据 → 打演示标记。
// 调用方随后应整页刷新（与导入备份同一模式）。
export function enterDemoMode(now = new Date()) {
  const stash = stringifyRatioBackup(buildRatioBackup())
  localStorage.setItem(DEMO_STASH_KEY, stash)
  restoreRatioBackup(buildDemoBackup(now))
  setDemoModeActive(true)
  cancelPendingCloudAutoSync()
}

// 退出演示：恢复暂存并清理标记。恢复的数据与进入前逐字节一致，
// 因此可以直接标记云同步为干净。
export function exitDemoMode() {
  const raw = localStorage.getItem(DEMO_STASH_KEY)
  if (raw) {
    restoreRatioBackup(parseRatioBackup(raw))
  } else {
    clearRatioStorage()
  }
  localStorage.removeItem(DEMO_STASH_KEY)
  setDemoModeActive(false)
  cancelPendingCloudAutoSync()
  markCloudSyncClean()
}
