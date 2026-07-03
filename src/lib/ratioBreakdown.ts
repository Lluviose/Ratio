import { getAccountTypeOption, type Account, type AccountTypeId } from './accounts'
import { addMoney } from './money'
import { allocateIntegerPercents } from './percent'
import { isLightColor } from './themes'

export type RatioBreakdownItem = {
  type: AccountTypeId
  name: string
  amount: number
  count: number
  percent: number
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const raw = hex.trim().replace(/^#/, '')
  if (raw.length === 3) {
    const r = Number.parseInt(raw[0] + raw[0], 16)
    const g = Number.parseInt(raw[1] + raw[1], 16)
    const b = Number.parseInt(raw[2] + raw[2], 16)
    if ([r, g, b].some((v) => Number.isNaN(v))) return null
    return { r, g, b }
  }
  if (raw.length === 6) {
    const r = Number.parseInt(raw.slice(0, 2), 16)
    const g = Number.parseInt(raw.slice(2, 4), 16)
    const b = Number.parseInt(raw.slice(4, 6), 16)
    if ([r, g, b].some((v) => Number.isNaN(v))) return null
    return { r, g, b }
  }
  return null
}

export function mixHexColors(base: string, target: string, ratio: number): string {
  const from = hexToRgb(base)
  const to = hexToRgb(target)
  if (!from || !to) return base

  const t = Math.min(1, Math.max(0, Number.isFinite(ratio) ? ratio : 0))
  const mixChannel = (a: number, b: number) => Math.round(a + (b - a) * t)
  const toHex = (v: number) => v.toString(16).padStart(2, '0')

  return `#${toHex(mixChannel(from.r, to.r))}${toHex(mixChannel(from.g, to.g))}${toHex(mixChannel(from.b, to.b))}`
}

// 浅色基调向墨色混合、深色基调向白色混合，保证每一档都与父级色块可区分
const LIGHT_TONE_MIX_TARGET = '#12172b'
const DARK_TONE_MIX_TARGET = '#ffffff'

const TONE_SCALE_START = 0.16
const TONE_SCALE_STEP = 0.14
const TONE_SCALE_MAX = 0.68
const TONE_SCALE_SINGLE = 0.3

export function buildToneScale(tone: string, count: number): string[] {
  if (!Number.isFinite(count) || count <= 0) return []

  const target = isLightColor(tone) ? LIGHT_TONE_MIX_TARGET : DARK_TONE_MIX_TARGET
  if (count === 1) return [mixHexColors(tone, target, TONE_SCALE_SINGLE)]

  const end = Math.min(TONE_SCALE_MAX, TONE_SCALE_START + TONE_SCALE_STEP * (count - 1))
  const step = (end - TONE_SCALE_START) / (count - 1)
  return Array.from({ length: count }, (_, i) => mixHexColors(tone, target, TONE_SCALE_START + step * i))
}

/**
 * 将可用高度按金额比例分配给各分段；小金额分段保底 minHeight，
 * 剩余空间按比例分给其他分段，尾段吸收浮点误差使总和恰好等于可用高度。
 */
export function distributeSegmentHeights(amounts: number[], available: number, minHeight: number): number[] {
  const count = amounts.length
  if (count === 0) return []

  const usable = Number.isFinite(available) ? Math.max(0, available) : 0
  if (usable <= 0) return amounts.map(() => 0)

  const safeMin = Number.isFinite(minHeight) ? Math.max(0, minHeight) : 0
  const safeAmounts = amounts.map((a) => (Number.isFinite(a) && a > 0 ? a : 0))
  const total = safeAmounts.reduce((sum, a) => sum + a, 0)

  // 没有可用比例，或空间不足以让每段保底时，退化为均分
  if (total <= 0 || usable <= safeMin * count) {
    const each = usable / count
    return amounts.map(() => each)
  }

  const raw = safeAmounts.map((a) => (usable * a) / total)
  const useMin = raw.map((h) => h < safeMin)
  const minSum = useMin.reduce((sum, m) => sum + (m ? safeMin : 0), 0)
  const flexTotal = raw.reduce((sum, h, i) => sum + (useMin[i] ? 0 : h), 0)
  const flexAvailable = Math.max(0, usable - minSum)

  const heights = raw.map((h, i) => {
    if (useMin[i]) return safeMin
    return flexTotal > 0 ? (flexAvailable * h) / flexTotal : 0
  })

  const sumButLast = heights.slice(0, -1).reduce((sum, h) => sum + h, 0)
  heights[count - 1] = Math.max(0, usable - sumButLast)
  return heights
}

export function buildGroupBreakdown(accounts: Account[]): RatioBreakdownItem[] {
  const byType = new Map<AccountTypeId, { amount: number; count: number }>()

  for (const account of accounts) {
    const entry = byType.get(account.type) ?? { amount: 0, count: 0 }
    const balance = Number.isFinite(account.balance) ? Math.max(0, account.balance) : 0
    entry.amount = addMoney(entry.amount, balance)
    entry.count += 1
    byType.set(account.type, entry)
  }

  const items = Array.from(byType.entries(), ([type, value]) => ({ type, ...value }))
  items.sort((a, b) => b.amount - a.amount || a.type.localeCompare(b.type))

  const percents = allocateIntegerPercents(items.map((i) => ({ id: i.type, amount: i.amount })))

  return items.map((i) => ({
    type: i.type,
    name: getAccountTypeOption(i.type).name,
    amount: i.amount,
    count: i.count,
    percent: percents[i.type] ?? 0,
  }))
}
