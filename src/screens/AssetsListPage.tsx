import { clsx } from 'clsx'
import { AnimatePresence, motion } from 'framer-motion'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { type ComponentType, type Ref, useMemo } from 'react'
import { getAccountTypeOption, type AccountTypeId } from '../lib/accounts'
import { formatCny } from '../lib/format'
import type { GroupedAccounts } from './AssetsScreen'

type GroupId = 'liquid' | 'invest' | 'fixed' | 'receivable' | 'debt'

export function AssetsListPage(props: {
  grouped: GroupedAccounts
  getIcon: (type: AccountTypeId) => ComponentType<{ size?: number }>
  onPickType: (type: AccountTypeId) => void
  expandedGroup: GroupId | null
  onToggleGroup: (id: GroupId) => void
  hideAmounts: boolean
  scrollRef?: Ref<HTMLDivElement>
  onGroupEl?: (id: GroupId, el: HTMLDivElement | null) => void
  isInitialLoad?: boolean
}) {
  const { grouped, getIcon, onPickType, expandedGroup, onToggleGroup, hideAmounts, scrollRef, onGroupEl, isInitialLoad } = props

  const groups = useMemo(() => {
    const order: GroupId[] = ['liquid', 'invest', 'fixed', 'receivable', 'debt']
    const rank = new Map(order.map((id, i) => [id, i]))
    return grouped.groupCards
      .filter((g) => g.accounts.length > 0)
      .slice()
      .sort((a, b) => (rank.get(a.group.id as GroupId) ?? 999) - (rank.get(b.group.id as GroupId) ?? 999))
  }, [grouped.groupCards])

  const maskedText = '*****'
  const maskedClass = 'tracking-[0.28em]'

  const formatTime = (iso?: string) => {
    if (!iso) return ''
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return ''
    return `${d.getMonth() + 1}月${d.getDate()}日 更新`
  }

  return (
    <div ref={scrollRef} className="h-full overflow-y-auto bg-transparent">
      <div className="px-4 pt-24 pb-24">
        <div className="flex flex-col gap-3 pl-24">
          {groups.map((g, i) => {
            const id = g.group.id as GroupId
            const isExpanded = expandedGroup === id

            const typeNames = Array.from(new Set(g.accounts.map((a) => getAccountTypeOption(a.type).name))).join('、')
            const updatedAt = g.accounts.length > 0 ? g.accounts.map((a) => a.updatedAt).sort().at(-1) : undefined

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
              <motion.div
                key={id}
                ref={(el) => onGroupEl?.(id, el)}
                className="relative rounded-[22px] border border-white/70 overflow-hidden"
                initial={isInitialLoad ? { opacity: 0, x: 80 } : { opacity: 0, y: 14 }}
                animate={{ opacity: 1, x: 0, y: 0 }}
                transition={{
                  duration: isInitialLoad ? 0.5 : 0.3,
                  delay: isInitialLoad ? 0.05 + i * 0.06 : 0.08 + i * 0.03,
                  ease: [0.25, 0.46, 0.45, 0.94],
                }}
                style={{
                  background: id === 'debt' ? 'rgba(217, 212, 246, 0.70)' : 'rgba(255, 255, 255, 0.86)',
                  boxShadow: 'var(--shadow-soft)',
                }}
              >
                <button
                  type="button"
                  className="w-full text-left"
                  onClick={() => onToggleGroup(id)}
                  aria-expanded={isExpanded}
                >
                  <div className="px-4 py-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <div className="text-[15px] font-semibold tracking-tight text-slate-900">{g.group.name}</div>
                          <div className="text-slate-400">
                            {isExpanded ? <ChevronUp size={14} strokeWidth={2.5} /> : <ChevronDown size={14} strokeWidth={2.5} />}
                          </div>
                        </div>
                        <div className="mt-1 text-[11px] font-medium text-slate-500 truncate max-w-[220px]">
                          {isExpanded ? '选择资产类别' : typeNames}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className={clsx('text-[17px] font-semibold tracking-tight text-slate-900', hideAmounts && maskedClass)}>
                          {hideAmounts ? maskedText : formatCny(g.total)}
                        </div>
                        <div className="mt-1 text-[10px] font-medium text-slate-400">{formatTime(updatedAt)}</div>
                      </div>
                    </div>

                    {!isExpanded ? <div className="mt-2 text-[12px] text-slate-300 leading-none">...</div> : null}
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
                      <div className="px-3 pb-3">
                        <div className="h-px bg-white/60 mb-2" />
                        <div className="flex flex-col gap-2">
                          {typeCards.map((t) => {
                            const Icon = getIcon(t.type)
                            return (
                              <motion.button
                                key={t.type}
                                type="button"
                                className={clsx(
                                  'flex items-center justify-between rounded-[18px] px-3 py-3 text-left',
                                  'bg-white/70 hover:bg-white/85 transition-colors',
                                )}
                                onClick={() => onPickType(t.type)}
                                whileTap={{ scale: 0.99 }}
                              >
                                <div className="flex items-center gap-3 min-w-0">
                                  <div
                                    className="w-9 h-9 rounded-2xl flex items-center justify-center border border-black/5"
                                    style={{ background: g.group.tone, color: 'rgba(0,0,0,0.78)' }}
                                  >
                                    <Icon size={18} />
                                  </div>
                                  <div className="min-w-0">
                                    <div className="text-[13px] font-semibold truncate text-slate-900">{t.opt.name}</div>
                                    <div className="text-[10px] font-medium text-slate-400 mt-0.5">
                                      {t.updatedAt ? formatTime(t.updatedAt) : ''}
                                    </div>
                                  </div>
                                </div>
                                <div className="text-right shrink-0">
                                  <div
                                    className={clsx('text-[13px] font-semibold text-slate-900', hideAmounts && maskedClass)}
                                  >
                                    {hideAmounts ? maskedText : formatCny(t.total)}
                                  </div>
                                  <div className={clsx('text-[10px] font-medium text-slate-400 mt-0.5', hideAmounts && maskedClass)}>
                                    {hideAmounts ? maskedText : String(t.accounts.length)} 项
                                  </div>
                                </div>
                              </motion.button>
                            )
                          })}
                        </div>
                      </div>
                    </motion.div>
                  ) : null}
                </AnimatePresence>
              </motion.div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
