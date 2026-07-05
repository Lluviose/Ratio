import { motion } from 'framer-motion'
import type { MoneyExpressionOperator, MoneyExpressionResult } from '../../lib/moneyExpression'
import { formatCny } from './format'

export function MoneyExpressionPreview(props: { show: boolean; result: MoneyExpressionResult }) {
  const { show, result } = props
  if (!show) return null
  const resultKey = result.ok ? `ok-${result.value}` : `error-${result.reason}`

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -3, scale: 0.99 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
      className="mt-2 flex min-h-10 items-center justify-between rounded-[18px] border border-white/80 px-3.5 py-2 shadow-sm"
      style={{
        background: 'linear-gradient(180deg, rgb(var(--glass-rgb) / 0.86), rgb(var(--glass-tint-rgb) / 0.72))',
        boxShadow: 'inset 0 1px 0 rgb(var(--glass-rgb) / 0.86), 0 10px 26px -24px rgba(15,23,42,0.55)',
      }}
    >
      <div className="text-[13px] font-black text-slate-400">=</div>
      {result.ok ? (
        <motion.div
          key={resultKey}
          initial={{ opacity: 0, y: 2 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.14, ease: [0.16, 1, 0.3, 1] }}
          className={`text-[13px] font-semibold ${result.value < 0 ? 'text-rose-500' : 'text-slate-700'}`}
        >
          {formatCny(result.value)}
        </motion.div>
      ) : (
        <motion.div
          key={resultKey}
          initial={{ opacity: 0, y: 2 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.14, ease: [0.16, 1, 0.3, 1] }}
          className="text-[12px] font-semibold text-slate-400"
        >
          {result.reason === 'invalid' ? '无法计算' : '继续输入金额'}
        </motion.div>
      )}
    </motion.div>
  )
}

export function MoneyExpressionKeypad(props: { onOperator: (operator: MoneyExpressionOperator) => void; onClear: () => void }) {
  const { onOperator, onClear } = props
  const keyClass =
    'relative h-12 overflow-hidden rounded-[18px] border text-[18px] font-black outline-none transition-colors focus-visible:ring-4 focus-visible:ring-[rgb(var(--primary-rgb)/0.16)]'
  const keyStyle = {
    background: 'linear-gradient(180deg, rgb(var(--glass-rgb) / 0.98), rgb(var(--glass-tint-rgb) / 0.94))',
    borderColor: 'rgb(var(--glass-rgb) / 0.9)',
    boxShadow:
      'inset 0 1px 0 rgb(var(--glass-rgb) / 0.98), inset 0 -1px 0 rgba(15,23,42,0.035), 0 10px 20px -16px rgba(15,23,42,0.7)',
  } as const
  const tapMotion = {
    y: 1,
    scale: 0.985,
    boxShadow:
      'inset 0 1px 1px rgba(15,23,42,0.06), inset 0 -1px 0 rgba(255,255,255,0.8), 0 4px 10px -14px rgba(15,23,42,0.6)',
  }

  return (
    <div className="mt-2.5 grid grid-cols-3 gap-2.5">
      <motion.button
        type="button"
        onPointerDown={(e) => e.preventDefault()}
        onClick={() => onOperator('+')}
        whileTap={tapMotion}
        transition={{ type: 'spring', stiffness: 700, damping: 36, mass: 0.55 }}
        className={keyClass}
        style={{ ...keyStyle, color: 'var(--primary)' }}
        aria-label="add"
      >
        <span className="pointer-events-none absolute inset-x-3 top-1 h-px rounded-full bg-white/90" />
        +
      </motion.button>
      <motion.button
        type="button"
        onPointerDown={(e) => e.preventDefault()}
        onClick={() => onOperator('-')}
        whileTap={tapMotion}
        transition={{ type: 'spring', stiffness: 700, damping: 36, mass: 0.55 }}
        className={keyClass}
        style={{ ...keyStyle, color: 'var(--primary)' }}
        aria-label="subtract"
      >
        <span className="pointer-events-none absolute inset-x-3 top-1 h-px rounded-full bg-white/90" />
        -
      </motion.button>
      <motion.button
        type="button"
        onPointerDown={(e) => e.preventDefault()}
        onClick={onClear}
        whileTap={tapMotion}
        transition={{ type: 'spring', stiffness: 700, damping: 36, mass: 0.55 }}
        className={`${keyClass} text-[14px]`}
        style={{
          ...keyStyle,
          color: 'var(--danger-key-text)',
          background: 'linear-gradient(180deg, rgb(var(--glass-rgb) / 0.98), rgb(var(--rose-tint-rgb) / 0.9))',
        }}
        aria-label="clear"
      >
        <span className="pointer-events-none absolute inset-x-3 top-1 h-px rounded-full bg-white/90" />
        AC
      </motion.button>
    </div>
  )
}
