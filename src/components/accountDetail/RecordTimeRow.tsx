import { formatTime } from './format'

// 记录时间行：新建记录时可选（默认打开动作页的时刻，不允许未来）；
// 编辑历史记录时只读展示——改时间会让「差额是否已应用到余额」跨校准边界漂移，暂不支持。
export function RecordTimeRow(props: {
  editingAt: string | null
  value: string
  max: string
  onChange: (value: string) => void
}) {
  const { editingAt, value, max, onChange } = props

  return (
    <div className="mt-3 flex items-center justify-between gap-4">
      <div className="shrink-0 text-[12px] font-medium text-slate-400">记录时间</div>
      {editingAt ? (
        <div className="text-[13px] font-semibold text-slate-500">{formatTime(editingAt)}</div>
      ) : (
        <input
          type="datetime-local"
          className="min-w-0 bg-transparent outline-none text-right text-[13px] font-semibold text-slate-700"
          value={value}
          max={max}
          onChange={(e) => onChange(e.target.value)}
          aria-label="record time"
        />
      )}
    </div>
  )
}
