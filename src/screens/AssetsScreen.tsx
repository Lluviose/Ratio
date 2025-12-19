import { AnimatePresence, motion, useMotionValue, useTransform, type MotionValue } from 'framer-motion'
import { BarChart3, Eye, EyeOff, MoreHorizontal, Plus, TrendingUp } from 'lucide-react'
import { type ComponentType, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Account, AccountGroup, AccountTypeId } from '../lib/accounts'
import { formatCny } from '../lib/format'
import { AssetsListPage } from './AssetsListPage'
import { AssetsRatioPage } from './AssetsRatioPage'
import { AssetsTypeDetailPage } from './AssetsTypeDetailPage'
import { BubbleChartPage } from './BubbleChartPage'
import { useBubblePhysics, type BubbleNode } from '../components/BubbleChartPhysics'

/** Linear interpolation helper */
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

export type GroupedAccounts = {
  groupCards: Array<{ group: AccountGroup; accounts: Account[]; total: number }>
  assetsTotal: number
  debtTotal: number
  netWorth: number
}

type GroupId = 'liquid' | 'invest' | 'fixed' | 'receivable' | 'debt'

type Rect = { x: number; y: number; w: number; h: number }

type Block = {
  id: GroupId
  name: string
  tone: string
  amount: number
  percent: number
  darkText: boolean
  hasCard: boolean
}

type OverlayBlockModel = Block

type CornerKind = 'debt' | 'assetTop' | 'assetMiddle' | 'assetBottom' | 'assetOnly' | 'assetTopNoDebt' | 'assetMiddleNoDebt' | 'assetBottomNoDebt' | 'assetOnlyNoDebt'

