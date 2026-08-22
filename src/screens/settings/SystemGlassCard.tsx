import { Toggle } from '../../components/Toggle'
import { isSystemGlassCssSupported } from '../../lib/systemGlass'

export function SystemGlassCard(props: { enabled: boolean; onChange: (enabled: boolean) => void }) {
  const { enabled, onChange } = props
  const supported = isSystemGlassCssSupported()

  return (
    <div className="card">
      <div className="cardInner">
        <div className="row" style={{ alignItems: 'flex-start' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 800, fontSize: 16 }}>系统液态玻璃</div>
            <div className="muted" style={{ marginTop: 4, fontSize: 13, fontWeight: 550 }}>
              {supported
                ? '用 iOS 系统材质替换网页毛玻璃（卡片、抽屉、导航）'
                : '仅 iPhone 原生应用内生效。当前继续使用网页毛玻璃，打开后下次在应用里自动启用'}
            </div>
          </div>
          <Toggle checked={enabled} onChange={onChange} />
        </div>
      </div>
    </div>
  )
}
