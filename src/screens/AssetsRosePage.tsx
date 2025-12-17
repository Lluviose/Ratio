import { ChevronRight } from 'lucide-react'
import { useState } from 'react'
import { formatCny } from '../lib/format'
import { type GroupedAccounts } from './AssetsScreen'
import { EnhancedDoubleRoseChart } from '../components/EnhancedDoubleRoseChart'
import { type AccountGroupId } from '../lib/accounts'

export type AssetsRosePageProps = {
  grouped: GroupedAccounts
  onNext: () => void
  isAnimating?: boolean
}

/**
 * AssetsRosePage displays the enhanced double rose chart visualization.
 * 
 * Features:
 * - Uses EnhancedDoubleRoseChart for improved visuals and animations
 * - Passes animation trigger prop for mount animation
 * - Shows bottom summary text for net worth and debt
 * 
 * **Validates: Requirements 5.5**
 */
export function AssetsRosePage(props: AssetsRosePageProps) {
  const { grouped, onNext, isAnimating = true } = props
  
  const [selectedGroupId, setSelectedGroupId] = useState<AccountGroupId | null>(null)
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null)

  return (
    <div className="w-full h-full relative flex flex-col pt-[64px]">
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

      <div className="flex-1 w-full h-full min-h-0 relative">
        <EnhancedDoubleRoseChart
          grouped={grouped}
          selectedGroupId={selectedGroupId}
          onSelectGroup={setSelectedGroupId}
          selectedAccountId={selectedAccountId}
          onSelectAccount={setSelectedAccountId}
          isAnimating={isAnimating}
        />
        
        {/* Bottom summary text for net worth and debt */}
        {!selectedGroupId && !selectedAccountId && (
          <div className="absolute bottom-8 inset-x-0 text-center pointer-events-none">
            <div className="text-[12px] text-slate-500/70 font-medium">
              净资产 {formatCny(grouped.netWorth)} · 负债 {formatCny(grouped.debtTotal)}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

