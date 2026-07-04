import { motion, useMotionValue, useTransform, type MotionValue } from 'framer-motion'
import { formatCny } from '../lib/format'
import { pickForegroundColor } from '../lib/themes'
import { lerp, type CornerKind, type CornerRadii, type GroupId, type Rect } from '../lib/homeGeometry'

// 首页形变色块的数据模型与几何描述。
// OverlayBlock 是「气泡 → 占比 → 列表」三态间逐像素插值的可视层：
// 几何由 AssetsScreen 测量/计算（lib/homeGeometry），这里只负责按 scrollIdx 插值渲染。

export type OverlayBlockModel = {
  id: GroupId
  name: string
  tone: string
  amount: number
  percent: number
  hasCard: boolean
}

export type HomeBlockGeometry = {
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

export function OverlayBlock(props: {
  geometry: HomeBlockGeometry
  scrollIdx: MotionValue<number>
  overlayFade: MotionValue<number>
  labelsOpacity: MotionValue<number>
  showLabels: boolean
  isInitialLoad?: boolean
  blockIndex?: number
  viewportWidth?: number
}) {
  const {
    geometry,
    scrollIdx,
    overlayFade,
    labelsOpacity,
    showLabels,
    isInitialLoad = false,
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

  // 是否需要入场动画（首次加载）
  const needsEnterAnimation = isInitialLoad

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
