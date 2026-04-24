import { Component, type ReactNode } from 'react'

type LazyLoadBoundaryProps = {
  children: ReactNode
  fallback?: ReactNode
}

type LazyLoadBoundaryState = {
  failed: boolean
}

export class LazyLoadBoundary extends Component<LazyLoadBoundaryProps, LazyLoadBoundaryState> {
  state: LazyLoadBoundaryState = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  render() {
    if (this.state.failed) {
      return (
        this.props.fallback ?? (
          <div className="muted" style={{ padding: 24, textAlign: 'center', fontSize: 13, fontWeight: 800 }}>
            模块加载失败，请检查网络后刷新
          </div>
        )
      )
    }

    return this.props.children
  }
}
