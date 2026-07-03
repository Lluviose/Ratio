import { motion } from 'framer-motion'
import { Sparkles } from 'lucide-react'
import { cardEntranceAnimate, cardEntranceInitial } from '../../lib/motionPresets'
import { HeaderBadge } from './statsUi'

export function MilestoneCelebration(props: { milestone: number; color: string }) {
  const { milestone, color } = props
  const pct = Math.round(milestone * 100)

  return (
    <motion.div
      className="card"
      initial={cardEntranceInitial}
      animate={cardEntranceAnimate}
      exit={{ opacity: 0, y: -8, scale: 0.98 }}
      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      style={{ overflow: 'hidden', position: 'relative' }}
    >
      <div className="cardInner">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <motion.div
            animate={{ rotate: [0, -8, 8, 0], scale: [1, 1.08, 1] }}
            transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
          >
            <HeaderBadge color={color}>
              <Sparkles size={19} strokeWidth={2.6} />
            </HeaderBadge>
          </motion.div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 800, fontSize: 15 }}>达成 {pct}% 里程碑</div>
            <div className="muted" style={{ fontSize: 12, fontWeight: 650, marginTop: 3 }}>储蓄目标又向前推进了一段</div>
          </div>
        </div>
      </div>
      {[0, 1, 2, 3].map((index) => (
        <motion.span
          key={index}
          initial={{ opacity: 0, y: 12, scale: 0.6 }}
          animate={{ opacity: [0, 1, 0], y: [-2, -20 - index * 4], scale: [0.7, 1, 0.8] }}
          transition={{ duration: 1.4, delay: 0.12 + index * 0.1, ease: 'easeOut' }}
          style={{
            position: 'absolute',
            right: 28 + index * 18,
            bottom: 18 + (index % 2) * 12,
            width: 7,
            height: 7,
            borderRadius: 999,
            background: index % 2 === 0 ? color : '#10b981',
          }}
        />
      ))}
    </motion.div>
  )
}
