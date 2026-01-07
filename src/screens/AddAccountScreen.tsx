import { useState } from 'react'
import { Check, ChevronDown, ChevronLeft, ChevronRight, ChevronUp } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { accountGroups, accountTypeOptions, defaultAccountName, type AccountTypeId, type AccountGroupId } from '../lib/accounts'
import { pickForegroundColor, type ThemeColors } from '../lib/themes'

function withAlpha(color: string, alpha: number): string {
  const hex = color.trim()
  if (!hex.startsWith('#')) return color
  const raw = hex.slice(1)

  let r: number
  let g: number
  let b: number

  if (raw.length === 3) {
    r = Number.parseInt(raw[0] + raw[0], 16)
    g = Number.parseInt(raw[1] + raw[1], 16)
    b = Number.parseInt(raw[2] + raw[2], 16)
  } else if (raw.length === 6) {
    r = Number.parseInt(raw.slice(0, 2), 16)
    g = Number.parseInt(raw.slice(2, 4), 16)
    b = Number.parseInt(raw.slice(4, 6), 16)
  } else {
    return color
  }

  if ([r, g, b].some((v) => Number.isNaN(v))) return color

  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

export function AddAccountScreen(props: {
  onBack: () => void
  onPick: (type: AccountTypeId, customName?: string) => void
  colors: ThemeColors
}) {
  const { onBack, onPick, colors } = props
  const [expandedGroup, setExpandedGroup] = useState<AccountGroupId | null>(null)
  const [selectedType, setSelectedType] = useState<AccountTypeId | null>(null)
  const [customName, setCustomName] = useState('')

  const grouped = {
    liquid: accountTypeOptions.filter((t) => t.groupId === 'liquid'),
    invest: accountTypeOptions.filter((t) => t.groupId === 'invest'),
    fixed: accountTypeOptions.filter((t) => t.groupId === 'fixed'),
    receivable: accountTypeOptions.filter((t) => t.groupId === 'receivable'),
    debt: accountTypeOptions.filter((t) => t.groupId === 'debt'),
  } as const

  const renderGroup = (groupId: AccountGroupId, index: number) => {
    const group = accountGroups[groupId]
    const items = grouped[groupId]
    const tone = colors[groupId]
    const isExpanded = expandedGroup === groupId
    const cardBg = isExpanded ? withAlpha(tone, 0.18) : 'var(--card)'

    return (
      <motion.div
        key={groupId}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: index * 0.1 }}
      >
        <div
          className="rounded-2xl shadow-sm border border-[var(--hairline)] overflow-hidden"
          style={{ background: cardBg }}
        >
          <button
            type="button"
            className={'w-full px-4 py-4 flex items-center justify-between text-left ' + (isExpanded ? 'border-b border-[var(--hairline)]' : '')}
            onClick={() => setExpandedGroup((prev) => (prev === groupId ? null : groupId))}
            aria-expanded={isExpanded}
          >
            <div className="flex items-center gap-3 min-w-0">
              <span className="w-3 h-3 rounded-full" style={{ background: tone }} />
              <div className="min-w-0">
                <div className="text-[15px] font-black text-[var(--text)] tracking-tight">
                  {group.name}
                </div>
                <div className="mt-1 text-[11px] font-medium text-[var(--muted-text)]">
                  {items.length} 项
                </div>
              </div>
            </div>
            <div className="w-9 h-9 rounded-full bg-[var(--bg)] flex items-center justify-center text-[var(--muted-text)]">
              {isExpanded ? <ChevronUp size={16} strokeWidth={3} /> : <ChevronDown size={16} strokeWidth={3} />}
            </div>
          </button>

          <AnimatePresence initial={false}>
            {isExpanded ? (
              <motion.div
                key="types"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.25, ease: 'easeInOut' }}
                className="overflow-hidden"
              >
                <div className="px-3 pt-2 pb-3 flex flex-col gap-2">
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
                        transition={{ delay: i * 0.03 }}
                      >
                        <span
                          className="w-10 h-10 rounded-xl flex items-center justify-center shadow-sm"
                          style={{ background: tone, color: pickForegroundColor(tone) }}
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
            ) : null}
          </AnimatePresence>
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
            添加资产
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
            style={{
              paddingTop: 'env(safe-area-inset-top)',
              paddingRight: 'env(safe-area-inset-right)',
              paddingBottom: 'env(safe-area-inset-bottom)',
              paddingLeft: 'env(safe-area-inset-left)',
            }}
            onClick={() => setSelectedType(null)}
          >
            <motion.div 
              className="w-full max-w-md mx-auto bg-[var(--card)] rounded-b-[28px] p-6 pb-8"
              onClick={(e) => e.stopPropagation()}
              initial={{ y: '-100%' }}
              animate={{ y: 0 }}
              exit={{ y: '-100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
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
