import clsx from 'clsx'
import { motion } from 'framer-motion'

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
      {options.map((opt) => {
        const isActive = value === opt.value
        return (
          <button
            key={opt.value}
            type="button"
            className={clsx('segmentBtn', isActive && 'segmentBtnActive')}
            onClick={() => onChange(opt.value)}
            role="tab"
            aria-selected={isActive}
            style={{ position: 'relative' }}
          >
            {isActive && (
              <motion.div
                layoutId="segmentBg"
                style={{
                  position: 'absolute',
                  inset: 0,
                  background: 'var(--card)',
                  borderRadius: 999,
                  zIndex: 0,
                  boxShadow: '0 6px 20px rgba(11, 15, 26, 0.08)',
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
