import clsx from 'clsx'
import { motion } from 'framer-motion'
import { useId } from 'react'
import { snappySpring } from '../lib/motionPresets'

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
  // layoutId 必须按实例区分：同屏多个分段控件共享 id 会让指示器跨控件飞行
  const instanceId = useId()

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
                layoutId={`segmentBg-${instanceId}`}
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
