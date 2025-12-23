import { AnimatePresence, motion, useMotionValue, useSpring, useTransform, type MotionValue } from 'framer-motion'
import { BarChart3, Eye, EyeOff, MoreHorizontal, Plus, TrendingUp } from 'lucide-react'
import { type ComponentType, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { getAccountTypeOption, type Account, type AccountGroup, type AccountTypeId } from '../lib/accounts'
import { formatCny } from '../lib/format'
import { pickForegroundColor } from '../lib/themes'
import { allocateIntegerPercents } from '../lib/percent'
import { AssetsListPage } from './AssetsListPage'
import { AssetsRatioPage } from './AssetsRatioPage'
import { AssetsTypeDetailPage } from './AssetsTypeDetailPage'
import { BubbleChartPage } from './BubbleChartPage'
import { useBubblePhysics, type BubbleNode } from '../components/BubbleChartPhysics'

/** Linear interpolation helper */
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

function rubberband(distance: number, max: number, k = 80): number {
  const d = Math.max(0, distance)
  const m = Math.max(0, max)
  const stiffness = Math.max(1, k)
  return m * (1 - Math.exp(-d / stiffness))
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

function OverlayBlock(props: {
  block: OverlayBlockModel
  kind: CornerKind
  ratioRect?: Rect
  listRect?: Rect
  displayHeight?: number
  bubblePos?: { x: MotionValue<number>; y: MotionValue<number> }
  bubbleRadius?: number
  scrollIdx: MotionValue<number>
  overlayFade: MotionValue<number>
  labelsOpacity: MotionValue<number>
  chartRadius: number
  listRadius: number
  isReturning?: boolean
  isInitialLoad?: boolean
  isReturningFromDetail?: boolean
  blockIndex?: number
  viewportWidth?: number
}) {
  const {
    block,
    kind,
    ratioRect,
    listRect,
    displayHeight,
    bubblePos,
    bubbleRadius,
    scrollIdx,
    overlayFade,
    labelsOpacity,
    chartRadius,
    listRadius,
    isReturning = false,
    isInitialLoad = false,
    isReturningFromDetail = false,
    blockIndex = 0,
    viewportWidth = 400,
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
    // List 模式：list.h 由 measureListRects 计算，包含「到下一个条目顶部的距离」以及
    // 「覆盖下一个色块圆角所需的重叠量」，确保：
    // 1) 当前色块上沿与条目上沿对齐
    // 2) 视觉上当前色块下沿对齐到下一个条目上沿
    // 3) 下一个色块圆角空白由上一个色块填充（多层叠不露底）
    const listH = list.h

    return lerp(ratio.h, listH, Math.min(1, Math.max(0, idx - 1)))
  })
  
  const opacity = useTransform([overlayFade], ([a]) => a)

  // 圆角逻辑：
  // - 有负债时：负债左上角无圆角（与资产区对齐），资产左边无圆角
  // - 无负债时：资产左右上角有圆角，右下角无圆角
  // - 每个色块（除最后一个）都向下延伸，延伸部分垫在下方色块的圆角处
  // - 最底部色块右下角有圆角
  const ratioCorner =
    kind === 'debt'
      ? { tl: 0, tr: chartRadius, bl: chartRadius, br: 0 }
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

  // List 视图下的圆角逻辑：
  // - 左侧与屏幕齐平，不做圆角
  // - 右上始终圆角
  // - 只有列表最后一个条目的右下才做圆角
  //   （有负债时：负债永远最后；最后一个资产不做底部圆角，避免和负债形成“双圆角”）
  const isListLastBlock = kind === 'debt' || kind === 'assetBottomNoDebt' || kind === 'assetOnlyNoDebt'
  // List 模式的彩色色块：左侧与屏幕齐平，不做圆角；右侧做圆角（末尾块底部也圆角）
  const listCorner = { tl: 0, tr: listRadius, bl: 0, br: isListLastBlock ? listRadius : 0 }
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

  const textColor = pickForegroundColor(block.tone)

  const isDebt = kind === 'debt'

  // 计算文字布局和字体缩放
  // 基础字体大小
  const basePercentSize = 36 // 百分比数字的基础字体大小
  const basePercentSymbolSize = 15 // %符号的基础字体大小
  const baseLabelSize = 16 // Ratio 图中资产/负债标签字号（非自适应时）
  const baseLabelMargin = 4 // 文字标签的上边距
  const normalPadding = 16 // 正常模式的上下 padding
  const adaptivePaddingValue = 4 // 自适应模式的上下 padding

  // 垂直布局的最小高度：百分比数字(34px) + 间距(4px) + 文字(12px) + padding(16px*2)
  const verticalMinHeight = basePercentSize + baseLabelMargin + baseLabelSize + normalPadding * 2

  // 水平布局的最小高度：百分比数字(34px) + padding(4px*2)（自适应模式使用更小的 padding）
  const horizontalMinHeight = basePercentSize + adaptivePaddingValue * 2

  // 根据可用高度计算布局和字体缩放
  const actualHeight = displayHeight ?? ratio.h

  // 负债块不需要动态调整
  const useHorizontalLayout = !isDebt && actualHeight < verticalMinHeight

  // 计算字体缩放比例（最小为1/3）
  let fontScale = 1
  if (!isDebt && actualHeight < horizontalMinHeight) {
    // 可用高度减去 padding 后的空间（自适应模式使用更小的 padding）
    const availableHeight = Math.max(0, actualHeight - adaptivePaddingValue * 2)
    // 计算缩放比例
    fontScale = Math.max(1 / 3, availableHeight / basePercentSize)
  }

  // 计算实际字体大小
  // 只有当 fontScale < 1 时才缩放，否则保持基础大小
  const needsScaling = fontScale < 1
  // 动态缩放时，百分比和文字使用相同的字体大小
  const percentSize = needsScaling ? Math.round(basePercentSize * fontScale) : basePercentSize
  const percentSymbolSize = needsScaling ? percentSize : basePercentSymbolSize
  // Keep label size consistent with non-adaptive sizing; only shrink if the block is too small.
  const labelSize = needsScaling ? Math.min(percentSize, baseLabelSize) : baseLabelSize

  // Padding: keep horizontal padding consistent so % stays left-aligned across blocks,
  // while allowing vertical padding to shrink in adaptive layouts.
  const paddingX = useTransform(scrollIdx, (idx) => {
    if (idx < 0.5) return 0 // Bubble 阶段无 padding
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
  const flexJustify = useTransform(scrollIdx, (v) => (v < 0.5 ? 'center' : 'flex-start')) // For debt col layout
  const contentScale = useTransform(scrollIdx, [0, 0.5, 1], [1.1, 1, 1]) // Slight scale up in bubble

  // Sphere visual effects (fade out as we scroll to ratio)
  const sphereEffectOpacity = useTransform(scrollIdx, [0, 0.5], [1, 0])

  // Text Crossfade
  // 0 -> 0.5: Show Amount (Bubble)
  // 0.5 -> 1: Show Percent (Ratio)
  const amountOpacity = useTransform(scrollIdx, [0, 0.35, 0.55], [1, 1, 0])
  const percentOpacity = useTransform(scrollIdx, [0.45, 0.65, 1], [0, 1, 1])

  // 动态计算 Percent View 的样式，确保在 Bubble 阶段保持正常显示
  // 使用 useTransform 让布局在过渡时平滑变化
  // 只有需要缩放时才进行过渡，否则保持基础大小
  const ratioPercentSize = useTransform(scrollIdx, (idx) => {
    if (idx < 0.5) return basePercentSize // Bubble 阶段使用基础大小
    if (!needsScaling) return basePercentSize // 不需要缩放时保持基础大小
    const t = Math.min(1, (idx - 0.5) * 2) // 0.5 -> 1 映射到 0 -> 1
    return Math.round(lerp(basePercentSize, percentSize, t))
  })

  const ratioPercentSymbolSize = useTransform(scrollIdx, (idx) => {
    if (idx < 0.5) return basePercentSymbolSize
    if (!needsScaling) return basePercentSymbolSize // 不需要缩放时保持基础大小
    const t = Math.min(1, (idx - 0.5) * 2)
    return Math.round(lerp(basePercentSymbolSize, percentSymbolSize, t))
  })

  const ratioLabelSize = useTransform(scrollIdx, (idx) => {
    if (idx < 0.5) return baseLabelSize
    if (!needsScaling) return baseLabelSize // 不需要缩放时保持基础大小
    const t = Math.min(1, (idx - 0.5) * 2)
    return Math.round(lerp(baseLabelSize, labelSize, t))
  })

  // 布局方向过渡
  const ratioFlexDirection = useTransform(scrollIdx, (idx) => {
    if (idx < 0.8) return 'column' // Bubble 到 Ratio 前期保持垂直布局
    return useHorizontalLayout ? 'row' : 'column'
  })

  // 水平布局时整体上下居中
  const ratioAlignItems = useTransform(scrollIdx, (idx) => {
    if (idx < 0.5) return 'center' // Bubble 阶段居中
    if (idx < 0.8) return 'flex-start' // Ratio 前期左上对齐
    return useHorizontalLayout ? 'center' : 'flex-start' // 水平布局时上下居中
  })

  const ratioLabelMarginTop = useTransform(scrollIdx, (idx) => {
    if (idx < 0.8) return 4
    return useHorizontalLayout ? 0 : 4
  })

  const ratioLabelMarginLeft = useTransform(scrollIdx, (idx) => {
    if (idx < 0.8) return 0
    return useHorizontalLayout ? 6 : 0
  })

  // 计算被遮挡的延伸高度（用于调整内容居中位置）
  // ratio.h 是色块总高度（含延伸），displayHeight 是实际显示高度
  const extendedHeight = displayHeight ? ratio.h - displayHeight : 0

  // 内容区域底部 padding，用于将内容"推"到可见区域内居中
  const ratioContentPaddingBottom = useTransform(scrollIdx, (idx) => {
    // Bubble 阶段和非水平布局时不需要调整
    if (idx < 0.8) return 0
    // 水平布局时，添加底部 padding 等于被遮挡的延伸高度
    if (useHorizontalLayout && extendedHeight > 0) {
      return extendedHeight
    }
    return 0
  })
  
  // Pointer events for text to avoid overlap issues during fade? (pointer-events-none is on parent anyway)

  // 是否需要入场动画（首次加载、从其他页面返回、或从详情页返回）
  const needsEnterAnimation = isInitialLoad || isReturning || isReturningFromDetail

  // 入场动画的 translateX 偏移（从左侧飞入）
  const enterTranslateX = needsEnterAnimation ? -viewportWidth : 0

  return (
    <motion.div
      className="absolute pointer-events-none"
      initial={needsEnterAnimation ? { translateX: enterTranslateX, opacity: 0 } : false}
      animate={{ translateX: 0, opacity: 1 }}
      transition={needsEnterAnimation ? {
        duration: 0.5,
        delay: blockIndex * 0.04,
        ease: [0.2, 0, 0, 1]
      } : undefined}
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
                 className="absolute inset-0 flex"
                 style={{
                     paddingBottom: ratioContentPaddingBottom,
                     opacity: percentOpacity,
                     justifyContent: isDebt ? 'center' : 'flex-start',
                     alignItems: isDebt ? 'flex-start' : ratioAlignItems,
                     flexDirection: ratioFlexDirection,
                 }}
            >
                 <motion.div
                   className="font-semibold tracking-tight leading-none"
                   style={{ fontSize: ratioPercentSize }}
                 >
                    {block.percent}
                    <motion.span
                      className="ml-0.5"
                      style={{ fontSize: ratioPercentSymbolSize }}
                    >%</motion.span>
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
    </motion.div>
  )
}

export function AssetsScreen(props: {
  grouped: GroupedAccounts
  getIcon: (type: AccountTypeId) => ComponentType<{ size?: number }>
  onEditAccount: (account: Account) => void
  onAddAccount: () => void
  onNavigate: (tab: 'trend' | 'stats' | 'settings') => void
  skipInitialAnimation?: boolean
  addButtonTone?: string
}) {
  const { grouped, getIcon, onEditAccount, onAddAccount, onNavigate, skipInitialAnimation = false, addButtonTone } = props

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

  const didInitRef = useRef(false)

  // 初始值设为一个大数，确保初始时不会显示动画（会被 useEffect 立即修正）
  const scrollLeft = useMotionValue(99999)

  const edgeLockRef = useRef(false)
  const edgePointerDownRef = useRef(false)
  const edgePullTargetX = useMotionValue(0)
  const edgePullX = useSpring(edgePullTargetX, { stiffness: 400, damping: 40, mass: 1 })
  const edgePullScale = useTransform(edgePullX, [-60, 0], [0.99, 1])

  const accounts = useMemo(() => grouped.groupCards.flatMap((g) => g.accounts), [grouped.groupCards])

  const maskedText = '*****'
  const maskedClass = 'tracking-[0.28em]'

  const addButtonStyle = useMemo(() => {
    if (!addButtonTone) return undefined
    return { background: addButtonTone, color: pickForegroundColor(addButtonTone) }
  }, [addButtonTone])

  const scrollToPage = (index: number) => {
    const el = scrollerRef.current
    if (!el) return
    const w = el.clientWidth || 0
    el.scrollTo({ left: w * index, behavior: 'smooth' })
  }

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
    const assetTotal = assetAmounts.reduce((s, a) => s + a.amount, 0)
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

  const measureListRects = useCallback(() => {
    const root = viewportRef.current
    if (!root) return

    const w = scrollerWidth || root.clientWidth || 1
    const idx = scrollLeft.get() / w
    // Measure only when near list page (index 2)
    if (Math.abs(idx - 2) > 0.12) return

    const rootRect = root.getBoundingClientRect()
    const next: Partial<Record<GroupId, Rect>> = {}
    const blockGap = 12
    const overlap = listRadius

    const getTranslateX = (el: HTMLElement): number => {
      const transform = window.getComputedStyle(el).transform
      if (!transform || transform === 'none') return 0

      const m2d = transform.match(/^matrix\((.+)\)$/)
      if (m2d) {
        const parts = m2d[1].split(',').map((p) => Number.parseFloat(p.trim()))
        const tx = parts[4]
        return Number.isFinite(tx) ? tx : 0
      }

      const m3d = transform.match(/^matrix3d\((.+)\)$/)
      if (m3d) {
        const parts = m3d[1].split(',').map((p) => Number.parseFloat(p.trim()))
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

      const blockWidth = Math.max(0, Math.round(item.cardLeft - blockGap))
      const baseHeight = nextItem ? Math.max(0, nextItem.top - item.top) : Math.max(0, item.height)
      const blockHeight = nextItem ? baseHeight + overlap : baseHeight

      next[item.id] = {
        x: 0,
        y: item.top,
        w: blockWidth,
        h: blockHeight,
      }
    }

    setListRects(next)
  }, [scrollLeft, scrollerWidth])

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
    scrollLeft.set(w * 2)

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

  const edgePointerXRef = useRef<number | null>(null)

  useEffect(() => {
    const el = scrollerRef.current
    if (!el) return

    let raf = 0
    const onScroll = () => {
      if (!selectedType) {
        const w = el.clientWidth || 1
        const maxScroll = w * 2
        const current = el.scrollLeft

        // 核心修正：无论是否有手势，只要不是 selectedType 状态，都强制不允许超过 maxScroll
        if (current > maxScroll) {
          // 如果用户正在按住并拖动，计算阻尼偏移
          if (edgePointerDownRef.current && edgePointerXRef.current !== null) {
            edgeLockRef.current = true
            // 使用 pointer 位置来计算 delta，避免 scrollLeft 抖动影响
            // 需要记录按下时的初始 pointerX，但这里简化处理：
            // 我们通过计算当前 scrollLeft 超出多少来映射阻尼，但强制重置 scrollLeft

            // 为了避免抖动，这里我们使用 current 超过 maxScroll 的部分
            const overscroll = current - maxScroll
            edgePullTargetX.set(-rubberband(overscroll, 60, 160))
          }

          // 强制重置滚动位置，防止看到空白页
          if (el.scrollLeft !== maxScroll) el.scrollLeft = maxScroll
          scrollLeft.set(maxScroll)
          return
        }
      }

      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        const w = el.clientWidth || 1
        const currentScroll = el.scrollLeft
        const maxScroll = w * 2

        if (!selectedType) {
          // 如果在锁定状态
          if (edgeLockRef.current) {
             // 如果用户已经松手，或者是回弹过程中
             if (!edgePointerDownRef.current) {
               edgeLockRef.current = false
               edgePullTargetX.set(0)
             } else if (currentScroll <= maxScroll) {
               // 还没松手但滚回了范围内
               edgeLockRef.current = false
               edgePullTargetX.set(0)
             } else {
               // 还在拖动且在边界外，强制锁住
               if (el.scrollLeft !== maxScroll) el.scrollLeft = maxScroll
               scrollLeft.set(maxScroll)
               return
             }
          }

          // 正常滚动情况
          scrollLeft.set(currentScroll)
          return
        }

        // selectedType 状态（详情页），允许正常滚动
        edgeLockRef.current = false
        edgePullTargetX.set(0)
        scrollLeft.set(currentScroll)
      })
    }

    const onPointerDown = (e: PointerEvent) => {
      edgePointerDownRef.current = true
      edgePointerXRef.current = e.clientX
    }
    const onPointerMove = (e: PointerEvent) => {
      if (edgePointerDownRef.current) {
        edgePointerXRef.current = e.clientX
      }
    }
    const onPointerEnd = () => {
      edgePointerDownRef.current = false
      edgePointerXRef.current = null
      edgeLockRef.current = false
      edgePullTargetX.set(0)
    }

    el.addEventListener('pointerdown', onPointerDown, { passive: true })
    window.addEventListener('pointermove', onPointerMove, { passive: true })
    el.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('pointerup', onPointerEnd, { passive: true })
    window.addEventListener('pointercancel', onPointerEnd, { passive: true })
    window.addEventListener('touchend', onPointerEnd, { passive: true })
    window.addEventListener('touchcancel', onPointerEnd, { passive: true })
    return () => {
      cancelAnimationFrame(raf)
      el.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('pointermove', onPointerMove)
      el.removeEventListener('scroll', onScroll)
      window.removeEventListener('pointerup', onPointerEnd)
      window.removeEventListener('pointercancel', onPointerEnd)
      window.removeEventListener('touchend', onPointerEnd)
      window.removeEventListener('touchcancel', onPointerEnd)
    }
  }, [edgePullTargetX, scrollLeft, selectedType])

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
        {overlayBlocksInListOrder.map((b, i) => (
          <OverlayBlock
            key={`${b.id}-${animationKey}`}
            block={b}
            kind={blockKinds[b.id] ?? 'assetMiddle'}
            ratioRect={ratioLayout.rects[b.id]}
            listRect={listRects[b.id]}
            displayHeight={b.id === 'debt' ? undefined : ratioLayout.displayHeights[b.id]}
            bubblePos={bubblePositions.get(b.id)}
            bubbleRadius={bubbleNodes.find(n => n.id === b.id)?.radius}
            scrollIdx={scrollIdx}
            overlayFade={overlayFade}
            labelsOpacity={labelsOpacity}
            chartRadius={chartRadius}
            listRadius={listRadius}
            isReturning={isReturning}
            isInitialLoad={isInitialLoad}
            isReturningFromDetail={isReturningFromDetail}
            blockIndex={i}
            viewportWidth={viewport.w}
          />
        ))}
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
          <motion.div className="w-full h-full" style={{ x: edgePullX, scale: edgePullScale }}>
            <AssetsListPage
              key={`list-${animationKey}`}
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
              isReturning={isReturning}
              isReturningFromDetail={isReturningFromDetail}
            />
          </motion.div>
        </div>

        <div className="w-full h-full flex-shrink-0 snap-center snap-always overflow-y-auto">
          <AssetsTypeDetailPage
            type={selectedType}
            accounts={accounts}
            getIcon={getIcon}
            hideAmounts={hideAmounts}
            themeColor={selectedThemeColor}
            onBack={() => {
              setIsReturningFromDetail(true)
              setAnimationKey(k => k + 1)
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
