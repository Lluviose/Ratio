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
    <div className="stack">
      <div className="card">
        <div className="cardInner">
          <div style={{ fontWeight: 950, fontSize: 16 }}>个性主题</div>
          <div className="muted" style={{ marginTop: 4, fontSize: 12, fontWeight: 800 }}>
            图标匹配主题色
          </div>

          <div className="stack" style={{ marginTop: 12 }}>
            {themeOptions.map((t) => {
              const active = t.id === theme
              return (
                <div
                  key={t.id}
                  className="themeRow"
                  onClick={() => onThemeChange(t.id)}
                  role="button"
                  tabIndex={0}
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
                    <div style={{ fontWeight: 950, fontSize: 13 }}>{t.name}</div>
                  </div>

                  <span className={active ? 'check checkOn' : 'check'} aria-label={active ? 'selected' : 'unselected'}>
                    {active ? <Check size={14} color="var(--primary)" /> : null}
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
          <div className="muted" style={{ marginTop: 4, fontSize: 12, fontWeight: 800 }}>
            跨平台同步（预留）
          </div>

          <div className="stack" style={{ marginTop: 14 }}>
            <div className="assetItem" style={{ padding: '12px 14px' }}>
              <div>
                <div className="assetName">跨平台同步</div>
                <div className="assetSub">需要登录后端账号后可用（预留）</div>
              </div>
              <Toggle checked={crossPlatformSync} onChange={onCrossPlatformSyncChange} />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
