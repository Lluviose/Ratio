import type { CSSProperties, ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Info } from 'lucide-react'
import {
  cardEntranceAnimate,
  cardEntranceInitial,
  cardEntranceTransition,
  quickFade,
  subtleLift,
} from '../../lib/motionPresets'

const metricTileStyle = {
  minWidth: 0,
  border: '1px solid rgba(15, 23, 42, 0.06)',
  borderRadius: 14,
  padding: 12,
  background: 'linear-gradient(180deg, rgba(255, 255, 255, 0.76), rgba(248, 250, 252, 0.7))',
  boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.82), 0 6px 16px -16px rgba(15, 23, 42, 0.36)',
  backdropFilter: 'blur(14px) saturate(1.04)',
  WebkitBackdropFilter: 'blur(14px) saturate(1.04)',
} satisfies CSSProperties

const compactMetricTileStyle = {
  ...metricTileStyle,
  borderRadius: 13,
  padding: 10,
  background: 'linear-gradient(180deg, rgba(255, 255, 255, 0.72), rgba(248, 250, 252, 0.66))',
} satisfies CSSProperties

const metricLabelStyle = {
  fontSize: 11,
  fontWeight: 650,
  color: 'rgba(71, 85, 105, 0.82)',
  overflowWrap: 'anywhere',
} satisfies CSSProperties

const metricValueStyle = {
  fontSize: 16,
  fontWeight: 700,
  marginTop: 4,
  lineHeight: 1.18,
  overflowWrap: 'anywhere',
} satisfies CSSProperties

const metricSubStyle = {
  fontSize: 11,
  fontWeight: 560,
  marginTop: 4,
  color: 'rgba(71, 85, 105, 0.72)',
  overflowWrap: 'anywhere',
} satisfies CSSProperties

const compactMetricLabelStyle = {
  ...metricLabelStyle,
  fontSize: 10,
} satisfies CSSProperties

const compactMetricValueStyle = {
  ...metricValueStyle,
  fontSize: 14,
  marginTop: 3,
} satisfies CSSProperties

const compactMetricSubStyle = {
  ...metricSubStyle,
  fontSize: 10,
  fontWeight: 550,
  marginTop: 3,
} satisfies CSSProperties

/** Two-column grid for metric tiles. */
export function MetricGrid(props: { children: ReactNode; marginTop?: number; gap?: number }) {
  const { children, marginTop, gap = 8 } = props
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
        gap,
        marginTop,
      }}
    >
      {children}
    </div>
  )
}

export function MetricTile(props: {
  label: string
  value: string
  sub?: string
  valueColor?: string
  compact?: boolean
}) {
  const { label, value, sub, valueColor, compact = false } = props
  const valueStyle = compact
    ? { ...compactMetricValueStyle, color: valueColor }
    : { ...metricValueStyle, color: valueColor ?? 'var(--text)' }

  return (
    <motion.div
      style={compact ? compactMetricTileStyle : metricTileStyle}
      whileHover={subtleLift}
      transition={{ type: 'spring', stiffness: 520, damping: 34, mass: 0.7 }}
    >
      <div style={compact ? compactMetricLabelStyle : metricLabelStyle}>{label}</div>
      <div style={valueStyle}>{value}</div>
      {sub ? <div style={compact ? compactMetricSubStyle : metricSubStyle}>{sub}</div> : null}
    </motion.div>
  )
}

/** Small round "i" toggle used before inline explanations. */
export function InfoDot(props: {
  open: boolean
  onToggle: () => void
  controls: string
  label: string
  size?: number
}) {
  const { open, onToggle, controls, label, size = 24 } = props
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={label}
      aria-expanded={open}
      aria-controls={controls}
      title={label}
      style={{
        width: size,
        height: size,
        borderRadius: 999,
        border: '1px solid var(--hairline)',
        background: 'rgb(255 255 255 / 0.84)',
        color: open ? 'var(--text)' : 'var(--muted-text)',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        flex: '0 0 auto',
      }}
    >
      <Info size={Math.round(size * 0.58)} strokeWidth={2.5} />
    </button>
  )
}

