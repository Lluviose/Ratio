import { useState } from 'react'

// 单实例守卫的两块终态 UI（见 src/lib/instanceGuard.ts）。
// 都在 React 应用树之外挂载（main.tsx 直接 render），不依赖 App 的任何 Provider。

function GateShell(props: { title: string; children: React.ReactNode }) {
  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-6"
      style={{ background: 'var(--bg, #f4f4f2)' }}
    >
      <div className="w-full max-w-[360px] rounded-[28px] bg-white/90 border border-white/70 shadow-lg px-6 py-7 text-center">
        <div className="text-[17px] font-extrabold tracking-tight text-slate-900">{props.title}</div>
        {props.children}
      </div>
    </div>
  )
}

export function InstanceOccupiedGate(props: { onTakeOver: () => Promise<void> }) {
  const [busy, setBusy] = useState(false)
  return (
    <GateShell title="Ratio 已在其他标签页打开">
      <div className="mt-3 text-[13px] font-semibold text-slate-600 leading-relaxed">
        为避免两个标签页同时写入互相覆盖数据，同一时间只有一个标签页可以使用。
      </div>
      <button
        type="button"
        disabled={busy}
        className="mt-6 w-full h-12 rounded-[20px] bg-slate-900 text-white font-extrabold text-[15px] shadow-sm disabled:opacity-60"
        onClick={() => {
          if (busy) return
          setBusy(true)
          void props.onTakeOver().finally(() => setBusy(false))
        }}
      >
        在此标签页继续
      </button>
      <div className="mt-3 text-[11px] font-semibold text-slate-400">
        原标签页会自动暂停并保存数据
      </div>
    </GateShell>
  )
}

export function InstanceFrozenNotice() {
  return (
    <GateShell title="本页已暂停">
      <div className="mt-3 text-[13px] font-semibold text-slate-600 leading-relaxed">
        你在另一个标签页继续使用了 Ratio，本页已停止读写以避免数据冲突；此前的修改已保存。
      </div>
      <button
        type="button"
        className="mt-6 w-full h-12 rounded-[20px] bg-slate-900 text-white font-extrabold text-[15px] shadow-sm"
        onClick={() => window.location.reload()}
      >
        刷新此页
      </button>
    </GateShell>
  )
}
