import { type ReactNode, useLayoutEffect, useState } from 'react'
import { createPortal } from 'react-dom'

// Keep overlays out of animated/isolated page trees without losing React context
// (including Motion layoutId). Resolve after commit: the frame may mount with us.
export function AppFramePortal({ children }: { children: ReactNode }) {
  const [target, setTarget] = useState<Element | null>(null)
  useLayoutEffect(() => {
    setTarget(document.querySelector('.appFrame') ?? document.body)
  }, [])
  return target ? createPortal(children, target) : null
}
