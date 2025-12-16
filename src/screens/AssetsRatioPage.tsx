import { useMemo } from 'react'
import type { GroupedAccounts } from './AssetsScreen'

export function AssetsRatioPage({ grouped }: { grouped: GroupedAccounts }) {
  const data = useMemo(() => {
    const assets = grouped.assetsTotal || 1
    const getPercent = (amount: number) => Math.round((amount / assets) * 100)

    const liquid = grouped.groupCards.find((g) => g.group.id === 'liquid')?.total ?? 0
    const invest = grouped.groupCards.find((g) => g.group.id === 'invest')?.total ?? 0
    const fixed = grouped.groupCards.find((g) => g.group.id === 'fixed')?.total ?? 0
    const receivable = grouped.groupCards.find((g) => g.group.id === 'receivable')?.total ?? 0
    
    // Debt is usually negative in total, but we want magnitude
    const debt = Math.abs(grouped.debtTotal) 

    return {
      liquid: { amount: liquid, percent: getPercent(liquid) },
      invest: { amount: invest, percent: getPercent(invest) },
      fixed: { amount: fixed, percent: getPercent(fixed) },
      receivable: { amount: receivable, percent: getPercent(receivable) },
      debt: { amount: debt, percent: getPercent(debt) }, // Debt ratio relative to total assets
    }
  }, [grouped])

  return (
    <div className="h-full flex flex-col p-6 pt-10 relative overflow-hidden" style={{ background: 'var(--bg)', overflowY: 'hidden' }}>

      <div className="flex-1 relative min-h-0 flex items-end pb-4">
        <div className="w-full h-full max-h-[460px] flex gap-2">
           {/* Debt Block - Left side */}
           <div 
            className="w-[24%] flex flex-col justify-end animate-[slideUp_0.6s_cubic-bezier(0.2,0.8,0.2,1)]"
           >
             <div 
               className="w-full rounded-[24px] rounded-r-lg p-4 flex flex-col justify-end min-h-[80px] transition-all hover:scale-[1.02] active:scale-[0.98] cursor-pointer shadow-sm border border-white/20"
               style={{ 
                 background: '#c7d2fe',
                 height: `${Math.max(data.debt.percent, 15)}%`,
                 boxShadow: 'var(--shadow-soft)'
               }}
             >
                <div className="text-2xl font-black text-slate-800 leading-none mb-1">{data.debt.percent}<span className="text-sm align-top ml-0.5">%</span></div>
                <div className="text-xs font-bold text-slate-600 uppercase tracking-wider">负债</div>
             </div>
           </div>

           {/* Main Assets Stack */}
           <div className="flex-1 h-full flex flex-col rounded-[28px] overflow-hidden animate-[slideUp_0.8s_cubic-bezier(0.2,0.8,0.2,1)_0.1s_backwards] shadow-[var(--shadow-soft)] border border-[var(--hairline)]">
              {/* Liquid - Green */}
              {data.liquid.percent > 0 && (
                <div 
                  style={{ flex: Math.max(data.liquid.percent, 5), background: '#4ade80' }} 
                  className="p-4 flex flex-col justify-start relative group cursor-pointer transition-colors hover:brightness-105"
                >
                  <div className="text-3xl font-black text-slate-900 leading-none mb-1">{data.liquid.percent}<span className="text-base align-top ml-0.5">%</span></div>
                  <div className="text-xs font-bold text-slate-800/70 uppercase tracking-wider">流动资金</div>
                </div>
              )}
              
              {/* Invest - Purple */}
              {data.invest.percent > 0 && (
                <div 
                  style={{ flex: Math.max(data.invest.percent, 5), background: '#818cf8' }} 
                  className="p-4 flex flex-col justify-start relative group cursor-pointer transition-colors hover:brightness-105"
                >
                  <div className="text-2xl font-black text-white leading-none mb-1">{data.invest.percent}<span className="text-sm align-top ml-0.5">%</span></div>
                  <div className="text-xs font-bold text-white/80 uppercase tracking-wider">投资</div>
                </div>
              )}

              {/* Fixed - Blue */}
              {data.fixed.percent > 0 && (
                <div 
                  style={{ flex: Math.max(data.fixed.percent, 5), background: '#6366f1' }} 
                  className="p-4 flex flex-col justify-start relative group cursor-pointer transition-colors hover:brightness-105"
                >
                   <div className="text-3xl font-black text-white leading-none mb-1">{data.fixed.percent}<span className="text-base align-top ml-0.5">%</span></div>
                   <div className="text-xs font-bold text-white/80 uppercase tracking-wider">固定资产</div>
                </div>
              )}

              {/* Receivable - Light Blue */}
              {data.receivable.percent > 0 && (
                <div 
                  style={{ flex: Math.max(data.receivable.percent, 5), background: '#a5b4fc' }} 
                  className="p-4 flex flex-col justify-start relative group cursor-pointer transition-colors hover:brightness-105"
                >
                   <div className="text-xl font-black text-slate-800 leading-none mb-1">{data.receivable.percent}<span className="text-sm align-top ml-0.5">%</span></div>
                   <div className="text-xs font-bold text-slate-600 uppercase tracking-wider">应收款</div>
                </div>
              )}
           </div>
        </div>
      </div>
    </div>
  )
}
