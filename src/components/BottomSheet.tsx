import { X } from 'lucide-react'
import { type CSSProperties, type ReactNode, useEffect, useRef } from 'react'
import { AnimatePresence, motion } from 'framer-motion'

const openSheetStack: string[] = []

type ScrollLockState = {
  scrollY: number
  htmlOverflow: string
  bodyOverflow: string
  bodyPosition: string
  bodyTop: string
  bodyLeft: string
  bodyRight: string
  bodyWidth: string
}

let scrollLockCount = 0
let scrollLockState: ScrollLockState | null = null

function lockBodyScroll() {
  if (typeof window === 'undefined') return
  if (typeof document === 'undefined') return

  if (scrollLockCount === 0) {
    const scrollY = window.scrollY
    const html = document.documentElement
    const body = document.body

    scrollLockState = {
      scrollY,
      htmlOverflow: html.style.overflow,
      bodyOverflow: body.style.overflow,
      bodyPosition: body.style.position,
      bodyTop: body.style.top,
      bodyLeft: body.style.left,
      bodyRight: body.style.right,
      bodyWidth: body.style.width,
    }

    html.style.overflow = 'hidden'
    body.style.overflow = 'hidden'
    body.style.position = 'fixed'
    body.style.top = `-${scrollY}px`
    body.style.left = '0'
    body.style.right = '0'
    body.style.width = '100%'
  }

  scrollLockCount += 1
}

function unlockBodyScroll() {
  if (typeof window === 'undefined') return
  if (typeof document === 'undefined') return

  if (scrollLockCount <= 0) return
  scrollLockCount -= 1
  if (scrollLockCount > 0) return

  const state = scrollLockState
  scrollLockState = null
  if (!state) return

  const html = document.documentElement
  const body = document.body

  html.style.overflow = state.htmlOverflow
  body.style.overflow = state.bodyOverflow
  body.style.position = state.bodyPosition
  body.style.top = state.bodyTop
  body.style.left = state.bodyLeft
  body.style.right = state.bodyRight
  body.style.width = state.bodyWidth

  window.scrollTo(0, state.scrollY)
}

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
  sheetMotion?: 'slide' | 'morph'
  sheetLayoutId?: string
  onExitComplete?: () => void
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
    sheetMotion = 'slide',
    sheetLayoutId,
    onExitComplete,
  } = props

  const resolvedSheetMotion = sheetMotion === 'morph' && sheetLayoutId ? 'morph' : 'slide'
  const resolvedSheetStyle: CSSProperties =
    resolvedSheetMotion === 'morph'
      ? {
          borderRadius: 22,
          border: '1px solid var(--hairline)',
          borderBottom: '1px solid var(--hairline)',
          boxShadow: 'var(--shadow-soft)',
          ...sheetStyle,
        }
      : { ...sheetStyle }

  const overlayFadeInDuration = resolvedSheetMotion === 'morph' ? 0.22 : 0.18
  const overlayFadeOutDuration = resolvedSheetMotion === 'morph' ? 0.22 : 0.2

  const sheetIdRef = useRef<string>(makeSheetId())
  const scrollLockCountRef = useRef(0)
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    const sheetId = sheetIdRef.current
    return () => {
      removeOpenSheet(sheetId)
      while (scrollLockCountRef.current > 0) {
        unlockBodyScroll()
        scrollLockCountRef.current -= 1
      }
    }
  }, [])

  useEffect(() => {
    if (!open) return
    const sheetId = sheetIdRef.current
    pushOpenSheet(sheetId)
    lockBodyScroll()
    scrollLockCountRef.current += 1
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isTopSheet(sheetId)) onCloseRef.current()       
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      removeOpenSheet(sheetId)
    }
  }, [open])

  const handleExitComplete = () => {
    if (scrollLockCountRef.current > 0) {
      unlockBodyScroll()
      scrollLockCountRef.current -= 1
    }
    onExitComplete?.()
  }

  return (
    <AnimatePresence onExitComplete={handleExitComplete}>
      {open && (
        <motion.div
          className="sheetOverlay"
          role="dialog"
          aria-modal="true"
          onClick={onClose}
          initial={{
            backgroundColor: 'rgba(11, 15, 26, 0)',
            backdropFilter: 'blur(0px)',
          }}
          animate={{
            backgroundColor: 'rgba(11, 15, 26, 0.4)',
            backdropFilter: 'blur(2px)',
            transition: {
              duration: overlayFadeInDuration,
              ease: [0.16, 1, 0.3, 1],
            },
          }}
          exit={{
            backgroundColor: 'rgba(11, 15, 26, 0)',
            backdropFilter: 'blur(0px)',
            transition: {
              duration: overlayFadeOutDuration,
              ease: [0.16, 1, 0.3, 1],
            },
          }}
        >
          <motion.div
            className={sheetClassName ? `sheet ${sheetClassName}` : 'sheet'}    
            onClick={(e) => e.stopPropagation()}
            layoutId={resolvedSheetMotion === 'morph' ? sheetLayoutId : undefined}
            initial={resolvedSheetMotion === 'slide' ? { y: '100%', opacity: 0.98 } : false}
            animate={resolvedSheetMotion === 'slide' ? { y: 0, opacity: 1 } : { opacity: 1 }}
            exit={resolvedSheetMotion === 'slide' ? { y: '100%', opacity: 0.98 } : { opacity: 1 }}
            transition={
              resolvedSheetMotion === 'slide'
                ? {
                    y: { type: 'tween', duration: 0.26, ease: [0.16, 1, 0.3, 1] },
                    opacity: { type: 'tween', duration: 0.18, ease: [0.16, 1, 0.3, 1] },
                  }
                : {
                    layout: { type: 'spring', stiffness: 520, damping: 52, mass: 1 },
                  }
            }
            style={{ ...resolvedSheetStyle, willChange: 'transform' }}
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
