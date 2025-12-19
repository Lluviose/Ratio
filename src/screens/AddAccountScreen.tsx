import { useState } from 'react'
import { ChevronLeft, ChevronRight, Check } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { accountGroups, accountTypeOptions, defaultAccountName, type AccountTypeId, type AccountGroupId } from '../lib/accounts'

export function AddAccountScreen(props: {
  onBack: () => void
  onPick: (type: AccountTypeId, customName?: string) => void
}) {
  const { onBack, onPick } = props
  const [selectedType, setSelectedType] = useState<AccountTypeId | null>(null)
  const [customName, setCustomName] = useState('')

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

  const renderGroup = (groupId: AccountGroupId, index: number) => {
    const group = accountGroups[groupId]
    const items = grouped[groupId]
    const iconColor = iconColors[groupId]
    const iconBg = iconBgColors[groupId]

    return (
      <motion.div 
        key={groupId} 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ 
          type: 'spring',
          stiffness: 400,
          damping: 30,
          delay: index * 0.05 
        }}
      >
        {header(group.name, group.tone)}
        <div className="flex flex-col mt-3 gap-2">
          {items.map((t, i) => {
            const Icon = t.icon
            return (
              <motion.button 
                key={t.id} 
                type="button" 
                className="flex items-center gap-4 px-4 py-4 bg-[var(--card)] hover:bg-[var(--bg)] transition-colors rounded-2xl shadow-sm border border-[var(--hairline)]"
                onClick={() => {
                  setSelectedType(t.id)
                  setCustomName('')
                }}
                whileTap={{ scale: 0.98 }}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ 
                  type: 'spring',
                  stiffness: 400,
                  damping: 30,
                  delay: index * 0.05 + i * 0.03 
                }}
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
              </motion.button>
            )
          })}
        </div>
      </motion.div>
    )
  }

  return (
    <div className="h-full overflow-auto bg-[var(--bg)]">
      <div className="sticky top-0 z-10 bg-[var(--bg)]/90 backdrop-blur-md border-b border-[var(--hairline)] px-4 py-3 flex items-center justify-between">
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
          <div className="text-lg font-black text-[var(--text)] tracking-tight">
            添加账户
          </div>
          <div style={{ width: 40 }} />
      </div>

      <div className="px-4 py-6 flex flex-col gap-6">
        {renderGroup('liquid', 0)}
        {renderGroup('invest', 1)}
        {renderGroup('fixed', 2)}
        {renderGroup('receivable', 3)}
        {renderGroup('debt', 4)}
      </div>

      <AnimatePresence>
        {selectedType && (
          <motion.div 
            className="fixed inset-0 z-50 flex flex-col bg-white"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setSelectedType(null)}
          >
            <motion.div 
              className="w-full max-w-md mx-auto bg-[var(--card)] rounded-b-[28px] p-6 pb-8"
              onClick={(e) => e.stopPropagation()}
              initial={{ y: '-100%' }}
              animate={{ y: 0 }}
              exit={{ y: '-100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 400 }}
            >
              <div className="text-center mb-6">
                <div className="text-lg font-black text-[var(--text)]">
                  为"{defaultAccountName(selectedType)}"命名
                </div>
                <div className="text-sm text-[var(--muted-text)] mt-1">
                  输入自定义名称，如：交通银行、支付宝等
                </div>
              </div>
              
              <input
                type="text"
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                placeholder={defaultAccountName(selectedType)}
                className="w-full px-4 py-4 rounded-2xl bg-[var(--bg)] border border-[var(--hairline)] text-[var(--text)] font-bold text-center text-lg focus:outline-none focus:ring-2 focus:ring-[var(--primary)] transition-all"
                autoFocus
              />
              
              <div className="flex gap-3 mt-6">
                <motion.button
                  type="button"
                  className="flex-1 py-4 rounded-2xl bg-[var(--bg)] text-[var(--text)] font-black"
                  onClick={() => setSelectedType(null)}
                  whileTap={{ scale: 0.98 }}
                >
                  取消
                </motion.button>
                <motion.button
                  type="button"
                  className="flex-1 py-4 rounded-2xl bg-[var(--primary)] text-[var(--primary-contrast)] font-black flex items-center justify-center gap-2"
                  onClick={() => {
                    onPick(selectedType, customName)
                  }}
                  whileTap={{ scale: 0.98 }}
                >
                  <Check size={18} strokeWidth={3} />
                  确认
                </motion.button>
              </div>
            </motion.div>

            <div className="flex-1 bg-white" />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