function OverlayBlock(props: {
  block: OverlayBlockModel
  kind: CornerKind
  ratioRect?: Rect
  listRect?: Rect
  bubblePos?: { x: MotionValue<number>; y: MotionValue<number> }
  bubbleRadius?: number
  scrollIdx: MotionValue<number>
  overlayFade: MotionValue<number>
  labelsOpacity: MotionValue<number>
  chartRadius: number
  listRadius: number
}) {
  const {
    block,
    kind,
    ratioRect,
    listRect,
    bubblePos,
    bubbleRadius,
    scrollIdx,
    overlayFade,
    labelsOpacity,
    chartRadius,
    listRadius,
  } = props

  const ratio = ratioRect ?? listRect ?? { x: 0, y: 0, w: 0, h: 0 }
  const list = listRect ?? ratioRect ?? ratio
  const bRadius = bubbleRadius ?? 60
  
  // Fallback for bubble pos if missing (shouldn't happen if initialized)
  const defaultBX = useMotionValue(ratio.x + ratio.w / 2)
  const defaultBY = useMotionValue(ratio.y + ratio.h / 2)
  
  const bX = bubblePos?.x ?? defaultBX
  const bY = bubblePos?.y ?? defaultBY

  // Interpolate Layout
  // 0 -> 1: Bubble -> Ratio
  // 1 -> 2: Ratio -> List
  
  const x = useTransform([scrollIdx, bX], (values) => {
    const idx = values[0] as number
    const bx = values[1] as number
    
    // Phase 1: Bubble -> Ratio
    if (idx < 1) {
      const t = Math.max(0, idx)
      // Bubble center is bx, by. Top-left is bx - r, by - r
      const bubbleLeft = bx - bRadius
      return lerp(bubbleLeft, ratio.x, t)
    }
    // Phase 2: Ratio -> List
    const t = Math.min(1, Math.max(0, idx - 1))
    return lerp(ratio.x, list.x, t)
  })

  const y = useTransform([scrollIdx, bY], (values) => {
    const idx = values[0] as number
    const by = values[1] as number

    if (idx < 1) {
      const t = Math.max(0, idx)
      const bubbleTop = by - bRadius
      return lerp(bubbleTop, ratio.y, t)
    }
    const t = Math.min(1, Math.max(0, idx - 1))
    return lerp(ratio.y, list.y, t)
  })

  const w = useTransform(scrollIdx, (idx) => {
    if (idx < 1) {
      return lerp(bRadius * 2, ratio.w, Math.max(0, idx))
    }
    return lerp(ratio.w, list.w, Math.min(1, Math.max(0, idx - 1)))
  })

  const h = useTransform(scrollIdx, (idx) => {
    if (idx < 1) {
      return lerp(bRadius * 2, ratio.h, Math.max(0, idx))
    }
    return lerp(ratio.h, list.h, Math.min(1, Math.max(0, idx - 1)))
  })
  
  const opacity = useTransform([overlayFade], ([a]) => a)

  // 圆角逻辑：
  // - 有负债时：资产左边无圆角（与负债区对齐），右上角有圆角，右下角无圆角
  // - 无负债时：资产左右上角有圆角，右下角无圆角
  // - 每个色块（除最后一个）都向下延伸，延伸部分垫在下方色块的圆角处
  // - 最底部色块右下角有圆角
  const ratioCorner =
    kind === 'debt'
      ? { tl: chartRadius, tr: chartRadius, bl: chartRadius, br: 0 }
      : kind === 'assetOnly'
        ? { tl: 0, tr: chartRadius, bl: 0, br: chartRadius }
      : kind === 'assetTop'
        ? { tl: 0, tr: chartRadius, bl: 0, br: 0 }
        : kind === 'assetBottom'
          ? { tl: 0, tr: chartRadius, bl: 0, br: chartRadius }
          : kind === 'assetMiddle'
            ? { tl: 0, tr: chartRadius, bl: 0, br: 0 }
            : kind === 'assetOnlyNoDebt'
              ? { tl: chartRadius, tr: chartRadius, bl: chartRadius, br: chartRadius }
              : kind === 'assetTopNoDebt'
                ? { tl: chartRadius, tr: chartRadius, bl: 0, br: 0 }
                : kind === 'assetBottomNoDebt'
                  ? { tl: chartRadius, tr: chartRadius, bl: chartRadius, br: chartRadius }
                  : kind === 'assetMiddleNoDebt'
                    ? { tl: chartRadius, tr: chartRadius, bl: 0, br: 0 }
                    : { tl: 0, tr: 0, bl: 0, br: 0 }

  const listCorner = { tl: listRadius, tr: listRadius, bl: listRadius, br: listRadius }
  const bubbleCorner = { tl: bRadius, tr: bRadius, bl: bRadius, br: bRadius }

  const tl = useTransform(scrollIdx, (idx) => {
    if (idx < 1) return lerp(bubbleCorner.tl, ratioCorner.tl, Math.max(0, idx))
    return lerp(ratioCorner.tl, listCorner.tl, Math.min(1, Math.max(0, idx - 1)))
  })
  const tr = useTransform(scrollIdx, (idx) => {
    if (idx < 1) return lerp(bubbleCorner.tr, ratioCorner.tr, Math.max(0, idx))
    return lerp(ratioCorner.tr, listCorner.tr, Math.min(1, Math.max(0, idx - 1)))
  })
  const bl = useTransform(scrollIdx, (idx) => {
    if (idx < 1) return lerp(bubbleCorner.bl, ratioCorner.bl, Math.max(0, idx))
    return lerp(ratioCorner.bl, listCorner.bl, Math.min(1, Math.max(0, idx - 1)))
  })
  const br = useTransform(scrollIdx, (idx) => {
    if (idx < 1) return lerp(bubbleCorner.br, ratioCorner.br, Math.max(0, idx))
    return lerp(ratioCorner.br, listCorner.br, Math.min(1, Math.max(0, idx - 1)))
  })

  const textColor = block.darkText ? 'rgba(11, 15, 26, 0.92)' : 'rgba(255,255,255,0.96)'

  // Content Centering for Bubbles
  const padding = useTransform(scrollIdx, [0, 1], [0, 16])
  const flexAlign = useTransform(scrollIdx, (v) => (v < 0.5 ? 'center' : 'flex-start'))
  const flexJustify = useTransform(scrollIdx, (v) => (v < 0.5 ? 'center' : 'flex-start')) // For debt col layout
  const contentScale = useTransform(scrollIdx, [0, 0.5, 1], [1.1, 1, 1]) // Slight scale up in bubble
  
  // Sphere visual effects (fade out as we scroll to ratio)
  const sphereEffectOpacity = useTransform(scrollIdx, [0, 0.6], [1, 0])

  // Text Crossfade
  // 0 -> 0.5: Show Amount (Bubble)
  // 0.5 -> 1: Show Percent (Ratio)
  const amountOpacity = useTransform(scrollIdx, [0, 0.4, 0.6], [1, 1, 0])
  const percentOpacity = useTransform(scrollIdx, [0.4, 0.6, 1], [0, 1, 1])
  
  // Pointer events for text to avoid overlap issues during fade? (pointer-events-none is on parent anyway)

  return (
    <motion.div
      className="absolute pointer-events-none"
      style={{
        left: x,
        top: y,
        width: w,
        height: h,
        background: block.tone,
        borderTopLeftRadius: tl,
        borderTopRightRadius: tr,
        borderBottomLeftRadius: bl,
        borderBottomRightRadius: br,
        opacity,
        overflow: 'hidden',
      }}
    >
      {/* Sphere 3D Effects Overlay */}
      <motion.div 
        className="absolute inset-0 z-0"
        style={{ opacity: sphereEffectOpacity }}
      >
        {/* Inner Highlight/Shadow using CSS gradients/shadows */}
        <div className="absolute inset-0" style={{ 
            background: 'radial-gradient(circle at 30% 30%, rgba(255,255,255,0.15), transparent 60%)' 
        }} />
        <div className="absolute inset-0" style={{ 
            boxShadow: 'inset -10px -10px 20px rgba(0,0,0,0.1), inset 10px 10px 20px rgba(255,255,255,0.2)' 
        }} />
      </motion.div>

      <motion.div
        style={{ opacity: labelsOpacity, color: textColor, padding }}
        className="w-full h-full flex flex-col relative z-10"
      >
        <motion.div 
            className="w-full h-full flex flex-col relative"
            style={{ 
                justifyContent: kind === 'debt' ? 'center' : flexJustify,
                alignItems: flexAlign,
                scale: contentScale
            }}
        >
            {/* Amount View (Bubble) */}
            <motion.div 
                className="absolute inset-0 flex flex-col justify-center"
                style={{ opacity: amountOpacity, alignItems: flexAlign }}
            >
                <div className="text-[12px] font-medium opacity-90 mb-0.5">{block.name}</div>
                <div className="text-[20px] font-bold tracking-tight leading-none">
                    {formatCny(block.amount)}
                </div>
            </motion.div>

            {/* Percent View (Ratio) */}
            <motion.div 
                 className="absolute inset-0 flex flex-col"
                 style={{ 
                     opacity: percentOpacity, 
                     justifyContent: kind === 'debt' ? 'center' : 'flex-start',
                     alignItems: flexAlign 
                 }}
            >
                 <div className="text-[34px] font-semibold tracking-tight leading-none">
                    {block.percent}
                    <span className="text-[14px] align-top ml-0.5">%</span>
                </div>
                <div className="mt-1 text-[12px] font-medium opacity-85">{block.name}</div>
            </motion.div>

        </motion.div>
      </motion.div>
    </motion.div>
  )
}

