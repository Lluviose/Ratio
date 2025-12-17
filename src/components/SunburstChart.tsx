import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import { type GroupedAccounts } from '../screens/AssetsScreen'
import { accountGroups } from '../lib/accounts'
import { formatCny } from '../lib/format'
import { useMemo } from 'react'

type Props = {
  grouped: GroupedAccounts
}

export function SunburstChart({ grouped }: Props) {
  const { innerData, outerData } = useMemo(() => {
    // Inner Ring: Net Worth vs Debt
    const debtTotal = grouped.debtTotal
    const netWorth = grouped.netWorth
    
    const inner = []
    
    // Safety check for negative net worth
    if (netWorth > 0) {
      inner.push({ name: '净资产', value: netWorth, color: 'url(#grad-networth)' }) 
    }
    
    if (debtTotal > 0) {
      inner.push({ name: '负债', value: debtTotal, color: 'url(#grad-debt)' })
    }
    
    // Outer Ring: Asset Groups
    const outer = grouped.groupCards
      .filter(g => g.group.id !== 'debt' && g.total > 0)
      .map(g => ({
        name: g.group.name,
        value: g.total,
        color: `url(#grad-${g.group.id})`
      }))
      
    return { innerData: inner, outerData: outer }
  }, [grouped])

  return (
    <div className="w-full h-full flex flex-col items-center justify-center relative">
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="flex flex-col items-center">
            <span className="text-xs text-slate-500 font-medium">总资产</span>
            <span className="text-xl font-bold text-slate-900">{formatCny(grouped.assetsTotal)}</span>
        </div>
      </div>
      
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <defs>
            <linearGradient id="grad-networth" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#4f46e5" />
              <stop offset="100%" stopColor="#818cf8" />
            </linearGradient>
            <linearGradient id="grad-debt" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor={accountGroups.debt.tone} />
              <stop offset="100%" stopColor="#efebff" />
            </linearGradient>
            <linearGradient id="grad-liquid" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor={accountGroups.liquid.tone} />
              <stop offset="100%" stopColor="#fceabb" />
            </linearGradient>
            <linearGradient id="grad-invest" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor={accountGroups.invest.tone} />
              <stop offset="100%" stopColor="#ff9e8f" />
            </linearGradient>
            <linearGradient id="grad-fixed" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor={accountGroups.fixed.tone} />
              <stop offset="100%" stopColor="#6c7ae0" />
            </linearGradient>
            <linearGradient id="grad-receivable" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor={accountGroups.receivable.tone} />
              <stop offset="100%" stopColor="#c5cdff" />
            </linearGradient>
          </defs>
          <Pie
            data={innerData}
            dataKey="value"
            cx="50%"
            cy="50%"
            innerRadius={60}
            outerRadius={80}
            stroke="var(--bg)"
            strokeWidth={2}
            isAnimationActive={true}
          >
            {innerData.map((entry, index) => (
              <Cell key={`cell-inner-${index}`} fill={entry.color} stroke="var(--bg)" strokeWidth={2} />
            ))}
          </Pie>
          <Pie
            data={outerData}
            dataKey="value"
            cx="50%"
            cy="50%"
            innerRadius={84}
            outerRadius={108}
            stroke="var(--bg)"
            strokeWidth={2}
            isAnimationActive={true}
          >
            {outerData.map((entry, index) => (
              <Cell key={`cell-outer-${index}`} fill={entry.color} stroke="var(--bg)" strokeWidth={2} />
            ))}
          </Pie>
          <Tooltip 
             formatter={(value: any) => formatCny(Number(value))}
             contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
          />
        </PieChart>
      </ResponsiveContainer>
      
      {/* Legend / Info could go here */}
    </div>
  )
}
