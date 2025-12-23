import { clsx } from 'clsx'
import { motion } from 'framer-motion'
import { ChevronLeft } from 'lucide-react'
import { type ComponentType, type Ref, useMemo } from 'react'
import { getAccountTypeOption, type AccountTypeId } from '../lib/accounts'
import { formatCny } from '../lib/format'
import type { GroupedAccounts } from './AssetsScreen'

type GroupId = 'liquid' | 'invest' | 'fixed' | 'receivable' | 'debt'

export function AssetsGroupTypesPage(props: {
  grouped: GroupedAccounts
  groupId: GroupId
  getIcon: (type: AccountTypeId) => ComponentType<{ size?: number }>
  onPickType: (type: AccountTypeId) => void
  onBack: () => void
  hideAmounts: boolean
  scrollRef?: Ref<HTMLDivElement>
}) {
  const { grouped, groupId, getIcon, onPickType, onBack, hideAmounts, scrollRef } = props

  const groupCard = useMemo(
    () => grouped.groupCards.find((g) => g.group.id === groupId) ?? null,
    [grouped.groupCards, groupId],
  )

  const typeCards = useMemo(() => {
    if (!groupCard) return []
    return Array.from(new Set(groupCard.accounts.map((a) => a.type)))
      .map((type) => {
        const accounts = groupCard.accounts.filter((a) => a.type === type)
        const total = accounts.reduce((s, a) => s + a.balance, 0)
        const updatedAt = accounts.map((a) => a.updatedAt).sort().slice(-1)[0]
        const opt = getAccountTypeOption(type)
        return { type, opt, accounts, total, updatedAt }
      })
      .sort((a, b) => b.total - a.total)
  }, [groupCard])

  const maskedText = '*****'
  const maskedClass = 'tracking-[0.28em]'

  const formatTime = (iso?: string) => {
    if (!iso) return ''
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return ''
    return `${d.getMonth() + 1}月${d.getDate()}日 更新`
  }

  if (!groupCard) return <div className="h-full" />

  return (
    <div ref={scrollRef} className="h-full overflow-y-auto" style={{ background: 'var(--bg)' }}>
      <div className="px-4 pt-[104px] pb-24">
        <div className="flex items-center gap-3 mb-3">
          <button
            type="button"
            className="w-10 h-10 rounded-full bg-white border border-black/5 shadow-sm flex items-center justify-center text-slate-700 active:scale-95"
            onClick={onBack}
            aria-label="back"
          >
            <ChevronLeft size={18} strokeWidth={2.5} />
          </button>
          <div className="min-w-0 flex-1">
            <div className="text-[15px] font-semibold tracking-tight text-slate-900 truncate">{groupCard.group.name}</div>
            <div className="mt-0.5 text-[11px] font-medium text-slate-500 truncate">二级资产类别</div>
          </div>
          <div className={clsx('text-[15px] font-semibold tracking-tight text-slate-900', hideAmounts && maskedClass)}>
            {hideAmounts ? maskedText : formatCny(groupCard.total)}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          {typeCards.map((t, i) => {
            const Icon = getIcon(t.type)
            return (
              <motion.button
                key={t.type}
                type="button"
                className={clsx(
                  'flex items-center justify-between rounded-[18px] px-3 py-3 text-left',
                  'bg-white border border-black/5 shadow-[0_6px_20px_-18px_rgba(15,23,42,0.45)]',
                  'transition-colors duration-200',
                )}
                onClick={() => onPickType(t.type)}
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.04 + i * 0.02 }}
                whileTap={{ scale: 0.99 }}
                whileHover={{ backgroundColor: 'rgba(255,255,255,0.92)' }}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-2xl flex items-center justify-center" style={{ color: groupCard.group.tone }}>
                    <Icon size={18} />
                  </div>
                  <div className="min-w-0">
                    <div className="text-[13px] font-semibold truncate" style={{ color: groupCard.group.tone }}>
                      {t.opt.name}
                    </div>
                    <div className="text-[10px] font-medium text-slate-400 mt-0.5">{t.updatedAt ? formatTime(t.updatedAt) : ''}</div>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className={clsx('text-[13px] font-semibold', hideAmounts && maskedClass)} style={{ color: groupCard.group.tone }}>
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
    </div>
  )
}
