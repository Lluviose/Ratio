import { type ComponentType, createElement, useMemo } from 'react'
import { ChevronLeft } from 'lucide-react'
import { motion } from 'framer-motion'
import { formatCny } from '../lib/format'
import { accountGroups, getAccountTypeOption, type Account, type AccountTypeId } from '../lib/accounts'

export function AssetsTypeDetailPage(props: {
  type: AccountTypeId | null
  accounts: Account[]
  getIcon: (type: AccountTypeId) => ComponentType<{ size?: number }>
  onBack: () => void
  onEditAccount: (account: Account) => void
  hideAmounts: boolean
}) {
  const { type, accounts, onBack, onEditAccount, hideAmounts } = props

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
  const maskedText = '*****'
  const maskedClass = 'tracking-[0.28em]'

  if (!type || !info) {
    return <div className="h-full" style={{ background: 'var(--bg)' }} />
  }

  return (
    <div className="h-full flex flex-col overflow-y-auto" style={{ background: 'var(--bg)' }}>
      <motion.div
        className="sticky top-0 z-10 backdrop-blur-xl border-b border-[var(--hairline)]"
        style={{ background: 'rgba(255,255,255,0.7)' }}
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.3 }}
      >
        <div className="px-4 py-3 flex items-center gap-3">
          <motion.button
            type="button"
            className="w-10 h-10 rounded-full flex items-center justify-center text-[var(--text)] active:bg-black/5 -ml-2"
            onClick={onBack}
            aria-label="back"
            whileTap={{ scale: 0.9 }}
          >
            <ChevronLeft size={24} strokeWidth={2.5} />
          </motion.button>
          <div className="flex-1 min-w-0">
            <div className="font-bold text-[17px] truncate text-slate-900">
              {info.opt.name}
            </div>
            <div className="text-[11px] font-medium text-slate-500 truncate">{info.group.name}</div>
          </div>
          <div className="text-right">
            <div className={hideAmounts ? `font-semibold text-[17px] text-slate-900 ${maskedClass}` : 'font-semibold text-[17px] text-slate-900'}>
              {hideAmounts ? maskedText : formatCny(total)}
            </div>
          </div>
        </div>
      </motion.div>

      <div className="px-4 pt-4 pb-8">
        <motion.div
          className="bg-white/60 backdrop-blur-md rounded-[24px] border border-white/60 overflow-hidden"
          style={{ boxShadow: '0 4px 24px -4px rgba(0, 0, 0, 0.04)' }}
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.3 }}
        >
          <div className="flex flex-col p-2 gap-2">
            {list.map((account) => (
              <motion.div
                key={account.id}
                className="flex items-center justify-between p-4 hover:bg-white/50 rounded-[18px] cursor-pointer transition-colors"
                onClick={() => onEditAccount(account)}
                whileTap={{ scale: 0.99, backgroundColor: 'rgba(255,255,255,0.8)' }}
              >
                <div className="flex items-center gap-3.5 min-w-0">
                  <motion.div 
                    className="w-10 h-10 rounded-full bg-white flex items-center justify-center text-slate-600 shadow-sm border border-slate-100"
                    layoutId={`account-icon-${account.id}`}
                  >
                    {createElement(info.opt.icon, { size: 20, strokeWidth: 2 })}
                  </motion.div>
                  <div className="min-w-0">
                    <div className="font-semibold text-[15px] text-slate-900 truncate mb-0.5">{account.name}</div>
                    <div className="text-[11px] text-slate-400 font-medium">更新于 {new Date(account.updatedAt).toLocaleDateString()}</div>
                  </div>
                </div>
                <motion.div 
                  className={hideAmounts ? `font-semibold text-[15px] text-slate-900 ${maskedClass}` : 'font-semibold text-[15px] text-slate-900'}
                  layoutId={`account-balance-${account.id}`}
                >
                  {hideAmounts ? maskedText : formatCny(account.balance)}
                </motion.div>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </div>
    </div>
  )
}
