import { motion, type Transition } from 'framer-motion'
import { ChevronRight, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState, type ComponentType } from 'react'
import type { Account, AccountGroupId, AccountTypeId } from '../lib/accounts'
import { formatCny } from '../lib/format'
import { expressiveEase } from '../lib/motionPresets'
import {
  buildGroupBreakdown,
  buildToneScale,
  distributeSegmentHeights,
  type RatioBreakdownItem,
} from '../lib/ratioBreakdown'
import { isLightColor, pickForegroundColor } from '../lib/themes'
import { useReducedMotion } from '../lib/useReducedMotion'

/** 占比图表区域距页面顶部的高度（与 AssetsScreen 的 ratioLayout 共用） */
export const RATIO_CHART_TOP = 64

export type RatioRect = { x: number; y: number; w: number; h: number }

export type RatioCornerRadii = { tl: number; tr: number; bl: number; br: number }

export type RatioPageBlock = {
  id: AccountGroupId
  name: string
  tone: string
  amount: number
  percent: number
  rect?: RatioRect
  /** 视觉高度（不含垫在下一个色块圆角下的延伸部分） */
  displayHeight?: number
  corner: RatioCornerRadii
}

const PANEL_HEADER_HEIGHT = 104
const SEGMENT_GAP = 5
const SEGMENT_MIN_HEIGHT = 40
const SEGMENT_AREA_INSET_X = 12
const SEGMENT_AREA_INSET_BOTTOM = 12
const SEGMENT_RADIUS = 20

const maskedText = '*****'

type ExpandPhase = 'open' | 'closing'

/** 百分比用轻微上移动画出现；数字本身始终使用最终值，避免计时器被浏览器节流后停在错误数值 */
function AnimatedPercent(props: {
  value: number
  delay: number
  animated: boolean
  numberSize: number
  symbolSize: number
}) {
  const { value, delay, animated, numberSize, symbolSize } = props

  return (
    <motion.span
      className="font-semibold tracking-tight leading-none shrink-0"
      style={{ fontSize: numberSize }}
      initial={animated ? { opacity: 0, y: 8 } : false}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: animated ? 0.24 : 0, delay: animated ? delay : 0, ease: expressiveEase }}
    >
      <span>{value}</span>
      <span className="ml-0.5" style={{ fontSize: symbolSize }}>
        %
      </span>
    </motion.span>
  )
}

/**
 * 复刻色块在占比页静止状态下的标签（OverlayBlockLabels 在 scrollIdx = 1 时的样子），
 * 让展开/收起的首尾帧与底下的色块完全一致，形成无缝衔接。
 */
function BlockLabelReplica(props: { name: string; percent: number; tone: string; isDebt: boolean; height: number }) {
  const { name, percent, tone, isDebt, height } = props
  const textColor = pickForegroundColor(tone)

  const basePercentSize = 36
  const verticalMinHeight = 88
  const horizontalMinHeight = 44
  const useHorizontalLayout = !isDebt && height < verticalMinHeight

  let fontScale = 1
  if (!isDebt && height < horizontalMinHeight) {
    fontScale = Math.max(1 / 3, Math.max(0, height - 8) / basePercentSize)
  }

  const needsScaling = fontScale < 1
  const percentSize = needsScaling ? Math.round(basePercentSize * fontScale) : basePercentSize
  const percentSymbolSize = needsScaling ? percentSize : 15
  const labelSize = needsScaling ? Math.min(percentSize, 16) : 16

  return (
    <div
      className="w-full h-full"
      style={{ color: textColor, padding: `${useHorizontalLayout ? 4 : 16}px 16px` }}
    >
      <div
        className="w-full h-full flex"
        style={{
          flexDirection: useHorizontalLayout ? 'row' : 'column',
          justifyContent: isDebt ? 'center' : 'flex-start',
          alignItems: isDebt ? 'flex-start' : useHorizontalLayout ? 'center' : 'flex-start',
        }}
      >
        <div className="font-semibold tracking-tight leading-none" style={{ fontSize: percentSize }}>
          {percent}
          <span className="ml-0.5" style={{ fontSize: percentSymbolSize }}>
            %
          </span>
        </div>
        <div
          className="font-medium opacity-85"
          style={{
            fontSize: labelSize,
            marginTop: useHorizontalLayout ? 0 : 4,
            marginLeft: useHorizontalLayout ? 6 : 0,
          }}
        >
          {name}
        </div>
      </div>
    </div>
  )
}

