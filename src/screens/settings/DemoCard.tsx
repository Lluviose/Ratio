export function DemoCard(props: {
  demoActive: boolean
  busy: boolean
  onEnterDemo: () => Promise<void>
  onExitDemo: () => Promise<void>
}) {
  const { demoActive, busy, onEnterDemo, onExitDemo } = props
  return (
    <div className="card">
      <div className="cardInner">
        <div style={{ fontWeight: 800, fontSize: 16 }}>演示数据</div>
        <div className="muted" style={{ marginTop: 4, fontSize: 13, fontWeight: 550 }}>
          {demoActive ? '正在浏览示例账本；你的真实数据已安全暂存' : '一键填充带 18 个月历史的示例账本，随时退出并恢复'}
        </div>
        <div style={{ marginTop: 14 }}>
          {demoActive ? (
            <button type="button" className="primaryBtn" style={{ width: '100%' }} disabled={busy} onClick={() => void onExitDemo()}>
              退出演示并恢复我的数据
            </button>
          ) : (
            <button type="button" className="ghostBtn" disabled={busy} onClick={() => void onEnterDemo()}>
              试试演示数据
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
