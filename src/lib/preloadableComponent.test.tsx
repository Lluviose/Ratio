import { Suspense, useState } from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { preloadableComponent } from './preloadableComponent'

afterEach(cleanup)

function Counter() {
  const [count, setCount] = useState(0)
  return <button onClick={() => setCount(count + 1)}>Count {count}</button>
}

describe('preloadableComponent', () => {
  it('renders a warm module synchronously without mounting the loading fallback', async () => {
    const loader = vi.fn(async () => ({ default: Counter }))
    const { Component, preload } = preloadableComponent(loader)
    const fallback = vi.fn(() => <span>Loading</span>)
    const Fallback = fallback
    await preload()
    const view = render(<Suspense fallback={<Fallback />}><Component /></Suspense>)
    expect(screen.getByText('Count 0')).toBeVisible()
    expect(fallback).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button'))
    view.rerender(<Suspense fallback={<Fallback />}><Component /></Suspense>)
    expect(screen.getByText('Count 1')).toBeVisible()
    expect(loader).toHaveBeenCalledTimes(1)
  })

  it('shares a pending preload with a cold render and retains state after resolution', async () => {
    let resolve!: (module: { default: typeof Counter }) => void
    const loader = vi.fn(() => new Promise<{ default: typeof Counter }>((done) => { resolve = done }))
    const { Component, preload } = preloadableComponent(loader)
    const first = preload()
    expect(preload()).toBe(first)
    const view = render(<Suspense fallback={<span>Loading</span>}><Component /></Suspense>)
    expect(screen.getByText('Loading')).toBeVisible()
    await act(async () => {
      resolve({ default: Counter })
      await first
    })
    fireEvent.click(screen.getByRole('button'))
    view.rerender(<Suspense fallback={<span>Loading</span>}><Component /></Suspense>)
    expect(screen.getByText('Count 1')).toBeVisible()
    expect(loader).toHaveBeenCalledTimes(1)
  })

  it('allows an unsuccessful background preload to retry on navigation', async () => {
    const loader = vi.fn<() => Promise<{ default: typeof Counter }>>()
      .mockRejectedValueOnce(new Error('temporary failure'))
      .mockResolvedValueOnce({ default: Counter })
    const { Component, preload } = preloadableComponent(loader)
    await expect(preload()).rejects.toThrow('temporary failure')
    await act(async () => {
      render(<Suspense fallback={<span>Loading</span>}><Component /></Suspense>)
    })
    expect(screen.getByText('Count 0')).toBeVisible()
    expect(loader).toHaveBeenCalledTimes(2)
  })
})
