import clsx from 'clsx'
import { motion } from 'framer-motion'

export function Toggle(props: { checked: boolean; onChange: (checked: boolean) => void; disabled?: boolean }) {
  const { checked, onChange, disabled = false } = props
  return (
    <button
      type="button"
      className={clsx('toggle', checked && 'toggleOn', disabled && 'opacity-60 cursor-not-allowed')}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      aria-pressed={checked}
    >
      <span className="toggleText toggleTextOn">开</span>
      <span className="toggleText toggleTextOff">关</span>
      <motion.span
        className="toggleKnob"
        initial={false}
        animate={{
          x: checked ? 28 : 0,
          scaleX: [1, 1.18, 1],
          scaleY: [1, 0.9, 1],
        }}
        transition={{
          x: { type: 'spring', stiffness: 640, damping: 33, mass: 0.66 },
          scaleX: { duration: 0.32, times: [0, 0.4, 1], ease: [0.33, 1, 0.68, 1] },
          scaleY: { duration: 0.32, times: [0, 0.4, 1], ease: [0.33, 1, 0.68, 1] },
        }}
      />
    </button>
  )
}
