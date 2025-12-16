import { type ComponentType, useMemo } from 'react'
import { ChevronLeft } from 'lucide-react'
import { formatCny } from '../lib/format'
import { accountGroups, getAccountTypeOption, type Account, type AccountTypeId } from '../lib/accounts'

export function AssetsTypeDetailPage(props: {
  type: AccountTypeId | null
  accounts: Account[]
  getIcon: (type: AccountTypeId) => ComponentType<{ size?: number }>
  onBack: () => void
  onEditAccount: (account: Account) => void
}) {
  const { type, accounts, getIcon, onBack, onEditAccount } = props

  const info = useMemo(() => {
    if (!type) return null
    const opt = getAccountTypeOption(type)
    const group = accountGroups[opt.groupId]
    return { opt, group }
  }, [type])

  const list = useMemo(() => {
    if (!type) return []
    return accounts.filter((a) => a.type === type)
  }, [accounts, type])

  const total = useMemo(() => list.reduce((s, a) => s + a.balance, 0), [list])

  if (!type || !info) {
    return <div className="h-full" style={{ background: 'var(--bg)' }} />
  }

  const Icon = getIcon(type)

  return (
    <div className="h-full flex flex-col overflow-y-auto" style={{ background: 'var(--bg)' }}>
      <div
        className="sticky top-0 z-10 backdrop-blur-md border-b border-[var(--hairline)]"
        style={{ background: 'rgba(255,255,255,0.85)' }}
      >
        <div className="px-4 py-3 flex items-center gap-3">
          <button
            type="button"
            className="w-10 h-10 rounded-full bg-[var(--card)] border border-[var(--hairline)] flex items-center justify-center text-[var(--text)] active:scale-90 transition-transform shadow-sm"
            onClick={onBack}
            aria-label="back"
          >
            <ChevronLeft size={20} strokeWidth={2.5} />
          </button>
          <div className="flex-1 min-w-0">
            <div className="font-black text-[15px] truncate" style={{ color: info.group.tone }}>
              {info.opt.name}
            </div>
            <div className="text-xs font-bold text-[var(--muted-text)] truncate">{info.group.name}</div>
          </div>
          <div className="text-right">
            <div className="font-black text-[15px] text-[var(--text)]">{formatCny(total)}</div>
          </div>
        </div>
      </div>

      <div className="px-4 pt-4 pb-8">
        <div
          className="bg-[var(--card)] rounded-[24px] border border-[var(--hairline)] overflow-hidden"
          style={{ boxShadow: 'var(--shadow-soft)' }}
        >
          <div className="px-4 py-4 flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-2xl flex items-center justify-center border border-[var(--hairline)]"
              style={{ background: info.group.tone, color: 'rgba(0,0,0,0.75)' }}
            >
              <Icon size={18} />
            </div>
            <div className="font-black text-[15px] text-[var(--text)]">{info.opt.name}</div>
          </div>

          <div className="h-[1px] bg-[var(--hairline)]" />

          <div className="flex flex-col p-3 gap-2">
            {list.map((account) => (
              <div
                key={account.id}
                className="flex items-center justify-between p-3 hover:bg-slate-50 rounded-2xl cursor-pointer transition-colors active:scale-[0.99]"
                onClick={() => onEditAccount(account)}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-500 shadow-sm border border-slate-200/50">
                    <Icon size={18} />
                  </div>
                  <div className="font-bold text-sm text-slate-700 truncate">{account.name}</div>
                </div>
                <div className="font-black text-sm text-[var(--text)]">{formatCny(account.balance)}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
