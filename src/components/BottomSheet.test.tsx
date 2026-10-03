import { StrictMode, useState } from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BottomSheet } from './BottomSheet'

vi.mock('../lib/haptics', () => ({ hapticImpact: vi.fn() }))

beforeEach(() => {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

function sheet(open: boolean, onExitComplete = vi.fn()) {
  return <BottomSheet open={open} title="Settings" onClose={() => {}} onExitComplete={onExitComplete}>Content</BottomSheet>
}

describe('BottomSheet overlays', () => {
  it('portals into a frame mounted in the same render, outside isolated pages', () => {
    const { container } = render(
      <div className="appFrame">
        <main className="content"><section className="iosInsightsPage">{sheet(true)}</section></main>
        <nav className="navBar">Navigation</nav>
      </div>,
    )
    const dialog = screen.getByRole('dialog', { name: 'Settings' })
    expect(dialog.parentElement).toBe(container.querySelector('.appFrame'))
    expect(container.querySelector('.iosInsightsPage')).not.toContainElement(dialog)
    expect(container.querySelector('.content')).toHaveStyle({ overflow: 'hidden' })
    expect((container.querySelector('.content') as HTMLElement).style.touchAction).toBe('none')
    expect(dialog.querySelector('.sheetBody')).not.toHaveStyle({ overflow: 'hidden' })
  })

  it('falls back to body and stops backdrop clicks bubbling into React triggers', () => {
    const trigger = vi.fn()
    const close = vi.fn()
    render(<div onClick={trigger}><BottomSheet open title="Sort" onClose={close}><button>Sort option</button></BottomSheet></div>)
    const dialog = screen.getByRole('dialog', { name: 'Sort' })
    expect(dialog.parentElement).toBe(document.body)
    fireEvent.click(screen.getByRole('button', { name: 'Sort option' }))
    expect(close).not.toHaveBeenCalled()
    fireEvent.click(dialog)
    expect(close).toHaveBeenCalledTimes(1)
    expect(trigger).not.toHaveBeenCalled()
  })

  it('keeps nested sheets top-only for Escape and locks through their exits', async () => {
    const closeOuter = vi.fn()
    const closeInner = vi.fn()
    function Nested() {
      const [outer, setOuter] = useState(true)
      const [inner, setInner] = useState(false)
      return <BottomSheet open={outer} title="Outer" onClose={() => { closeOuter(); setOuter(false) }}>
        <button onClick={() => setInner(true)}>Open inner</button>
        <BottomSheet open={inner} title="Inner" onClose={() => { closeInner(); setInner(false) }}>Nested content</BottomSheet>
      </BottomSheet>
    }
    render(<Nested />)
    fireEvent.click(screen.getByRole('button', { name: 'Open inner' }))
    expect(screen.getAllByRole('dialog')).toHaveLength(2)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(closeInner).toHaveBeenCalledTimes(1)
    expect(closeOuter).not.toHaveBeenCalled()
    expect(document.body.style.position).toBe('fixed')
    // The inner sheet is still visibly exiting: another Escape must not close its parent.
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(closeOuter).not.toHaveBeenCalled()
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Inner' })).not.toBeInTheDocument())
    expect(document.body.style.position).toBe('fixed')
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(closeOuter).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(document.body.style.position).toBe('')
    expect(document.documentElement.style.overflow).toBe('')
  })

  it('does not leak a lock on close/reopen before exit finishes, including StrictMode', async () => {
    const exit = vi.fn()
    const { rerender } = render(<StrictMode>{sheet(true, exit)}</StrictMode>)
    rerender(<StrictMode>{sheet(false, exit)}</StrictMode>)
    expect(document.body.style.position).toBe('fixed')
    rerender(<StrictMode>{sheet(true, exit)}</StrictMode>)
    // Let the canceled exit's duration elapse while open.
    await new Promise((resolve) => setTimeout(resolve, 300))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(exit).not.toHaveBeenCalled()
    rerender(<StrictMode>{sheet(false, exit)}</StrictMode>)
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(exit).toHaveBeenCalledTimes(1)
    expect(document.body.style.position).toBe('')
    expect(document.documentElement.style.overflow).toBe('')
  })

  it('restores pre-existing body/content styles and scroll on unmount during exit', () => {
    document.documentElement.style.overflow = 'clip'
    document.body.style.overflow = 'auto'
    document.body.style.position = 'relative'
    document.body.style.top = '3px'
    vi.spyOn(window, 'scrollY', 'get').mockReturnValue(72)
    const view = (open: boolean) => <div className="appFrame"><main className="content" style={{ overflow: 'scroll', touchAction: 'pan-y' }}>{sheet(open)}</main></div>
    const { unmount, rerender } = render(view(true))
    const content = document.querySelector('.content') as HTMLElement
    expect(content.style.overflow).toBe('hidden')
    expect(document.body.style.top).toBe('-72px')
    rerender(view(false))
    unmount()
    expect(content.style.overflow).toBe('scroll')
    expect(content.style.touchAction).toBe('pan-y')
    expect(document.body.style.position).toBe('relative')
    expect(document.body.style.top).toBe('3px')
    expect(document.body.style.overflow).toBe('auto')
    expect(document.documentElement.style.overflow).toBe('clip')
    expect(window.scrollTo).toHaveBeenLastCalledWith(0, 72)
    document.body.removeAttribute('style')
    document.documentElement.style.overflow = ''
  })
})
