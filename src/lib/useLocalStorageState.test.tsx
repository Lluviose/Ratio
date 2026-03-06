import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useState } from 'react'
import { useLocalStorageState } from './useLocalStorageState'

describe('useLocalStorageState', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('keeps multiple hook instances in sync', async () => {
    function Writer() {
      const [value, setValue] = useLocalStorageState('ratio.test.key', 0)
      return (
        <button type="button" onClick={() => setValue(value + 1)}>
          {value}
        </button>
      )
    }

    function Reader() {
      const [value] = useLocalStorageState('ratio.test.key', 0)
      return <div data-testid="reader">{value}</div>
    }

    render(
      <>
        <Writer />
        <Reader />
      </>,
    )

    expect(screen.getByTestId('reader')).toHaveTextContent('0')
    fireEvent.click(screen.getByRole('button'))
    await waitFor(() => expect(screen.getByTestId('reader')).toHaveTextContent('1'))
  })

  it('reacts to external ratio:storage-write events', async () => {
    function Reader() {
      const [value] = useLocalStorageState('ratio.test.external', 0)
      return <div data-testid="reader">{value}</div>
    }

    render(<Reader />)

    expect(screen.getByTestId('reader')).toHaveTextContent('0')
    act(() => {
      localStorage.setItem('ratio.test.external', '2')
      window.dispatchEvent(
        new CustomEvent('ratio:storage-write', {
          detail: { key: 'ratio.test.external', raw: '2' },
        }),
      )
    })

    await waitFor(() => expect(screen.getByTestId('reader')).toHaveTextContent('2'))
  })

  it('reloads state when the storage key changes without clobbering the new key', async () => {
    localStorage.setItem('ratio.test.a', '1')
    localStorage.setItem('ratio.test.b', '2')

    function Harness() {
      const [storageKey, setStorageKey] = useState('ratio.test.a')
      const [value] = useLocalStorageState(storageKey, 0)

      return (
        <>
          <button type="button" onClick={() => setStorageKey('ratio.test.b')}>
            switch
          </button>
          <div data-testid="value">{value}</div>
        </>
      )
    }

    render(<Harness />)

    expect(screen.getByTestId('value')).toHaveTextContent('1')
    fireEvent.click(screen.getByRole('button', { name: 'switch' }))

    await waitFor(() => expect(screen.getByTestId('value')).toHaveTextContent('2'))
    expect(localStorage.getItem('ratio.test.b')).toBe('2')
  })

  it('reports write failures through onError', async () => {
    const originalSetItem = Storage.prototype.setItem
    const onError = vi.fn()

    Storage.prototype.setItem = function setItem() {
      throw new Error('quota')
    }

    function Reader() {
      const [value] = useLocalStorageState('ratio.test.write-error', 0, { onError })
      return <div data-testid="value">{value}</div>
    }

    try {
      render(<Reader />)
      await waitFor(() => {
        expect(onError).toHaveBeenCalled()
      })
      expect(onError.mock.calls[0]?.[1]).toEqual({ key: 'ratio.test.write-error', phase: 'write' })
    } finally {
      Storage.prototype.setItem = originalSetItem
    }
  })
})