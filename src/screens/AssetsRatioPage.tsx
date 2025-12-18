import { ChevronRight } from 'lucide-react'

export function AssetsRatioPage(props: { onBack: () => void }) {
  const { onBack } = props

  return (
    <div className="h-full relative bg-transparent">
      <div className="absolute inset-x-0 top-0 z-20 px-4 flex items-center justify-between" style={{ paddingTop: 'calc(1.5rem + env(safe-area-inset-top))' }}>
        <div className="text-[15px] font-semibold tracking-tight text-slate-900">资产分配比</div>
        <button
          type="button"
          onClick={onBack}
          className="w-11 h-11 rounded-full bg-white/80 border border-white/70 text-slate-700 flex items-center justify-center shadow-sm"
          aria-label="back"
        >
          <ChevronRight size={20} strokeWidth={2.5} />
        </button>
      </div>
    </div>
  )
}
