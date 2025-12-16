import { Check } from 'lucide-react'
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
    <div className="stack animate-[fadeIn_0.4s_ease-out]">
      <div className="card">
        <div className="cardInner">
          <div style={{ fontWeight: 950, fontSize: 16 }}>个性主题</div>
          <div className="muted" style={{ marginTop: 4, fontSize: 13, fontWeight: 700 }}>
            图标匹配主题色
          </div>

          <div className="stack" style={{ marginTop: 16 }}>
            {themeOptions.map((t) => {
              const active = t.id === theme
              return (
                <div
                  key={t.id}
                  className="themeRow transition-transform active:scale-[0.99]"
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
                </div>
              )
            })}
          </div>
        </div>
      </div>

      <div className="card">
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
      </div>
    </div>
  )
}
