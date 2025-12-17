import { motion, type MotionValue } from 'framer-motion'
import { ChevronRight } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { BubbleNode } from '../components/BubbleChartPhysics'

export function BubbleChartPage(props: {
  isActive: boolean
  onNext: () => void
  nodes: BubbleNode[]
  positions: Map<string, { x: MotionValue<number>; y: MotionValue<number> }>
}) {
  const { isActive, onNext, nodes, positions } = props

  return (
    <div className="relative w-full h-full overflow-hidden bg-transparent">
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

      {/* Impact Ripples */}
      <ImpactRipples isActive={isActive} nodes={nodes} positions={positions} />
    </div>
  )
}

function ImpactRipples({ 
    isActive, 
    nodes, 
    positions 
}: { 
    isActive: boolean
    nodes: BubbleNode[]
    positions: Map<string, { x: MotionValue<number>; y: MotionValue<number> }>
}) {
    const [ripples, setRipples] = useState<Array<{ id: string; x: number; y: number; r: number; delay: number }>>([])

    useEffect(() => {
        if (isActive) {
            // Delay slightly to allow physics engine to update positions from initial center
            // This ensures ripples appear where the bubbles actually are/will be
            const timer = setTimeout(() => {
                const newRipples = nodes.map((node) => {
                    const pos = positions.get(node.id)
                    if (!pos) return null
                    
                    const x = pos.x.get()
                    const y = pos.y.get()
                    
                    // Skip if position seems uninitialized (exactly center might happen, but usually some jitter is applied)
                    // If physics hasn't ticked, x/y might be width/2. 
                    // But with 50ms delay, it likely has ticked or at least initial random placement occurred.
                    
                    return {
                        id: node.id,
                        x,
                        y,
                        r: node.radius,
                        delay: Math.random() * 0.2 // Natural scatter
                    }
                }).filter((r): r is NonNullable<typeof r> => r !== null)

                setRipples(newRipples)
            }, 100)

            // Cleanup after animations are done (longest is ~2.5s)
            const cleanup = setTimeout(() => {
                setRipples([])
            }, 3000)

            return () => {
                clearTimeout(timer)
                clearTimeout(cleanup)
            }
        } else {
            setRipples([])
        }
    }, [isActive, nodes, positions])

    return (
        <div className="absolute inset-0 z-[-1] overflow-hidden pointer-events-none">
            {ripples.map((r) => (
                <RippleGroup key={r.id} x={r.x} y={r.y} r={r.r} delay={r.delay} />
            ))}
        </div>
    )
}

function RippleGroup({ x, y, r, delay }: { x: number; y: number; r: number; delay: number }) {
    // Scale ripple effect based on bubble size
    const scale = r / 50 
    
    return (
        <div 
            className="absolute top-0 left-0"
            style={{ 
                transform: `translate(${x}px, ${y}px)`,
            }}
        >
            {/* Ring 1: Initial Splash - Fast, sharp */}
            <motion.div
                initial={{ width: r * 0.8, height: r * 0.8, opacity: 0.8, borderWidth: 2 * scale }}
                animate={{ width: r * 2.2, height: r * 2.2, opacity: 0, borderWidth: 0 }}
                transition={{ duration: 1.0, ease: [0.25, 0.46, 0.45, 0.94], delay }}
                className="absolute top-0 left-0 -translate-x-1/2 -translate-y-1/2 rounded-full border border-slate-400/40"
            />
            
            {/* Ring 2: Main Wave - Slower, wider */}
            <motion.div
                initial={{ width: r, height: r, opacity: 0.5, borderWidth: 1.5 * scale }}
                animate={{ width: r * 3, height: r * 3, opacity: 0, borderWidth: 0 }}
                transition={{ duration: 1.8, ease: "easeOut", delay: delay + 0.1 }}
                className="absolute top-0 left-0 -translate-x-1/2 -translate-y-1/2 rounded-full border border-slate-400/30"
            />

            {/* Ring 3: Distant Ripple - Very subtle */}
            <motion.div
                initial={{ width: r * 1.2, height: r * 1.2, opacity: 0.3, borderWidth: 1 * scale }}
                animate={{ width: r * 4.5, height: r * 4.5, opacity: 0, borderWidth: 0 }}
                transition={{ duration: 2.4, ease: "easeOut", delay: delay + 0.2 }}
                className="absolute top-0 left-0 -translate-x-1/2 -translate-y-1/2 rounded-full border border-slate-400/20"
            />
        </div>
    )
}

