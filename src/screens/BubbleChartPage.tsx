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
          transition={{ 
            type: 'spring',
            stiffness: 400,
            damping: 30
          }}
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
