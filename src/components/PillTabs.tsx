import clsx from 'clsx'
import { motion } from 'framer-motion'
import { useId } from 'react'
import { snappySpring } from '../lib/motionPresets'

export type PillOption<T extends string> = { value: T; label: string }

export function PillTabs<T extends string>(props: {
  options: PillOption<T>[]
  value: T
  onChange: (value: T) => void
  ariaLabel?: string
}) {
  const { options, value, onChange, ariaLabel } = props
  // 未提供 ariaLabel 时退回实例 id，避免多个 PillTabs 共享 layoutId
  const instanceId = useId()
  const layoutNamespace = ariaLabel ?? instanceId

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
                layoutId={`pillBg-${layoutNamespace}`}
                style={{
                  position: 'absolute',
                  inset: 0,
                  background: 'var(--card)',
                  borderRadius: 999,
                  zIndex: 0,
                  boxShadow: '0 3px 10px rgba(15, 23, 42, 0.10), 0 1px 2px rgba(15, 23, 42, 0.06)',
                }}
                transition={snappySpring}
              />
            )}
            <motion.span
              style={{ position: 'relative', zIndex: 1, display: 'inline-block' }}
              animate={{ scale: isActive ? 1.02 : 1 }}
              transition={snappySpring}
            >
              {opt.label}
            </motion.span>
          </button>
        )
      })}
    </div>
  )
}