/** 分段内容按最终高度自适应三档布局：纵向大字 / 单行 / 紧凑单行 */
function BreakdownSegmentContent(props: {
  item: RatioBreakdownItem
  height: number
  index: number
  Icon: ComponentType<{ size?: number }>
  hideAmounts: boolean
  animatePercent: boolean
}) {
  const { item, height, index, Icon, hideAmounts, animatePercent } = props
  const percentDelay = 0.18 + index * 0.05
  const amountText = hideAmounts ? maskedText : `${formatCny(item.amount)} · ${item.count} 项`
  const amountClass = hideAmounts ? 'tracking-[0.28em]' : ''

  if (height >= 92) {
    return (
      <div className="w-full h-full flex flex-col justify-between px-4 pt-3.5 pb-3">
        <AnimatedPercent
          value={item.percent}
          delay={percentDelay}
          animated={animatePercent}
          numberSize={30}
          symbolSize={13}
        />
        <div className="flex items-end justify-between gap-2 min-w-0">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="flex shrink-0">
              <Icon size={15} />
            </span>
            <span className="text-[13px] font-semibold truncate">{item.name}</span>
          </div>
          <span className={`text-[11px] font-medium opacity-80 shrink-0 ${amountClass}`}>{amountText}</span>
        </div>
      </div>
    )
  }

  if (height >= 54) {
    return (
      <div className="w-full h-full flex items-center gap-2.5 px-4">
        <AnimatedPercent
          value={item.percent}
          delay={percentDelay}
          animated={animatePercent}
          numberSize={20}
          symbolSize={11}
        />
        <span className="flex shrink-0">
          <Icon size={14} />
        </span>
        <span className="text-[13px] font-semibold truncate">{item.name}</span>
        <span className={`ml-auto text-[11px] font-medium opacity-80 shrink-0 ${amountClass}`}>{amountText}</span>
      </div>
    )
  }

  return (
    <div className="w-full h-full flex items-center gap-2 px-4">
      <AnimatedPercent
        value={item.percent}
        delay={percentDelay}
        animated={animatePercent}
        numberSize={15}
        symbolSize={10}
      />
      <span className="text-[12px] font-semibold truncate">{item.name}</span>
      <span className={`ml-auto text-[10px] font-medium opacity-80 shrink-0 ${amountClass}`}>{amountText}</span>
    </div>
  )
}

/**
 * 展开后的占比详情面板：从色块矩形以弹簧动画生长到整个图表区域，
 * 内部为「大类汇总头部 + 按类型分段的占比图」，分段沿父级色调做明暗阶梯。
 */
