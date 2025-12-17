import { ChevronRight } from 'lucide-react'
import { formatCny } from '../lib/format'
import { type GroupedAccounts } from './AssetsScreen'

export function AssetsRosePage(props: { grouped: GroupedAccounts; onNext: () => void }) {
  const { grouped, onNext } = props

  return (
    <div className="w-full h-full relative flex flex-col">
      <div className="absolute inset-x-0 top-0 z-20 px-4 pt-6 flex items-center justify-between pointer-events-none">
        <div className="text-[15px] font-semibold tracking-tight text-slate-900">资产分配比</div>
        <button
          type="button"
          onClick={onNext}
          className="w-10 h-10 rounded-full bg-white/80 border border-white/70 text-slate-700 flex items-center justify-center shadow-sm pointer-events-auto"
          aria-label="next"
        >
          <ChevronRight size={20} strokeWidth={2.5} />
        </button>
      </div>

      <div className="flex-1 flex items-center justify-center px-6">
        <div className="text-center">
          <div className="text-[12px] font-medium text-slate-500/80">总资产</div>
          <div className="mt-1 text-[28px] font-semibold tracking-tight text-slate-900">{formatCny(grouped.assetsTotal)}</div>
          <div className="mt-2 text-[12px] text-slate-500/70">
            净资产 {formatCny(grouped.netWorth)} · 负债 {formatCny(grouped.debtTotal)}
          </div>
        </div>
      </div>

      <div className="h-20 shrink-0" />
    </div>
  )
}