export function AssetsScreen(props: {
  grouped: GroupedAccounts
  getIcon: (type: AccountTypeId) => ComponentType<{ size?: number }>
  onEditAccount: (account: Account) => void
  onAddAccount: () => void
  onNavigate: (tab: 'trend' | 'stats' | 'settings') => void
}) {
  const { grouped, getIcon, onEditAccount, onAddAccount, onNavigate } = props

  const viewportRef = useRef<HTMLDivElement | null>(null)
  const scrollerRef = useRef<HTMLDivElement | null>(null)
  const listScrollRef = useRef<HTMLDivElement | null>(null)
  const moreRef = useRef<HTMLDivElement | null>(null)
  const resizeObserverRef = useRef<ResizeObserver | null>(null)
  const measureRafRef = useRef<number | null>(null)
  const groupElsRef = useRef<Partial<Record<GroupId, HTMLDivElement | null>>>({})

  const [selectedType, setSelectedType] = useState<AccountTypeId | null>(null)
  const [expandedGroup, setExpandedGroup] = useState<GroupId | null>(null)
  const [moreOpen, setMoreOpen] = useState(false)
  const [hideAmounts, setHideAmounts] = useState(false)
  const [listRects, setListRects] = useState<Partial<Record<GroupId, Rect>>>({})
  const [viewport, setViewport] = useState({ w: 0, h: 0 })
  const [initialized, setInitialized] = useState(false)
  const [isInitialLoad, setIsInitialLoad] = useState(true)

  // 初始值设为一个大数，确保初始时不会显示动画（会被 useEffect 立即修正）
  const scrollLeft = useMotionValue(99999)

  const accounts = useMemo(() => grouped.groupCards.flatMap((g) => g.accounts), [grouped.groupCards])

  const maskedText = '*****'
  const maskedClass = 'tracking-[0.28em]'

  const scrollToPage = (index: number) => {
    const el = scrollerRef.current
    if (!el) return
    const w = el.clientWidth || 0
    el.scrollTo({ left: w * index, behavior: 'smooth' })
  }

  const scrollIdx = useTransform(scrollLeft, (v) => {
    const w = viewport.w || 1
    return v / w
  })

  // Page 0: Bubble
  // Page 1: Ratio (Blocks)
  // Page 2: List
  // Page 3: Detail
  
  // Transition Ratio(1) -> List(2)
  const ratioProgress = useTransform(scrollIdx, [1, 2], [0, 1])

  // Blocks visible on Page 1-2, fade out quickly on 3
  // Also visible on Page 0 (Bubble)
  const overlayFade = useTransform(scrollIdx, [0, 1, 2, 2.08, 3], [1, 1, 1, 0, 0])
  
  // Bubble chart visibility
  const [isBubblePageActive, setIsBubblePageActive] = useState(true)
  
  useEffect(() => {
    return scrollIdx.on('change', (v) => {
        setIsBubblePageActive(v < 0.8)
    })
  }, [scrollIdx])

  const listHeaderY = useTransform(ratioProgress, [0, 1], [-120, 0])
  const listHeaderOpacity = ratioProgress
  const labelsOpacity = useTransform(ratioProgress, [0, 1], [1, 0])
  const miniBarOpacity = useTransform(ratioProgress, [0, 0.92, 1], [0, 0, 1])
  const miniBarY = useTransform(ratioProgress, [0, 1], [16, 0])
  const listHeaderPointerEvents = useTransform(ratioProgress, (p) => (p < 0.05 ? 'none' : 'auto'))
  const miniBarPointerEvents = useTransform(miniBarOpacity, (o) => (o < 0.2 ? 'none' : 'auto'))

  const blocks = useMemo(() => {
    const byId = new Map<GroupId, { group: AccountGroup; accountsCount: number; total: number }>()
    for (const g of grouped.groupCards) {
      byId.set(g.group.id as GroupId, { group: g.group, accountsCount: g.accounts.length, total: g.total })
    }

    const assetsTotal = grouped.assetsTotal || 0
    const pct = (amount: number, total: number) => (total > 0 ? Math.round((amount / total) * 100) : 0)

    const assetOrder: GroupId[] = ['liquid', 'invest', 'fixed', 'receivable']
    const assets: Block[] = assetOrder
      .map((id) => {
        const g = byId.get(id)
        if (!g) return null
        return {
          id,
          name: g.group.name,
          tone: g.group.tone,
          amount: g.total,
          percent: pct(g.total, assetsTotal),
          darkText: id === 'liquid' || id === 'receivable',
          hasCard: g.accountsCount > 0,
        } satisfies Block
      })
      .filter((v): v is Block => Boolean(v))
      .filter((b) => b.hasCard)

    const debtRaw = byId.get('debt')
    const debt: Block | null = debtRaw
      ? {
          id: 'debt',
          name: debtRaw.group.name,
          tone: debtRaw.group.tone,
          amount: debtRaw.total,
          percent: pct(debtRaw.total, assetsTotal),
          darkText: true,
          hasCard: debtRaw.accountsCount > 0,
        }
      : null

    return { assets, debt: debt && debt.hasCard ? debt : null }
  }, [grouped])

  const bubbleNodes = useMemo(() => {
    const nodes: BubbleNode[] = []
    const groups = grouped.groupCards
    
    // Find max total to scale
    const maxTotal = Math.max(...groups.map(g => g.total), 1)
    const maxRadius = 130 // Base max radius
    
    // Fixed / Liquid / Debt / Invest / Receivable
    for (const g of groups) {
      if (g.total <= 0) continue
      
      // Calculate radius roughly proportional to sqrt of area (value)
      // clamp min size so small assets are still visible bubbles
      const r = Math.sqrt(g.total / maxTotal) * maxRadius
      const radius = Math.max(r, 55)

      nodes.push({
        id: g.group.id,
        radius,
        color: g.group.tone,
        label: g.group.name,
        value: g.total
      })
    }
    return nodes
  }, [grouped.groupCards])

  const bubblePositions = useBubblePhysics(bubbleNodes, viewport.w, viewport.h, isBubblePageActive)

  const ratioLayout = useMemo(() => {
    const top = 64
    const chartH = Math.max(0, viewport.h - top)
    const chartW = viewport.w

    // 判断是否有负债
    const hasDebt = blocks.debt && blocks.debt.amount > 0

    // 如果没有负债，资产占满整个宽度；否则负债占 24%
    const debtW = hasDebt ? Math.round(chartW * 0.24) : 0
    const assetX = debtW
    const assetW = Math.max(0, chartW - debtW)

    const rects: Partial<Record<GroupId, Rect>> = {}

    // 计算负债占资产的百分比
    const assetsTotal = grouped.assetsTotal || 0
    const debtTotal = blocks.debt?.amount || 0
    const debtPercent = assetsTotal > 0 ? debtTotal / assetsTotal : 0

    // 决定哪边是100%高度的基准
    const debtExceeds = debtPercent > 1

    // 计算实际显示高度
    let assetDisplayH: number
    let debtDisplayH: number
    let assetStartY: number
    let debtStartY: number

    if (debtExceeds) {
      // 负债超过100%：负债占满，资产按比例缩小（资产高度 = 100% / 负债百分比）
      debtDisplayH = chartH
      debtStartY = top
      assetDisplayH = chartH / debtPercent
      assetStartY = top // 资产从顶部开始
    } else {
      // 负债不超过100%：资产占满，负债按比例缩小
      assetDisplayH = chartH
      assetStartY = top
      debtDisplayH = chartH * debtPercent
      debtStartY = top + chartH - debtDisplayH // 负债底部对齐，与资产底部平齐
    }

    if (hasDebt && blocks.debt) {
      rects.debt = { x: 0, y: debtStartY, w: debtW, h: debtDisplayH }
    }

    const ratioAssets = blocks.assets.filter((b) => b.amount > 0)
    const total = ratioAssets.reduce((s, b) => s + b.amount, 0)

    // 最小高度阈值（确保文字可见）
    const minHeight = 52
    // 圆角延伸高度（用于填充下方色块圆角处的空缺）
    const cornerExtend = 32

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

      // 非最后的资产向下延伸一段，以填充下方色块圆角处的空缺
      const extendedHeight = isLast ? height : height + cornerExtend

      rects[b.id] = { x: assetX, y, w: assetW, h: Math.max(0, extendedHeight) }
      y += height // 下一个色块的起始位置不变，仍然使用原始高度计算
    }

    return {
      rects,
      topAssetId: ratioAssets.at(0)?.id ?? null,
      bottomAssetId: ratioAssets.at(-1)?.id ?? null,
      debtExceeds,
      assetDisplayH,
      assetStartY,
      hasDebt,
    }
  }, [blocks, grouped.assetsTotal, viewport.h, viewport.w])

  const blockKinds = useMemo(() => {
    const kinds: Partial<Record<GroupId, CornerKind>> = {}
    if (blocks.debt) kinds.debt = 'debt'
    const singleAsset = Boolean(ratioLayout.topAssetId && ratioLayout.topAssetId === ratioLayout.bottomAssetId)
    const hasDebt = ratioLayout.hasDebt

    for (const b of blocks.assets) {
      if (singleAsset && b.id === ratioLayout.topAssetId) {
        kinds[b.id] = hasDebt ? 'assetOnly' : 'assetOnlyNoDebt'
      } else if (b.id === ratioLayout.topAssetId) {
        kinds[b.id] = hasDebt ? 'assetTop' : 'assetTopNoDebt'
      } else if (b.id === ratioLayout.bottomAssetId) {
        kinds[b.id] = hasDebt ? 'assetBottom' : 'assetBottomNoDebt'
      } else {
        kinds[b.id] = hasDebt ? 'assetMiddle' : 'assetMiddleNoDebt'
      }
    }
    return kinds
  }, [blocks.assets, blocks.debt, ratioLayout.bottomAssetId, ratioLayout.topAssetId, ratioLayout.hasDebt])

  const measureListRects = useCallback(() => {
    const root = viewportRef.current
    if (!root) return

    const w = root.clientWidth || 1
    const idx = scrollLeft.get() / w
    // Measure only when near list page (index 2)
    if (Math.abs(idx - 2) > 0.12) return

    const rootRect = root.getBoundingClientRect()
    const next: Partial<Record<GroupId, Rect>> = {}

    for (const id of Object.keys(groupElsRef.current) as GroupId[]) {
      const el = groupElsRef.current[id]
      if (!el) continue
      const r = el.getBoundingClientRect()
      next[id] = {
        x: 0,
        y: r.top - rootRect.top,
        w: r.width,
        h: r.height,
      }
    }

    setListRects(next)
  }, [scrollLeft])

  const scheduleMeasure = useCallback(() => {
    if (measureRafRef.current) cancelAnimationFrame(measureRafRef.current)
    measureRafRef.current = requestAnimationFrame(() => measureListRects())
  }, [measureListRects])

  const onGroupEl = useCallback(
    (id: GroupId, el: HTMLDivElement | null) => {
      const ro = resizeObserverRef.current
      const prev = groupElsRef.current[id]

      if (ro && prev) ro.unobserve(prev)
      groupElsRef.current[id] = el
      if (ro && el) ro.observe(el)

      scheduleMeasure()
    },
    [scheduleMeasure],
  )

  useEffect(() => {
    const el = viewportRef.current
    if (!el) return

    const update = () => setViewport({ w: el.clientWidth, h: el.clientHeight })
    update()

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', update)
      return () => window.removeEventListener('resize', update)
    }

    const ro = new ResizeObserver(() => update())
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    if (typeof ResizeObserver === 'undefined') return

    const ro = new ResizeObserver(() => scheduleMeasure())
    resizeObserverRef.current = ro

    for (const id of Object.keys(groupElsRef.current) as GroupId[]) {
      const el = groupElsRef.current[id]
      if (el) ro.observe(el)
    }

    return () => {
      ro.disconnect()
      resizeObserverRef.current = null
    }
  }, [scheduleMeasure])

  useEffect(() => {
    if (!moreOpen) return

    const onPointerDown = (e: PointerEvent) => {
      const root = moreRef.current
      if (!root) return
      if (e.target instanceof Node && root.contains(e.target)) return
      setMoreOpen(false)
    }

    document.addEventListener('pointerdown', onPointerDown, { capture: true })
    return () => document.removeEventListener('pointerdown', onPointerDown, { capture: true })
  }, [moreOpen])

  useEffect(() => {
    const el = scrollerRef.current
    if (!el) return

    const raf = requestAnimationFrame(() => {
      const w = el.clientWidth || 0
      if (w <= 0) return
      // Start at Page 2 (List) - 直接设置，不触发动画
      el.scrollLeft = w * 2
      scrollLeft.set(w * 2)
      // 标记初始化完成
      setInitialized(true)
      // 启动动画完成后（约600ms），重置 isInitialLoad
      setTimeout(() => setIsInitialLoad(false), 700)
    })

    return () => cancelAnimationFrame(raf)
  }, [scrollLeft])

  useEffect(() => {
    const el = scrollerRef.current
    if (!el) return

    let raf = 0
    const onScroll = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        const w = el.clientWidth || 1
        const currentScroll = el.scrollLeft
        const maxScroll = w * 2 // 最大只能滑到 Page 2（主页），不能滑到 Page 3

        // 如果没有选中类型，限制滚动范围不超过 Page 2
        if (!selectedType && currentScroll > maxScroll) {
          el.scrollLeft = maxScroll
          scrollLeft.set(maxScroll)
        } else {
          scrollLeft.set(currentScroll)
        }
      })
    }

    el.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      cancelAnimationFrame(raf)
      el.removeEventListener('scroll', onScroll)
    }
  }, [scrollLeft, selectedType])

  useEffect(() => {
    const el = listScrollRef.current
    if (!el) return

    let raf = 0
    const onScroll = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => scheduleMeasure())
    }

    el.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      cancelAnimationFrame(raf)
      el.removeEventListener('scroll', onScroll)
    }
  }, [scheduleMeasure])

  useEffect(() => scheduleMeasure(), [expandedGroup, scheduleMeasure])

  const chartRadius = 32
  const listRadius = 30

  // 计算负债上方的白色填充块（负债比例低于100%时）
  const debtFillerRect = useMemo(() => {
    if (!blocks.debt || ratioLayout.debtExceeds) return null
    const debtRect = ratioLayout.rects.debt
    if (!debtRect) return null
    
    const top = 64
    const fillerH = debtRect.y - top
    if (fillerH <= 0) return null
    
    return { x: 0, y: top, w: debtRect.w, h: fillerH }
  }, [blocks.debt, ratioLayout])

  // 计算资产底部的白色填充块（负债比例超过100%时）
  const assetFillerRect = useMemo(() => {
    if (!blocks.debt || !ratioLayout.debtExceeds) return null
    
    const top = 64
    const chartH = Math.max(0, viewport.h - top)
    const debtW = Math.round(viewport.w * 0.24)
    const assetX = debtW
    const assetW = Math.max(0, viewport.w - debtW)
    
    const assetEndY = ratioLayout.assetStartY + ratioLayout.assetDisplayH
    const fillerH = top + chartH - assetEndY
    if (fillerH <= 0) return null
    
    return { x: assetX, y: assetEndY, w: assetW, h: fillerH }
  }, [blocks.debt, ratioLayout, viewport.h, viewport.w])

  // 负债上方白色填充块的动画值
  const debtFillerLeft = useTransform(scrollIdx, (idx) => {
    if (!debtFillerRect) return 0
    if (idx < 2) return 0
    return lerp(debtFillerRect.x, 0, Math.max(0, idx - 2))
  })
  const debtFillerTop = useTransform(scrollIdx, (idx) => {
    if (!debtFillerRect) return 0
    if (idx < 2) return lerp(0, debtFillerRect.y, Math.max(0, idx - 1))
    return debtFillerRect.y
  })
  const debtFillerWidth = useTransform(scrollIdx, (idx) => {
    if (!debtFillerRect) return 0
    if (idx < 2) return lerp(0, debtFillerRect.w, Math.max(0, idx - 1))
    return debtFillerRect.w
  })
  const debtFillerHeight = useTransform(scrollIdx, (idx) => {
    if (!debtFillerRect) return 0
    if (idx < 2) return lerp(0, debtFillerRect.h, Math.max(0, idx - 1))
    return lerp(debtFillerRect.h, 0, Math.max(0, idx - 2))
  })
  // 白色填充块只在 ratio 页面（page 1）显示，在 list 页面（page 2）完全隐藏
  const debtFillerOpacity = useTransform(scrollIdx, [0.8, 1, 1.8, 2], [0, 1, 0.5, 0])

  // 资产底部白色填充块的动画值
  const assetFillerLeft = useTransform(scrollIdx, (idx) => {
    if (!assetFillerRect) return 0
    if (idx < 2) return lerp(0, assetFillerRect.x, Math.max(0, idx - 1))
    return assetFillerRect.x
  })
  const assetFillerTop = useTransform(scrollIdx, (idx) => {
    if (!assetFillerRect) return 0
    if (idx < 2) return lerp(0, assetFillerRect.y, Math.max(0, idx - 1))
    return assetFillerRect.y
  })
  const assetFillerWidth = useTransform(scrollIdx, (idx) => {
    if (!assetFillerRect) return 0
    if (idx < 2) return lerp(0, assetFillerRect.w, Math.max(0, idx - 1))
    return assetFillerRect.w
  })
  const assetFillerHeight = useTransform(scrollIdx, (idx) => {
    if (!assetFillerRect) return 0
    if (idx < 2) return lerp(0, assetFillerRect.h, Math.max(0, idx - 1))
    return lerp(assetFillerRect.h, 0, Math.max(0, idx - 2))
  })
  // 白色填充块只在 ratio 页面（page 1）显示，在 list 页面（page 2）完全隐藏
  const assetFillerOpacity = useTransform(scrollIdx, [0.8, 1, 1.8, 2], [0, 1, 0.5, 0])

  return (
    <div ref={viewportRef} className="relative w-full h-full overflow-hidden" style={{ background: 'var(--bg)' }}>
      {/* 只有初始化完成后才显示 overlay 块，带启动动画 */}
      {initialized ? (
        <motion.div
          className="absolute inset-0 z-0 pointer-events-none"
          initial={{ x: -100, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] }}
        >
          {/* 负债上方的白色填充块（负债比例低于100%时） */}
          {debtFillerRect ? (
          <motion.div
            className="absolute pointer-events-none"
            style={{
              left: debtFillerLeft,
              top: debtFillerTop,
              width: debtFillerWidth,
              height: debtFillerHeight,
              background: 'white',
              borderTopLeftRadius: chartRadius,
              borderTopRightRadius: chartRadius,
              opacity: debtFillerOpacity,
            }}
          />
        ) : null}

        {/* 资产底部的白色填充块（负债比例超过100%时） */}
        {assetFillerRect ? (
          <motion.div
            className="absolute pointer-events-none"
            style={{
              left: assetFillerLeft,
              top: assetFillerTop,
              width: assetFillerWidth,
              height: assetFillerHeight,
              background: 'white',
              borderTopRightRadius: chartRadius,
              borderBottomRightRadius: chartRadius,
              opacity: assetFillerOpacity,
            }}
          />
        ) : null}

        {blocks.debt ? (
          <OverlayBlock
            key="debt"
            block={blocks.debt}
            kind="debt"
            ratioRect={ratioLayout.rects.debt}
            listRect={listRects.debt}
            bubblePos={bubblePositions.get('debt')}
            bubbleRadius={bubbleNodes.find(n => n.id === 'debt')?.radius}
            scrollIdx={scrollIdx}
            overlayFade={overlayFade}
            labelsOpacity={labelsOpacity}
            chartRadius={chartRadius}
            listRadius={listRadius}
          />
        ) : null}

        {/* 顶部色块先渲染，按顺序渲染
            每个色块向下延伸的部分垫在下方色块的圆角处 */}
        {blocks.assets.map((b) => (
          <OverlayBlock
            key={b.id}
            block={b}
            kind={blockKinds[b.id] ?? 'assetMiddle'}
            ratioRect={ratioLayout.rects[b.id]}
            listRect={listRects[b.id]}
            bubblePos={bubblePositions.get(b.id)}
            bubbleRadius={bubbleNodes.find(n => n.id === b.id)?.radius}
            scrollIdx={scrollIdx}
            overlayFade={overlayFade}
            labelsOpacity={labelsOpacity}
            chartRadius={chartRadius}
            listRadius={listRadius}
          />
        ))}
        </motion.div>
      ) : null}

      <motion.div className="absolute inset-x-0 top-0 z-20 px-4 pt-6 pointer-events-none" style={{ opacity: overlayFade }}>
        <motion.div
          className="flex items-start justify-between gap-3"
          style={{ y: listHeaderY, opacity: listHeaderOpacity, pointerEvents: listHeaderPointerEvents }}
        >
          {/* 净资产标题 - 从上滑入 */}
          <motion.div
            className="min-w-0"
            initial={isInitialLoad ? { y: -50, opacity: 0 } : false}
            animate={initialized ? { y: 0, opacity: 1 } : false}
            transition={{ duration: 0.5, delay: 0.15, ease: [0.25, 0.46, 0.45, 0.94] }}
          >
            <div className="flex items-center gap-2 text-[12px] font-medium text-slate-500/80">
              <span>我的净资产 (CNY)</span>
              <button
                type="button"
                className="w-6 h-6 -m-1 rounded-full flex items-center justify-center text-slate-400 hover:bg-black/5"
                onClick={() => setHideAmounts((v) => !v)}
                aria-label={hideAmounts ? 'show amounts' : 'hide amounts'}
              >
                {hideAmounts ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
            <div className="mt-1 text-[34px] font-semibold tracking-tight text-slate-900">
              {hideAmounts ? <span className={maskedClass}>{maskedText}</span> : formatCny(grouped.netWorth)}
            </div>
          </motion.div>

          {/* 添加按钮 - 从上滑入，稍微延迟 */}
          <motion.button
            type="button"
            onClick={onAddAccount}
            className="w-10 h-10 rounded-full bg-[#eae9ff] text-[#4f46e5] flex items-center justify-center shadow-sm"
            aria-label="add"
            initial={isInitialLoad ? { y: -50, opacity: 0 } : false}
            animate={initialized ? { y: 0, opacity: 1 } : false}
            transition={{ duration: 0.5, delay: 0.2, ease: [0.25, 0.46, 0.45, 0.94] }}
          >
            <Plus size={22} strokeWidth={2.75} />
          </motion.button>
        </motion.div>
      </motion.div>

      <motion.div className="absolute left-4 bottom-4 z-20 pointer-events-none" style={{ opacity: overlayFade }}>
        <motion.div style={{ opacity: miniBarOpacity, y: miniBarY, pointerEvents: miniBarPointerEvents }}>
          <div ref={moreRef} className="relative">
            <div className="flex items-center gap-1 bg-white/80 backdrop-blur-md border border-white/70 shadow-sm rounded-full p-1">
              <button
                type="button"
                className="w-11 h-11 rounded-full flex items-center justify-center text-slate-700 hover:bg-black/5"
                onClick={() => onNavigate('stats')}
                aria-label="stats"
              >
                <BarChart3 size={20} strokeWidth={2.3} />
              </button>
              <button
                type="button"
                className="w-11 h-11 rounded-full flex items-center justify-center text-slate-700 hover:bg-black/5"
                onClick={() => onNavigate('trend')}
                aria-label="trend"
              >
                <TrendingUp size={20} strokeWidth={2.3} />
              </button>
              <button
                type="button"
                className="w-11 h-11 rounded-full flex items-center justify-center text-slate-700 hover:bg-black/5"
                onClick={() => setMoreOpen((v) => !v)}
                aria-label="more"
              >
                <MoreHorizontal size={20} strokeWidth={2.3} />
              </button>
            </div>

            <AnimatePresence>
              {moreOpen ? (
                <motion.div
                  key="menu"
                  initial={{ opacity: 0, y: 8, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 8, scale: 0.98 }}
                  transition={{ duration: 0.15 }}
                  className="absolute left-0 bottom-full mb-2 min-w-[160px] rounded-[18px] bg-white/90 backdrop-blur-md border border-white/70 shadow-[var(--shadow-hover)] overflow-hidden"
                >
                  <button
                    type="button"
                    className="w-full px-4 py-3 text-left text-[13px] font-medium text-slate-800 hover:bg-black/5"
                    onClick={() => {
                      setMoreOpen(false)
                      onNavigate('settings')
                    }}
                  >
                    设置
                  </button>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>
        </motion.div>
      </motion.div>

      <div
        ref={scrollerRef}
        className="relative z-10 w-full h-full overflow-x-auto snap-x snap-mandatory flex scrollbar-hide overscroll-x-contain scroll-smooth"
        style={{ WebkitOverflowScrolling: 'touch' }}
      >
        <div className="w-full h-full flex-shrink-0 snap-center snap-always overflow-y-hidden" style={{ touchAction: 'pan-x' }}>
          <div className="w-full h-full relative">
            <BubbleChartPage
              isActive={isBubblePageActive}
              onNext={() => scrollToPage(1)}
            />
          </div>
        </div>

        <div className="w-full h-full flex-shrink-0 snap-center snap-always overflow-y-hidden" style={{ touchAction: 'pan-x' }}>
          <AssetsRatioPage onBack={() => scrollToPage(2)} />
        </div>

        <div className="w-full h-full flex-shrink-0 snap-center snap-always overflow-y-hidden">
          <AssetsListPage
            grouped={grouped}
            getIcon={getIcon}
            onPickType={(type) => {
              setSelectedType(type)
              scrollToPage(3)
            }}
            expandedGroup={expandedGroup}
            onToggleGroup={(id) => setExpandedGroup((current) => (current === id ? null : id))}
            hideAmounts={hideAmounts}
            scrollRef={listScrollRef}
            onGroupEl={onGroupEl}
            isInitialLoad={isInitialLoad}
          />
        </div>

        <div className="w-full h-full flex-shrink-0 snap-center snap-always overflow-y-auto">
          <AssetsTypeDetailPage
            type={selectedType}
            accounts={accounts}
            getIcon={getIcon}
            hideAmounts={hideAmounts}
            onBack={() => {
              scrollToPage(2)
              setSelectedType(null)
            }}
            onEditAccount={onEditAccount}
          />
        </div>
      </div>
    </div>
  )
}
