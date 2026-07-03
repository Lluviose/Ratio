import { motion } from 'framer-motion'
import { Sparkles } from 'lucide-react'
import { HeaderBadge } from './statsUi'

// 一次性彩带粒子轨迹（确定性配置，transform/opacity 合成器友好）
const CONFETTI_PARTICLES = [
  { right: 24, bottom: 16, dx: -6, dy: -34, size: 7, delay: 0.1, alt: false },
  { right: 44, bottom: 24, dx: 10, dy: -26, size: 5, delay: 0.16, alt: true },
  { right: 62, bottom: 14, dx: -12, dy: -30, size: 6, delay: 0.2, alt: false },
  { right: 82, bottom: 26, dx: 8, dy: -38, size: 5, delay: 0.26, alt: true },
  { right: 100, bottom: 16, dx: -8, dy: -24, size: 7, delay: 0.14, alt: true },
  { right: 120, bottom: 22, dx: 12, dy: -32, size: 5, delay: 0.3, alt: false },
  { right: 140, bottom: 14, dx: -10, dy: -28, size: 6, delay: 0.22, alt: true },
  { right: 158, bottom: 24, dx: 6, dy: -36, size: 5, delay: 0.34, alt: false },
]

export function MilestoneCelebration(props: { milestone: number; color: string }) {
  const { milestone, color } = props
  const pct = Math.round(milestone * 100)

  return (
    <motion.div
      className="card"
      initial={{ opacity: 0, y: 16, scale: 0.94 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -8, scale: 0.97, transition: { duration: 0.18, ease: [0.4, 0, 1, 1] } }}
      transition={{ type: 'spring', stiffness: 420, damping: 26, mass: 0.9 }}
      style={{ overflow: 'hidden', position: 'relative' }}
    >
      <div className="cardInner">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ position: 'relative', flex: '0 0 auto' }}>
            {/* 徽章向外辐射的庆祝圆环，一次性扩散 */}
            {[0, 1].map((ring) => (
              <motion.span
                key={ring}
                aria-hidden="true"
                initial={{ opacity: 0, scale: 0.6 }}
                animate={{ opacity: [0, 0.5, 0], scale: [0.6, 2 + ring * 0.7] }}
                transition={{ duration: 0.9, delay: 0.16 + ring * 0.14, ease: [0.16, 1, 0.3, 1] }}
                style={{
                  position: 'absolute',
                  inset: 0,
                  borderRadius: 15,
                  border: `1.5px solid ${color}`,
                  pointerEvents: 'none',
                }}
              />
            ))}
            <motion.div
              initial={{ scale: 0.4, rotate: -18 }}
              animate={{ scale: [0.4, 1.14, 1], rotate: [-18, 7, 0] }}
              transition={{ duration: 0.68, times: [0, 0.62, 1], ease: [0.34, 1.56, 0.64, 1], delay: 0.06 }}
            >
              <HeaderBadge color={color}>
                <Sparkles size={19} strokeWidth={2.6} />
              </HeaderBadge>
            </motion.div>
          </div>
          <div style={{ minWidth: 0 }}>
            <motion.div
              style={{ fontWeight: 800, fontSize: 15 }}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.16, ease: [0.16, 1, 0.3, 1] }}
            >
              达成 {pct}% 里程碑
            </motion.div>
            <motion.div
              className="muted"
              style={{ fontSize: 12, fontWeight: 650, marginTop: 3 }}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.24, ease: [0.16, 1, 0.3, 1] }}
            >
              储蓄目标又向前推进了一段
            </motion.div>
          </div>
        </div>
      </div>
      {CONFETTI_PARTICLES.map((p, index) => (
        <motion.span
          key={index}
          aria-hidden="true"
          initial={{ opacity: 0, x: 0, y: 10, scale: 0.5, rotate: 0 }}
          animate={{
            opacity: [0, 1, 1, 0],
            x: [0, p.dx * 0.6, p.dx],
            y: [10, p.dy * 0.7, p.dy],
            scale: [0.5, 1, 0.72],
            rotate: p.alt ? [0, 120] : [0, -100],
          }}
          transition={{ duration: 1.3, delay: p.delay, ease: [0.16, 1, 0.3, 1] }}
          style={{
            position: 'absolute',
            right: p.right,
            bottom: p.bottom,
            width: p.size,
            height: p.size,
            borderRadius: p.alt ? 2 : 999,
            background: p.alt ? '#10b981' : color,
            pointerEvents: 'none',
          }}
        />
      ))}
    </motion.div>
  )
}
