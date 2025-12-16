import { X } from 'lucide-react'
import { type ReactNode, useEffect } from 'react'

export function BottomSheet(props: {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
}) {
  const { open, title, onClose, children } = props

  useEffect(() => {
    if (!open) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose, open])

  if (!open) return null

  return (
    <div className="sheetOverlay" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="handle" />
        <div className="sheetHeader">
          <div className="sheetTitle">{title}</div>
          <button type="button" className="iconBtn" onClick={onClose} aria-label="close">
            <X size={18} />
          </button>
        </div>
        <div className="sheetBody">{children}</div>
      </div>
    </div>
  )
}
