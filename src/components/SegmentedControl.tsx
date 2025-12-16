import clsx from 'clsx'

export type SegmentedOption<T extends string> = {
  value: T
  label: string
}

export function SegmentedControl<T extends string>(props: {
  options: SegmentedOption<T>[]
  value: T
  onChange: (value: T) => void
}) {
  const { options, value, onChange } = props

  return (
    <div className="segment" role="tablist" aria-label="segmented-control">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          className={clsx('segmentBtn', value === opt.value && 'segmentBtnActive')}
          onClick={() => onChange(opt.value)}
          role="tab"
          aria-selected={value === opt.value}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}
