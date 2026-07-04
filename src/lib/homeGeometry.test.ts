import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import {
  BUBBLE_BURSTS_DISABLE_MAX,
  BUBBLE_BURSTS_ENABLE_MAX,
  BUBBLE_PHYSICS_DISABLE_MAX,
  BUBBLE_PHYSICS_ENABLE_MAX,
  DEBT_WIDTH_RATIO,
  RATIO_CORNER_EXTEND,
  RATIO_MIN_BLOCK_HEIGHT,
  computeAssetFillerRect,
  computeBlockKinds,
  computeDebtFillerRect,
  computeListBlockRects,
  computeRatioLayout,
  getBubbleRuntimeState,
  getListCorner,
  getRatioCorner,
  isSameBubbleRuntimeState,
  isSameRect,
  isSameRectMap,
  lerp,
  type CornerKind,
  type GroupId,
  type ListMeasureItem,
} from './homeGeometry'

const TOP = 120

function layoutOf(
  assets: Array<{ id: GroupId; amount: number }>,
  debtAmount: number | null,
  viewport = { w: 420, h: 800 },
) {
  const assetsTotal = assets.reduce((sum, a) => sum + a.amount, 0)
  return computeRatioLayout({
    assets,
    debt: debtAmount == null ? null : { amount: debtAmount },
    assetsTotal,
    viewportW: viewport.w,
    viewportH: viewport.h,
    top: TOP,
  })
}

describe('lerp', () => {
  it('interpolates endpoints and midpoint', () => {
    expect(lerp(0, 10, 0)).toBe(0)
    expect(lerp(0, 10, 1)).toBe(10)
    expect(lerp(0, 10, 0.5)).toBe(5)
  })
})

describe('corner tables', () => {
  const R = 32
  const L = 30

  it('ratio corners match the design table', () => {
    expect(getRatioCorner('debt', R)).toEqual({ tl: 0, tr: R, bl: R, br: 0 })
    expect(getRatioCorner('assetOnly', R)).toEqual({ tl: 0, tr: R, bl: 0, br: R })
    expect(getRatioCorner('assetTop', R)).toEqual({ tl: 0, tr: R, bl: 0, br: 0 })
    expect(getRatioCorner('assetBottom', R)).toEqual({ tl: 0, tr: R, bl: 0, br: R })
    expect(getRatioCorner('assetMiddle', R)).toEqual({ tl: 0, tr: R, bl: 0, br: 0 })
    expect(getRatioCorner('assetOnlyNoDebt', R)).toEqual({ tl: R, tr: R, bl: R, br: R })
    expect(getRatioCorner('assetTopNoDebt', R)).toEqual({ tl: R, tr: R, bl: 0, br: 0 })
    expect(getRatioCorner('assetBottomNoDebt', R)).toEqual({ tl: R, tr: R, bl: R, br: R })
    expect(getRatioCorner('assetMiddleNoDebt', R)).toEqual({ tl: R, tr: R, bl: 0, br: 0 })
  })

  it('list corners round the bottom only on the visually last block', () => {
    const lastKinds: CornerKind[] = ['debt', 'assetBottomNoDebt', 'assetOnlyNoDebt']
    const otherKinds: CornerKind[] = ['assetTop', 'assetMiddle', 'assetBottom', 'assetOnly', 'assetTopNoDebt', 'assetMiddleNoDebt']
    for (const k of lastKinds) expect(getListCorner(k, L)).toEqual({ tl: 0, tr: L, bl: 0, br: L })
    for (const k of otherKinds) expect(getListCorner(k, L)).toEqual({ tl: 0, tr: L, bl: 0, br: 0 })
  })
})

describe('isSameRect / isSameRectMap', () => {
  it('treats sub-half-pixel movement as equal', () => {
    expect(isSameRect({ x: 0, y: 0, w: 10, h: 10 }, { x: 0.4, y: 0, w: 10, h: 10.4 })).toBe(true)
    expect(isSameRect({ x: 0, y: 0, w: 10, h: 10 }, { x: 0.6, y: 0, w: 10, h: 10 })).toBe(false)
    expect(isSameRect(undefined, undefined)).toBe(true)
    expect(isSameRect(undefined, { x: 0, y: 0, w: 0, h: 0 })).toBe(false)
    expect(isSameRectMap({ liquid: { x: 0, y: 0, w: 1, h: 1 } }, { liquid: { x: 0.2, y: 0, w: 1, h: 1 } })).toBe(true)
    expect(isSameRectMap({ liquid: { x: 0, y: 0, w: 1, h: 1 } }, {})).toBe(false)
  })
})

