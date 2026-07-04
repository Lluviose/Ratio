// 首页「气泡 → 占比 → 列表」三态形变的纯几何计算。
// 这些函数曾内联在 AssetsScreen 中，是全应用回归风险最高的数学；
// 抽出为纯函数以便直接单测/性质测试。所有输入输出均为普通数据，
// 不依赖 DOM 或 framer-motion。

import { addMoney } from './money'

export type GroupId = 'liquid' | 'invest' | 'fixed' | 'receivable' | 'debt'

export type Rect = { x: number; y: number; w: number; h: number }

export type CornerKind =
  | 'debt'
  | 'assetTop'
  | 'assetMiddle'
  | 'assetBottom'
  | 'assetOnly'
  | 'assetTopNoDebt'
  | 'assetMiddleNoDebt'
  | 'assetBottomNoDebt'
  | 'assetOnlyNoDebt'

export type CornerRadii = { tl: number; tr: number; bl: number; br: number }

export const LIST_GROUP_ORDER: GroupId[] = ['liquid', 'invest', 'fixed', 'receivable', 'debt']

// 占比页：负债列占视口宽度的比例
export const DEBT_WIDTH_RATIO = 0.24
// 占比页：资产色块最小显示高度（允许字体缩放到最小时仍可显示；最小字体 = 34/3 ≈ 11px 加 padding 余量）
export const RATIO_MIN_BLOCK_HEIGHT = 28
// 占比页：非最后色块向下延伸的高度（填充下方色块圆角处的空缺）
export const RATIO_CORNER_EXTEND = 32

/** Linear interpolation helper */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

export function getRatioCorner(kind: CornerKind, chartRadius: number): CornerRadii {
  if (kind === 'debt') return { tl: 0, tr: chartRadius, bl: chartRadius, br: 0 }
  if (kind === 'assetOnly') return { tl: 0, tr: chartRadius, bl: 0, br: chartRadius }
  if (kind === 'assetTop') return { tl: 0, tr: chartRadius, bl: 0, br: 0 }
  if (kind === 'assetBottom') return { tl: 0, tr: chartRadius, bl: 0, br: chartRadius }
  if (kind === 'assetMiddle') return { tl: 0, tr: chartRadius, bl: 0, br: 0 }
  if (kind === 'assetOnlyNoDebt') return { tl: chartRadius, tr: chartRadius, bl: chartRadius, br: chartRadius }
  if (kind === 'assetTopNoDebt') return { tl: chartRadius, tr: chartRadius, bl: 0, br: 0 }
  if (kind === 'assetBottomNoDebt') return { tl: chartRadius, tr: chartRadius, bl: chartRadius, br: chartRadius }
  if (kind === 'assetMiddleNoDebt') return { tl: chartRadius, tr: chartRadius, bl: 0, br: 0 }
  return { tl: 0, tr: 0, bl: 0, br: 0 }
}

export function getListCorner(kind: CornerKind, listRadius: number): CornerRadii {
  const isListLastBlock = kind === 'debt' || kind === 'assetBottomNoDebt' || kind === 'assetOnlyNoDebt'
  return { tl: 0, tr: listRadius, bl: 0, br: isListLastBlock ? listRadius : 0 }
}

export function isSameRect(a?: Rect, b?: Rect): boolean {
  if (!a || !b) return a === b
  return (
    Math.abs(a.x - b.x) < 0.5 &&
    Math.abs(a.y - b.y) < 0.5 &&
    Math.abs(a.w - b.w) < 0.5 &&
    Math.abs(a.h - b.h) < 0.5
  )
}

export function isSameRectMap(a: Partial<Record<GroupId, Rect>>, b: Partial<Record<GroupId, Rect>>): boolean {
  return LIST_GROUP_ORDER.every((id) => isSameRect(a[id], b[id]))
}

export type RatioLayout = {
  rects: Partial<Record<GroupId, Rect>>
  displayHeights: Partial<Record<GroupId, number>>
  topAssetId: GroupId | null
  bottomAssetId: GroupId | null
  debtExceeds: boolean
  assetDisplayH: number
  assetStartY: number
  hasDebt: boolean
}

