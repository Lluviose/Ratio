import { lazy, Suspense, useState } from 'react'
import { motion } from 'framer-motion'
import { Sparkles } from 'lucide-react'
import { LazyLoadBoundary } from './LazyLoadBoundary'

const loadAiAssistant = () => import('./AiAssistant')

const AiAssistant = lazy(() => loadAiAssistant().then((mod) => ({ default: mod.AiAssistant })))

function AiAssistantButton(props: { onClick?: () => void; busy?: boolean }) {
  const { onClick, busy = false } = props

  return (
    <div className="absolute inset-0 z-30 pointer-events-none">
      <div className="absolute right-4 bottom-4 pointer-events-auto">
        <motion.button
          type="button"
          aria-label="AI analysis"
          className="w-11 h-11 rounded-full bg-[var(--primary)] text-[var(--primary-contrast)] flex items-center justify-center shadow-[0_10px_24px_-6px_rgb(var(--primary-rgb)/0.45)] disabled:opacity-60"
          onClick={onClick}
          disabled={busy || !onClick}
          whileTap={{ scale: busy ? 1 : 0.94 }}
          transition={{ type: 'spring', stiffness: 700, damping: 40, mass: 0.6 }}
        >
          <Sparkles size={18} strokeWidth={2.6} />
        </motion.button>
      </div>
    </div>
  )
}

export function LazyAiAssistant() {
  const [enabled, setEnabled] = useState(false)

  if (!enabled) return <AiAssistantButton onClick={() => setEnabled(true)} />

  return (
    <LazyLoadBoundary fallback={<AiAssistantButton onClick={() => window.location.reload()} />}>
      <Suspense fallback={<AiAssistantButton busy />}>
        <AiAssistant initialOpen />
      </Suspense>
    </LazyLoadBoundary>
  )
}
