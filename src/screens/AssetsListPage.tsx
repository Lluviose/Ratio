import { type ComponentType, useState } from 'react'
import { Plus, Eye, ChevronDown, ChevronUp } from 'lucide-react'
import { formatCny } from '../lib/format'
import type { GroupedAccounts } from './AssetsScreen'
import { getAccountTypeOption, type AccountTypeId } from '../lib/accounts'
import { clsx } from 'clsx'

export function AssetsListPage(props: {
  grouped: GroupedAccounts
  getIcon: (type: AccountTypeId) => ComponentType<{ size?: number }>
  onAddAccount: () => void
  onPickType: (type: AccountTypeId) => void
}) {
  const { grouped, getIcon, onAddAccount, onPickType } = props
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null)

  // Define colors for the side strip to match the image/theme
  const groupColors: Record<string, string> = {
    liquid: '#4ade80',    // Green
    invest: '#6366f1',    // Purple
    fixed: '#3b82f6',     // Blue
    receivable: '#93c5fd',// Light Blue
    debt: '#94a3b8',      // Grey
  }

  const toggleGroup = (id: string) => {
    setExpandedGroup(current => current === id ? null : id)
  }

  return (
    <div className="h-full flex flex-col p-4 overflow-y-auto" style={{ background: 'var(--bg)' }}>
      <div className="mb-6 mt-2 px-2 animate-[fadeIn_0.6s_ease-out]">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-sm font-extrabold text-slate-500/80">我的净资产 (CNY)</span>
          <Eye size={14} className="text-slate-400" />
        </div>
        <div className="flex items-center justify-between">
          <div className="text-3xl font-black tracking-tight text-[var(--text)]">
            {formatCny(grouped.netWorth)}
          </div>
          <button 
            onClick={onAddAccount}
            className="w-10 h-10 rounded-full bg-[var(--primary)] text-[var(--primary-contrast)] flex items-center justify-center shadow-lg hover:scale-105 active:scale-95 transition-all duration-300"
          >
            <Plus size={22} strokeWidth={3} />
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-3 pb-8">
        {grouped.groupCards.filter((g) => g.accounts.length > 0).map((g, i) => {
          const color = groupColors[g.group.id] || '#cbd5e1'
          const typeNames = Array.from(new Set(g.accounts.map((a) => getAccountTypeOption(a.type).name))).join('、')
          const updatedAt = g.accounts.length > 0 
            ? g.accounts.map(a => a.updatedAt).sort().at(-1)
            : undefined
            
          const formatTime = (iso?: string) => {
             if (!iso) return ''
             const d = new Date(iso)
             if (Number.isNaN(d.getTime())) return ''
             return `${d.getMonth() + 1}月${d.getDate()}日 更新`
          }

          const isExpanded = expandedGroup === g.group.id

          const typeCards = Array.from(new Set(g.accounts.map((a) => a.type)))
            .map((type) => {
              const accounts = g.accounts.filter((a) => a.type === type)
              const total = accounts.reduce((s, a) => s + a.balance, 0)
              const updatedAt = accounts.map((a) => a.updatedAt).sort().at(-1)
              const opt = getAccountTypeOption(type)
              return { type, opt, accounts, total, updatedAt }
            })
            .sort((a, b) => b.total - a.total)

          return (
            <div 
              key={g.group.id} 
              className="relative bg-[var(--card)] rounded-[24px] overflow-hidden border border-[var(--hairline)] transition-all duration-300"
              style={{
                 boxShadow: isExpanded ? 'var(--shadow-hover)' : 'var(--shadow-soft)',
                 animation: `slideUp 0.5s ease-out ${i * 0.05}s backwards`
              }}
            >
              {isExpanded ? (
                <div 
                  className="absolute left-0 top-0 bottom-0 w-[6px]" 
                  style={{ background: color }}
                />
              ) : null}
              <div className={isExpanded ? 'pl-5 pr-4 py-4 flex flex-col gap-3' : 'px-4 py-4 flex flex-col gap-3'}>
                <div 
                  className="flex justify-between items-start cursor-pointer group"
                  onClick={() => toggleGroup(g.group.id)}
                >
                   <div>
                      <div className="font-black text-[15px] text-[var(--text)] mb-1 flex items-center gap-2">
                        <span style={isExpanded ? { color } : undefined}>{g.group.name}</span>
                        <span className="text-slate-300 group-hover:text-slate-500 transition-colors">
                          {isExpanded ? <ChevronUp size={14} strokeWidth={3} /> : <ChevronDown size={14} strokeWidth={3} />}
                        </span>
                      </div>
                      <div className="text-xs font-bold text-slate-400 truncate max-w-[180px]">
                        {isExpanded ? '选择资产类别' : typeNames}
                      </div>
                   </div>
                   <div className="text-right">
                      <div
                        className="font-black text-[17px] text-[var(--text)] flex items-center justify-end gap-1"
                        style={isExpanded ? { color } : undefined}
                      >
                        {g.group.id === 'debt' && g.total > 0 && (
                          <span className="w-5 h-5 rounded-full border-2 border-slate-400 flex items-center justify-center text-xs font-black text-slate-500">−</span>
                        )}
                        {formatCny(g.total)}
                      </div>
                      <div className="text-[10px] font-bold text-slate-300 mt-1">
                        {formatTime(updatedAt)}
                      </div>
                   </div>
                </div>
                
                 <div className={clsx(
                   "flex flex-col gap-2 overflow-hidden transition-all duration-300 ease-[cubic-bezier(0.33,1,0.68,1)]",
                   isExpanded ? "max-h-[500px] opacity-100 pt-3 border-t border-slate-50 mt-1" : "max-h-0 opacity-0"
                 )}>
                   {typeCards.map((t) => {
                     const Icon = getIcon(t.type)
                     return (
                       <div
                         key={t.type}
                         className="flex items-center justify-between p-3 hover:bg-slate-50 rounded-2xl cursor-pointer transition-colors active:scale-[0.99]"
                         onClick={() => onPickType(t.type)}
                       >
                         <div className="flex items-center gap-3 min-w-0">
                           <div
                             className="w-9 h-9 rounded-2xl flex items-center justify-center shadow-sm border border-slate-200/50"
                             style={{ background: color, color: 'rgba(0,0,0,0.75)' }}
                           >
                             <Icon size={18} />
                           </div>
                           <div className="min-w-0">
                             <div className="font-black text-sm truncate" style={{ color }}>
                               {t.opt.name}
                             </div>
                             <div className="text-[10px] font-bold text-slate-300 mt-0.5">
                               {t.updatedAt ? formatTime(t.updatedAt) : ''}
                             </div>
                           </div>
                         </div>
                         <div className="text-right">
                           <div className="font-black text-sm text-[var(--text)]">{formatCny(t.total)}</div>
                           <div className="text-[10px] font-bold text-slate-300 mt-0.5">{t.accounts.length} 个</div>
                         </div>
                       </div>
                     )
                   })}
                 </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
