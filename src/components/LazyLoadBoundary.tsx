import { Component, type ReactNode } from 'react'
import { notifyChunkLoadFailed, recoverFromChunkLoadFailure } from '../lib/chunkRecovery'

type LazyLoadBoundaryProps = {
  children: ReactNode
  fallback?: ReactNode
}

type LazyLoadBoundaryState = {
  failed: boolean
}

// 懒分包加载失败边界：失败几乎总是「部署已更新、旧哈希 chunk 已消失」，
// 恢复走 chunkRecovery（优先应用 waiting 的 SW 更新，而非原地刷新死循环）。
export class LazyLoadBoundary extends Component<LazyLoadBoundaryProps, LazyLoadBoundaryState> {
  state: LazyLoadBoundaryState = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch() {
    notifyChunkLoadFailed()
  }

  render() {
    if (this.state.failed) {
      return (
        this.props.fallback ?? (
          <div className="muted" style={{ padding: 24, textAlign: 'center', fontSize: 13, fontWeight: 600 }}>
            <div>模块加载失败</div>
            <button
              type="button"
              className="ghostBtn"
              style={{ marginTop: 12 }}
              onClick={() => recoverFromChunkLoadFailure()}
            >
              重试
            </button>
          </div>
        )
      )
    }

    return this.props.children
  }
}
