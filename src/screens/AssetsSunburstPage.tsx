import { SunburstChart } from '../components/SunburstChart'
import { type GroupedAccounts } from './AssetsScreen'
import { ChevronRight } from 'lucide-react'

export function AssetsSunburstPage(props: { 
  grouped: GroupedAccounts
  onNext: () => void 
}) {
  const { grouped, onNext } = props

  return (
    <div className="w-full h-full relative flex flex-col">
      <div className="absolute inset-x-0 top-0 z-20 px-4 pt-6 flex items-center justify-between pointer-events-none">
        <div className="text-[15px] font-semibold tracking-tight text-slate-900 opacity-0">占位</div>
        <button
          type="button"
          onClick={onNext}
          className="w-10 h-10 rounded-full bg-white/80 border border-white/70 text-slate-700 flex items-center justify-center shadow-sm pointer-events-auto"
          aria-label="next"
        >
          <ChevronRight size={20} strokeWidth={2.5} />
        </button>
      </div>

      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-[360px] aspect-square">
            <SunburstChart grouped={grouped} />
        </div>
      </div>
      
      <div className="h-20 shrink-0" /> {/* Bottom spacing */}
    </div>
  )
}
