import { createContext, useContext } from 'react'

export type ToastTone = 'neutral' | 'success' | 'danger'

export type ToastAction = {
  label: string
  onClick: () => void
}

export type ToastOptions = {
  tone?: ToastTone
  durationMs?: number
  action?: ToastAction
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

// React 树之外的 toast 入口（pwa 更新提示、存储层写入失败等模块级代码）。
// Provider 尚未挂载时先排队，挂载后按序补发。
type AppToastRequest = { message: string; options?: ToastOptions }

let appToastListener: ((request: AppToastRequest) => void) | null = null
const pendingAppToasts: AppToastRequest[] = []
const MAX_PENDING_APP_TOASTS = 8

export function emitAppToast(message: string, options?: ToastOptions) {
  const request: AppToastRequest = { message, options }
  if (appToastListener) {
    appToastListener(request)
    return
  }
  pendingAppToasts.push(request)
  if (pendingAppToasts.length > MAX_PENDING_APP_TOASTS) pendingAppToasts.shift()
}

export function subscribeAppToasts(listener: (request: AppToastRequest) => void): () => void {
  appToastListener = listener
  const queued = pendingAppToasts.splice(0, pendingAppToasts.length)
  for (const request of queued) listener(request)
  return () => {
    if (appToastListener === listener) appToastListener = null
  }
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

