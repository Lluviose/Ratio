import { Check } from 'lucide-react'
import { motion } from 'framer-motion'
import { Toggle } from '../components/Toggle'
import type { ThemeId, ThemeOption } from '../lib/themes'

export function SettingsScreen(props: {
  themeOptions: ThemeOption[]
  theme: ThemeId
  onThemeChange: (id: ThemeId) => void
  crossPlatformSync: boolean
  onCrossPlatformSyncChange: (next: boolean) => void
}) {
  const {
    themeOptions,
    theme,
    onThemeChange,
    crossPlatformSync,
    onCrossPlatformSyncChange,
  } = props

  return (
    <motion.div 
      className="stack"
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ 
        type: 'spring',
        stiffness: 400,
        damping: 30
      }}
    >
      <div className="card">
        <div className="cardInner">
          <div style={{ fontWeight: 950, fontSize: 16 }}>个性主题</div>
          <div className="muted" style={{ marginTop: 4, fontSize: 13, fontWeight: 700 }}>
            图标匹配主题色
          </div>

          <div className="stack" style={{ marginTop: 16 }}>
            {themeOptions.map((t, i) => {
              const active = t.id === theme
              return (
                <motion.div
                  key={t.id}
                  className="themeRow"
                  onClick={() => onThemeChange(t.id)}
                  role="button"
                  tabIndex={0}
                  style={{
                    background: active ? 'var(--bg)' : 'transparent',
                    borderColor: active ? 'var(--primary)' : 'rgba(11, 15, 26, 0.06)'
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') onThemeChange(t.id)
                  }}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ 
                    type: 'spring',
                    stiffness: 400,
                    damping: 30,
                    delay: i * 0.05 
                  }}
                  whileTap={{ scale: 0.99 }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div className="swatches" aria-hidden="true">
                      {t.swatches.map((s) => (
                        <span key={s} className="swatch" style={{ background: s }} />
                      ))}
                    </div>
                    <div style={{ fontWeight: 900, fontSize: 14 }}>{t.name}</div>
                  </div>

                  <span className={active ? 'check checkOn' : 'check'} aria-label={active ? 'selected' : 'unselected'}>
                    {active ? <Check size={12} color="#fff" strokeWidth={4} /> : null}
                  </span>
                </motion.div>
              )
            })}
          </div>
        </div>
      </div>

      <motion.div 
        className="card"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ 
          type: 'spring',
          stiffness: 400,
          damping: 30,
          delay: 0.2 
        }}
      >
        <div className="cardInner">
          <div style={{ fontWeight: 950, fontSize: 16 }}>数据同步</div>
          <div className="muted" style={{ marginTop: 4, fontSize: 13, fontWeight: 700 }}>
            跨平台同步（预留）
          </div>

          <div className="stack" style={{ marginTop: 16 }}>
            <div className="assetItem" style={{ padding: '16px', background: 'var(--bg)', border: 'none' }}>
              <div>
                <div className="assetName" style={{ fontSize: 15 }}>跨平台同步</div>
                <div className="assetSub" style={{ marginTop: 4 }}>需要登录后端账号后可用</div>
              </div>
              <Toggle checked={crossPlatformSync} onChange={onCrossPlatformSyncChange} />
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  )
}