function RatioExpandedPanel(props: {
  block: RatioPageBlock
  origin: RatioRect
  accounts: Account[]
  target: RatioRect
  chartRadius: number
  phase: ExpandPhase
  hideAmounts: boolean
  reduceMotion: boolean
  getIcon: (type: AccountTypeId) => ComponentType<{ size?: number }>
  onRequestClose: () => void
  onClosed: () => void
}) {
  const {
    block,
    origin,
    accounts,
    target,
    chartRadius,
    phase,
    hideAmounts,
    reduceMotion,
    getIcon,
    onRequestClose,
    onClosed,
  } = props

  const isOpen = phase === 'open'
  const isDebt = block.id === 'debt'
  const fg = pickForegroundColor(block.tone)
  const fgSoftBg = isLightColor(block.tone) ? 'rgba(11, 15, 26, 0.08)' : 'rgba(255, 255, 255, 0.18)'

  const breakdown = useMemo(() => buildGroupBreakdown(accounts), [accounts])
  const toneScale = useMemo(() => buildToneScale(block.tone, breakdown.length), [block.tone, breakdown.length])

  const segmentAreaHeight = Math.max(0, target.h - PANEL_HEADER_HEIGHT - SEGMENT_AREA_INSET_BOTTOM)
  const segmentHeights = useMemo(
    () =>
      distributeSegmentHeights(
        breakdown.map((i) => i.amount),
        Math.max(0, segmentAreaHeight - SEGMENT_GAP * Math.max(0, breakdown.length - 1)),
        SEGMENT_MIN_HEIGHT,
      ),
    [breakdown, segmentAreaHeight],
  )

  const originGeom = {
    x: origin.x,
    y: origin.y,
    width: origin.w,
    height: origin.h,
    borderTopLeftRadius: block.corner.tl,
    borderTopRightRadius: block.corner.tr,
    borderBottomLeftRadius: block.corner.bl,
    borderBottomRightRadius: block.corner.br,
  }
  const openGeom = {
    x: target.x,
    y: target.y,
    width: target.w,
    height: target.h,
    borderTopLeftRadius: chartRadius,
    borderTopRightRadius: chartRadius,
    borderBottomLeftRadius: chartRadius,
    borderBottomRightRadius: chartRadius,
  }

  const panelTransition: Transition = reduceMotion
    ? { duration: 0 }
    : isOpen
      ? { type: 'spring', stiffness: 350, damping: 36, mass: 0.9 }
      : { type: 'spring', stiffness: 420, damping: 40, mass: 0.9 }

  const handleAnimationComplete = useCallback(() => {
    if (!isOpen) onClosed()
  }, [isOpen, onClosed])

  // 兜底：当色块几何与展开目标完全一致（如单一资产占满图表）时，收起不会产生任何数值变化，
  // framer-motion 不会触发 onAnimationComplete，需要定时器保证面板最终卸载
  useEffect(() => {
    if (isOpen) return
    const timer = window.setTimeout(onClosed, reduceMotion ? 40 : 650)
    return () => window.clearTimeout(timer)
  }, [isOpen, onClosed, reduceMotion])

  return (
    <motion.div
      className="absolute left-0 top-0 z-40 overflow-hidden cursor-pointer"
      style={{
        background: block.tone,
        boxShadow: '0 18px 44px -20px rgba(15, 23, 42, 0.38)',
        touchAction: 'none',
        pointerEvents: 'auto',
        willChange: 'transform, width, height',
      }}
      initial={originGeom}
      animate={isOpen ? openGeom : originGeom}
      transition={panelTransition}
      onAnimationComplete={handleAnimationComplete}
      onClick={onRequestClose}
      role="dialog"
      aria-label={`${block.name}占比详情`}
      data-testid="ratio-breakdown-panel"
    >
      {/* 展开态内容：按目标尺寸固定排版，随面板生长逐渐显现 */}
      <motion.div
        className="absolute left-0 top-0"
        style={{ width: target.w, height: target.h }}
        initial={{ opacity: 0 }}
        animate={{ opacity: isOpen ? 1 : 0 }}
        transition={{
          duration: reduceMotion ? 0 : isOpen ? 0.2 : 0.12,
          delay: reduceMotion || !isOpen ? 0 : 0.05,
          ease: 'linear',
        }}
      >
        <motion.div
          className="absolute inset-x-0 top-0 flex items-start justify-between gap-3 px-5 pt-[18px]"
          style={{ color: fg, height: PANEL_HEADER_HEIGHT }}
          initial={reduceMotion ? false : { opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: reduceMotion ? 0 : 0.26, delay: reduceMotion ? 0 : 0.08, ease: expressiveEase }}
        >
          <div className="min-w-0">
            <div className="text-[13px] font-medium" style={{ opacity: 0.85 }}>
              {block.name}
            </div>
            <div
              className="mt-0.5 text-[28px] font-semibold leading-tight"
              style={{ letterSpacing: hideAmounts ? '0.28em' : '-0.02em' }}
            >
              {hideAmounts ? maskedText : formatCny(block.amount)}
            </div>
            <div className="mt-1 text-[11px] font-medium" style={{ opacity: 0.7 }}>
              {hideAmounts
                ? maskedText
                : `${breakdown.length} 类 · ${accounts.length} 项${isDebt ? ' · 相当于资产的' : ' · 占资产的'} ${block.percent}%`}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <div
              className="h-9 px-3 rounded-full text-[12px] font-semibold leading-none flex items-center"
              style={{ background: fgSoftBg }}
            >
              {block.percent}%
            </div>
            <motion.button
              type="button"
              className="w-9 h-9 rounded-full flex items-center justify-center cursor-pointer"
              style={{ background: fgSoftBg, color: fg }}
              onPointerDown={(e) => {
                e.stopPropagation()
                onRequestClose()
              }}
              onClick={(e) => {
                e.stopPropagation()
                onRequestClose()
              }}
              whileTap={{ scale: 0.9 }}
              aria-label="收起占比详情"
            >
              <X size={18} strokeWidth={2.5} />
            </motion.button>
          </div>
        </motion.div>

        <div
          className="absolute flex flex-col"
          style={{
            top: PANEL_HEADER_HEIGHT,
            left: SEGMENT_AREA_INSET_X,
            right: SEGMENT_AREA_INSET_X,
            bottom: SEGMENT_AREA_INSET_BOTTOM,
            gap: SEGMENT_GAP,
          }}
        >
          {breakdown.map((item, i) => {
            const segmentHeight = segmentHeights[i] ?? 0
            const segmentTone = toneScale[i] ?? block.tone
            const TypeIcon = getIcon(item.type)
            return (
              <motion.div
                key={item.type}
                className="overflow-hidden shrink-0"
                style={{
                  height: segmentHeight,
                  background: segmentTone,
                  color: pickForegroundColor(segmentTone),
                  borderRadius: SEGMENT_RADIUS,
                }}
                initial={reduceMotion ? false : { opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                transition={
                  reduceMotion
                    ? { duration: 0 }
                    : { duration: 0.34, delay: 0.12 + i * 0.05, ease: expressiveEase }
                }
              >
                <BreakdownSegmentContent
                  item={item}
                  height={segmentHeight}
                  index={i}
                  Icon={TypeIcon}
                  hideAmounts={hideAmounts}
                  animatePercent={!reduceMotion}
                />
              </motion.div>
            )
          })}
        </div>
      </motion.div>

      {/* 起始态标签复刻：面板收起到色块大小时与底下的色块标签逐像素对齐 */}
      <motion.div
        className="absolute left-0 top-0 pointer-events-none"
        style={{ width: origin.w, height: origin.h }}
        initial={{ opacity: 1 }}
        animate={{ opacity: isOpen ? 0 : 1 }}
        transition={{
          duration: reduceMotion ? 0 : 0.16,
          delay: reduceMotion || isOpen ? 0 : 0.14,
          ease: 'linear',
        }}
      >
        <BlockLabelReplica
          name={block.name}
          percent={block.percent}
          tone={block.tone}
          isDebt={isDebt}
          height={origin.h}
        />
      </motion.div>
    </motion.div>
  )
}

export function AssetsRatioPage(props: {
  onBack: () => void
  blocks: RatioPageBlock[]
  accountsByGroup: Partial<Record<AccountGroupId, Account[]>>
  getIcon: (type: AccountTypeId) => ComponentType<{ size?: number }>
  hideAmounts: boolean
  viewport: { w: number; h: number }
  active: boolean
  chartRadius?: number
}) {
  const { onBack, blocks, accountsByGroup, getIcon, hideAmounts, viewport, active, chartRadius = 32 } = props

  const reduceMotion = useReducedMotion()
  const [expanded, setExpanded] = useState<{ id: AccountGroupId; phase: ExpandPhase } | null>(null)

  const expandedBlock = useMemo(
    () => (expanded ? blocks.find((b) => b.id === expanded.id) ?? null : null),
    [blocks, expanded],
  )

  const handleExpand = useCallback((id: AccountGroupId) => {
    setExpanded((current) => current ?? { id, phase: 'open' })
  }, [])

  const handleRequestClose = useCallback(() => {
    setExpanded((current) => (current && current.phase === 'open' ? { ...current, phase: 'closing' } : current))
  }, [])

  const handleClosed = useCallback(() => {
    setExpanded((current) => (current && current.phase === 'closing' ? null : current))
  }, [])

  const chartTarget = useMemo<RatioRect>(
    () => ({ x: 0, y: RATIO_CHART_TOP, w: viewport.w, h: Math.max(0, viewport.h - RATIO_CHART_TOP) }),
    [viewport.h, viewport.w],
  )

  const expandedOrigin = useMemo<RatioRect | null>(() => {
    if (!expandedBlock?.rect) return null
    const rect = expandedBlock.rect
    return { x: rect.x, y: rect.y, w: rect.w, h: expandedBlock.displayHeight ?? rect.h }
  }, [expandedBlock])

  const canRenderPanel = Boolean(expanded && expandedBlock && expandedOrigin && chartTarget.w > 0 && chartTarget.h > 0)

  // 滑离占比页时自动收起
  useEffect(() => {
    if (!active) handleRequestClose()
  }, [active, handleRequestClose])

  // 数据或布局变化导致面板无法渲染时直接复位，避免卡在展开态
  useEffect(() => {
    if (expanded && !canRenderPanel) setExpanded(null)
  }, [canRenderPanel, expanded])

  // 桌面端 Escape 收起
  useEffect(() => {
    if (!expanded || expanded.phase !== 'open') return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleRequestClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [expanded, handleRequestClose])

  return (
    <div className="h-full relative bg-transparent">
      {/* 覆盖每个大类色块的命中区域，点击展开该类内部占比 */}
      {blocks.map((block) => {
        const rect = block.rect
        if (!rect || rect.w <= 0) return null
        const height = block.displayHeight ?? rect.h
        if (height <= 2) return null
        const radius = `${block.corner.tl}px ${block.corner.tr}px ${block.corner.br}px ${block.corner.bl}px`
        return (
          <button
            key={block.id}
            type="button"
            className="absolute left-0 top-0 z-10 cursor-pointer group"
            style={{
              transform: `translate(${rect.x}px, ${rect.y}px)`,
              width: rect.w,
              height,
              borderRadius: radius,
              pointerEvents: active && !expanded ? 'auto' : 'none',
            }}
            onClick={() => handleExpand(block.id)}
            aria-label={`展开${block.name}占比详情`}
          >
            <span
              className="absolute inset-0 bg-slate-900/0 group-active:bg-slate-900/[0.06] transition-colors duration-150"
              style={{ borderRadius: radius }}
            />
          </button>
        )
      })}

      <div className="absolute inset-x-0 top-0 z-20 px-4 pt-6 flex items-center justify-between">
        <div className="text-[16px] font-semibold tracking-tight text-slate-900">资产分配比</div>
        <button
          type="button"
          onClick={onBack}
          className="w-10 h-10 rounded-full bg-white/80 border border-white/70 text-slate-700 flex items-center justify-center shadow-sm"
          aria-label="back"
        >
          <ChevronRight size={20} strokeWidth={2.5} />
        </button>
      </div>

      {canRenderPanel && expanded && expandedBlock && expandedOrigin ? (
        <>
          <motion.div
            className="absolute inset-0 z-30"
            style={{
              background: 'rgb(var(--bg-rgb) / 0.62)',
              backdropFilter: 'blur(10px)',
              WebkitBackdropFilter: 'blur(10px)',
              touchAction: 'none',
              pointerEvents: 'auto',
            }}
            initial={{ opacity: 0 }}
            animate={{ opacity: expanded.phase === 'open' ? 1 : 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.28, ease: 'linear' }}
            onClick={handleRequestClose}
            aria-hidden
            data-testid="ratio-breakdown-scrim"
          />
          <RatioExpandedPanel
            key={expanded.id}
            block={expandedBlock}
            origin={expandedOrigin}
            accounts={accountsByGroup[expanded.id] ?? []}
            target={chartTarget}
            chartRadius={chartRadius}
            phase={expanded.phase}
            hideAmounts={hideAmounts}
            reduceMotion={reduceMotion}
            getIcon={getIcon}
            onRequestClose={handleRequestClose}
            onClosed={handleClosed}
          />
        </>
      ) : null}
    </div>
  )
}
