import { useEffect, useMemo, useState } from 'react'
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

  const initial = useMemo(() => String(initialValue), [initialValue])
  const [value, setValue] = useState(initial)

  useEffect(() => {
    if (!open) return
    setValue(initial)
  }, [initial, open])

  const submit = () => {
    const num = Number(value)
    if (!Number.isFinite(num)) {
      alert('请输入正确余额')
      return
    }
    onSave(num)
    onClose()
  }

  return (
    <BottomSheet open={open} title={title} onClose={onClose}>
      <div className="stack" style={{ gap: 12 }}>
        <div className="muted" style={{ fontSize: 12, fontWeight: 800 }}>
          当前：{formatCny(initialValue)}
        </div>

        <label className="field">
          <div className="fieldLabel">修改余额</div>
          <input
            className="input"
            inputMode="decimal"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="0"
          />
        </label>

        <button type="button" className="primaryBtn" onClick={submit}>
          保存
        </button>
      </div>
    </BottomSheet>
  )
}
