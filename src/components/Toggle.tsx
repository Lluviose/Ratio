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
      <motion.span 
        className="toggleKnob" 
        layout
        transition={{ type: 'spring', stiffness: 500, damping: 30 }}
      />
    </button>
  )
}