describe('computeRatioLayout', () => {
  it('no debt: assets fill full width and full chart height', () => {
    const layout = layoutOf([{ id: 'liquid', amount: 100 }], null)
    const chartH = 800 - TOP
    expect(layout.hasDebt).toBe(false)
    expect(layout.rects.debt).toBeUndefined()
    expect(layout.rects.liquid).toEqual({ x: 0, y: TOP, w: 420, h: chartH })
    expect(layout.displayHeights.liquid).toBe(chartH)
    expect(layout.topAssetId).toBe('liquid')
    expect(layout.bottomAssetId).toBe('liquid')
  })

  it('debt below 100%: debt column is bottom-aligned with proportional height', () => {
    const layout = layoutOf([{ id: 'liquid', amount: 200 }], 100)
    const chartH = 800 - TOP
    const debtW = Math.round(420 * DEBT_WIDTH_RATIO)
    expect(layout.debtExceeds).toBe(false)
    expect(layout.rects.debt).toBeDefined()
    expect(layout.rects.debt?.w).toBe(debtW)
    expect(layout.rects.debt?.h).toBeCloseTo(chartH * 0.5, 6)
    // 底部对齐
    expect((layout.rects.debt?.y ?? 0) + (layout.rects.debt?.h ?? 0)).toBeCloseTo(TOP + chartH, 6)
    // 资产列从负债列右侧开始
    expect(layout.rects.liquid?.x).toBe(debtW)
    expect(layout.rects.liquid?.w).toBe(420 - debtW)
  })

  it('debt above 100%: debt fills the chart and assets compress proportionally', () => {
    const layout = layoutOf([{ id: 'liquid', amount: 100 }], 200)
    const chartH = 800 - TOP
    expect(layout.debtExceeds).toBe(true)
    expect(layout.rects.debt?.y).toBe(TOP)
    expect(layout.rects.debt?.h).toBe(chartH)
    expect(layout.assetDisplayH).toBeCloseTo(chartH / 2, 6)
    expect(layout.displayHeights.liquid).toBeCloseTo(chartH / 2, 6)
  })

  it('tiny assets are lifted to the minimum display height', () => {
    // 1% 资产在 680px 高度下原始高度 6.8px < 28px
    const layout = layoutOf(
      [
        { id: 'liquid', amount: 99 },
        { id: 'invest', amount: 1 },
      ],
      null,
    )
    expect(layout.displayHeights.invest).toBe(RATIO_MIN_BLOCK_HEIGHT)
  })

  it('zero-amount assets are excluded from the ratio column', () => {
    const layout = layoutOf(
      [
        { id: 'liquid', amount: 100 },
        { id: 'invest', amount: 0 },
      ],
      null,
    )
    expect(layout.rects.invest).toBeUndefined()
    expect(layout.topAssetId).toBe('liquid')
    expect(layout.bottomAssetId).toBe('liquid')
  })

  const ASSET_IDS: GroupId[] = ['liquid', 'invest', 'fixed', 'receivable']
  const amountArb = fc.double({ min: 0.01, max: 1e7, noNaN: true, noDefaultInfinity: true })
  const assetsArb = fc
    .array(amountArb, { minLength: 1, maxLength: 4 })
    .map((amounts) => amounts.map((amount, i) => ({ id: ASSET_IDS[i], amount })))
  const viewportArb = fc.record({
    w: fc.integer({ min: 200, max: 900 }),
    h: fc.integer({ min: 400, max: 1600 }),
  })
  const debtArb = fc.option(fc.double({ min: 0.01, max: 2e7, noNaN: true, noDefaultInfinity: true }), { nil: null })

  it('性质：displayHeights 恰好填满资产显示高度（最后一块吃满余量）', () => {
    fc.assert(
      fc.property(assetsArb, debtArb, viewportArb, (assets, debt, viewport) => {
        const layout = layoutOf(assets, debt, viewport)
        const sum = assets.reduce((acc, a) => acc + (layout.displayHeights[a.id] ?? 0), 0)
        expect(sum).toBeCloseTo(layout.assetDisplayH, 6)
      }),
    )
  })

  it('性质：资产块自顶向下无缝堆叠，首块起点为 assetStartY', () => {
    fc.assert(
      fc.property(assetsArb, debtArb, viewportArb, (assets, debt, viewport) => {
        const layout = layoutOf(assets, debt, viewport)
        let expectedY = layout.assetStartY
        for (const a of assets) {
          const rect = layout.rects[a.id]
          expect(rect).toBeDefined()
          expect(rect!.y).toBeCloseTo(expectedY, 6)
          expectedY += layout.displayHeights[a.id] ?? 0
        }
      }),
    )
  })

  it('性质：非最后资产块的矩形高度 = 显示高度 + 圆角延伸；最后一块不延伸', () => {
    fc.assert(
      fc.property(assetsArb, debtArb, viewportArb, (assets, debt, viewport) => {
        const layout = layoutOf(assets, debt, viewport)
        for (let i = 0; i < assets.length; i += 1) {
          const a = assets[i]
          const isLast = i === assets.length - 1
          const rect = layout.rects[a.id]!
          const display = layout.displayHeights[a.id] ?? 0
          const expected = Math.max(0, isLast ? display : display + RATIO_CORNER_EXTEND)
          expect(rect.h).toBeCloseTo(expected, 6)
        }
      }),
    )
  })

  it('性质：debtExceeds 等价于 负债金额 > 资产总额', () => {
    fc.assert(
      fc.property(assetsArb, debtArb, viewportArb, (assets, debt, viewport) => {
        const layout = layoutOf(assets, debt, viewport)
        const assetsTotal = assets.reduce((sum, a) => sum + a.amount, 0)
        expect(layout.debtExceeds).toBe(debt != null && debt > assetsTotal)
      }),
    )
  })
})

