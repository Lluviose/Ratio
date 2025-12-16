import { ChevronLeft, ChevronRight } from 'lucide-react'
import { accountGroups, accountTypeOptions, type AccountTypeId, type AccountGroupId } from '../lib/accounts'

export function AddAccountScreen(props: {
  onBack: () => void
  onPick: (type: AccountTypeId) => void
}) {
  const { onBack, onPick } = props

  const grouped = {
    liquid: accountTypeOptions.filter((t) => t.groupId === 'liquid'),
    invest: accountTypeOptions.filter((t) => t.groupId === 'invest'),
    fixed: accountTypeOptions.filter((t) => t.groupId === 'fixed'),
    receivable: accountTypeOptions.filter((t) => t.groupId === 'receivable'),
    debt: accountTypeOptions.filter((t) => t.groupId === 'debt'),
  } as const

  // Icon colors by group
  const iconColors: Record<AccountGroupId, string> = {
    liquid: '#e09e43',
    invest: '#f04638',
    fixed: '#3949c7',
    receivable: '#6a78ff',
    debt: '#8b7fc7',
  }

  // Icon background colors (lighter versions)
  const iconBgColors: Record<AccountGroupId, string> = {
    liquid: '#fef3c7',
    invest: '#fee2e2',
    fixed: '#e0e7ff',
    receivable: '#e0e7ff',
    debt: '#ede9fe',
  }

  const header = (title: string, tone: string) => (
    <div 
      className="px-4 py-3 rounded-2xl font-black text-sm"
      style={{ background: tone, color: tone === '#3949c7' ? 'white' : 'rgba(0,0,0,0.85)' }}
    >
      {title}
    </div>
  )

  const renderGroup = (groupId: AccountGroupId) => {
    const group = accountGroups[groupId]
    const items = grouped[groupId]
    const iconColor = iconColors[groupId]
    const iconBg = iconBgColors[groupId]

    return (
      <div key={groupId} className="animate-[slideUp_0.5s_ease-out_backwards]">
        {header(group.name, group.tone)}
        <div className="flex flex-col mt-3 gap-2">
          {items.map((t) => {
            const Icon = t.icon
            return (
              <button 
                key={t.id} 
                type="button" 
                className="flex items-center gap-4 px-4 py-4 bg-[var(--card)] hover:bg-[var(--bg)] transition-all active:scale-[0.99] rounded-2xl shadow-sm border border-[var(--hairline)]"
                onClick={() => onPick(t.id)}
              >
                <span 
                  className="w-10 h-10 rounded-xl flex items-center justify-center shadow-sm"
                  style={{ background: iconBg, color: iconColor }}
                >
                  <Icon size={20} strokeWidth={2.5} />
                </span>
                <span className="flex-1 text-left font-black text-[15px] text-[var(--text)]">{t.name}</span>
                <span className="w-8 h-8 rounded-full bg-[var(--bg)] flex items-center justify-center text-[var(--muted-text)]">
                   <ChevronRight size={16} strokeWidth={3} />
                </span>
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <div className="h-full overflow-auto bg-[var(--bg)]">
      <div className="sticky top-0 z-10 bg-[var(--bg)]/90 backdrop-blur-md border-b border-[var(--hairline)] px-4 py-3 flex items-center justify-between">
          <button 
            type="button" 
            className="w-10 h-10 rounded-full bg-[var(--card)] border border-[var(--hairline)] flex items-center justify-center text-[var(--text)] active:scale-90 transition-transform shadow-sm"
            onClick={onBack} 
            aria-label="back"
          >
            <ChevronLeft size={20} strokeWidth={2.5} />
          </button>
          <div className="text-lg font-black text-[var(--text)] tracking-tight">
            添加账户
          </div>
          <div style={{ width: 40 }} />
      </div>

      <div className="px-4 py-6 flex flex-col gap-6">
        {renderGroup('liquid')}
        {renderGroup('invest')}
        {renderGroup('fixed')}
        {renderGroup('receivable')}
        {renderGroup('debt')}
      </div>
    </div>
  )
}