// 占比页布局：
// - 负债占左侧固定宽度列，资产纵向按金额比例分配右侧高度
// - 负债 ≤ 资产总额时资产列占满高度、负债按比例缩短且底部对齐；
//   负债超过资产总额时反过来（负债占满、资产整体压缩）
// - 过小的资产提升到最小高度，剩余高度按原比例分给其余资产，最后一块吃满余量
// - 非最后色块向下延伸 RATIO_CORNER_EXTEND 以填充下一块圆角处的空缺
//   （rects 含延伸；displayHeights 是不含延伸的真实显示高度）
export function computeRatioLayout(params: {
  assets: Array<{ id: GroupId; amount: number }>
  debt: { amount: number } | null
  assetsTotal: number
  viewportW: number
  viewportH: number
  top: number
}): RatioLayout {
  const { assets, debt, assetsTotal, viewportW, viewportH, top } = params
  const chartH = Math.max(0, viewportH - top)
  const chartW = viewportW

  const hasDebt = Boolean(debt && debt.amount > 0)

  const debtW = hasDebt ? Math.round(chartW * DEBT_WIDTH_RATIO) : 0
  const assetX = debtW
  const assetW = Math.max(0, chartW - debtW)

  const rects: Partial<Record<GroupId, Rect>> = {}

  const debtTotal = debt?.amount || 0
  const debtPercent = assetsTotal > 0 ? debtTotal / assetsTotal : 0

  const debtExceeds = debtPercent > 1

  let assetDisplayH: number
  let debtDisplayH: number
  let assetStartY: number
  let debtStartY: number

  if (debtExceeds) {
    // 负债超过100%：负债占满，资产按比例缩小（资产高度 = 100% / 负债百分比）
    debtDisplayH = chartH
    debtStartY = top
    assetDisplayH = chartH / debtPercent
    assetStartY = top
  } else {
    // 负债不超过100%：资产占满，负债按比例缩小、底部对齐
    assetDisplayH = chartH
    assetStartY = top
    debtDisplayH = chartH * debtPercent
    debtStartY = top + chartH - debtDisplayH
  }

  if (hasDebt) {
    rects.debt = { x: 0, y: debtStartY, w: debtW, h: debtDisplayH }
  }

  const ratioAssets = assets.filter((b) => b.amount > 0)
  const total = ratioAssets.reduce((sum, b) => addMoney(sum, b.amount), 0)

  const minHeight = RATIO_MIN_BLOCK_HEIGHT
  const cornerExtend = RATIO_CORNER_EXTEND

  const displayHeights: Partial<Record<GroupId, number>> = {}

  // 第一遍：找出需要使用最小高度的资产
  const assetHeights: { id: GroupId; rawH: number; useMin: boolean }[] = []
  let minHeightSum = 0

  for (const b of ratioAssets) {
    const rawH = total > 0 ? (assetDisplayH * b.amount) / total : 0
    const useMin = rawH < minHeight && rawH > 0
    if (useMin) minHeightSum += minHeight
    assetHeights.push({ id: b.id, rawH, useMin })
  }

  // 第二遍：计算剩余高度给非最小高度的资产
  const remainingH = Math.max(0, assetDisplayH - minHeightSum)
  const nonMinTotal = assetHeights
    .filter((a) => !a.useMin)
    .reduce((sum, a) => sum + a.rawH, 0)

  // 第三遍：分配最终高度（非最后的资产向下延伸以填充圆角空缺）
  let y = assetStartY
  for (let i = 0; i < ratioAssets.length; i += 1) {
    const b = ratioAssets[i]
    const info = assetHeights[i]
    const isLast = i === ratioAssets.length - 1

    let height: number
    if (info.useMin) {
      height = minHeight
    } else if (nonMinTotal > 0) {
      height = (remainingH * info.rawH) / nonMinTotal
    } else {
      height = info.rawH
    }

    // 最后一个资产填满剩余空间
    if (isLast) {
      height = assetStartY + assetDisplayH - y
    }

    displayHeights[b.id] = height

    const extendedHeight = isLast ? height : height + cornerExtend

    rects[b.id] = { x: assetX, y, w: assetW, h: Math.max(0, extendedHeight) }
    y += height
  }

  return {
    rects,
    displayHeights,
    topAssetId: ratioAssets.length > 0 ? ratioAssets[0]?.id ?? null : null,
    bottomAssetId: ratioAssets.length > 0 ? ratioAssets[ratioAssets.length - 1]?.id ?? null : null,
    debtExceeds,
    assetDisplayH,
    assetStartY,
    hasDebt,
  }
}

// 每个色块在占比页的圆角形态：
// hasDebtBlock = 负债「分组卡」存在（决定 debt 块本身），
// hasDebt = 负债金额 > 0（决定资产块用带负债/无负债的圆角变体）——两者是不同的判定。
export function computeBlockKinds(params: {
  assetIds: GroupId[]
  hasDebtBlock: boolean
  topAssetId: GroupId | null
  bottomAssetId: GroupId | null
  hasDebt: boolean
}): Partial<Record<GroupId, CornerKind>> {
  const { assetIds, hasDebtBlock, topAssetId, bottomAssetId, hasDebt } = params
  const kinds: Partial<Record<GroupId, CornerKind>> = {}
  if (hasDebtBlock) kinds.debt = 'debt'
  const singleAsset = Boolean(topAssetId && topAssetId === bottomAssetId)

  for (const id of assetIds) {
    if (singleAsset && id === topAssetId) {
      kinds[id] = hasDebt ? 'assetOnly' : 'assetOnlyNoDebt'
    } else if (id === topAssetId) {
      kinds[id] = hasDebt ? 'assetTop' : 'assetTopNoDebt'
    } else if (id === bottomAssetId) {
      kinds[id] = hasDebt ? 'assetBottom' : 'assetBottomNoDebt'
    } else {
      kinds[id] = hasDebt ? 'assetMiddle' : 'assetMiddleNoDebt'
    }
  }
  return kinds
}

