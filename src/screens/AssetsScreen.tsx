import { AnimatePresence, motion, useMotionValue, useTransform } from 'framer-motion'
import { BarChart3, Cloud, Eye, EyeOff, MoreHorizontal, Plus, TrendingUp } from 'lucide-react'
import { type ComponentType, type CSSProperties, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { getAccountTypeOption, type Account, type AccountGroup, type AccountTypeId } from '../lib/accounts'
import { formatCny } from '../lib/format'
import { pickForegroundColor } from '../lib/themes'
import { allocateIntegerPercents } from '../lib/percent'
import { addMoney } from '../lib/money'
import { CLOUD_SYNC_SETTINGS_KEY, DEFAULT_CLOUD_SYNC_SETTINGS, coerceCloudSyncSettings, hasCloudCredentials } from '../lib/cloud'
import { CLOUD_SYNC_DIRTY_KEY, readCloudSyncDirtyToken } from '../lib/cloudSync'
import { STORAGE_WRITE_EVENT, type StorageWriteDetail } from '../lib/storageEvents'
import { useLocalStorageState } from '../lib/useLocalStorageState'
import { overshootEase, quickFade } from '../lib/motionPresets'
import {
  LIST_GROUP_ORDER,
  computeAssetFillerRect,
  computeBlockKinds,
  computeDebtFillerRect,
  computeListBlockRects,
  computeRatioLayout,
  getBubbleRuntimeState,
  getListCorner,
  getRatioCorner,
  isSameBubbleRuntimeState,
  isSameRectMap,
  lerp,
  type BubbleRuntimeState,
  type GroupId,
  type ListMeasureItem,
  type Rect,
} from '../lib/homeGeometry'
import { AssetsListPage } from './AssetsListPage'
import { AssetsRatioPage, RATIO_CHART_TOP, type RatioPageBlock } from './AssetsRatioPage'
import { AssetsTypeDetailPage } from './AssetsTypeDetailPage'
import { BubbleChartPage } from './BubbleChartPage'
import { OverlayBlock, type HomeBlockGeometry, type OverlayBlockModel } from './HomeOverlayBlock'
import { AnimatedAmount } from '../components/AnimatedAmount'
import { useBubblePhysics, type BubbleNode } from '../components/BubbleChartPhysics'

export type GroupedAccounts = {
  groupCards: Array<{ group: AccountGroup; accounts: Account[]; total: number }>
  assetsTotal: number
  debtTotal: number
  netWorth: number
}

const INITIAL_HOME_PAGE_INDEX = 2
const HOME_PAGE_ACTIVE_TOLERANCE = 0.12
const HIDE_AMOUNTS_KEY = 'ratio.hideAmounts'

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

type Block = OverlayBlockModel


export function AssetsScreen(props: {
  grouped: GroupedAccounts
  getIcon: (type: AccountTypeId) => ComponentType<{ size?: number }>
  onEditAccount: (account: Account) => void
  onAddAccount: () => void
  onNavigate: (tab: 'trend' | 'stats' | 'settings') => void
  activeAccountId?: string | null
  skipInitialAnimation?: boolean
  addButtonTone?: string
  onHomePageActiveChange?: (active: boolean) => void
}) {
  const {
    grouped,
    getIcon,
    onEditAccount,
    onAddAccount,
    onNavigate,
    activeAccountId,
    skipInitialAnimation = false,
    addButtonTone,
    onHomePageActiveChange,
  } = props

  const viewportRef = useRef<HTMLDivElement | null>(null)
  const scrollerRef = useRef<HTMLDivElement | null>(null)
  const listScrollRef = useRef<HTMLDivElement | null>(null)
  const moreRef = useRef<HTMLDivElement | null>(null)
  const resizeObserverRef = useRef<ResizeObserver | null>(null)
  const measureRafRef = useRef<number | null>(null)
  const initRafRef = useRef<number | null>(null)
  const groupElsRef = useRef<Partial<Record<GroupId, HTMLDivElement | null>>>({})

  const [selectedType, setSelectedType] = useState<AccountTypeId | null>(null)
  const [expandedGroup, setExpandedGroup] = useState<GroupId | null>(null)
  const [moreOpen, setMoreOpen] = useState(false)
  const [hideAmounts, setHideAmounts] = useLocalStorageState<boolean>(HIDE_AMOUNTS_KEY, false)
  const [cloudSync] = useLocalStorageState(CLOUD_SYNC_SETTINGS_KEY, DEFAULT_CLOUD_SYNC_SETTINGS, {
    coerce: coerceCloudSyncSettings,
  })
  const [cloudDirtyToken, setCloudDirtyToken] = useState(() => readCloudSyncDirtyToken())
  const [listRects, setListRects] = useState<Partial<Record<GroupId, Rect>>>({})
  const [viewport, setViewport] = useState({ w: 0, h: 0 })
  const [scrollerWidth, setScrollerWidth] = useState(0)
  // 当 skipInitialAnimation 为 true 时，initialized 直接为 true，但仍需等待 viewport 测量完成
  const [initialized, setInitialized] = useState(false)
  const [isInitialLoad, setIsInitialLoad] = useState(!skipInitialAnimation)
  const [detailPageMounted, setDetailPageMounted] = useState(false)
  const [showOverlayLabels, setShowOverlayLabels] = useState(true)

  const didInitRef = useRef(false)
  const anchoredScrollerWidthRef = useRef<number | null>(null)
  const detailCloseFallbackTimerRef = useRef<number | null>(null)
  const detailClosePendingRef = useRef(false)
  const detailPageReachedRef = useRef(false)
  const showOverlayLabelsRef = useRef(true)

  // 初始值设为一个大数，确保初始时不会显示动画（会被 useEffect 立即修正）
  const scrollLeft = useMotionValue(99999)

  const accounts = useMemo(() => grouped.groupCards.flatMap((g) => g.accounts), [grouped.groupCards])

  const maskedText = '*****'
  const maskedClass = 'tracking-[0.28em]'
  const cloudHasSuccessfulBackup = Boolean(
    cloudSync.lastBackupAt ||
      cloudSync.lastRestoreAt ||
      cloudSync.lastSyncStatus === 'ok',
  )
  const cloudConnected =
    hasCloudCredentials(cloudSync) &&
    !cloudDirtyToken &&
    cloudHasSuccessfulBackup

  useEffect(() => {
    const updateDirtyToken = () => setCloudDirtyToken(readCloudSyncDirtyToken())
    const onStorageWrite = (event: Event) => {
      if (!(event instanceof CustomEvent)) return
      const detail = event.detail as StorageWriteDetail | undefined
      if (detail?.key === CLOUD_SYNC_DIRTY_KEY) updateDirtyToken()
    }
    const onStorage = (event: StorageEvent) => {
      if (event.key === CLOUD_SYNC_DIRTY_KEY) updateDirtyToken()
    }
    window.addEventListener(STORAGE_WRITE_EVENT, onStorageWrite)
    window.addEventListener('storage', onStorage)
    return () => {
      window.removeEventListener(STORAGE_WRITE_EVENT, onStorageWrite)
      window.removeEventListener('storage', onStorage)
    }
  }, [])

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

  const reportHomePageActive = useCallback(
    (idx: number) => {
      onHomePageActiveChange?.(Math.abs(idx - INITIAL_HOME_PAGE_INDEX) <= HOME_PAGE_ACTIVE_TOLERANCE)
    },
    [onHomePageActiveChange],
  )

  const scrollHomeScrollerToListPage = useCallback(() => {
    const el = scrollerRef.current
    if (!el) return false

    const w = el.clientWidth
    if (w <= 0) return false

    const target = w * INITIAL_HOME_PAGE_INDEX
    const maxScrollLeft = Math.max(0, el.scrollWidth - w)
    if (maxScrollLeft + 1 < target) return false

    el.scrollLeft = target
    const actual = el.scrollLeft
    if (Math.abs(actual - target) > 1) return false

    if (scrollLeft.get() !== actual) scrollLeft.set(actual)
    anchoredScrollerWidthRef.current = w
    reportHomePageActive(INITIAL_HOME_PAGE_INDEX)
    return true
  }, [reportHomePageActive, scrollLeft])

  useEffect(() => {
    reportHomePageActive(scrollIdx.get())
    return scrollIdx.on('change', reportHomePageActive)
  }, [reportHomePageActive, scrollIdx])

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

  // 占比页是否处于（接近）当前页，用于启用色块点击展开、离开时自动收起
  const [ratioPageActive, setRatioPageActive] = useState(false)
  const ratioPageActiveRef = useRef(false)

  useEffect(() => {
    const update = (v: number) => {
      const next = v > 0.55 && v < 1.45
      if (ratioPageActiveRef.current === next) return
      ratioPageActiveRef.current = next
      setRatioPageActive(next)
    }

    update(scrollIdx.get())
    return scrollIdx.on('change', update)
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
      if (detailCloseFallbackTimerRef.current !== null) {
        window.clearTimeout(detailCloseFallbackTimerRef.current)
        detailCloseFallbackTimerRef.current = null
      }
      detailClosePendingRef.current = false
      detailPageReachedRef.current = false
      setSelectedType(type)
      setDetailPageMounted(true)
    },
    [],
  )
  const handleToggleGroup = useCallback((id: GroupId) => {
    setExpandedGroup((current) => (current === id ? null : id))
  }, [])
  const clearDetailCloseFallback = useCallback(() => {
    if (detailCloseFallbackTimerRef.current === null) return
    window.clearTimeout(detailCloseFallbackTimerRef.current)
    detailCloseFallbackTimerRef.current = null
  }, [])
  const finishDetailClose = useCallback(() => {
    clearDetailCloseFallback()
    detailClosePendingRef.current = false
    detailPageReachedRef.current = false

    const el = scrollerRef.current
    const listScrollLeft = (el?.clientWidth || 1) * 2
    if (el && el.scrollLeft > listScrollLeft) {
      el.scrollLeft = listScrollLeft
      if (scrollLeft.get() !== listScrollLeft) scrollLeft.set(listScrollLeft)
    }

    setSelectedType(null)
    setDetailPageMounted(false)
  }, [clearDetailCloseFallback, scrollLeft])
  const scheduleDetailCloseFallback = useCallback(() => {
    clearDetailCloseFallback()
    detailCloseFallbackTimerRef.current = window.setTimeout(finishDetailClose, 900)
  }, [clearDetailCloseFallback, finishDetailClose])
  const closeDetailPage = useCallback(
    (shouldScrollToList: boolean) => {
      if (detailClosePendingRef.current) return

      detailClosePendingRef.current = true
      detailPageReachedRef.current = false
      if (!shouldScrollToList) {
        finishDetailClose()
        return
      }

      scrollToPage(2)
      scheduleDetailCloseFallback()
    },
    [finishDetailClose, scheduleDetailCloseFallback, scrollToPage],
  )
  const handleDetailBack = useCallback(() => {
    closeDetailPage(true)
  }, [closeDetailPage])

  useLayoutEffect(() => {
    if (!detailPageMounted || !selectedType || detailClosePendingRef.current) return
    scrollToPage(3)
  }, [detailPageMounted, scrollerWidth, scrollToPage, selectedType])

  const ratioLayout = useMemo(
    () =>
      computeRatioLayout({
        assets: blocks.assets,
        debt: blocks.debt,
        assetsTotal: grouped.assetsTotal || 0,
        viewportW: viewport.w,
        viewportH: viewport.h,
        top: RATIO_CHART_TOP,
      }),
    [blocks, grouped.assetsTotal, viewport.h, viewport.w],
  )

  const blockKinds = useMemo(
    () =>
      computeBlockKinds({
        assetIds: blocks.assets.map((b) => b.id),
        hasDebtBlock: Boolean(blocks.debt),
        topAssetId: ratioLayout.topAssetId,
        bottomAssetId: ratioLayout.bottomAssetId,
        hasDebt: ratioLayout.hasDebt,
      }),
    [blocks.assets, blocks.debt, ratioLayout.bottomAssetId, ratioLayout.topAssetId, ratioLayout.hasDebt],
  )

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

  // 占比页点击展开所需的色块几何与分组账户数据
  const ratioPageBlocks = useMemo<RatioPageBlock[]>(
    () =>
      homeBlockGeometries.map((g) => ({
        id: g.block.id,
        name: g.block.name,
        tone: g.block.tone,
        amount: g.block.amount,
        percent: g.block.percent,
        rect: g.ratioRect,
        displayHeight: g.displayHeight,
        corner: g.ratioCorner,
      })),
    [homeBlockGeometries],
  )

  const accountsByGroup = useMemo(() => {
    const byGroup: Partial<Record<GroupId, Account[]>> = {}
    for (const g of grouped.groupCards) byGroup[g.group.id as GroupId] = g.accounts
    return byGroup
  }, [grouped.groupCards])

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
    const items: ListMeasureItem[] = []

    for (const id of order) {
      const el = groupElsRef.current[id]
      if (!el) continue
      const r = el.getBoundingClientRect()
      const top = r.top - rootRect.top
      const translateX = getTranslateX(el)
      const cardLeft = r.left - rootRect.left - translateX
      items.push({ id, top, height: r.height, cardLeft })
    }

    const next = computeListBlockRects(items, { listPageFinalOffsetX, maxBlockWidth, blockGap, overlap })

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
      if (measureRafRef.current !== null) {
        cancelAnimationFrame(measureRafRef.current)
        measureRafRef.current = null
      }
      if (initRafRef.current !== null) {
        cancelAnimationFrame(initRafRef.current)
        initRafRef.current = null
      }
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

  const initializeHomeScroller = useCallback(() => {
    if (didInitRef.current) return true
    didInitRef.current = true

    // Start at Page 2 (List) - 直接设置，不触发动画
    if (!scrollHomeScrollerToListPage()) {
      didInitRef.current = false
      return false
    }

    measureListRects()
    setInitialized(true)
    return true
  }, [measureListRects, scrollHomeScrollerToListPage])

  useLayoutEffect(() => {
    if (initializeHomeScroller()) return

    let attempts = 0
    const retry = () => {
      initRafRef.current = null
      if (initializeHomeScroller()) return
      attempts += 1
      if (attempts >= 120) return
      initRafRef.current = requestAnimationFrame(retry)
    }

    initRafRef.current = requestAnimationFrame(retry)
    return () => {
      if (initRafRef.current === null) return
      cancelAnimationFrame(initRafRef.current)
      initRafRef.current = null
    }
  }, [initializeHomeScroller])

  useLayoutEffect(() => {
    if (!initialized) return
    if (detailPageMounted) return
    // 只在滚动器宽度较上次锚定发生实际变化时才把页面拽回列表页。
    // 初始化经 rAF 重试成功后，initialized 翻转会让本 effect 在稍晚的提交中再次执行；
    // 若此时用户已滑到其他页（如占比页展开详情），无条件锚定会把用户拽回去。
    const width = scrollerRef.current?.clientWidth ?? 0
    if (anchoredScrollerWidthRef.current !== width) {
      if (!scrollHomeScrollerToListPage()) return
    }
    scheduleMeasure()
  }, [detailPageMounted, initialized, scheduleMeasure, scrollerWidth, scrollHomeScrollerToListPage])

  useEffect(() => {
    if (!initialized) return
    if (skipInitialAnimation) return
    const timer = window.setTimeout(() => setIsInitialLoad(false), 700)
    return () => window.clearTimeout(timer)
  }, [initialized, skipInitialAnimation])

  useEffect(() => {
    return () => {
      clearDetailCloseFallback()
      detailClosePendingRef.current = false
    }
  }, [clearDetailCloseFallback])

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
    const syncDetailReturn = () => {
      if (!detailPageMounted) return

      const w = el.clientWidth || 1
      const listScrollLeft = w * 2
      const detailScrollLeft = w * 3
      const reachedTolerance = Math.max(12, w * 0.04)
      const returnedTolerance = Math.max(8, w * 0.03)

      if (detailClosePendingRef.current) {
        if (el.scrollLeft <= listScrollLeft + returnedTolerance) finishDetailClose()
        return
      }

      if (el.scrollLeft >= detailScrollLeft - reachedTolerance) detailPageReachedRef.current = true
      if (detailPageReachedRef.current && el.scrollLeft <= listScrollLeft + returnedTolerance) {
        closeDetailPage(false)
      }
    }
    const onScroll = () => {
      if (clampToAvailablePages()) return
      syncDetailReturn()
      if (raf) cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        raf = 0
        if (!clampToAvailablePages()) {
          commitScrollLeft(el.scrollLeft)
          syncDetailReturn()
        }
      })
    }

    clampToAvailablePages()
    syncDetailReturn()
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      if (raf) cancelAnimationFrame(raf)
      el.removeEventListener('scroll', onScroll)
    }
  }, [closeDetailPage, detailPageMounted, finishDetailClose, scrollLeft])

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
      if (!touchStart) return

      const touch = e.touches[0]
      if (!touch) return

      const maxScroll = getListMaxScroll()
      const listPageTolerance = Math.max(4, (el.clientWidth || 1) * 0.01)
      const startedOnListPage = Math.abs(touchStart.scrollLeft - maxScroll) <= listPageTolerance
      const detailCloseStartedFromDetailPage = detailClosePendingRef.current && touchStart.scrollLeft >= maxScroll - listPageTolerance
      if (!startedOnListPage && !detailCloseStartedFromDetailPage) return

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
  }, [scrollLeft])

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

  // 计算负债上方的底色填充块（负债比例低于100%时）
  const debtFillerRect = useMemo(
    () => (blocks.debt ? computeDebtFillerRect(ratioLayout, RATIO_CHART_TOP) : null),
    [blocks.debt, ratioLayout],
  )

  // 计算资产底部的底色填充块（负债比例超过100%时）
  const assetFillerRect = useMemo(
    () => (blocks.debt ? computeAssetFillerRect(ratioLayout, viewport.w, viewport.h, RATIO_CHART_TOP) : null),
    [blocks.debt, ratioLayout, viewport.h, viewport.w],
  )

  // 负债上方底色填充块的动画值
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
  // 底色填充块只在 ratio 页面（page 1）显示，在 list 页面（page 2）完全隐藏
  const debtFillerOpacity = useTransform(scrollIdx, [0.8, 1, 1.8, 2], [0, 1, 0.5, 0])

  // 资产底部底色填充块的动画值
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
  // 底色填充块只在 ratio 页面（page 1）显示，在 list 页面（page 2）完全隐藏
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

  const fallbackHome = !initialized ? (
    <div className="absolute inset-0 z-30 flex flex-col" style={{ background: 'var(--bg)' }}>
      <div className="px-4 pt-6 pb-2 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[13px] font-medium text-slate-500/80">
            <span>我的净资产 (CNY)</span>
          </div>
          <div className="mt-1 text-[34px] font-semibold tracking-tight text-slate-900">
            {hideAmounts ? <span className={maskedClass}>{maskedText}</span> : formatCny(grouped.netWorth)}
          </div>
        </div>
        <button
          type="button"
          onClick={onAddAccount}
          className="iconBtn iconBtnPrimary shadow-sm"
          style={addButtonStyle}
          aria-label="add"
        >
          <Plus size={22} strokeWidth={2.75} />
        </button>
      </div>

      <div className="relative flex-1 min-h-0">
        <AssetsListPage
          grouped={grouped}
          getIcon={getIcon}
          onPickType={handlePickType}
          expandedGroup={expandedGroup}
          onToggleGroup={handleToggleGroup}
          hideAmounts={hideAmounts}
          isInitialLoad={false}
        />
      </div>

      <div className="absolute left-4 bottom-4 z-20">
        <div className="flex items-center gap-1 bg-white/85 backdrop-blur-lg backdrop-saturate-150 border border-white/70 shadow-[0_1px_2px_rgba(15,23,42,0.05),0_12px_32px_-14px_rgba(15,23,42,0.32)] rounded-full p-1">
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
        </div>
      </div>
    </div>
  ) : null

  return (
    <div ref={viewportRef} className="relative w-full h-full overflow-hidden" style={{ background: 'var(--bg)' }}>
      {fallbackHome}
      {/* 只有初始化完成后才显示 overlay 块，带启动动画 */}
      {initialized ? (
        <div className="absolute inset-0 z-0 pointer-events-none">
          {/* 负债上方的底色填充块（负债比例低于100%时） */}
          {debtFillerRect ? (
          <motion.div
            className="absolute left-0 top-0 pointer-events-none"
            style={{
              x: debtFillerLeft,
              y: debtFillerTop,
              width: debtFillerWidth,
              height: debtFillerHeight,
              background: 'var(--card)',
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

        {/* 资产底部的底色填充块（负债比例超过100%时） */}
        {assetFillerRect ? (
          <motion.div
            className="absolute left-0 top-0 pointer-events-none"
            style={{
              x: assetFillerLeft,
              y: assetFillerTop,
              width: assetFillerWidth,
              height: assetFillerHeight,
              background: 'var(--card)',
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
            key={geometry.block.id}
            geometry={geometry}
            scrollIdx={scrollIdx}
            overlayFade={overlayFade}
            labelsOpacity={labelsOpacity}
            showLabels={showOverlayLabels}
            isInitialLoad={isInitialLoad}
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

      <motion.div
        aria-hidden={!initialized}
        className="absolute inset-x-0 top-0 z-20 px-4 pt-6 pointer-events-none"
        style={{ opacity: overlayFade }}
      >
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
            <div className="flex items-center gap-2 text-[13px] font-medium text-slate-500/80">
              <span>我的净资产 (CNY)</span>
              <button
                type="button"
                className="w-7 h-7 -m-1.5 rounded-full flex items-center justify-center text-slate-400 hover:bg-black/5 active:bg-black/10 transition-colors"
                onClick={() => setHideAmounts((v) => !v)}
                aria-label={hideAmounts ? 'show amounts' : 'hide amounts'}
              >
                {hideAmounts ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
              {cloudConnected ? (
                <motion.span
                  className="w-5 h-5 -m-0.5 flex items-center justify-center text-emerald-500 drop-shadow-[0_2px_4px_rgba(16,185,129,0.28)]"
                  initial={{ opacity: 0, scale: 0.45, y: -3 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  transition={{ duration: 0.36, ease: overshootEase }}
                  aria-label="cloud connected"
                  title="云端已连接"
                >
                  <Cloud size={16} strokeWidth={2.7} />
                </motion.span>
              ) : null}
            </div>
            <div className="mt-1 text-[34px] font-semibold tracking-tight text-slate-900">
              <AnimatePresence mode="wait" initial={false}>
                <motion.span
                  key={hideAmounts ? 'masked' : 'visible'}
                  className={hideAmounts ? `inline-block ${maskedClass}` : 'inline-block'}
                  initial={{ opacity: 0, y: 9, scale: 0.985 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -9, scale: 0.985, transition: { duration: 0.12, ease: [0.4, 0, 1, 1] } }}
                  transition={quickFade}
                >
                  {hideAmounts ? maskedText : <AnimatedAmount value={grouped.netWorth} />}
                </motion.span>
              </AnimatePresence>
            </div>
          </motion.div>

          {/* 添加按钮 - 从上滑入，稍微延迟 */}
          <motion.button
            type="button"
            onClick={onAddAccount}
            className="iconBtn iconBtnPrimary shadow-sm"
            style={addButtonStyle}
            aria-label="add"
            initial={isInitialLoad ? { y: -50, opacity: 0 } : false}
            animate={initialized ? { y: 0, opacity: 1 } : false}
            transition={{ duration: 0.5, delay: 0.2, ease: [0.25, 0.46, 0.45, 0.94] }}
          >
            <Plus size={22} strokeWidth={2.75} />
          </motion.button>
        </motion.div>
      </motion.div>

      <motion.div
        aria-hidden={!initialized}
        className="absolute left-4 bottom-4 z-20 pointer-events-none"
        style={{ opacity: overlayFade }}
      >
        <motion.div style={{ opacity: miniBarOpacity, y: miniBarY, pointerEvents: miniBarPointerEvents }}>
          <div ref={moreRef} className="relative">
            <div className="flex items-center gap-1 bg-white/85 backdrop-blur-lg backdrop-saturate-150 border border-white/70 shadow-[0_1px_2px_rgba(15,23,42,0.05),0_12px_32px_-14px_rgba(15,23,42,0.32)] rounded-full p-1">
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
                  initial={{ opacity: 0, y: 10, scale: 0.92 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 6, scale: 0.96, transition: { duration: 0.13, ease: [0.4, 0, 1, 1] } }}
                  transition={{ type: 'spring', stiffness: 560, damping: 38, mass: 0.7 }}
                  style={{ transformOrigin: 'bottom left' }}
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
        aria-hidden={!initialized}
        data-testid="home-scroller"
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
          <AssetsRatioPage
            onBack={goToListPage}
            blocks={ratioPageBlocks}
            accountsByGroup={accountsByGroup}
            getIcon={getIcon}
            hideAmounts={hideAmounts}
            viewport={viewport}
            active={ratioPageActive}
            chartRadius={chartRadius}
          />
        </div>

        <div className="w-full h-full flex-shrink-0 snap-center snap-always overflow-y-hidden" style={containedPageStyle}>
          <div className="w-full h-full">
            <AssetsListPage
              grouped={grouped}
              getIcon={getIcon}
              onPickType={handlePickType}
              expandedGroup={expandedGroup}
              onToggleGroup={handleToggleGroup}
              hideAmounts={hideAmounts}
              scrollRef={listScrollRef}
              onGroupEl={onGroupEl}
              isInitialLoad={isInitialLoad}
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
