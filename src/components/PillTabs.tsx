import clsx from 'clsx'

export type PillOption<T extends string> = { value: T; label: string }

export function PillTabs<T extends string>(props: {
  options: PillOption<T>[]
  value: T
  onChange: (value: T) => void
  ariaLabel?: string
}) {
  const { options, value, onChange, ariaLabel } = props

  return (
    <div className="pills" role="tablist" aria-label={ariaLabel ?? 'pills'}>
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          className={clsx('pill', value === opt.value && 'pillActive')}
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
