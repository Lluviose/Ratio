import { AnimatePresence, motion, useMotionValue, useTransform, type MotionValue } from 'framer-motion'
import { BarChart3, Eye, EyeOff, MoreHorizontal, Plus, TrendingUp } from 'lucide-react'
import { type ComponentType, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Account, AccountGroup, AccountTypeId } from '../lib/accounts'
import { formatCny } from '../lib/format'
import { AssetsListPage } from './AssetsListPage'
import { AssetsRatioPage } from './AssetsRatioPage'
import { AssetsTypeDetailPage } from './AssetsTypeDetailPage'

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

type CornerKind = 'debt' | 'assetTop' | 'assetMiddle' | 'assetBottom' | 'assetOnly'

function OverlayBlock(props: {
  block: OverlayBlockModel
  kind: CornerKind
  ratioRect?: Rect
  listRect?: Rect
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
    scrollIdx,
    overlayFade,
    labelsOpacity,
    chartRadius,
    listRadius,
  } = props

  const ratio = ratioRect ?? listRect ?? { x: 0, y: 0, w: 0, h: 0 }
  const list = listRect ?? ratioRect ?? ratio

  const hasRatio = Boolean(ratioRect && ratioRect.w > 0 && ratioRect.h > 0)
  const hasList = Boolean(listRect && listRect.w > 0 && listRect.h > 0)

  const visibleRatio = hasRatio ? 1 : 0
  const visibleList = hasList ? 1 : hasRatio ? 1 : 0
  const visible = useTransform(scrollIdx, (idx) => {
    return lerp(visibleRatio, visibleList, Math.max(0, idx))
  })
  const opacity = useTransform([overlayFade, visible], (values) => {
    const [a, b] = values as number[]
    return a * b
  })

  const x = useTransform(scrollIdx, (idx) => {
    return lerp(ratio.x, list.x, Math.max(0, idx))
  })
  const y = useTransform(scrollIdx, (idx) => {
    return lerp(ratio.y, list.y, Math.max(0, idx))
  })
  const w = useTransform(scrollIdx, (idx) => {
    return lerp(ratio.w, list.w, Math.max(0, idx))
  })
  const h = useTransform(scrollIdx, (idx) => {
    return lerp(ratio.h, list.h, Math.max(0, idx))
  })

  const ratioCorner =
    kind === 'debt'
      ? { tl: chartRadius, tr: 0, bl: chartRadius, br: 0 }
      : kind === 'assetOnly'
        ? { tl: 0, tr: chartRadius, bl: 0, br: chartRadius }
      : kind === 'assetTop'
        ? { tl: 0, tr: chartRadius, bl: 0, br: 0 }
        : kind === 'assetBottom'
          ? { tl: 0, tr: 0, bl: 0, br: chartRadius }
          : { tl: 0, tr: 0, bl: 0, br: 0 }

  const listCorner = { tl: listRadius, tr: listRadius, bl: listRadius, br: listRadius }

  const tl = useTransform(scrollIdx, (idx) => {
    return lerp(ratioCorner.tl, listCorner.tl, Math.max(0, idx))
  })
  const tr = useTransform(scrollIdx, (idx) => {
    return lerp(ratioCorner.tr, listCorner.tr, Math.max(0, idx))
  })
  const bl = useTransform(scrollIdx, (idx) => {
    return lerp(ratioCorner.bl, listCorner.bl, Math.max(0, idx))
  })
  const br = useTransform(scrollIdx, (idx) => {
    return lerp(ratioCorner.br, listCorner.br, Math.max(0, idx))
  })

  const textColor = block.darkText ? 'rgba(11, 15, 26, 0.92)' : 'rgba(255,255,255,0.96)'

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
      <motion.div
        style={{ opacity: labelsOpacity, color: textColor }}
        className="w-full h-full"
      >
        {kind === 'debt' ? (
          <div className="h-full flex flex-col justify-center p-4">
            <div className="text-[34px] font-semibold tracking-tight leading-none">
              {block.percent}
              <span className="text-[14px] align-top ml-0.5">%</span>
            </div>
            <div className="mt-1 text-[12px] font-medium opacity-85">{block.name}</div>
          </div>
        ) : (
          <div className="p-4">
            <div className="text-[38px] font-semibold tracking-tight leading-none">
              {block.percent}
              <span className="text-[14px] align-top ml-0.5">%</span>
            </div>
            <div className="mt-1 text-[12px] font-medium opacity-85">{block.name}</div>
          </div>
        )}
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

  // Page 0: Ratio (Blocks)
  // Page 1: List
  // Page 2: Detail
  
  // Transition Ratio(0) -> List(1)
  const ratioProgress = useTransform(scrollIdx, [0, 1], [0, 1])

  // Blocks visible on Page 0-1, fade out quickly on 2
  const overlayFade = useTransform(scrollIdx, [0, 1, 1.08, 2], [1, 1, 0, 0])

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

  const ratioLayout = useMemo(() => {
    const top = 64
    const chartH = Math.max(0, viewport.h - top)
    const chartW = viewport.w
    // 色块只占屏幕左侧约1/6
    const debtW = Math.round(chartW * 0.08)
    const assetX = debtW
    const assetW = Math.round(chartW * 0.08)

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
    
    if (blocks.debt) {
      rects.debt = { x: 0, y: debtStartY, w: debtW, h: debtDisplayH }
    }

    const ratioAssets = blocks.assets.filter((b) => b.amount > 0)
    const total = ratioAssets.reduce((s, b) => s + b.amount, 0)
    
    // 最小高度阈值（确保文字可见）
    const minHeight = 52
    
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
    
    // 第三遍：分配最终高度
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
      
      rects[b.id] = { x: assetX, y, w: assetW, h: Math.max(0, height) }
      y += height
    }

    return {
      rects,
      topAssetId: ratioAssets.at(0)?.id ?? null,
      bottomAssetId: ratioAssets.at(-1)?.id ?? null,
      debtExceeds,
      assetDisplayH,
      assetStartY,
    }
  }, [blocks, grouped.assetsTotal, viewport.h, viewport.w])

  const blockKinds = useMemo(() => {
    const kinds: Partial<Record<GroupId, CornerKind>> = {}
    if (blocks.debt) kinds.debt = 'debt'
    const singleAsset = Boolean(ratioLayout.topAssetId && ratioLayout.topAssetId === ratioLayout.bottomAssetId)
    for (const b of blocks.assets) {
      if (singleAsset && b.id === ratioLayout.topAssetId) kinds[b.id] = 'assetOnly'
      else if (b.id === ratioLayout.topAssetId) kinds[b.id] = 'assetTop'
      else if (b.id === ratioLayout.bottomAssetId) kinds[b.id] = 'assetBottom'
      else kinds[b.id] = 'assetMiddle'
    }
    return kinds
  }, [blocks.assets, blocks.debt, ratioLayout.bottomAssetId, ratioLayout.topAssetId])

  const measureListRects = useCallback(() => {
    const root = viewportRef.current
    if (!root) return

    const w = root.clientWidth || 1
    const idx = scrollLeft.get() / w
    // Measure only when near list page (index 1)
    if (Math.abs(idx - 1) > 0.12) return

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
      // Start at Page 1 (List) - 直接设置，不触发动画
      el.scrollLeft = w * 1
      scrollLeft.set(w * 1)
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
      raf = requestAnimationFrame(() => scrollLeft.set(el.scrollLeft))
    }

    el.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      cancelAnimationFrame(raf)
      el.removeEventListener('scroll', onScroll)
    }
  }, [scrollLeft])

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



  // 计算资产底部的白色填充块（负债比例超过100%时）
  const assetFillerRect = useMemo(() => {
    if (!blocks.debt || !ratioLayout.debtExceeds) return null
    
    const top = 64
    const chartH = Math.max(0, viewport.h - top)
    const debtW = Math.round(viewport.w * 0.08)
    const assetX = debtW
    const assetW = Math.round(viewport.w * 0.08)
    
    const assetEndY = ratioLayout.assetStartY + ratioLayout.assetDisplayH
    const fillerH = top + chartH - assetEndY
    if (fillerH <= 0) return null
    
    return { x: assetX, y: assetEndY, w: assetW, h: fillerH }
  }, [blocks.debt, ratioLayout, viewport.h, viewport.w])



  // 资产底部白色填充块的动画值
  const assetFillerLeft = useTransform(scrollIdx, (idx) => {
    if (!assetFillerRect) return 0
    if (idx < 1) return lerp(0, assetFillerRect.x, Math.max(0, idx))
    return assetFillerRect.x
  })
  const assetFillerTop = useTransform(scrollIdx, (idx) => {
    if (!assetFillerRect) return 0
    if (idx < 1) return lerp(0, assetFillerRect.y, Math.max(0, idx))
    return assetFillerRect.y
  })
  const assetFillerWidth = useTransform(scrollIdx, (idx) => {
    if (!assetFillerRect) return 0
    if (idx < 1) return lerp(0, assetFillerRect.w, Math.max(0, idx))
    return assetFillerRect.w
  })
  const assetFillerHeight = useTransform(scrollIdx, (idx) => {
    if (!assetFillerRect) return 0
    if (idx < 1) return lerp(0, assetFillerRect.h, Math.max(0, idx))
    return lerp(assetFillerRect.h, 0, Math.max(0, idx - 1))
  })
  const assetFillerOpacity = useTransform(scrollIdx, [0, 0.4, 1, 2, 2.08], [0, 0, 1, 1, 0])

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
            scrollIdx={scrollIdx}
            overlayFade={overlayFade}
            labelsOpacity={labelsOpacity}
            chartRadius={chartRadius}
            listRadius={listRadius}
          />
        ) : null}

        {blocks.assets.map((b) => (
          <OverlayBlock
            key={b.id}
            block={b}
            kind={blockKinds[b.id] ?? 'assetMiddle'}
            ratioRect={ratioLayout.rects[b.id]}
            listRect={listRects[b.id]}
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
          <AssetsRatioPage onBack={() => scrollToPage(1)} />
        </div>

        <div className="w-full h-full flex-shrink-0 snap-center snap-always overflow-y-hidden">
          <AssetsListPage
            grouped={grouped}
            getIcon={getIcon}
            onPickType={(type) => {
              setSelectedType(type)
              scrollToPage(2)
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
              scrollToPage(1)
              setSelectedType(null)
            }}
            onEditAccount={onEditAccount}
          />
        </div>
      </div>
    </div>
  )
}