describe('computeBlockKinds', () => {
  it('single asset picks the Only variant, with/without debt', () => {
    expect(
      computeBlockKinds({ assetIds: ['liquid'], hasDebtBlock: true, topAssetId: 'liquid', bottomAssetId: 'liquid', hasDebt: true }),
    ).toEqual({ debt: 'debt', liquid: 'assetOnly' })
    expect(
      computeBlockKinds({ assetIds: ['liquid'], hasDebtBlock: false, topAssetId: 'liquid', bottomAssetId: 'liquid', hasDebt: false }),
    ).toEqual({ liquid: 'assetOnlyNoDebt' })
  })

  it('multiple assets map to top/middle/bottom variants', () => {
    expect(
      computeBlockKinds({
        assetIds: ['liquid', 'invest', 'fixed'],
        hasDebtBlock: true,
        topAssetId: 'liquid',
        bottomAssetId: 'fixed',
        hasDebt: true,
      }),
    ).toEqual({ debt: 'debt', liquid: 'assetTop', invest: 'assetMiddle', fixed: 'assetBottom' })
    expect(
      computeBlockKinds({
        assetIds: ['liquid', 'invest', 'fixed'],
        hasDebtBlock: false,
        topAssetId: 'liquid',
        bottomAssetId: 'fixed',
        hasDebt: false,
      }),
    ).toEqual({ liquid: 'assetTopNoDebt', invest: 'assetMiddleNoDebt', fixed: 'assetBottomNoDebt' })
  })

  it('debt block kind follows hasDebtBlock even when debt amount is zero', () => {
    // 分组卡存在但金额为 0：负债块仍标 debt，资产用无负债变体
    expect(
      computeBlockKinds({ assetIds: ['liquid'], hasDebtBlock: true, topAssetId: 'liquid', bottomAssetId: 'liquid', hasDebt: false }),
    ).toEqual({ debt: 'debt', liquid: 'assetOnlyNoDebt' })
  })
})

describe('computeListBlockRects', () => {
  const itemArb = fc.record({
    top: fc.double({ min: 0, max: 2000, noNaN: true, noDefaultInfinity: true }),
    height: fc.double({ min: 10, max: 400, noNaN: true, noDefaultInfinity: true }),
    cardLeft: fc.double({ min: 0, max: 500, noNaN: true, noDefaultInfinity: true }),
  })
  const IDS: GroupId[] = ['liquid', 'invest', 'fixed', 'receivable', 'debt']

  it('性质：y 对齐条目顶部、宽度在 [0, maxBlockWidth]、非最后块高度含重叠量', () => {
    fc.assert(
      fc.property(
        fc.array(itemArb, { minLength: 1, maxLength: 5 }),
        fc.double({ min: -100, max: 100, noNaN: true, noDefaultInfinity: true }),
        fc.integer({ min: 100, max: 900 }),
        (raw, offset, maxBlockWidth) => {
          const sorted = raw.slice().sort((a, b) => a.top - b.top)
          const items: ListMeasureItem[] = sorted.map((r, i) => ({ id: IDS[i], ...r }))
          const overlap = 30
          const rects = computeListBlockRects(items, { listPageFinalOffsetX: offset, maxBlockWidth, blockGap: 12, overlap })

          for (let i = 0; i < items.length; i += 1) {
            const item = items[i]
            const rect = rects[item.id]!
            expect(rect.x).toBe(0)
            expect(rect.y).toBe(item.top)
            expect(rect.w).toBeGreaterThanOrEqual(0)
            expect(rect.w).toBeLessThanOrEqual(maxBlockWidth)
            const nextItem = items[i + 1]
            if (nextItem) {
              expect(rect.h).toBeCloseTo(Math.max(0, nextItem.top - item.top) + overlap, 6)
            } else {
              expect(rect.h).toBeCloseTo(Math.max(0, item.height), 6)
            }
          }
        },
      ),
    )
  })

  it('block width derives from card left edge on the list page', () => {
    const rects = computeListBlockRects(
      [{ id: 'liquid', top: 100, height: 80, cardLeft: 156 }],
      { listPageFinalOffsetX: 0, maxBlockWidth: 400, blockGap: 12, overlap: 30 },
    )
    expect(rects.liquid).toEqual({ x: 0, y: 100, w: 144, h: 80 })
  })
})

