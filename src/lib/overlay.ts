import { createContext, useContext } from 'react'

export type ToastTone = 'neutral' | 'success' | 'danger'

export type ToastOptions = {
  tone?: ToastTone
  durationMs?: number
}

export type ConfirmOptions = {
  title: string
  message?: string
  confirmText?: string
  cancelText?: string
  tone?: 'default' | 'danger'
}

export type OverlayApi = {
  toast: (message: string, options?: ToastOptions) => void
  confirm: (options: ConfirmOptions) => Promise<boolean>
}

export const OverlayContext = createContext<OverlayApi | null>(null)

export function useOverlay(): OverlayApi {
  const ctx = useContext(OverlayContext)
  if (!ctx) throw new Error('useOverlay must be used within <OverlayProvider>')
  return ctx
}

const PENDING_TOAST_KEY = 'ratio.pendingToast.v1'

export function queueToastAfterReload(message: string, options?: ToastOptions) {
  try {
    sessionStorage.setItem(PENDING_TOAST_KEY, JSON.stringify({ message, options }))
  } catch {
    // ignore
  }
}

export function takeQueuedToastAfterReload(): { message: string; options?: ToastOptions } | null {
  try {
    const raw = sessionStorage.getItem(PENDING_TOAST_KEY)
    if (!raw) return null
    sessionStorage.removeItem(PENDING_TOAST_KEY)

    const parsed: unknown = JSON.parse(raw)
    if (!isRecord(parsed) || typeof parsed.message !== 'string') return null
    const opts = isRecord(parsed.options) ? parsed.options : undefined

    return {
      message: parsed.message,
      options: {
        tone: parseToastTone(opts?.tone),
        durationMs: parseDurationMs(opts?.durationMs),
      },
    }
  } catch {
    return null
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function parseToastTone(value: unknown): ToastTone | undefined {
  if (value === 'neutral' || value === 'success' || value === 'danger') return value
  return undefined
}

function parseDurationMs(value: unknown): number | undefined {
  if (typeof value !== 'number') return undefined
  if (!Number.isFinite(value)) return undefined
  return value
}

