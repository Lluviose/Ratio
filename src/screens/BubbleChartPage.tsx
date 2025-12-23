import { motion, type MotionValue } from 'framer-motion'
import { ChevronRight } from 'lucide-react'
import { useCallback, useRef, type PointerEvent } from 'react'

type BubbleGesture = {
  nodes: Array<{ id: string; radius: number }>
  positions: Map<string, { x: MotionValue<number>; y: MotionValue<number> }>
  onFlick: (id: string, velocity: { x: number; y: number }, point: { x: number; y: number }) => void
  getScrollLeft?: () => number
}

type PointerSample = { x: number; y: number; tMs: number }

type Tracking = {
  pointerId: number
  bubbleId: string
  startScrollLeft: number
  startX: number
  startY: number
  samples: PointerSample[]
}

export function BubbleChartPage(props: {
  isActive: boolean
  onNext: () => void
  gesture?: BubbleGesture
}) {
  const { isActive, onNext, gesture } = props

  const trackingRef = useRef<Tracking | null>(null)

  const pickBubbleId = useCallback(
    (x: number, y: number) => {
      if (!gesture) return null

      let bestId: string | null = null
      let bestDist2 = Number.POSITIVE_INFINITY

      for (const node of gesture.nodes) {
        const pos = gesture.positions.get(node.id)
        if (!pos) continue

        const cx = pos.x.get()
        const cy = pos.y.get()
        if (!Number.isFinite(cx) || !Number.isFinite(cy)) continue

        const dx = x - cx
        const dy = y - cy
        const hitR = node.radius + 14
        const dist2 = dx * dx + dy * dy
        if (dist2 > hitR * hitR) continue

        if (dist2 < bestDist2) {
          bestDist2 = dist2
          bestId = node.id
        }
      }

      return bestId
    },
    [gesture]
  )

  const onPointerDown = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      if (!isActive || !gesture) return
      if (e.pointerType === 'mouse' && e.button !== 0) return

      const rect = e.currentTarget.getBoundingClientRect()
      const x = e.clientX - rect.left
      const y = e.clientY - rect.top
      const bubbleId = pickBubbleId(x, y)
      if (!bubbleId) return

      const tMs = performance.now()
      trackingRef.current = {
        pointerId: e.pointerId,
        bubbleId,
        startScrollLeft: gesture.getScrollLeft?.() ?? 0,
        startX: x,
        startY: y,
        samples: [{ x, y, tMs }],
      }
    },
    [gesture, isActive, pickBubbleId]
  )

  const onPointerMove = useCallback((e: PointerEvent<HTMLDivElement>) => {
    const tracking = trackingRef.current
    if (!tracking || tracking.pointerId !== e.pointerId) return

    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    const tMs = performance.now()

    tracking.samples.push({ x, y, tMs })
    if (tracking.samples.length > 8) tracking.samples.shift()
  }, [])

  const endGesture = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      const tracking = trackingRef.current
      if (!tracking || tracking.pointerId !== e.pointerId) return
      trackingRef.current = null
      if (!gesture) return

      const endScrollLeft = gesture.getScrollLeft?.() ?? tracking.startScrollLeft
      if (Math.abs(endScrollLeft - tracking.startScrollLeft) > 12) return

      const rect = e.currentTarget.getBoundingClientRect()
      const x = e.clientX - rect.left
      const y = e.clientY - rect.top

      const tMs = performance.now()
      tracking.samples.push({ x, y, tMs })
      if (tracking.samples.length > 8) tracking.samples.shift()

      const samples = tracking.samples
      const last = samples[samples.length - 1] ?? { x, y, tMs }
      const nowMs = last.tMs

      let first = samples[0] ?? last
      for (let i = samples.length - 1; i >= 0; i -= 1) {
        const s = samples[i]
        if (nowMs - s.tMs > 80) break
        first = s
      }

      const dtMs = Math.max(16, last.tMs - first.tMs)
      let vx = ((last.x - first.x) / dtMs) * 1000
      let vy = ((last.y - first.y) / dtMs) * 1000

      const travel = Math.hypot(last.x - tracking.startX, last.y - tracking.startY)
      const speed = Math.hypot(vx, vy)

      const isFlick = travel >= 14 && speed >= 380
      if (!isFlick) {
        const pos = gesture.positions.get(tracking.bubbleId)
        const cx = pos?.x.get() ?? last.x
        const cy = pos?.y.get() ?? last.y
        const dx = cx - last.x
        const dy = cy - last.y
        const d = Math.hypot(dx, dy)
        const pokeSpeed = 360
        if (d > 0.01) {
          vx = (dx / d) * pokeSpeed
          vy = (dy / d) * pokeSpeed
        } else {
          vx = 0
          vy = -pokeSpeed
        }
      }

      gesture.onFlick(tracking.bubbleId, { x: vx, y: vy }, { x: last.x, y: last.y })
    },
    [gesture]
  )

  return (
    <div className="relative w-full h-full overflow-hidden bg-transparent">
      <div
        className="absolute inset-0 z-10"
        style={{ touchAction: 'pan-x' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endGesture}
        onPointerCancel={endGesture}
      />

      {/* Title / Header */}
      <div className="absolute inset-x-0 top-0 z-20 px-4 pt-6 flex items-center justify-between pointer-events-none">
        <div className="text-[15px] font-semibold tracking-tight text-slate-900 opacity-0">
          {/* Placeholder to match layout */}
        </div>
        <motion.button
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: isActive ? 1 : 0, x: isActive ? 0 : 20 }}
          transition={{ delay: 0.2 }}
          type="button"
          onClick={onNext}
          className="w-10 h-10 rounded-full bg-white/80 border border-white/70 text-slate-700 flex items-center justify-center shadow-sm pointer-events-auto"
          aria-label="next"
        >
          <ChevronRight size={20} strokeWidth={2.5} />
        </motion.button>
      </div>
    </div>
  )
}