/** Inline expandable explanation body, shared by every stats card. */
export function ExplainPanel(props: { id: string; open: boolean; children: ReactNode }) {
  const { id, open, children } = props
  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          id={id}
          role="note"
          initial={{ opacity: 0, height: 0, y: -4 }}
          animate={{ opacity: 1, height: 'auto', y: 0 }}
          exit={{ opacity: 0, height: 0, y: -4, transition: { duration: 0.16, ease: [0.4, 0, 1, 1] } }}
          transition={{ height: { duration: 0.26, ease: [0.05, 0.7, 0.1, 1] }, ...quickFade }}
          style={{ overflow: 'hidden' }}
        >
          <div
            style={{
              marginTop: 10,
              borderRadius: 16,
              padding: 12,
              background: 'var(--card)',
              border: '1px solid var(--hairline)',
              boxShadow: '0 10px 26px -22px rgba(15, 23, 42, 0.42)',
              display: 'grid',
              gap: 7,
              fontSize: 11,
              fontWeight: 650,
              color: 'var(--muted-text)',
            }}
          >
            {children}
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}

/** Bold inline term inside an ExplainPanel sentence. */
export function ExplainTerm(props: { children: ReactNode }) {
  return <span style={{ color: 'var(--text)', fontWeight: 800 }}>{props.children}</span>
}

/** Rounded status pill (e.g. 本期达标 / 目标已逾期). */
export function StatusChip(props: { text: string; tone: string; dot?: boolean }) {
  const { text, tone, dot = false } = props
  return (
    <div
      style={{
        flex: '0 0 auto',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        borderRadius: 999,
        padding: '6px 10px',
        background: 'rgb(255 255 255 / 0.84)',
        border: '1px solid rgba(15, 23, 42, 0.06)',
        boxShadow: '0 8px 20px -18px rgba(15, 23, 42, 0.36)',
        color: tone,
        fontSize: 11,
        fontWeight: 800,
        whiteSpace: 'nowrap',
      }}
    >
      {dot ? <span style={{ width: 7, height: 7, borderRadius: 999, background: tone, flex: '0 0 auto' }} /> : null}
      {text}
    </div>
  )
}

/** Card shell with the shared entrance animation and optional tint wash. */
export function GlowCard(props: {
  children: ReactNode
  color?: string
  glowOpacity?: number
  delay?: number
  style?: CSSProperties
}) {
  const { children, color, glowOpacity = 0, delay = 0, style } = props
  return (
    <motion.div
      className="card"
      initial={cardEntranceInitial}
      animate={cardEntranceAnimate}
      transition={{ ...cardEntranceTransition, delay }}
      style={{ overflow: 'hidden', position: 'relative', ...style }}
    >
      {color && glowOpacity > 0 ? (
        <motion.div
          aria-hidden="true"
          initial={{ opacity: 0 }}
          animate={{ opacity: glowOpacity }}
          transition={{ duration: 0.35 }}
          style={{
            position: 'absolute',
            inset: 0,
            background: `linear-gradient(135deg, ${color}, transparent 64%)`,
            borderRadius: 'inherit',
            pointerEvents: 'none',
          }}
        />
      ) : null}
      <div className="cardInner" style={{ position: 'relative' }}>{children}</div>
    </motion.div>
  )
}

/** Icon badge used in card headers. */
export function HeaderBadge(props: { color: string; children: ReactNode }) {
  const { color, children } = props
  return (
    <div
      style={{
        width: 36,
        height: 36,
        borderRadius: 15,
        background: 'rgb(var(--primary-rgb) / 0.12)',
        color,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flex: '0 0 auto',
      }}
    >
      {children}
    </div>
  )
}

/** Muted uppercase-ish subsection label inside a card. */
export function SubsectionLabel(props: { children: ReactNode; marginTop?: number }) {
  return (
    <div
      style={{
        marginTop: props.marginTop ?? 14,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
      }}
    >
      <div style={{ fontSize: 11, fontWeight: 750, color: 'var(--muted-text)', flex: '0 0 auto' }}>{props.children}</div>
      <div style={{ height: 1, background: 'var(--hairline)', flex: 1 }} />
    </div>
  )
}
