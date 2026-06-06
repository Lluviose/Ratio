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
                  background:
                    'linear-gradient(180deg, rgba(255,255,255,0.86), rgba(255,255,255,0.36))',
                  borderRadius: 999,
                  zIndex: 0,
                  border: '1px solid rgba(255,255,255,0.78)',
                  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.78), 0 8px 18px rgba(15, 23, 42, 0.08)',
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
