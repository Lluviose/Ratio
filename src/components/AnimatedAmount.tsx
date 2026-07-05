import { AnimatePresence, motion } from 'framer-motion'
import { formatCny } from '../lib/format'
import { splitAmountTokens } from '../lib/amountTokens'
import { useReducedMotion } from '../lib/useReducedMotion'

// 金额数字滚动（odometer）：每个数位是一条 0-9 的竖排色带，
// 数值变化时按弹簧滚动到目标数字；符号（¥ , . -）保持静态。
// token 拆分与键规则见 lib/amountTokens.ts。
// 全局 tabular-nums（body）保证数位等宽，不会因数字变化抖动布局。

const DIGITS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'] as const

const digitSpring = { type: 'spring', stiffness: 300, damping: 34, mass: 0.8 } as const

function DigitColumn(props: { digit: number }) {
  const { digit } = props
  return (
    <span className="inline-flex flex-col overflow-hidden" style={{ height: '1em' }} aria-hidden>
      <motion.span
        className="inline-flex flex-col items-center"
        initial={false}
        animate={{ y: `${-digit}em` }}
        transition={digitSpring}
      >
        {DIGITS.map((d) => (
          <span key={d} style={{ height: '1em', lineHeight: '1em' }}>
            {d}
          </span>
        ))}
      </motion.span>
    </span>
  )
}

export function AnimatedAmount(props: { value: number; keepCents?: boolean; className?: string }) {
  const { value, keepCents, className } = props
  const reducedMotion = useReducedMotion()
  const formatted = formatCny(value, keepCents ? { keepCents: true } : undefined)

  if (reducedMotion) {
    return <span className={className}>{formatted}</span>
  }

  const tokens = splitAmountTokens(formatted)

  return (
    <span
      className={className ? `inline-flex ${className}` : 'inline-flex'}
      style={{ lineHeight: '1em' }}
      role="text"
      aria-label={formatted}
    >
      <AnimatePresence initial={false} mode="popLayout">
        {tokens.map((token) => (
          <motion.span
            key={token.key}
            layout="position"
            initial={{ opacity: 0, y: '0.35em' }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: '-0.25em' }}
            transition={digitSpring}
            aria-hidden
            className="inline-flex"
          >
            {token.kind === 'digit' ? (
              <DigitColumn digit={token.digit} />
            ) : (
              <span style={{ height: '1em', lineHeight: '1em' }}>{token.char}</span>
            )}
          </motion.span>
        ))}
      </AnimatePresence>
    </span>
  )
}
