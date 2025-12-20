import { type ComponentType, createElement, useMemo } from 'react'
import { ChevronLeft } from 'lucide-react'
import { motion } from 'framer-motion'
import { formatCny } from '../lib/format'
import { accountGroups, getAccountTypeOption, type Account, type AccountTypeId } from '../lib/accounts'
import { pickForegroundColor } from '../lib/themes'

export function AssetsTypeDetailPage(props: {
  type: AccountTypeId | null
  accounts: Account[]
  getIcon: (type: AccountTypeId) => ComponentType<{ size?: number }>
  onBack: () => void
  onEditAccount: (account: Account) => void
  hideAmounts: boolean
  themeColor: string
}) {
  const { type, accounts, onBack, onEditAccount, hideAmounts, themeColor } = props

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
        className="sticky top-0 z-10 backdrop-blur-md border-b border-[var(--hairline)]"
        style={{ background: 'rgba(255,255,255,0.85)' }}
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.3 }}
      >
        <div className="px-4 py-3 flex items-center gap-3">
          <motion.button
            type="button"
            className="w-10 h-10 rounded-full bg-[var(--card)] border border-[var(--hairline)] flex items-center justify-center text-[var(--text)] shadow-sm"
            onClick={onBack}
            aria-label="back"
            whileTap={{ scale: 0.9 }}
            whileHover={{ scale: 1.05 }}
          >
            <ChevronLeft size={20} strokeWidth={2.5} />
          </motion.button>
          <div className="flex-1 min-w-0">
            <div className="font-black text-[15px] truncate" style={{ color: themeColor }}>
              {info.opt.name}
            </div>
            <div className="text-xs font-bold text-[var(--muted-text)] truncate">{info.group.name}</div>
          </div>
          <div className="text-right">
            <div className={hideAmounts ? `font-black text-[15px] text-[var(--text)] ${maskedClass}` : 'font-black text-[15px] text-[var(--text)]'}>
              {hideAmounts ? maskedText : formatCny(total)}
            </div>
          </div>
        </div>
      </motion.div>

      <div className="px-4 pt-4 pb-8">
        <motion.div
          className="bg-[var(--card)] rounded-[24px] border border-[var(--hairline)] overflow-hidden"
          style={{ boxShadow: 'var(--shadow-soft)' }}
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.4, delay: 0.1 }}
        >
          <div className="px-4 py-4 flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-2xl flex items-center justify-center border border-[var(--hairline)]"
              style={{ background: themeColor, color: pickForegroundColor(themeColor) }}
            >
              {createElement(info.opt.icon, { size: 18 })}
            </div>
            <div className="font-black text-[15px] text-[var(--text)]">{info.opt.name}</div>
          </div>

          <div className="h-[1px] bg-[var(--hairline)]" />

          <div className="flex flex-col p-3 gap-2">
            {list.map((account, i) => (
              <motion.div
                key={account.id}
                className="flex items-center justify-between p-3 hover:bg-slate-50 rounded-2xl cursor-pointer"
                onClick={() => onEditAccount(account)}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.2 + i * 0.05 }}
                whileTap={{ scale: 0.98 }}
                whileHover={{ backgroundColor: 'var(--hairline)' }}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-500 shadow-sm border border-slate-200/50">
                    {createElement(info.opt.icon, { size: 18 })}
                  </div>
                  <div className="font-bold text-sm text-slate-700 truncate">{account.name}</div>
                </div>
                <div className={hideAmounts ? `font-black text-sm text-[var(--text)] ${maskedClass}` : 'font-black text-sm text-[var(--text)]'}>
                  {hideAmounts ? maskedText : formatCny(account.balance)}
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </div>
    </div>
  )
}
