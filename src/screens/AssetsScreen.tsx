import { AnimatePresence, motion, useMotionValue, useTransform, type MotionValue } from 'framer-motion'
import { BarChart3, Eye, EyeOff, MoreHorizontal, Plus, TrendingUp } from 'lucide-react'
import { type ComponentType, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Account, AccountGroup, AccountTypeId } from '../lib/accounts'
import { formatCny } from '../lib/format'
import { AssetsListPage } from './AssetsListPage'
import { AssetsRosePage } from './AssetsRosePage'
import { AssetsRatioPage } from './AssetsRatioPage'
import { AssetsTypeDetailPage } from './AssetsTypeDetailPage'

export type GroupedAccounts = {
  groupCards: Array<{ group: AccountGroup; accounts: Account[]; total: number }>
  assetsTotal: number
  debtTotal: number
  netWorth: number
}

type GroupId = 'liquid' | 'invest' | 'fixed' | 'receivable' | 'debt'
type OverlayId = GroupId | 'networth'

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

type NetWorthBlock = Omit<Block, 'id'> & { id: 'networth' }
type OverlayBlockModel = Block | NetWorthBlock

type CornerKind = 'debt' | 'assetTop' | 'assetMiddle' | 'assetBottom' | 'assetOnly'

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t
}

function OverlayBlock(props: {
  block: OverlayBlockModel
  kind: CornerKind
  roseRect?: Rect
  roseRotate?: number
  ratioRect?: Rect
  listRect?: Rect
  scrollIdx: MotionValue<number>
  overlayFade: MotionValue<number>
  labelsOpacity: MotionValue<number>
  labelScale: MotionValue<number>
  chartRadius: number
  listRadius: number
}) {
  const {
    block,
    kind,
    roseRect,
    roseRotate = 0,
    ratioRect,
    listRect,
    scrollIdx,
    overlayFade,
    labelsOpacity,
    labelScale,
    chartRadius,
    listRadius,
  } = props

  const ratio = ratioRect ?? roseRect ?? listRect ?? { x: 0, y: 0, w: 0, h: 0 }
  const list = listRect ?? ratioRect ?? roseRect ?? ratio
  const rose = roseRect ?? ratioRect ?? listRect ?? ratio

  const isExtra = block.id === 'networth'
  const hasRose = Boolean(roseRect && roseRect.w > 0 && roseRect.h > 0)
  const hasRatio = Boolean(ratioRect && ratioRect.w > 0 && ratioRect.h > 0)
  const hasList = Boolean(listRect && listRect.w > 0 && listRect.h > 0)

  const visibleRose = hasRose ? 1 : 0
  const visibleRatio = isExtra ? 0 : hasRatio ? 1 : 0
  const visibleList = isExtra ? 0 : hasList ? 1 : hasRatio ? 1 : 0
  const visible = useTransform(scrollIdx, (idx) => {
    if (idx < 1) return lerp(visibleRose, visibleRatio, Math.max(0, idx))
    return lerp(visibleRatio, visibleList, Math.max(0, idx - 1))
  })
  const opacity = useTransform([overlayFade, visible], (values) => {
    const [a, b] = values as number[]
    return a * b
  })

  const x = useTransform(scrollIdx, (idx) => {
    if (idx < 1) return lerp(rose.x, ratio.x, Math.max(0, idx))
    return lerp(ratio.x, list.x, Math.max(0, idx - 1))
  })
  const y = useTransform(scrollIdx, (idx) => {
    if (idx < 1) return lerp(rose.y, ratio.y, Math.max(0, idx))
    return lerp(ratio.y, list.y, Math.max(0, idx - 1))
  })
  const w = useTransform(scrollIdx, (idx) => {
    if (idx < 1) return lerp(rose.w, ratio.w, Math.max(0, idx))
    return lerp(ratio.w, list.w, Math.max(0, idx - 1))
  })
  const h = useTransform(scrollIdx, (idx) => {
    if (idx < 1) return lerp(rose.h, ratio.h, Math.max(0, idx))
    return lerp(ratio.h, list.h, Math.max(0, idx - 1))
  })

  const rotate = useTransform(scrollIdx, (idx) => {
    if (idx < 1) return lerp(roseRotate, 0, Math.max(0, idx))
    return 0
  })

  const roseRadius = Math.max(0, (rose.h || 0) / 2)
  const roseCorner = { tl: roseRadius, tr: roseRadius, bl: roseRadius, br: roseRadius }
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
    if (idx < 1) return lerp(roseCorner.tl, ratioCorner.tl, Math.max(0, idx))
    return lerp(ratioCorner.tl, listCorner.tl, Math.max(0, idx - 1))
  })
  const tr = useTransform(scrollIdx, (idx) => {
    if (idx < 1) return lerp(roseCorner.tr, ratioCorner.tr, Math.max(0, idx))
    return lerp(ratioCorner.tr, listCorner.tr, Math.max(0, idx - 1))
  })
  const bl = useTransform(scrollIdx, (idx) => {
    if (idx < 1) return lerp(roseCorner.bl, ratioCorner.bl, Math.max(0, idx))
    return lerp(ratioCorner.bl, listCorner.bl, Math.max(0, idx - 1))
  })
  const br = useTransform(scrollIdx, (idx) => {
    if (idx < 1) return lerp(roseCorner.br, ratioCorner.br, Math.max(0, idx))
    return lerp(ratioCorner.br, listCorner.br, Math.max(0, idx - 1))
  })

  const textColor = block.darkText ? 'rgba(11, 15, 26, 0.92)' : 'rgba(255,255,255,0.96)'
  const labelRotate = useTransform(rotate, (r) => -r)

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
        rotate,
      }}
    >
      <motion.div
        style={{ opacity: labelsOpacity, color: textColor, rotate: labelRotate, scale: labelScale }}
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

  const scrollLeft = useMotionValue(0)

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

  // Page 0: Rose
  // Page 1: Ratio (Blocks)
  // Page 2: List
  // Page 3: Detail
  
  // Transition Ratio(1) -> List(2)
  // Clamp at 0 for Rose page to keep Ratio styles (blocks morph via scrollIdx)
  const ratioProgress = useTransform(scrollIdx, [0, 1, 2], [0, 0, 1])

  // Blocks visible on Page 0-2, fade out quickly on 3
  const overlayFade = useTransform(scrollIdx, [0, 2, 2.08, 3], [1, 1, 0, 0])

  const listHeaderY = useTransform(ratioProgress, [0, 1], [-120, 0])
  const listHeaderOpacity = ratioProgress
  const labelsOpacity = useTransform(ratioProgress, [0, 1], [1, 0])
  const labelScale = useTransform(scrollIdx, [0, 1, 2], [0.74, 1, 1])
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

  const netWorthBlock: NetWorthBlock | null = useMemo(() => {
    const assetsTotal = grouped.assetsTotal || 0
    const netWorth = grouped.netWorth || 0
    if (assetsTotal <= 0 || netWorth <= 0) return null

    return {
      id: 'networth',
      name: '净资产',
      tone: 'linear-gradient(135deg, #4f46e5 0%, #818cf8 100%)',
      amount: netWorth,
      percent: Math.round((netWorth / assetsTotal) * 100),
      darkText: false,
      hasCard: true,
    }
  }, [grouped.assetsTotal, grouped.netWorth])

  const ratioLayout = useMemo(() => {
    const top = 64
    const chartH = Math.max(0, viewport.h - top)
    const chartW = viewport.w
    const debtW = Math.round(chartW * 0.24)
    const assetX = debtW
    const assetW = Math.max(0, chartW - debtW)

    const rects: Partial<Record<GroupId, Rect>> = {}
    if (blocks.debt) rects.debt = { x: 0, y: top, w: debtW, h: chartH }

    const ratioAssets = blocks.assets.filter((b) => b.amount > 0)
    const total = ratioAssets.reduce((s, b) => s + b.amount, 0)
    let y = top

    for (let i = 0; i < ratioAssets.length; i += 1) {
      const b = ratioAssets[i]
      const isLast = i === ratioAssets.length - 1
      const rawH = total > 0 ? (chartH * b.amount) / total : 0
      const height = isLast ? top + chartH - y : rawH
      rects[b.id] = { x: assetX, y, w: assetW, h: Math.max(0, height) }
      y += height
    }

    return {
      rects,
      topAssetId: ratioAssets.at(0)?.id ?? null,
      bottomAssetId: ratioAssets.at(-1)?.id ?? null,
    }
  }, [blocks, viewport.h, viewport.w])

  const roseLayout = useMemo(() => {
    const top = 64
    const chartH = Math.max(0, viewport.h - top)
    const chartW = viewport.w
    const cx = chartW / 2
    const cy = top + chartH / 2

    const r = Math.max(0, Math.min(chartW, chartH) / 2 - 26)
    const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))
    const sqrt01 = (v: number) => Math.sqrt(clamp(v, 0, 1))

    const gap = 16
    const outerBase = r * 0.58
    const innerBase = r * 0.32
    const innerAvail = Math.max(0, outerBase - gap - innerBase)
    const outerAvail = Math.max(0, r - outerBase)

    const outerThickness = clamp(Math.round(r * 0.28), 56, 86)
    const innerThickness = clamp(Math.round(r * 0.22), 44, 72)

    const assetsTotal = grouped.assetsTotal || 0

    const rects: Partial<Record<OverlayId, Rect>> = {}
    const rotates: Partial<Record<OverlayId, number>> = {}

    const outerAssets = blocks.assets.filter((b) => b.amount > 0)
    const n = outerAssets.length || 1
    const startAngle = -90

    const outerLen = (frac: number) => outerAvail * (0.35 + 0.65 * sqrt01(frac))
    const innerLen = (frac: number) => innerAvail * (0.45 + 0.55 * sqrt01(frac))

    for (let i = 0; i < outerAssets.length; i += 1) {
      const b = outerAssets[i]
      const thetaDeg = startAngle + (360 / n) * i
      const theta = (thetaDeg * Math.PI) / 180
      const frac = assetsTotal > 0 ? b.amount / assetsTotal : 0
      const w = Math.max(0, outerLen(frac))
      const h = outerThickness
      const centerR = outerBase + w / 2
      const centerX = cx + Math.cos(theta) * centerR
      const centerY = cy + Math.sin(theta) * centerR
      rects[b.id] = { x: centerX - w / 2, y: centerY - h / 2, w, h }
      rotates[b.id] = thetaDeg
    }

    const debt = blocks.debt
    if (debt) {
      const thetaDeg = 180
      const theta = Math.PI
      const frac = assetsTotal > 0 ? debt.amount / assetsTotal : 0
      const w = Math.max(0, innerLen(frac))
      const h = innerThickness
      const centerR = innerBase + w / 2
      const centerX = cx + Math.cos(theta) * centerR
      const centerY = cy + Math.sin(theta) * centerR
      rects.debt = { x: centerX - w / 2, y: centerY - h / 2, w, h }
      rotates.debt = thetaDeg
    }

    if (netWorthBlock) {
      const thetaDeg = 0
      const theta = 0
      const frac = assetsTotal > 0 ? netWorthBlock.amount / assetsTotal : 0
      const w = Math.max(0, innerLen(frac))
      const h = innerThickness
      const centerR = innerBase + w / 2
      const centerX = cx + Math.cos(theta) * centerR
      const centerY = cy + Math.sin(theta) * centerR
      rects.networth = { x: centerX - w / 2, y: centerY - h / 2, w, h }
      rotates.networth = thetaDeg
    }

    return { rects, rotates }
  }, [blocks.assets, blocks.debt, grouped.assetsTotal, netWorthBlock, viewport.h, viewport.w])

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
      // Start at Page 2 (List)
      el.scrollLeft = w * 2
      scrollLeft.set(w * 2)
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

  return (
    <div ref={viewportRef} className="relative w-full h-full overflow-hidden" style={{ background: 'var(--bg)' }}>
      <div className="absolute inset-0 z-0 pointer-events-none">
        {blocks.debt ? (
          <OverlayBlock
            key="debt"
            block={blocks.debt}
            kind="debt"
            roseRect={roseLayout.rects.debt}
            roseRotate={roseLayout.rotates.debt}
            ratioRect={ratioLayout.rects.debt}
            listRect={listRects.debt}
            scrollIdx={scrollIdx}
            overlayFade={overlayFade}
            labelsOpacity={labelsOpacity}
            labelScale={labelScale}
            chartRadius={chartRadius}
            listRadius={listRadius}
          />
        ) : null}

        {blocks.assets.map((b) => (
          <OverlayBlock
            key={b.id}
            block={b}
            kind={blockKinds[b.id] ?? 'assetMiddle'}
            roseRect={roseLayout.rects[b.id]}
            roseRotate={roseLayout.rotates[b.id]}
            ratioRect={ratioLayout.rects[b.id]}
            listRect={listRects[b.id]}
            scrollIdx={scrollIdx}
            overlayFade={overlayFade}
            labelsOpacity={labelsOpacity}
            labelScale={labelScale}
            chartRadius={chartRadius}
            listRadius={listRadius}
          />
        ))}

        {netWorthBlock ? (
          <OverlayBlock
            key="networth"
            block={netWorthBlock}
            kind="assetMiddle"
            roseRect={roseLayout.rects.networth}
            roseRotate={roseLayout.rotates.networth}
            scrollIdx={scrollIdx}
            overlayFade={overlayFade}
            labelsOpacity={labelsOpacity}
            labelScale={labelScale}
            chartRadius={chartRadius}
            listRadius={listRadius}
          />
        ) : null}
      </div>

      <motion.div className="absolute inset-x-0 top-0 z-20 px-4 pt-6 pointer-events-none" style={{ opacity: overlayFade }}>
        <motion.div
          className="flex items-start justify-between gap-3"
          style={{ y: listHeaderY, opacity: listHeaderOpacity, pointerEvents: listHeaderPointerEvents }}
        >
          <div className="min-w-0">
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
          </div>

          <button
            type="button"
            onClick={onAddAccount}
            className="w-10 h-10 rounded-full bg-[#eae9ff] text-[#4f46e5] flex items-center justify-center shadow-sm"
            aria-label="add"
          >
            <Plus size={22} strokeWidth={2.75} />
          </button>
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
          <AssetsRosePage grouped={grouped} onNext={() => scrollToPage(1)} />
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
