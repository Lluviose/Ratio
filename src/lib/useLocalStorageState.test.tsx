import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
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
})
