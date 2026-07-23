import { Check } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'
import { standardEase } from '../../lib/motionPresets'
import type { ThemeId, ThemeOption } from '../../lib/themes'

export type ThemeChangeOrigin = { x: number; y: number }

// 主题切换的点击坐标上报约定：以色板（.swatches）中心为动画原点，见 PROJECT.md「应用编排」
function getThemeChangeOrigin(el: HTMLElement): ThemeChangeOrigin {
  const swatches = el.querySelector('.swatches')
  const rect = (swatches ?? el).getBoundingClientRect()
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
}

function withAlpha(color: string, alpha: number): string {
  const raw = color.trim().replace(/^#/, '')
  if (raw.length !== 3 && raw.length !== 6) return color

  const full = raw.length === 3 ? raw.split('').map((v) => v + v).join('') : raw
  const r = Number.parseInt(full.slice(0, 2), 16)
  const g = Number.parseInt(full.slice(2, 4), 16)
  const b = Number.parseInt(full.slice(4, 6), 16)
  if ([r, g, b].some((v) => Number.isNaN(v))) return color

  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

export function ThemeCard(props: {
  themeOptions: ThemeOption[]
  theme: ThemeId
  activeThemeColor: string
  onThemeChange: (id: ThemeId, origin?: ThemeChangeOrigin) => void
}) {
  const { themeOptions, theme, activeThemeColor, onThemeChange } = props
  const randomSwatches = themeOptions.filter((t) => t.id !== 'random').map((t) => t.colors.invest)

  return (
    <div className="card">
      <div className="cardInner">
        <div style={{ fontWeight: 800, fontSize: 16 }}>个性主题</div>
        <div className="muted" style={{ marginTop: 4, fontSize: 13, fontWeight: 550 }}>
          图标匹配主题色
        </div>

        <div className="stack" style={{ marginTop: 16 }}>
          {themeOptions.map((t, i) => {
            const active = t.id === theme
            const activeAccent = active ? activeThemeColor : t.colors.invest
            const activeBackground = active ? withAlpha(activeAccent, 0.1) : 'transparent'
            const activeShadow = active ? `0 12px 28px -24px ${withAlpha(activeAccent, 0.72)}` : undefined
            return (
              <motion.div
                key={t.id}
                className="themeRow"
                onClick={(e) => onThemeChange(t.id, getThemeChangeOrigin(e.currentTarget))}
                role="button"
                tabIndex={0}
                style={{
                  background: activeBackground,
                  borderColor: active ? activeAccent : 'rgb(var(--edge-rgb) / 0.06)',
                  boxShadow: activeShadow,
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    onThemeChange(t.id, getThemeChangeOrigin(e.currentTarget))
                  }
                }}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  opacity: { delay: i * 0.05, duration: 0.18, ease: standardEase },
                  y: { delay: i * 0.05, duration: 0.18, ease: standardEase },
                }}
                whileTap={{ scale: 0.99 }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div className="swatches" aria-hidden="true">
                    {(t.id === 'random' ? randomSwatches : [t.colors.liquid, t.colors.invest, t.colors.fixed]).map(
                      (color, idx) => (
                        <motion.span
                          key={`${t.id}-${idx}`}
                          className="swatch"
                          style={{ background: color }}
                          animate={{ y: active ? -2 : 0, scale: active ? 1.08 : 1 }}
                          transition={{
                            type: 'spring',
                            stiffness: 540,
                            damping: 22,
                            mass: 0.7,
                            delay: active ? idx * 0.045 : 0,
                          }}
                        />
                      ),
                    )}
                  </div>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{t.name}</div>
                </div>

                <motion.span
                  className={active ? 'check checkOn' : 'check'}
                  aria-label={active ? 'selected' : 'unselected'}
                  style={active ? { background: activeAccent, borderColor: activeAccent } : undefined}
                  animate={{ scale: active ? 1.1 : 1 }}
                  transition={{ type: 'spring', stiffness: 600, damping: 24, mass: 0.6 }}
                >
                  <AnimatePresence initial={false}>
                    {active ? (
                      <motion.span
                        key="check"
                        initial={{ opacity: 0, scale: 0.4, rotate: -30 }}
                        animate={{ opacity: 1, scale: 1, rotate: 0 }}
                        exit={{ opacity: 0, scale: 0.6, transition: { duration: 0.1 } }}
                        transition={{ type: 'spring', stiffness: 560, damping: 22, mass: 0.65 }}
                      >
                        <Check size={12} color="#fff" strokeWidth={4} />
                      </motion.span>
                    ) : null}
                  </AnimatePresence>
                </motion.span>
              </motion.div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
