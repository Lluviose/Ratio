import { motion, type MotionValue } from 'framer-motion'
import { ChevronRight } from 'lucide-react'
import { RippleCanvas } from '../components/RippleCanvas'
import type { BubbleNode } from '../components/BubbleChartPhysics'

export function BubbleChartPage(props: {
  isActive: boolean
  onNext: () => void
  /** 气泡节点数据 */
  nodes: BubbleNode[]
  /** 气泡位置的 MotionValue Map */
  positions: Map<string, { x: MotionValue<number>; y: MotionValue<number> }>
  /** Canvas 宽度 */
  width: number
  /** Canvas 高度 */
  height: number
}) {
  const { isActive, onNext, nodes, positions, width, height } = props

  return (
    <div className="relative w-full h-full overflow-hidden bg-transparent">
      {/* Water Ripple Effect - 真实落水涟漪效果 */}
      <RippleCanvas
        nodes={nodes}
        positions={positions}
        width={width}
        height={height}
        isActive={isActive}
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
