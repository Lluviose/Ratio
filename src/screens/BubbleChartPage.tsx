import { motion } from 'framer-motion'
import { ChevronRight } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { BubbleNode } from '../components/BubbleChartPhysics'

export function BubbleChartPage(props: {
  isActive: boolean
  onNext: () => void
  nodes: BubbleNode[]
}) {
  const { isActive, onNext, nodes } = props

  return (
    <div className="relative w-full h-full overflow-hidden bg-white">
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

      {/* Splash Ripples */}
      <SplashRipples isActive={isActive} nodes={nodes} />
    </div>
  )
}

function SplashRipples({ isActive, nodes }: { isActive: boolean; nodes: BubbleNode[] }) {
    const [ripples, setRipples] = useState<Array<{ id: string; x: number; y: number; r: number; delay: number }>>([])
    const triggeredRef = useRef(false)

    useEffect(() => {
        if (isActive) {
            // Trigger only once when becoming active
            if (!triggeredRef.current && nodes.length > 0) {
                const newRipples = nodes.map((node) => ({
                    id: node.id,
                    // Random position centrally distributed (20% - 80%)
                    x: 20 + Math.random() * 60,
                    y: 20 + Math.random() * 60,
                    r: node.radius,
                    // Staggered delay to simulate raining/falling effect
                    delay: Math.random() * 0.5
                }))
                setRipples(newRipples)
                triggeredRef.current = true
            }
        } else {
            // Reset when leaving so it can play again on next entry
            triggeredRef.current = false
            setRipples([])
        }
    }, [isActive, nodes])

    return (
        <div className="absolute inset-0 z-[-1] overflow-hidden pointer-events-none">
            {ripples.map((ripple) => (
                <RippleEffect key={ripple.id} {...ripple} />
            ))}
        </div>
    )
}

function RippleEffect({ x, y, r, delay }: { x: number; y: number; r: number; delay: number }) {
    return (
        <motion.div
            className="absolute rounded-full border-2 border-slate-200/60"
            style={{
                left: `${x}%`,
                top: `${y}%`,
                width: r,
                height: r,
                x: '-50%',
                y: '-50%',
            }}
            initial={{ opacity: 0, scale: 0.2 }}
            animate={{
                opacity: [0, 0.8, 0],
                scale: [0.2, 2.5],
                borderWidth: ['2px', '0px'],
            }}
            transition={{
                duration: 1.8,
                delay: delay,
                ease: [0.25, 0.46, 0.45, 0.94], // easeOutQuad-ish
            }}
        />
    )
}