export type ListMeasureItem = { id: GroupId; top: number; height: number; cardLeft: number }

// 列表页色块矩形：块高包含「到下一个条目顶部的距离」+「覆盖下一块圆角所需的重叠量」，
// 确保当前块上沿对齐条目上沿、视觉下沿贴住下一条目上沿、圆角空白不露底。
export function computeListBlockRects(
  items: ListMeasureItem[],
  opts: { listPageFinalOffsetX: number; maxBlockWidth: number; blockGap: number; overlap: number },
): Partial<Record<GroupId, Rect>> {
  const { listPageFinalOffsetX, maxBlockWidth, blockGap, overlap } = opts
  const next: Partial<Record<GroupId, Rect>> = {}

  for (let i = 0; i < items.length; i += 1) {
    const item = items[i]
    if (!item) continue
    const nextItem = items[i + 1]

    const cardLeftOnListPage = item.cardLeft - listPageFinalOffsetX
    const blockWidth = Math.min(maxBlockWidth, Math.max(0, Math.round(cardLeftOnListPage - blockGap)))
    const baseHeight = nextItem ? Math.max(0, nextItem.top - item.top) : Math.max(0, item.height)
    const blockHeight = nextItem ? baseHeight + overlap : baseHeight

    next[item.id] = {
      x: 0,
      y: item.top,
      w: blockWidth,
      h: blockHeight,
    }
  }

  return next
}

// 负债上方的白色填充块（负债比例低于100%时，补齐负债列顶部的空白）
export function computeDebtFillerRect(layout: RatioLayout, top: number): Rect | null {
  if (layout.debtExceeds) return null
  const debtRect = layout.rects.debt
  if (!debtRect) return null

  const fillerH = debtRect.y - top
  if (fillerH <= 0) return null

  return { x: 0, y: top, w: debtRect.w, h: fillerH }
}

// 资产底部的白色填充块（负债比例超过100%时，补齐资产列底部的空白）
export function computeAssetFillerRect(
  layout: RatioLayout,
  viewportW: number,
  viewportH: number,
  top: number,
): Rect | null {
  if (!layout.debtExceeds) return null

  const chartH = Math.max(0, viewportH - top)
  const debtW = Math.round(viewportW * DEBT_WIDTH_RATIO)
  const assetX = debtW
  const assetW = Math.max(0, viewportW - debtW)

  const assetEndY = layout.assetStartY + layout.assetDisplayH
  const fillerH = top + chartH - assetEndY
  if (fillerH <= 0) return null

  return { x: assetX, y: assetEndY, w: assetW, h: fillerH }
}

// 气泡页运行时状态（按滚动进度 idx 推导，带滞回避免边界抖动）
export const BUBBLE_PAGE_ACTIVE_MAX = 0.8
export const BUBBLE_PHYSICS_ENABLE_MAX = 0.24
export const BUBBLE_PHYSICS_DISABLE_MAX = 0.34
export const BUBBLE_BURSTS_ENABLE_MAX = 0.62
export const BUBBLE_BURSTS_DISABLE_MAX = 0.72

export type BubbleRuntimeState = {
  pageActive: boolean
  physicsActive: boolean
  burstsVisible: boolean
}

export function getBubbleRuntimeState(idx: number, current?: BubbleRuntimeState): BubbleRuntimeState {
  const pageActive = idx < BUBBLE_PAGE_ACTIVE_MAX
  const physicsActive = current?.physicsActive ? idx < BUBBLE_PHYSICS_DISABLE_MAX : idx < BUBBLE_PHYSICS_ENABLE_MAX
  const burstsVisible = current?.burstsVisible ? idx < BUBBLE_BURSTS_DISABLE_MAX : idx < BUBBLE_BURSTS_ENABLE_MAX
  return { pageActive, physicsActive, burstsVisible }
}

export function isSameBubbleRuntimeState(a: BubbleRuntimeState, b: BubbleRuntimeState): boolean {
  return a.pageActive === b.pageActive && a.physicsActive === b.physicsActive && a.burstsVisible === b.burstsVisible
}
