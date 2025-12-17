import { motion } from 'framer-motion'
import { ChevronRight } from 'lucide-react'

export function BubbleChartPage(props: {
  isActive: boolean
  onNext: () => void
}) {
  const { isActive, onNext } = props

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

      {/* Background Ripples */}
      <AmbientRipples isActive={isActive} />
    </div>
  )
}

function AmbientRipples({ isActive }: { isActive: boolean }) {
    if (!isActive) return null
    
    return (
        <div className="absolute inset-0 z-[-1] overflow-hidden pointer-events-none">
            {[...Array(3)].map((_, i) => (
                <motion.div
                    key={i}
                    className="absolute top-1/2 left-1/2 rounded-full border border-slate-300/20"
                    style={{ marginLeft: '-50px', marginTop: '-50px', width: 100, height: 100 }}
                    animate={{
                        scale: [1, 4],
                        opacity: [0.5, 0],
                    }}
                    transition={{
                        duration: 4,
                        repeat: Infinity,
                        delay: i * 1.5,
                        ease: "easeOut"
                    }}
                />
            ))}
        </div>
    )
}

