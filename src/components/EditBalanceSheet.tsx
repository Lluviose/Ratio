import { useRef } from 'react'
import { BottomSheet } from './BottomSheet'
import { formatCny } from '../lib/format'

export function EditBalanceSheet(props: {
  open: boolean
  title: string
  initialValue: number
  onClose: () => void
  onSave: (next: number) => void
}) {
  const { open, title, initialValue, onClose, onSave } = props

  const inputRef = useRef<HTMLInputElement | null>(null)

  const submit = () => {
    const num = Number(inputRef.current?.value ?? '')
    if (!Number.isFinite(num)) {
      alert('请输入正确余额')
      return
    }
    onSave(num)
    onClose()
  }

  return (
    <BottomSheet open={open} title={title} onClose={onClose}>
      <div className="stack animate-[fadeIn_0.4s_ease-out]" style={{ gap: 16 }}>
        <div className="muted" style={{ fontSize: 13, fontWeight: 700 }}>
          当前：<span style={{ color: 'var(--text)', fontWeight: 900 }}>{formatCny(initialValue)}</span>
        </div>

        <label className="field">
          <div className="fieldLabel">修改余额</div>
          <input
            className="input"
            inputMode="decimal"
            defaultValue={String(initialValue)}
            ref={inputRef}
            placeholder="0"
            autoFocus
          />
        </label>

        <button type="button" className="primaryBtn" onClick={submit}>
          保存
        </button>
      </div>
    </BottomSheet>
  )
}
