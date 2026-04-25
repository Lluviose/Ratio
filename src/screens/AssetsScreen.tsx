import { AnimatePresence, motion, useMotionValue, useTransform, type MotionValue } from 'framer-motion'
import { BarChart3, Eye, EyeOff, MoreHorizontal, Plus, TrendingUp } from 'lucide-react'
import { type ComponentType, type CSSProperties, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { getAccountTypeOption, type Account, type AccountGroup, type AccountTypeId } from '../lib/accounts'
import { formatCny } from '../lib/format'
import { pickForegroundColor } from '../lib/themes'
import { allocateIntegerPercents } from '../lib/percent'
import { addMoney } from '../lib/money'
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

const LIST_GROUP_ORDER: GroupId[] = ['liquid', 'invest', 'fixed', 'receivable', 'debt']

const INITIAL_HOME_PAGE_INDEX = 2
const BUBBLE_PAGE_ACTIVE_MAX = 0.8
const BUBBLE_PHYSICS_ENABLE_MAX = 0.24
const BUBBLE_PHYSICS_DISABLE_MAX = 0.34
const BUBBLE_BURSTS_ENABLE_MAX = 0.62
const BUBBLE_BURSTS_DISABLE_MAX = 0.72

const horizontalPageStyle: CSSProperties = {
  touchAction: 'pan-x',
  contain: 'layout paint style',
  isolation: 'isolate',
  backfaceVisibility: 'hidden',
  WebkitBackfaceVisibility: 'hidden',
}

const containedPageStyle: CSSProperties = {
  contain: 'layout paint style',
  isolation: 'isolate',
  backfaceVisibility: 'hidden',
  WebkitBackfaceVisibility: 'hidden',
}

const homeScrollerStyle: CSSProperties = {
  WebkitOverflowScrolling: 'touch',
  overscrollBehaviorX: 'contain',
  contain: 'layout paint style',
}

type Block = {
  id: GroupId
  name: string
  tone: string
  amount: number
  percent: number
  hasCard: boolean
}

type OverlayBlockModel = Block

type CornerKind = 'debt' | 'assetTop' | 'assetMiddle' | 'assetBottom' | 'assetOnly' | 'assetTopNoDebt' | 'assetMiddleNoDebt' | 'assetBottomNoDebt' | 'assetOnlyNoDebt'

type CornerRadii = { tl: number; tr: number; bl: number; br: number }

type BubbleRuntimeState = {
  pageActive: boolean
  physicsActive: boolean
  burstsVisible: boolean
}

type HomeBlockGeometry = {
  block: OverlayBlockModel
  kind: CornerKind
  ratioRect?: Rect
  listRect?: Rect
  displayHeight?: number
  bubblePos?: { x: MotionValue<number>; y: MotionValue<number> }
  bubbleRadius: number
  burstProgress?: MotionValue<number>
  ratioCorner: CornerRadii
  listCorner: CornerRadii
  bubbleCorner: CornerRadii
}

function getRatioCorner(kind: CornerKind, chartRadius: number): CornerRadii {
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

function getListCorner(kind: CornerKind, listRadius: number): CornerRadii {
  const isListLastBlock = kind === 'debt' || kind === 'assetBottomNoDebt' || kind === 'assetOnlyNoDebt'
  return { tl: 0, tr: listRadius, bl: 0, br: isListLastBlock ? listRadius : 0 }
}

function getBubbleRuntimeState(idx: number, current?: BubbleRuntimeState): BubbleRuntimeState {
  const pageActive = idx < BUBBLE_PAGE_ACTIVE_MAX
  const physicsActive = current?.physicsActive ? idx < BUBBLE_PHYSICS_DISABLE_MAX : idx < BUBBLE_PHYSICS_ENABLE_MAX
  const burstsVisible = current?.burstsVisible ? idx < BUBBLE_BURSTS_DISABLE_MAX : idx < BUBBLE_BURSTS_ENABLE_MAX
  return { pageActive, physicsActive, burstsVisible }
}

function isSameBubbleRuntimeState(a: BubbleRuntimeState, b: BubbleRuntimeState): boolean {
  return a.pageActive === b.pageActive && a.physicsActive === b.physicsActive && a.burstsVisible === b.burstsVisible
}

function isSameRect(a?: Rect, b?: Rect): boolean {
  if (!a || !b) return a === b
  return (
    Math.abs(a.x - b.x) < 0.5 &&
    Math.abs(a.y - b.y) < 0.5 &&
    Math.abs(a.w - b.w) < 0.5 &&
    Math.abs(a.h - b.h) < 0.5
  )
}

function isSameRectMap(a: Partial<Record<GroupId, Rect>>, b: Partial<Record<GroupId, Rect>>): boolean {
  return LIST_GROUP_ORDER.every((id) => isSameRect(a[id], b[id]))
}

function OverlayBlockLabels(props: {
  block: OverlayBlockModel
  kind: CornerKind
  ratio: Rect
  displayHeight?: number
  scrollIdx: MotionValue<number>
  labelsOpacity: MotionValue<number>
}) {
  const { block, kind, ratio, displayHeight, scrollIdx, labelsOpacity } = props
  const textColor = pickForegroundColor(block.tone)
  const isDebt = kind === 'debt'
  const basePercentSize = 36
  const basePercentSymbolSize = 15
  const baseLabelSize = 16
  const baseLabelMargin = 4
  const normalPadding = 16
  const adaptivePaddingValue = 4
  const verticalMinHeight = basePercentSize + baseLabelMargin + baseLabelSize + normalPadding * 2
  const horizontalMinHeight = basePercentSize + adaptivePaddingValue * 2
  const actualHeight = displayHeight ?? ratio.h
  const useHorizontalLayout = !isDebt && actualHeight < verticalMinHeight

  let fontScale = 1
  if (!isDebt && actualHeight < horizontalMinHeight) {
    const availableHeight = Math.max(0, actualHeight - adaptivePaddingValue * 2)
    fontScale = Math.max(1 / 3, availableHeight / basePercentSize)
  }

  const needsScaling = fontScale < 1
  const percentSize = needsScaling ? Math.round(basePercentSize * fontScale) : basePercentSize
  const percentSymbolSize = needsScaling ? percentSize : basePercentSymbolSize
  const labelSize = needsScaling ? Math.min(percentSize, baseLabelSize) : baseLabelSize

  const paddingX = useTransform(scrollIdx, (idx) => {
    if (idx < 0.5) return 0
    const t = Math.min(1, (idx - 0.5) * 2)
    return lerp(0, normalPadding, t)
  })
  const paddingYTarget = useHorizontalLayout ? adaptivePaddingValue : normalPadding
  const paddingY = useTransform(scrollIdx, (idx) => {
    if (idx < 0.5) return 0
    const t = Math.min(1, (idx - 0.5) * 2)
    return lerp(0, paddingYTarget, t)
  })
  const flexAlign = useTransform(scrollIdx, (v) => (v < 0.5 ? 'center' : 'flex-start'))
  const flexJustify = useTransform(scrollIdx, (v) => (v < 0.5 ? 'center' : 'flex-start'))
  const contentScale = useTransform(scrollIdx, [0, 0.5, 1], [1.1, 1, 1])
  const amountOpacity = useTransform(scrollIdx, [0, 0.35, 0.55], [1, 1, 0])
  const percentOpacity = useTransform(scrollIdx, [0.45, 0.65, 1], [0, 1, 1])

  const ratioPercentSize = useTransform(scrollIdx, (idx) => {
    if (idx < 0.5) return basePercentSize
    if (!needsScaling) return basePercentSize
    const t = Math.min(1, (idx - 0.5) * 2)
    return Math.round(lerp(basePercentSize, percentSize, t))
  })
  const ratioPercentSymbolSize = useTransform(scrollIdx, (idx) => {
    if (idx < 0.5) return basePercentSymbolSize
    if (!needsScaling) return basePercentSymbolSize
    const t = Math.min(1, (idx - 0.5) * 2)
    return Math.round(lerp(basePercentSymbolSize, percentSymbolSize, t))
  })
  const ratioLabelSize = useTransform(scrollIdx, (idx) => {
    if (idx < 0.5) return baseLabelSize
    if (!needsScaling) return baseLabelSize
    const t = Math.min(1, (idx - 0.5) * 2)
    return Math.round(lerp(baseLabelSize, labelSize, t))
  })
  const ratioFlexDirection = useTransform(scrollIdx, (idx) => {
    if (idx < 0.8) return 'column'
    return useHorizontalLayout ? 'row' : 'column'
  })
  const ratioAlignItems = useTransform(scrollIdx, (idx) => {
    if (idx < 0.5) return 'center'
    if (idx < 0.8) return 'flex-start'
    return useHorizontalLayout ? 'center' : 'flex-start'
  })
  const ratioLabelMarginTop = useTransform(scrollIdx, (idx) => {
    if (idx < 0.8) return 4
    return useHorizontalLayout ? 0 : 4
  })
  const ratioLabelMarginLeft = useTransform(scrollIdx, (idx) => {
    if (idx < 0.8) return 0
    return useHorizontalLayout ? 6 : 0
  })
  const extendedHeight = displayHeight ? ratio.h - displayHeight : 0
  const ratioContentPaddingBottom = useTransform(scrollIdx, (idx) => {
    if (idx < 0.8) return 0
    if (useHorizontalLayout && extendedHeight > 0) return extendedHeight
    return 0
  })

  return (
    <motion.div
      style={{
        opacity: labelsOpacity,
        color: textColor,
        paddingLeft: paddingX,
        paddingRight: paddingX,
        paddingTop: paddingY,
        paddingBottom: paddingY,
      }}
      className="w-full h-full flex flex-col relative z-10"
    >
      <motion.div
        className="w-full h-full flex flex-col relative"
        style={{
          justifyContent: kind === 'debt' ? 'center' : flexJustify,
          alignItems: flexAlign,
          scale: contentScale,
        }}
      >
        <motion.div
          className="absolute inset-0 flex flex-col justify-center"
          style={{ opacity: amountOpacity, alignItems: flexAlign }}
        >
          <div className="text-[12px] font-medium opacity-90 mb-0.5">{block.name}</div>
          <div className="text-[20px] font-bold tracking-tight leading-none">{formatCny(block.amount)}</div>
        </motion.div>

        <motion.div
          className="absolute inset-0 flex"
          style={{
            paddingBottom: ratioContentPaddingBottom,
            opacity: percentOpacity,
            justifyContent: isDebt ? 'center' : 'flex-start',
            alignItems: isDebt ? 'flex-start' : ratioAlignItems,
            flexDirection: ratioFlexDirection,
          }}
        >
          <motion.div className="font-semibold tracking-tight leading-none" style={{ fontSize: ratioPercentSize }}>
            {block.percent}
            <motion.span className="ml-0.5" style={{ fontSize: ratioPercentSymbolSize }}>
              %
            </motion.span>
          </motion.div>
          <motion.div
            className="font-medium opacity-85"
            style={{
              fontSize: ratioLabelSize,
              marginTop: ratioLabelMarginTop,
              marginLeft: ratioLabelMarginLeft,
            }}
          >
            {block.name}
          </motion.div>
        </motion.div>
      </motion.div>
    </motion.div>
  )
}

function OverlayBlock(props: {
  geometry: HomeBlockGeometry
  scrollIdx: MotionValue<number>
  overlayFade: MotionValue<number>
  labelsOpacity: MotionValue<number>
  showLabels: boolean
  isReturning?: boolean
  isInitialLoad?: boolean
  isReturningFromDetail?: boolean
  blockIndex?: number
  viewportWidth?: number
}) {
  const {
    geometry,
    scrollIdx,
    overlayFade,
    labelsOpacity,
    showLabels,
    isReturning = false,
    isInitialLoad = false,
    isReturningFromDetail = false,
    blockIndex = 0,
    viewportWidth = 400,
  } = props

  const {
    block,
    kind,
    ratioRect,
    listRect,
    displayHeight,
    bubblePos,
    bubbleRadius,
    burstProgress,
    ratioCorner,
    listCorner,
    bubbleCorner,
  } = geometry
  const ratio = ratioRect ?? listRect ?? { x: 0, y: 0, w: 0, h: 0 }
  const list = listRect ?? ratioRect ?? ratio
  const bRadius = bubbleRadius
  
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
    // List 模式：list.h 由 measureListRects 计算，包含「到下一个条目顶部的距离」以及
    // 「覆盖下一个色块圆角所需的重叠量」，确保：
    // 1) 当前色块上沿与条目上沿对齐
    // 2) 视觉上当前色块下沿对齐到下一个条目上沿
    // 3) 下一个色块圆角空白由上一个色块填充（多层叠不露底）
    const listH = list.h

    return lerp(ratio.h, listH, Math.min(1, Math.max(0, idx - 1)))
  })
  
  const opacity = overlayFade
  const fallbackBurst = useMotionValue(0)
  const burstP = burstProgress ?? fallbackBurst
  const burstOpacityRaw = useTransform(burstP, [0, 1], [1, 0])
  const burstScaleRaw = useTransform(burstP, [0, 1], [1, 0.92])
  const bubblePhase = useTransform(scrollIdx, (idx) => (idx < 0.95 ? 1 : 0) * 1)
  const burstOpacityMul = useTransform([burstOpacityRaw, bubblePhase], (values) => {
    const [o, m] = values as [number, number]
    return m * o + (1 - m)
  })
  const burstScale = useTransform([burstScaleRaw, bubblePhase], (values) => {
    const [s, m] = values as [number, number]
    return m * s + (1 - m)
  })
  const finalOpacity = useTransform([opacity, burstOpacityMul], (values) => {
    const [o, m] = values as [number, number]
    return o * m
  })

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

  // Sphere visual effects (fade out as we scroll to ratio)
  const sphereEffectOpacity = useTransform(scrollIdx, [0, 0.5], [1, 0])
  const surfaceHighlightOpacity = useTransform(scrollIdx, [0, 0.7, 1.6, 2], [0.18, 0.13, 0.1, 0.06])

  // 是否需要入场动画（首次加载、从其他页面返回、或从详情页返回）
  const needsEnterAnimation = isInitialLoad || isReturning || isReturningFromDetail

  // 入场动画的 translateX 偏移（从左侧飞入）
  const enterTranslateX = needsEnterAnimation ? -viewportWidth : 0

  return (
    <motion.div
      className="absolute inset-0 pointer-events-none"
      initial={needsEnterAnimation ? { translateX: enterTranslateX, opacity: 0 } : false}
      animate={{ translateX: 0, opacity: 1 }}
      transition={needsEnterAnimation ? {
        duration: 0.5,
        delay: blockIndex * 0.04,
        ease: [0.2, 0, 0, 1]
      } : undefined}
    >
      <motion.div
        className="absolute left-0 top-0 pointer-events-none"
        style={{
          x,
          y,
          width: w,
          height: h,
          background: block.tone,
          borderTopLeftRadius: tl,
          borderTopRightRadius: tr,
          borderBottomLeftRadius: bl,
          borderBottomRightRadius: br,
          opacity: finalOpacity,
          scale: burstScale,
          originX: 0.5,
          originY: 0.5,
          overflow: 'hidden',
          willChange: 'transform, opacity',
          backfaceVisibility: 'hidden',
          WebkitBackfaceVisibility: 'hidden',
          contain: 'layout paint style',
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
          className="absolute inset-0 pointer-events-none"
          style={{
            zIndex: 1,
            opacity: surfaceHighlightOpacity,
            background: 'linear-gradient(to bottom, rgba(255,255,255,0.22), rgba(255,255,255,0) 36%)',
          }}
        />
        <motion.div
          className="absolute inset-0 pointer-events-none"
          style={{
            zIndex: 1,
            opacity: surfaceHighlightOpacity,
            boxShadow: 'inset 0 -14px 20px rgba(15,23,42,0.04)',
          }}
        />

        {showLabels ? (
          <OverlayBlockLabels
            block={block}
            kind={kind}
            ratio={ratio}
            displayHeight={displayHeight}
            scrollIdx={scrollIdx}
            labelsOpacity={labelsOpacity}
          />
        ) : null}
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
  activeAccountId?: string | null
  skipInitialAnimation?: boolean
  addButtonTone?: string
}) {
  const { grouped, getIcon, onEditAccount, onAddAccount, onNavigate, activeAccountId, skipInitialAnimation = false, addButtonTone } = props

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
  const [scrollerWidth, setScrollerWidth] = useState(0)
  // 当 skipInitialAnimation 为 true 时，initialized 直接为 true，但仍需等待 viewport 测量完成
  const [initialized, setInitialized] = useState(false)
  const [isInitialLoad, setIsInitialLoad] = useState(!skipInitialAnimation)
  // 是否是从其他页面返回（用于控制入场动画方向）
  const [isReturning, setIsReturning] = useState(false)
  // 是否从详情页返回到列表页（用于触发入场动画）
  const [isReturningFromDetail, setIsReturningFromDetail] = useState(false)
  // 动画触发计数器，用于强制重新挂载组件以触发入场动画
  const [animationKey, setAnimationKey] = useState(0)
  const [detailPageMounted, setDetailPageMounted] = useState(false)
  const [showOverlayLabels, setShowOverlayLabels] = useState(true)

  const didInitRef = useRef(false)
  const detailUnmountTimerRef = useRef<number | null>(null)
  const showOverlayLabelsRef = useRef(true)

  // 初始值设为一个大数，确保初始时不会显示动画（会被 useEffect 立即修正）
  const scrollLeft = useMotionValue(99999)

  const accounts = useMemo(() => grouped.groupCards.flatMap((g) => g.accounts), [grouped.groupCards])

  const maskedText = '*****'
  const maskedClass = 'tracking-[0.28em]'

  const addButtonStyle = useMemo(() => {
    if (!addButtonTone) return undefined
    return { background: addButtonTone, color: pickForegroundColor(addButtonTone) }
  }, [addButtonTone])

  const scrollToPage = useCallback((index: number) => {
    const el = scrollerRef.current
    if (!el) return
    const w = el.clientWidth || 0
    if (w <= 0) return

    const target = w * index
    el.scrollTo({ left: target, behavior: 'smooth' })
  }, [])

  const scrollIdx = useTransform(scrollLeft, (v) => {
    const w = scrollerWidth || viewport.w || 1
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
  
  const [bubbleRuntime, setBubbleRuntime] = useState<BubbleRuntimeState>(() => getBubbleRuntimeState(INITIAL_HOME_PAGE_INDEX))
  const bubbleRuntimeRef = useRef(bubbleRuntime)
  
  useEffect(() => {
    return scrollIdx.on('change', (v) => {
      const current = bubbleRuntimeRef.current
      const next = getBubbleRuntimeState(v, current)
      if (isSameBubbleRuntimeState(current, next)) return

      bubbleRuntimeRef.current = next
      setBubbleRuntime(next)
    })
  }, [scrollIdx])

  const listHeaderY = useTransform(ratioProgress, [0, 1], [-120, 0])
  const listHeaderOpacity = ratioProgress
  const labelsOpacity = useTransform(ratioProgress, [0, 0.5, 1], [1, 0, 0])
  const miniBarOpacity = useTransform(ratioProgress, [0, 0.92, 1], [0, 0, 1])   
  const miniBarY = useTransform(ratioProgress, [0, 1], [16, 0])
  const listHeaderPointerEvents = useTransform([ratioProgress, overlayFade], (values) => {
    const [p, fade] = values as [number, number]
    return p < 0.05 || fade < 0.05 ? 'none' : 'auto'
  })
  const miniBarPointerEvents = useTransform([miniBarOpacity, overlayFade], (values) => {
    const [o, fade] = values as [number, number]
    return o < 0.2 || fade < 0.05 ? 'none' : 'auto'
  })

  useEffect(() => {
    const syncLabels = (value: number) => {
      const next = value < 0.58
      if (showOverlayLabelsRef.current === next) return
      showOverlayLabelsRef.current = next
      setShowOverlayLabels(next)
    }

    syncLabels(ratioProgress.get())
    return ratioProgress.on('change', syncLabels)
  }, [ratioProgress])

  const chartRadius = 32
  const listRadius = 30

  const blocks = useMemo(() => {
    const byId = new Map<GroupId, { group: AccountGroup; accountsCount: number; total: number }>()
    for (const g of grouped.groupCards) {
      byId.set(g.group.id as GroupId, { group: g.group, accountsCount: g.accounts.length, total: g.total })
    }

    const assetOrder: GroupId[] = ['liquid', 'invest', 'fixed', 'receivable']
    const assetAmounts = assetOrder.map((id) => {
      const g = byId.get(id)
      const total = Number.isFinite(g?.total) ? Math.max(0, g?.total ?? 0) : 0
      return { id, amount: total }
    })
    const assetTotal = assetAmounts.reduce((sum, a) => addMoney(sum, a.amount), 0)
    const assetPercents = allocateIntegerPercents(assetAmounts)
    const assets: Block[] = assetOrder
      .map((id) => {
        const g = byId.get(id)
        if (!g) return null
        const amount = Number.isFinite(g.total) ? Math.max(0, g.total) : 0
        return {
          id,
          name: g.group.name,
          tone: g.group.tone,
          amount,
          percent: assetPercents[id] ?? 0,
          hasCard: g.accountsCount > 0,
        } satisfies Block
      })
      .filter((v): v is Block => Boolean(v))
      .filter((b) => b.hasCard)

    const debtRaw = byId.get('debt')
    const debtPercent = (amount: number) => {
      if (assetTotal <= 0) return 0
      const exact = (amount / assetTotal) * 100
      if (exact > 0 && exact < 1) return 1
      return Math.round(exact)
    }
    const debt: Block | null = debtRaw
      ? {
          id: 'debt',
          name: debtRaw.group.name,
          tone: debtRaw.group.tone,
          amount: Number.isFinite(debtRaw.total) ? Math.max(0, debtRaw.total) : 0,
          percent: debtPercent(Number.isFinite(debtRaw.total) ? Math.max(0, debtRaw.total) : 0),
          hasCard: debtRaw.accountsCount > 0,
        }
      : null

    return { assets, debt: debt && debt.hasCard ? debt : null }
  }, [grouped])

  const bubbleNodes = useMemo(() => {
    const nodes: BubbleNode[] = []
    const groups = grouped.groupCards
    
    // Find max total to scale
    const totals = groups.map((g) => (Number.isFinite(g.total) ? g.total : 0))
    const maxTotal = Math.max(...totals, 1)
    const maxRadius = 130 // Base max radius
    
    // Fixed / Liquid / Debt / Invest / Receivable
    for (const g of groups) {
      const total = Number.isFinite(g.total) ? g.total : 0
      if (total <= 0) continue
      
      // Calculate radius roughly proportional to sqrt of area (value)
      // clamp min size so small assets are still visible bubbles
      const r = Math.sqrt(total / maxTotal) * maxRadius
      const radius = Math.max(r, 55)

      nodes.push({
        id: g.group.id,
        radius,
        color: g.group.tone,
        label: g.group.name,
        value: total
      })
    }
    return nodes
  }, [grouped.groupCards])

  const bubbleColorById = useMemo(() => {
    const m = new Map<string, string>()
    bubbleNodes.forEach((n) => m.set(n.id, n.color))
    return m
  }, [bubbleNodes])

  const bubbleNodeById = useMemo(() => {
    const m = new Map<string, BubbleNode>()
    bubbleNodes.forEach((n) => m.set(n.id, n))
    return m
  }, [bubbleNodes])

  const bubblePhysics = useBubblePhysics(
    bubbleNodes,
    viewport.w,
    viewport.h,
    bubbleRuntime.physicsActive,
    bubbleRuntime.burstsVisible,
  )

  const bubbleGestureNodes = useMemo(() => bubbleNodes.map((n) => ({ id: n.id, radius: n.radius })), [bubbleNodes])
  const goToRatioPage = useCallback(() => scrollToPage(1), [scrollToPage])
  const getBubbleScrollLeft = useCallback(() => scrollLeft.get(), [scrollLeft])
  const handleBubbleFlick = useCallback(
    (id: string, velocity: { x: number; y: number }) => bubblePhysics.flick(id, velocity),
    [bubblePhysics],
  )
  const handleBubbleBurst = useCallback(
    (id: string, point: { x: number; y: number }) => bubblePhysics.burst(id, point),
    [bubblePhysics],
  )
  const bubbleGesture = useMemo(
    () => ({
      nodes: bubbleGestureNodes,
      positions: bubblePhysics.positions,
      onFlick: handleBubbleFlick,
      onBurst: handleBubbleBurst,
      getScrollLeft: getBubbleScrollLeft,
    }),
    [bubbleGestureNodes, bubblePhysics.positions, getBubbleScrollLeft, handleBubbleBurst, handleBubbleFlick],
  )
  const goToListPage = useCallback(() => scrollToPage(2), [scrollToPage])
  const handlePickType = useCallback(
    (type: AccountTypeId) => {
      if (detailUnmountTimerRef.current !== null) {
        window.clearTimeout(detailUnmountTimerRef.current)
        detailUnmountTimerRef.current = null
      }
      setSelectedType(type)
      setDetailPageMounted(true)
      window.requestAnimationFrame(() => scrollToPage(3))
    },
    [scrollToPage],
  )
  const handleToggleGroup = useCallback((id: GroupId) => {
    setExpandedGroup((current) => (current === id ? null : id))
  }, [])
  const handleDetailBack = useCallback(() => {
    if (detailUnmountTimerRef.current !== null) window.clearTimeout(detailUnmountTimerRef.current)
    setIsReturningFromDetail(true)
    setAnimationKey((k) => k + 1)
    scrollToPage(2)
    detailUnmountTimerRef.current = window.setTimeout(() => {
      setSelectedType(null)
      setDetailPageMounted(false)
      detailUnmountTimerRef.current = null
    }, 260)
  }, [scrollToPage])

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
    const total = ratioAssets.reduce((sum, b) => addMoney(sum, b.amount), 0)

    // 最小高度阈值（允许字体缩放到最小时仍可显示）
    // 最小字体 = 34/3 ≈ 11px，加上 padding 和一些余量
    const minHeight = 28
    // 圆角延伸高度（用于填充下方色块圆角处的空缺）
    const cornerExtend = 32

    // 存储每个色块的实际显示高度（不含延伸部分）
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

      // 保存实际显示高度（不含延伸部分）
      displayHeights[b.id] = height

      // 非最后的资产向下延伸一段，以填充下方色块圆角处的空缺
      const extendedHeight = isLast ? height : height + cornerExtend

      rects[b.id] = { x: assetX, y, w: assetW, h: Math.max(0, extendedHeight) }
      y += height // 下一个色块的起始位置不变，仍然使用原始高度计算
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

  const overlayBlocksInListOrder = useMemo(() => {
    const byId = new Map<GroupId, Block>()
    for (const b of blocks.assets) byId.set(b.id, b)
    if (blocks.debt) byId.set('debt', blocks.debt)

    return LIST_GROUP_ORDER.map((id) => byId.get(id)).filter((b): b is Block => Boolean(b))
  }, [blocks.assets, blocks.debt])

  const homeBlockGeometries = useMemo<HomeBlockGeometry[]>(
    () =>
      overlayBlocksInListOrder.map((block) => {
        const kind = blockKinds[block.id] ?? 'assetMiddle'
        const bubbleRadius = bubbleNodeById.get(block.id)?.radius ?? 60
        return {
          block,
          kind,
          ratioRect: ratioLayout.rects[block.id],
          listRect: listRects[block.id],
          displayHeight: block.id === 'debt' ? undefined : ratioLayout.displayHeights[block.id],
          bubblePos: bubblePhysics.positions.get(block.id),
          bubbleRadius,
          burstProgress: bubblePhysics.burstProgress.get(block.id),
          ratioCorner: getRatioCorner(kind, chartRadius),
          listCorner: getListCorner(kind, listRadius),
          bubbleCorner: { tl: bubbleRadius, tr: bubbleRadius, bl: bubbleRadius, br: bubbleRadius },
        }
      }),
    [
      blockKinds,
      bubbleNodeById,
      bubblePhysics.burstProgress,
      bubblePhysics.positions,
      chartRadius,
      listRadius,
      listRects,
      overlayBlocksInListOrder,
      ratioLayout.displayHeights,
      ratioLayout.rects,
    ],
  )

  const measureListRects = useCallback(() => {
    const root = viewportRef.current
    if (!root) return

    const scroller = scrollerRef.current
    const pageW = scroller?.clientWidth || scrollerWidth || root.clientWidth || 0
    if (pageW <= 0) return
    const currentScrollLeft = scroller?.scrollLeft ?? scrollLeft.get()
    const listPageFinalOffsetX = pageW * INITIAL_HOME_PAGE_INDEX - currentScrollLeft

    const rootRect = root.getBoundingClientRect()
    const maxBlockWidth = Math.max(0, Math.round(rootRect.width))
    const next: Partial<Record<GroupId, Rect>> = {}
    const blockGap = 12
    const overlap = listRadius

    const getTranslateX = (el: HTMLElement): number => {
      const transform = window.getComputedStyle(el).transform
      if (!transform || transform === 'none') return 0

      if (typeof DOMMatrixReadOnly !== 'undefined') {
        try {
          const m = new DOMMatrixReadOnly(transform)
          return Number.isFinite(m.m41) ? m.m41 : 0
        } catch {
          // fall through to string parsing
        }
      }

      const m2d = transform.match(/^matrix\((.+)\)$/)
      if (m2d) {
        const parts = m2d[1]
          .split(/[,\s]+/)
          .filter(Boolean)
          .map((p) => Number.parseFloat(p.trim()))
        const tx = parts[4]
        return Number.isFinite(tx) ? tx : 0
      }

      const m3d = transform.match(/^matrix3d\((.+)\)$/)
      if (m3d) {
        const parts = m3d[1]
          .split(/[,\s]+/)
          .filter(Boolean)
          .map((p) => Number.parseFloat(p.trim()))
        const tx = parts[12]
        return Number.isFinite(tx) ? tx : 0
      }

      return 0
    }

    // 固定顺序，确保层叠方向稳定（后面的色块盖住前面的色块）
    const order = LIST_GROUP_ORDER
    const items: Array<{ id: GroupId; top: number; height: number; cardLeft: number }> = []

    for (const id of order) {
      const el = groupElsRef.current[id]
      if (!el) continue
      const r = el.getBoundingClientRect()
      const top = r.top - rootRect.top
      const translateX = getTranslateX(el)
      const cardLeft = r.left - rootRect.left - translateX
      items.push({ id, top, height: r.height, cardLeft })
    }

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

    setListRects((prev) => (isSameRectMap(prev, next) ? prev : next))
  }, [scrollLeft, scrollerWidth])

  const scheduleMeasure = useCallback(() => {
    if (measureRafRef.current !== null) return
    measureRafRef.current = requestAnimationFrame(() => {
      measureRafRef.current = null
      measureListRects()
    })
  }, [measureListRects])

  useEffect(() => {
    return () => {
      if (measureRafRef.current === null) return
      cancelAnimationFrame(measureRafRef.current)
      measureRafRef.current = null
    }
  }, [])

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

  useLayoutEffect(() => {
    const el = viewportRef.current
    if (!el) return

    const update = () => {
      const w = el.clientWidth
      const h = el.clientHeight
      setViewport((prev) => (prev.w === w && prev.h === h ? prev : { w, h }))
      const nextScrollerWidth = scrollerRef.current?.clientWidth ?? 0
      setScrollerWidth((prev) => (prev === nextScrollerWidth ? prev : nextScrollerWidth))
    }
    update()

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', update)
      return () => window.removeEventListener('resize', update)
    }

    const ro = new ResizeObserver(() => update())
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useLayoutEffect(() => {
    if (didInitRef.current) return
    const el = scrollerRef.current
    if (!el) return

    const w = el.clientWidth || 0
    if (w <= 0) return

    didInitRef.current = true

    // Start at Page 2 (List) - 直接设置，不触发动画
    el.scrollLeft = w * 2
    scrollLeft.set(el.scrollLeft)

    measureListRects()
    setInitialized(true)
  }, [measureListRects, scrollLeft, skipInitialAnimation, viewport.w])

  useEffect(() => {
    if (!initialized) return
    if (skipInitialAnimation) return
    const timer = window.setTimeout(() => setIsInitialLoad(false), 700)
    return () => window.clearTimeout(timer)
  }, [initialized, skipInitialAnimation])

  // 返回动画完成后重置 isReturning 状态
  useEffect(() => {
    if (!initialized || !isReturning) return
    const timer = window.setTimeout(() => setIsReturning(false), 600)
    return () => window.clearTimeout(timer)
  }, [initialized, isReturning])

  // 从详情页返回动画完成后重置 isReturningFromDetail 状态
  useEffect(() => {
    if (!isReturningFromDetail) return
    const timer = window.setTimeout(() => setIsReturningFromDetail(false), 600)
    return () => window.clearTimeout(timer)
  }, [isReturningFromDetail])

  useEffect(() => {
    return () => {
      if (detailUnmountTimerRef.current === null) return
      window.clearTimeout(detailUnmountTimerRef.current)
      detailUnmountTimerRef.current = null
    }
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

    let raf = 0
    const commitScrollLeft = (value: number) => {
      if (scrollLeft.get() !== value) scrollLeft.set(value)
    }
    const maxScroll = () => (el.clientWidth || 1) * (detailPageMounted ? 3 : 2)
    const clampToAvailablePages = () => {
      const max = maxScroll()
      if (el.scrollLeft <= max) return false
      el.scrollLeft = max
      commitScrollLeft(max)
      return true
    }
    const onScroll = () => {
      if (clampToAvailablePages()) return
      if (raf) cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        raf = 0
        if (!clampToAvailablePages()) commitScrollLeft(el.scrollLeft)
      })
    }

    clampToAvailablePages()
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      if (raf) cancelAnimationFrame(raf)
      el.removeEventListener('scroll', onScroll)
    }
  }, [detailPageMounted, scrollLeft])

  useEffect(() => {
    const el = scrollerRef.current
    if (!el) return

    let touchStart: { x: number; y: number; scrollLeft: number; locked: boolean } | null = null
    const getListMaxScroll = () => (el.clientWidth || 1) * 2
    const commitListEdge = () => {
      const maxScroll = getListMaxScroll()
      if (el.scrollLeft !== maxScroll) el.scrollLeft = maxScroll
      if (scrollLeft.get() !== maxScroll) scrollLeft.set(maxScroll)
    }

    const onTouchStart = (e: TouchEvent) => {
      const touch = e.touches[0]
      if (!touch) return

      touchStart = {
        x: touch.clientX,
        y: touch.clientY,
        scrollLeft: el.scrollLeft,
        locked: false,
      }
    }

    const onTouchMove = (e: TouchEvent) => {
      if (detailPageMounted || !touchStart) return

      const touch = e.touches[0]
      if (!touch) return

      const maxScroll = getListMaxScroll()
      const atListRightEdge = touchStart.scrollLeft >= maxScroll - 2 || el.scrollLeft >= maxScroll - 2
      if (!atListRightEdge) return

      const dx = touch.clientX - touchStart.x
      const dy = touch.clientY - touchStart.y
      const isLeftSwipe = dx < -6 && Math.abs(dx) > Math.abs(dy) * 1.1
      if (!touchStart.locked && !isLeftSwipe) return

      touchStart.locked = true
      e.preventDefault()
      commitListEdge()
    }

    const onTouchEnd = () => {
      touchStart = null
    }

    el.addEventListener('touchstart', onTouchStart, { passive: true })
    el.addEventListener('touchmove', onTouchMove, { passive: false })
    el.addEventListener('touchend', onTouchEnd, { passive: true })
    el.addEventListener('touchcancel', onTouchEnd, { passive: true })
    return () => {
      el.removeEventListener('touchstart', onTouchStart)
      el.removeEventListener('touchmove', onTouchMove)
      el.removeEventListener('touchend', onTouchEnd)
      el.removeEventListener('touchcancel', onTouchEnd)
    }
  }, [detailPageMounted, scrollLeft])

  useEffect(() => {
    const el = listScrollRef.current
    if (!el) return

    const onScroll = () => {
      scheduleMeasure()
    }

    el.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      el.removeEventListener('scroll', onScroll)
    }
  }, [scheduleMeasure])

  useEffect(() => scheduleMeasure(), [expandedGroup, scheduleMeasure])

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

  const selectedThemeColor = useMemo(() => {
    if (!selectedType) return 'var(--text)'
    try {
      const opt = getAccountTypeOption(selectedType)
      const group = grouped.groupCards.find((g) => g.group.id === opt.groupId)
      return group?.group.tone ?? 'var(--text)'
    } catch {
      return 'var(--text)'
    }
  }, [selectedType, grouped.groupCards])

  return (
    <div ref={viewportRef} className="relative w-full h-full overflow-hidden" style={{ background: 'var(--bg)' }}>
      {/* 只有初始化完成后才显示 overlay 块，带启动动画 */}
      {initialized ? (
        <div className="absolute inset-0 z-0 pointer-events-none">
          {/* 负债上方的白色填充块（负债比例低于100%时） */}
          {debtFillerRect ? (
          <motion.div
            className="absolute left-0 top-0 pointer-events-none"
            style={{
              x: debtFillerLeft,
              y: debtFillerTop,
              width: debtFillerWidth,
              height: debtFillerHeight,
              background: 'white',
              borderTopLeftRadius: chartRadius,
              borderTopRightRadius: chartRadius,
              opacity: debtFillerOpacity,
              willChange: 'transform, opacity',
              backfaceVisibility: 'hidden',
              WebkitBackfaceVisibility: 'hidden',
              contain: 'layout paint style',
            }}
          />
        ) : null}

        {/* 资产底部的白色填充块（负债比例超过100%时） */}
        {assetFillerRect ? (
          <motion.div
            className="absolute left-0 top-0 pointer-events-none"
            style={{
              x: assetFillerLeft,
              y: assetFillerTop,
              width: assetFillerWidth,
              height: assetFillerHeight,
              background: 'white',
              borderTopRightRadius: chartRadius,
              borderBottomRightRadius: chartRadius,
              opacity: assetFillerOpacity,
              willChange: 'transform, opacity',
              backfaceVisibility: 'hidden',
              WebkitBackfaceVisibility: 'hidden',
              contain: 'layout paint style',
            }}
          />
        ) : null}

        {/* Overlay blocks are rendered in list order (top -> bottom). Later items sit above earlier ones,
            and the previous item is extended downward to show through the next item’s rounded corner. */}

        {/* 顶部色块先渲染，按顺序渲染
            每个色块向下延伸的部分垫在下方色块的圆角处

            在 List 模式下，为了实现 Stack 效果（上方卡片圆角覆盖下方卡片顶部），
            我们需要反向渲染：先渲染底部的，再渲染顶部的。
            但在 Ratio 模式下，我们的逻辑是上方卡片直角，下方卡片被覆盖。

            修正：List 模式下是每个卡片都有圆角头部，为了不漏出缝隙，我们让每个卡片向下延伸。
            对于堆叠顺序：
            List 模式：上方卡片盖住下方卡片的延伸部分？
            不，应该是：
            Item 1 (Top)
            Item 2 (Below 1)

            如果 Item 1 有圆角底部，Item 2 直角顶部，那 Item 1 盖住 Item 2。
            如果 Item 1 直角底部，Item 2 圆角顶部，那 Item 1 盖住 Item 2 的圆角缝隙？

            参考设计图：
            列表页每个卡片都有圆角头部（tl/tr）。
            这意味这 Item 2 的顶部圆角区域是透明的，会露出 Item 1 的底部。
            为了不露馅，Item 1 必须向下延伸填充这个区域。
            所以 Item 1 (z-index 高) 应该盖在 Item 2 (z-index 低) 上面吗？
            不，通常列表是自然堆叠，后面的在上面。

            如果后面的在上面 (Item 2 on top of Item 1)，那 Item 2 的圆角头部会盖住 Item 1 的底部。
            这时 Item 1 的底部如果是直角，会被切掉吗？不会，只是被遮挡。
            所以只要 Item 1 足够长，Item 2 盖上去就行。

            当前的渲染顺序是：map 顺序 (Item 1, Item 2...) => DOM 顺序 (Item 1 在下, Item 2 在上)。
            这就满足了 "Item 2 盖住 Item 1" 的需求。

            但是！OverlayBlock 的设计是：
            Ratio 模式：上层 Block (Item 1) 向下延伸，垫在 下层 Block (Item 2) 的圆角处。
            这就要求 Item 1 在 Item 2 的 *下面* 才能被垫住？
            不对，如果是垫在下面，那就是 Item 2 盖住 Item 1。

            现状：DOM 顺序是 index 0 (Top) -> index N (Bottom)。
            CSS 默认 stacking：后面的盖住前面的。
            所以 Item N 盖住 ... 盖住 Item 1。

            List 模式需求：
            Item 1 (Top)
            Item 2 (Below) -> 盖住 Item 1 的底部

            所以现有的 DOM 顺序 (Item 1 rendered first, Item 2 rendered second) = Item 2 covers Item 1.
            这是正确的堆叠顺序。

            我们只需要确保 OverlayBlock 在 List 模式下也向下延伸即可。
         */}
        {homeBlockGeometries.map((geometry, i) => (
          <OverlayBlock
            key={`${geometry.block.id}-${animationKey}`}
            geometry={geometry}
            scrollIdx={scrollIdx}
            overlayFade={overlayFade}
            labelsOpacity={labelsOpacity}
            showLabels={showOverlayLabels}
            isReturning={isReturning}
            isInitialLoad={isInitialLoad}
            isReturningFromDetail={isReturningFromDetail}
            blockIndex={i}
            viewportWidth={viewport.w}
          />
        ))}

        {bubbleRuntime.burstsVisible
          ? Array.from(bubblePhysics.bursts.entries()).flatMap(([parentId, burst]) => {
              const color = bubbleColorById.get(parentId) ?? 'rgba(0,0,0,0.25)'
              return burst.shards.map((shard) => (
                <motion.div
                  key={shard.id}
                  className="absolute left-0 top-0 pointer-events-none"
                  style={{
                    x: shard.x,
                    y: shard.y,
                    width: shard.radius * 2,
                    height: shard.radius * 2,
                    borderRadius: shard.radius,
                    background: color,
                    opacity: burst.alpha,
                    overflow: 'hidden',
                    boxShadow: '0 10px 24px rgba(0,0,0,0.08)',
                  }}
                >
                  <div
                    className="absolute inset-0"
                    style={{
                      background: 'radial-gradient(circle at 30% 30%, rgba(255,255,255,0.22), transparent 60%)',
                    }}
                  />
                  <div
                    className="absolute inset-0"
                    style={{
                      boxShadow:
                        'inset -8px -8px 16px rgba(0,0,0,0.08), inset 8px 8px 16px rgba(255,255,255,0.18)',
                    }}
                  />
                </motion.div>
              ))
            })
          : null}
        </div>
      ) : null}

      <motion.div className="absolute inset-x-0 top-0 z-20 px-4 pt-6 pointer-events-none" style={{ opacity: overlayFade }}>
        <motion.div
          className="flex items-start justify-between gap-3"
          style={{ y: listHeaderY, opacity: listHeaderOpacity, pointerEvents: listHeaderPointerEvents }}
        >
          {/* 净资产标题 - 从上滑入 */}
          <motion.div
            key={`title-${animationKey}`}
            className="min-w-0"
            initial={(isInitialLoad || isReturning || isReturningFromDetail) ? { y: -50, opacity: 0 } : false}
            animate={initialized ? { y: 0, opacity: 1 } : false}
            transition={{ duration: 0.5, delay: (isReturning || isReturningFromDetail) ? 0.1 : 0.15, ease: [0.25, 0.46, 0.45, 0.94] }}
          >
            <div className="flex items-center gap-2 text-[13px] font-medium text-slate-500/80">
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
            key={`add-${animationKey}`}
            type="button"
            onClick={onAddAccount}
            className="iconBtn iconBtnPrimary shadow-sm"
            style={addButtonStyle}
            aria-label="add"
            initial={(isInitialLoad || isReturning || isReturningFromDetail) ? { y: -50, opacity: 0 } : false}
            animate={initialized ? { y: 0, opacity: 1 } : false}
            transition={{ duration: 0.5, delay: (isReturning || isReturningFromDetail) ? 0.15 : 0.2, ease: [0.25, 0.46, 0.45, 0.94] }}
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
        className="relative z-10 w-full h-full overflow-x-auto snap-x snap-mandatory flex scrollbar-hide overscroll-x-contain"
        style={homeScrollerStyle}
      >
        <div className="w-full h-full flex-shrink-0 snap-center snap-always overflow-y-hidden" style={horizontalPageStyle}>
          <div className="w-full h-full relative">
            <BubbleChartPage
              isActive={bubbleRuntime.pageActive}
              onNext={goToRatioPage}
              gesture={bubbleGesture}
            />
          </div>
        </div>

        <div className="w-full h-full flex-shrink-0 snap-center snap-always overflow-y-hidden" style={horizontalPageStyle}>
          <AssetsRatioPage onBack={goToListPage} />
        </div>

        <div className="w-full h-full flex-shrink-0 snap-center snap-always overflow-y-hidden" style={containedPageStyle}>
          <div className="w-full h-full">
            <AssetsListPage
              key={`list-${animationKey}`}
              grouped={grouped}
              getIcon={getIcon}
              onPickType={handlePickType}
              expandedGroup={expandedGroup}
              onToggleGroup={handleToggleGroup}
              hideAmounts={hideAmounts}
              scrollRef={listScrollRef}
              onGroupEl={onGroupEl}
              isInitialLoad={isInitialLoad}
              isReturning={isReturning}
              isReturningFromDetail={isReturningFromDetail}
            />
          </div>
        </div>

        {detailPageMounted ? (
          <div className="w-full h-full flex-shrink-0 snap-center snap-always overflow-y-auto" style={containedPageStyle}>
            <AssetsTypeDetailPage
              type={selectedType}
              accounts={accounts}
              getIcon={getIcon}
              hideAmounts={hideAmounts}
              themeColor={selectedThemeColor}
              activeAccountId={activeAccountId}
              onBack={handleDetailBack}
              onEditAccount={onEditAccount}
            />
          </div>
        ) : null}
      </div>
    </div>
  )
}
