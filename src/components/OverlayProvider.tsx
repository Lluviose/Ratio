import { AnimatePresence, motion } from 'framer-motion'
import { X } from 'lucide-react'
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { BottomSheet } from './BottomSheet'
import { OverlayContext, takeQueuedToastAfterReload, type ConfirmOptions, type OverlayApi, type ToastOptions, type ToastTone } from '../lib/overlay'

type ToastItem = {
  id: string
  message: string
  tone: ToastTone
}

type ConfirmRequest = {
  id: string
  title: string
  message?: string
  confirmText: string
  cancelText: string
  tone: 'default' | 'danger'
  resolve: (ok: boolean) => void
}

function makeId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

export function OverlayProvider(props: { children: ReactNode }) {
  const { children } = props

  const toastTimersRef = useRef<Map<string, number>>(new Map())
  const [toasts, setToasts] = useState<ToastItem[]>([])

  const dismissToast = useCallback((id: string) => {
    const timer = toastTimersRef.current.get(id)
    if (timer != null) window.clearTimeout(timer)
    toastTimersRef.current.delete(id)
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const toast = useCallback(
    (message: string, options?: ToastOptions) => {
      const tone: ToastTone = options?.tone ?? 'neutral'
      const durationMs =
        options?.durationMs ?? (tone === 'danger' ? 3200 : tone === 'success' ? 2400 : 2400)

      const id = makeId()
      setToasts((prev) => {
        const next = [...prev, { id, message, tone }]
        while (next.length > 3) next.shift()
        return next
      })

      if (durationMs > 0) {
        const timer = window.setTimeout(() => dismissToast(id), durationMs)
        toastTimersRef.current.set(id, timer)
      }
    },
    [dismissToast],
  )

  useEffect(() => {
    const queued = takeQueuedToastAfterReload()
    if (!queued) return
    toast(queued.message, queued.options)
  }, [toast])

  useEffect(() => {
    const timers = toastTimersRef.current
    return () => {
      for (const timer of timers.values()) window.clearTimeout(timer)
      timers.clear()
    }
  }, [])

  const confirmQueueRef = useRef<ConfirmRequest[]>([])
  const activeConfirmRef = useRef<ConfirmRequest | null>(null)
  const [activeConfirm, setActiveConfirm] = useState<ConfirmRequest | null>(null)

  const showNextConfirm = useCallback(() => {
    if (activeConfirmRef.current) return
    const next = confirmQueueRef.current.shift() ?? null
    activeConfirmRef.current = next
    setActiveConfirm(next)
  }, [])

  const closeConfirm = useCallback(
    (ok: boolean) => {
      const current = activeConfirmRef.current
      if (!current) return
      activeConfirmRef.current = null
      setActiveConfirm(null)
      current.resolve(ok)
      window.setTimeout(showNextConfirm, 220)
    },
    [showNextConfirm],
  )

  const confirm = useCallback(
    (options: ConfirmOptions) => {
      return new Promise<boolean>((resolve) => {
        const req: ConfirmRequest = {
          id: makeId(),
          title: options.title,
          message: options.message,
          confirmText: options.confirmText ?? '确定',
          cancelText: options.cancelText ?? '取消',
          tone: options.tone ?? 'default',
          resolve,
        }
        confirmQueueRef.current.push(req)
        showNextConfirm()
      })
    },
    [showNextConfirm],
  )

  useEffect(() => {
    return () => {
      const current = activeConfirmRef.current
      activeConfirmRef.current = null
      if (current) current.resolve(false)
      for (const req of confirmQueueRef.current) req.resolve(false)
      confirmQueueRef.current = []
    }
  }, [])

  const api = useMemo<OverlayApi>(() => ({ toast, confirm }), [confirm, toast])

  const confirmOpen = Boolean(activeConfirm)
  const confirmTone = activeConfirm?.tone ?? 'default'

  return (
    <OverlayContext.Provider value={api}>
      {children}

      <div className="toastViewport" aria-live="polite" aria-atomic="true">
        <AnimatePresence initial={false}>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              className="toast"
              initial={{ opacity: 0, y: -10, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.98 }}
              transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            >
              <span
                aria-hidden="true"
                className={
                  t.tone === 'danger'
                    ? 'toastDot toastDotDanger'
                    : t.tone === 'success'
                      ? 'toastDot toastDotSuccess'
                      : 'toastDot'
                }
              />
              <div className="toastText">{t.message}</div>
              <button
                type="button"
                className="toastClose"
                aria-label="close"
                onClick={() => dismissToast(t.id)}
              >
                <X size={16} strokeWidth={2.6} />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      <BottomSheet
        open={confirmOpen}
        title={activeConfirm?.title ?? '确认'}
        onClose={() => closeConfirm(false)}
        hideHandle
        sheetStyle={{ maxHeight: '72vh' }}
      >
        {activeConfirm?.message ? (
          <div className="muted" style={{ fontSize: 13, fontWeight: 750, lineHeight: 1.55 }}>
            {activeConfirm.message}
          </div>
        ) : null}

        <div className="stack" style={{ gap: 10, marginTop: 14 }}>
          <button type="button" className="ghostBtn" onClick={() => closeConfirm(false)}>
            {activeConfirm?.cancelText ?? '取消'}
          </button>
          <button
            type="button"
            className={confirmTone === 'danger' ? 'dangerBtn' : 'primaryBtn'}
            onClick={() => closeConfirm(true)}
          >
            {activeConfirm?.confirmText ?? '确定'}
          </button>
        </div>
      </BottomSheet>
    </OverlayContext.Provider>
  )
}
