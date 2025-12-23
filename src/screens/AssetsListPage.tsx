import { clsx } from 'clsx'
import { motion } from 'framer-motion'
import { ChevronRight } from 'lucide-react'
import { type Ref, useMemo } from 'react'
import { getAccountTypeOption } from '../lib/accounts'
import { formatCny } from '../lib/format'
import type { GroupedAccounts } from './AssetsScreen'

type GroupId = 'liquid' | 'invest' | 'fixed' | 'receivable' | 'debt'

export function AssetsListPage(props: {
  grouped: GroupedAccounts
  onPickGroup: (id: GroupId) => void
  hideAmounts: boolean
  scrollRef?: Ref<HTMLDivElement>
  onGroupEl?: (id: GroupId, el: HTMLDivElement | null) => void
  isInitialLoad?: boolean
  isReturning?: boolean
  isReturningFromDetail?: boolean
}) {
  const { grouped, onPickGroup, hideAmounts, scrollRef, onGroupEl, isInitialLoad, isReturning, isReturningFromDetail } = props

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
      <div className="px-4 pt-[104px] pb-24">
        <div className="flex flex-col gap-[4px]">
          {groups.map((g, i) => {
            const id = g.group.id as GroupId
            const cardBg = '#ffffff'
            const listLeft = 56

            const typeNames = Array.from(new Set(g.accounts.map((a) => getAccountTypeOption(a.type).name))).join('、')
            const updatedAt = g.accounts.length > 0 ? g.accounts.map((a) => a.updatedAt).sort().slice(-1)[0] : undefined

            const needsEnterAnimation = isInitialLoad || isReturning || isReturningFromDetail

            return (
              <motion.div
                key={id}
                ref={(el) => onGroupEl?.(id, el)}
                className={clsx('relative')}
                initial={needsEnterAnimation ? { opacity: 0, x: 100, marginLeft: listLeft } : false}
                animate={{ opacity: 1, x: 0, y: 0, marginLeft: listLeft }}
                transition={
                  {
                    opacity: {
                      duration: needsEnterAnimation ? 0.5 : 0.3,
                      delay: needsEnterAnimation ? 0.06 + i * 0.04 : 0.06 + i * 0.02,
                      ease: [0.2, 0, 0, 1],
                    },
                    x: {
                      duration: needsEnterAnimation ? 0.5 : 0.3,
                      delay: needsEnterAnimation ? 0.06 + i * 0.04 : 0.06 + i * 0.02,
                      ease: [0.2, 0, 0, 1],
                    },
                    y: {
                      duration: needsEnterAnimation ? 0.5 : 0.3,
                      delay: needsEnterAnimation ? 0.06 + i * 0.04 : 0.06 + i * 0.02,
                      ease: [0.2, 0, 0, 1],
                    },
                    marginLeft: {
                      duration: 0.25,
                      ease: 'easeInOut',
                    },
                  } as const
                }
              >
                <div
                  className={clsx(
                    'relative overflow-hidden rounded-[22px] border border-black/5 shadow-[0_10px_22px_-18px_rgba(15,23,42,0.35)]',
                  )}
                  style={{ background: cardBg }}
                >
                  <div className="absolute inset-0 z-0 opacity-0"></div>

                  <button type="button" className="relative z-10 w-full text-left" onClick={() => onPickGroup(id)}>
                    <div className="px-4 py-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <div className="text-[15px] font-semibold tracking-tight text-slate-900">{g.group.name}</div>
                            <div className="text-slate-400">
                              <ChevronRight size={14} strokeWidth={2.5} />
                            </div>
                          </div>
                          <div className="mt-1 text-[11px] font-medium text-slate-500 truncate max-w-[220px]">{typeNames}</div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className={clsx('text-[17px] font-semibold tracking-tight text-slate-900', hideAmounts && maskedClass)}>
                            {hideAmounts ? maskedText : formatCny(g.total)}
                          </div>
                          <div className="mt-1 text-[10px] font-medium text-slate-400">{formatTime(updatedAt)}</div>
                        </div>
                      </div>

                      <div className="mt-2 text-[12px] text-slate-300 leading-none">...</div>
                    </div>
                  </button>
                </div>
              </motion.div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

