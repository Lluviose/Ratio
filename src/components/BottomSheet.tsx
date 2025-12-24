import { X } from 'lucide-react'
import { type CSSProperties, type ReactNode, useEffect, useRef } from 'react'
import { AnimatePresence, motion } from 'framer-motion'

const openSheetStack: string[] = []

function makeSheetId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

function pushOpenSheet(id: string) {
  openSheetStack.push(id)
}

function removeOpenSheet(id: string) {
  const idx = openSheetStack.lastIndexOf(id)
  if (idx >= 0) openSheetStack.splice(idx, 1)
}

function isTopSheet(id: string) {
  return openSheetStack[openSheetStack.length - 1] === id
}

export function BottomSheet(props: {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
  header?: ReactNode
  hideHandle?: boolean
  sheetClassName?: string
  sheetStyle?: CSSProperties
  bodyClassName?: string
  bodyStyle?: CSSProperties
}) {
  const {
    open,
    title,
    onClose,
    children,
    header,
    hideHandle = false,
    sheetClassName,
    sheetStyle,
    bodyClassName,
    bodyStyle,
  } = props

  const sheetIdRef = useRef<string>(makeSheetId())
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    if (!open) return
    const sheetId = sheetIdRef.current
    pushOpenSheet(sheetId)
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isTopSheet(sheetId)) onCloseRef.current()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      removeOpenSheet(sheetId)
    }
  }, [open])

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
          transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
        >
          <motion.div
            className={sheetClassName ? `sheet ${sheetClassName}` : 'sheet'}
            onClick={(e) => e.stopPropagation()}
            initial={{ y: '100%', opacity: 0.98 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: '100%', opacity: 0.98 }}
            transition={{
              y: { type: 'tween', duration: 0.26, ease: [0.16, 1, 0.3, 1] },
              opacity: { type: 'tween', duration: 0.18, ease: [0.16, 1, 0.3, 1] },
            }}
            style={{ ...sheetStyle, willChange: 'transform' }}
          >
            {!hideHandle ? <div className="handle" /> : null}
            {header ? (
              header
            ) : (
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
            )}
            <div
              className={bodyClassName ? `sheetBody ${bodyClassName}` : 'sheetBody'}
              style={bodyStyle}
            >
              {children}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
