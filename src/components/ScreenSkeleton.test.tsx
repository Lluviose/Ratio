import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ScreenSkeleton } from './ScreenSkeleton'

describe('ScreenSkeleton', () => {
  it('marks only the trend skeleton for the iOS system-glass backing fix', () => {
    const { container, rerender } = render(<ScreenSkeleton screen="trend" />)
    const skeleton = () => container.querySelector('.screenSkeleton')

    expect(skeleton()).toHaveClass('screenSkeletonTrend')

    rerender(<ScreenSkeleton screen="stats" />)
    expect(skeleton()).not.toHaveClass('screenSkeletonTrend')

    rerender(<ScreenSkeleton screen="settings" />)
    expect(skeleton()).not.toHaveClass('screenSkeletonTrend')
  })
})
