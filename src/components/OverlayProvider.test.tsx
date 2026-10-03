import { useEffect } from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { OverlayProvider } from './OverlayProvider'
import { emitAppToast, queueToastAfterReload, useOverlay, type OverlayApi } from '../lib/overlay'
import { hapticError, hapticSuccess, hapticWarning } from '../lib/haptics'

vi.mock('../lib/haptics', () => ({ hapticImpact: vi.fn(), hapticError: vi.fn(), hapticSuccess: vi.fn(), hapticWarning: vi.fn() }))

let api: OverlayApi
function Consumer() {
  const overlay = useOverlay()
  useEffect(() => { api = overlay }, [overlay])
  return null
}
function mount() {
  return render(<div className="appFrame"><OverlayProvider><Consumer /></OverlayProvider></div>)
}
beforeEach(() => {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
  sessionStorage.clear()
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.clearAllMocks()
  vi.useRealTimers()
})

describe('OverlayProvider', () => {
  it('keeps full unbroken messages and action labels, tone, live region and dismissal', async () => {
    const action = vi.fn()
    const message = 'BackupFailed'.repeat(30)
    const label = 'RetryBackup'.repeat(10)
    mount()
    act(() => api.toast(message, { tone: 'danger', durationMs: 0, action: { label, onClick: action } }))
    const text = screen.getByText(message)
    const toast = text.closest('.toast')!
    expect(text).toHaveClass('toastText')
    expect(toast).toHaveClass('toast--action')
    expect(toast.querySelector('.toastDotDanger')).toHaveAttribute('aria-hidden', 'true')
    expect(toast.parentElement).toHaveAttribute('aria-live', 'polite')
    expect(toast.parentElement?.parentElement).toHaveClass('appFrame')
    expect(hapticError).toHaveBeenCalledTimes(1)
    expect(within(toast as HTMLElement).getByRole('button', { name: 'close' })).toBeEnabled()
    fireEvent.click(screen.getByRole('button', { name: label }))
    expect(action).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(screen.queryByText(message)).not.toBeInTheDocument())
  })

  it('delivers pre-mount/reload queues once and caps visible toasts at three', async () => {
    emitAppToast('Before mount', { durationMs: 0 })
    queueToastAfterReload('After reload', { tone: 'success', durationMs: 0 })
    mount()
    expect(screen.getByText('Before mount')).toBeInTheDocument()
    expect(screen.getByText('After reload')).toBeInTheDocument()
    expect(sessionStorage.getItem('ratio.pendingToast.v1')).toBeNull()
    expect(hapticSuccess).toHaveBeenCalledTimes(1)
    act(() => {
      api.toast('Third', { durationMs: 0 })
      api.toast('Fourth', { durationMs: 0 })
    })
    await waitFor(() => expect(screen.queryByText('After reload')).not.toBeInTheDocument())
    expect(document.querySelectorAll('.toast')).toHaveLength(3)
    const toast = screen.getByText('Fourth').closest('.toast') as HTMLElement
    fireEvent.click(within(toast).getByRole('button', { name: 'close' }))
    await waitFor(() => expect(screen.queryByText('Fourth')).not.toBeInTheDocument())
    expect(screen.getByText('Third')).toBeInTheDocument()
  })

  it('clears toast timers on unmount', () => {
    vi.useFakeTimers()
    const { unmount } = mount()
    act(() => api.toast('Temporary', { durationMs: 10000 }))
    expect(vi.getTimerCount()).toBeGreaterThan(0)
    unmount()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('resolves confirmations in order and cancels outstanding requests on unmount', async () => {
    const { unmount } = mount()
    let first!: Promise<boolean>
    let second!: Promise<boolean>
    let third!: Promise<boolean>
    act(() => {
      first = api.confirm({ title: 'First', tone: 'danger', confirmText: 'Delete' })
      second = api.confirm({ title: 'Second' })
      third = api.confirm({ title: 'Third' })
    })
    expect(screen.getByRole('dialog', { name: 'First' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    await expect(first).resolves.toBe(true)
    expect(hapticWarning).toHaveBeenCalledTimes(1)
    expect(await screen.findByRole('dialog', { name: 'Second' })).toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: 'Third' })).not.toBeInTheDocument()
    unmount()
    await expect(second).resolves.toBe(false)
    await expect(third).resolves.toBe(false)
    expect(document.body.style.position).toBe('')
  })
})