describe('fillers', () => {
  it('debt filler fills the gap above a shorter debt column', () => {
    const layout = layoutOf([{ id: 'liquid', amount: 200 }], 100)
    const filler = computeDebtFillerRect(layout, TOP)
    expect(filler).not.toBeNull()
    expect(filler!.y).toBe(TOP)
    expect(filler!.w).toBe(layout.rects.debt!.w)
    // 填充块 + 负债块 = 整列高度
    expect(filler!.h + layout.rects.debt!.h).toBeCloseTo(800 - TOP, 6)
    // 负债超出时不需要
    const exceeded = layoutOf([{ id: 'liquid', amount: 100 }], 200)
    expect(computeDebtFillerRect(exceeded, TOP)).toBeNull()
  })

  it('asset filler fills the gap below compressed assets when debt exceeds', () => {
    const layout = layoutOf([{ id: 'liquid', amount: 100 }], 200, { w: 420, h: 800 })
    const filler = computeAssetFillerRect(layout, 420, 800, TOP)
    expect(filler).not.toBeNull()
    expect(filler!.y).toBeCloseTo(layout.assetStartY + layout.assetDisplayH, 6)
    expect(filler!.h + layout.assetDisplayH).toBeCloseTo(800 - TOP, 6)
    // 负债不超出时不需要
    const normal = layoutOf([{ id: 'liquid', amount: 200 }], 100)
    expect(computeAssetFillerRect(normal, 420, 800, TOP)).toBeNull()
  })
})

describe('getBubbleRuntimeState', () => {
  it('physics/bursts use hysteresis bands between enable and disable thresholds', () => {
    const inactive = { pageActive: false, physicsActive: false, burstsVisible: false }
    const active = { pageActive: true, physicsActive: true, burstsVisible: true }

    const midPhysics = (BUBBLE_PHYSICS_ENABLE_MAX + BUBBLE_PHYSICS_DISABLE_MAX) / 2
    expect(getBubbleRuntimeState(midPhysics, inactive).physicsActive).toBe(false)
    expect(getBubbleRuntimeState(midPhysics, active).physicsActive).toBe(true)

    const midBursts = (BUBBLE_BURSTS_ENABLE_MAX + BUBBLE_BURSTS_DISABLE_MAX) / 2
    expect(getBubbleRuntimeState(midBursts, inactive).burstsVisible).toBe(false)
    expect(getBubbleRuntimeState(midBursts, active).burstsVisible).toBe(true)
  })

  it('性质：任何 idx 下，激活态的判定阈值不低于未激活态（滞回单调性）', () => {
    fc.assert(
      fc.property(fc.double({ min: -1, max: 4, noNaN: true, noDefaultInfinity: true }), (idx) => {
        const fromInactive = getBubbleRuntimeState(idx)
        const fromActive = getBubbleRuntimeState(idx, { pageActive: true, physicsActive: true, burstsVisible: true })
        // 从激活态出发永远不会比未激活态更早关闭
        if (fromInactive.physicsActive) expect(fromActive.physicsActive).toBe(true)
        if (fromInactive.burstsVisible) expect(fromActive.burstsVisible).toBe(true)
        expect(fromInactive.pageActive).toBe(fromActive.pageActive)
      }),
    )
  })

  it('isSameBubbleRuntimeState compares all three flags', () => {
    const a = { pageActive: true, physicsActive: false, burstsVisible: false }
    expect(isSameBubbleRuntimeState(a, { ...a })).toBe(true)
    expect(isSameBubbleRuntimeState(a, { ...a, burstsVisible: true })).toBe(false)
  })
})
