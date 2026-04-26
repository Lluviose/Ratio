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
        animate={{ x: checked ? 28 : 0 }}
        transition={{ type: 'spring', stiffness: 650, damping: 34, mass: 0.7 }}
      />
    </button>
  )
}
