import { SegmentedControl } from '../../components/SegmentedControl'
import { coerceColorMode, COLOR_MODE_OPTIONS, type ColorMode } from '../../lib/colorMode'

export function AppearanceCard(props: { colorMode: ColorMode; onChange: (mode: ColorMode) => void }) {
  const { colorMode, onChange } = props
  return (
    <div className="card">
      <div className="cardInner">
        <div style={{ fontWeight: 800, fontSize: 16 }}>外观</div>
        <div className="muted" style={{ marginTop: 4, fontSize: 13, fontWeight: 550 }}>
          深色模式可跟随系统或手动固定
        </div>
        <div style={{ marginTop: 14, display: 'flex', justifyContent: 'center' }}>
          <SegmentedControl
            options={COLOR_MODE_OPTIONS.map((o) => ({ value: o.id, label: o.label }))}
            value={colorMode}
            onChange={(v) => onChange(coerceColorMode(v))}
          />
        </div>
      </div>
    </div>
  )
}
