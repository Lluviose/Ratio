import { Component, type ReactNode } from 'react'
import { buildRatioBackup, stringifyRatioBackup } from '../lib/backup'
import { trackTelemetry } from '../lib/telemetry'

type RootErrorBoundaryProps = {
  children: ReactNode
}

type RootErrorBoundaryState = {
  failed: boolean
  exportState: 'idle' | 'done' | 'failed'
}

// 根级错误边界：首包渲染树任何一处抛错都不再白屏。
// 核心数据全部在 localStorage，渲染崩溃不影响数据本身——兜底界面先给用户
// 一条导出备份的生路，再引导刷新；这里在 OverlayProvider 之外，只能用自绘 UI。
export class RootErrorBoundary extends Component<RootErrorBoundaryProps, RootErrorBoundaryState> {
  state: RootErrorBoundaryState = { failed: false, exportState: 'idle' }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error: unknown) {
    trackTelemetry('react_render_error', {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    })
  }

  handleExportBackup = () => {
    try {
      const text = stringifyRatioBackup(buildRatioBackup())
      const stamp = new Date().toISOString().replace(/[:.]/g, '-')
      const blob = new Blob([text], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `ratio-backup-${stamp}.json`
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 0)
      this.setState({ exportState: 'done' })
    } catch {
      this.setState({ exportState: 'failed' })
    }
  }

  render() {
    if (!this.state.failed) return this.props.children

    const { exportState } = this.state
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
          background: 'var(--bg)',
          color: 'var(--text)',
        }}
      >
        <div style={{ maxWidth: 340, width: '100%', display: 'grid', gap: 12, textAlign: 'center' }}>
          <div style={{ fontSize: 17, fontWeight: 800 }}>页面遇到了意外错误</div>
          <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.6, color: 'var(--muted-text)' }}>
            你的数据保存在本机，不受此错误影响。可以先导出一份备份以防万一，然后刷新重试。
          </div>
          <button type="button" className="primaryBtn" onClick={() => window.location.reload()}>
            刷新页面
          </button>
          <button type="button" className="ghostBtn" onClick={this.handleExportBackup}>
            导出数据备份
          </button>
          {exportState === 'done' ? (
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted-text)' }}>备份文件已开始下载</div>
          ) : null}
          {exportState === 'failed' ? (
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--danger-key-text)' }}>
              导出失败，可尝试刷新后在「设置 → 备份与恢复」中导出
            </div>
          ) : null}
        </div>
      </div>
    )
  }
}
