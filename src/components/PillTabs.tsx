import clsx from 'clsx'
import { motion } from 'framer-motion'

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
      {options.map((opt) => {
        const isActive = value === opt.value
        return (
          <button
            key={opt.value}
            type="button"
            className={clsx('pill', isActive && 'pillActive')}
            onClick={() => onChange(opt.value)}
            role="tab"
            aria-selected={isActive}
            style={{ position: 'relative' }}
          >
            {isActive && (
              <motion.div
                layoutId={`pillBg-${ariaLabel}`}
                style={{
                  position: 'absolute',
                  inset: 0,
                  background: 'var(--card)',
                  borderRadius: 999,
                  zIndex: 0,
                  boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
                }}
                transition={{ type: 'spring', stiffness: 500, damping: 30 }}
              />
            )}
            <span style={{ position: 'relative', zIndex: 1 }}>{opt.label}</span>
          </button>
        )
      })}
    </div>
  )
}
