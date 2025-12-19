import { X } from 'lucide-react'
import { type ReactNode, useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'

export function BottomSheet(props: {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
}) {
  const { open, title, onClose, children } = props

  useEffect(() => {
    if (!open) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose, open])

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="sheetOverlay"
          role="dialog"
          aria-modal="true"
          onClick={onClose}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <motion.div
            className="sheet"
            onClick={(e) => e.stopPropagation()}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 400 }}
          >
            <div className="handle" />
            <div className="sheetHeader">
              <div className="sheetTitle">{title}</div>
              <button
                type="button"
                className="iconBtn hover:bg-[var(--hairline)] transition-colors"
                onClick={onClose}
                aria-label="close"
              >
                <X size={18} />
              </button>
            </div>
            <div className="sheetBody">{children}</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
