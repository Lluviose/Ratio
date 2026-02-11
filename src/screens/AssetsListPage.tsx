import { clsx } from 'clsx'
import { AnimatePresence, motion, Reorder } from 'framer-motion'
import { ChevronDown, ChevronUp, GripVertical, MoreHorizontal } from 'lucide-react'
import { type ComponentType, type Ref, useEffect, useMemo, useState } from 'react'
import { BottomSheet } from '../components/BottomSheet'
import {
  ACCOUNT_SORT_MODE_KEY,
  ACCOUNT_TYPE_ORDER_BY_GROUP_KEY,
  mergeOrder,
  sortByOrder,
  type AccountSortMode,
  type ManualTypeOrderByGroup,
} from '../lib/accountSort'
import { getAccountTypeOption, type AccountTypeId } from '../lib/accounts'
import { formatCny } from '../lib/format'
import { addMoney } from '../lib/money'
import { useLocalStorageState } from '../lib/useLocalStorageState'
import type { GroupedAccounts } from './AssetsScreen'

type GroupId = 'liquid' | 'invest' | 'fixed' | 'receivable' | 'debt'

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
  isReturning?: boolean
  isReturningFromDetail?: boolean
}) {
  const { grouped, getIcon, onPickType, expandedGroup, onToggleGroup, hideAmounts, scrollRef, onGroupEl, isInitialLoad, isReturning, isReturningFromDetail } = props

  const [accountSortMode] = useLocalStorageState<AccountSortMode>(ACCOUNT_SORT_MODE_KEY, 'balance')
  const [manualTypeOrderByGroup, setManualTypeOrderByGroup] = useLocalStorageState<ManualTypeOrderByGroup>(
    ACCOUNT_TYPE_ORDER_BY_GROUP_KEY,
    {},
  )

  const [typeMenuOpenGroup, setTypeMenuOpenGroup] = useState<GroupId | null>(null)
  const [typeSortGroup, setTypeSortGroup] = useState<GroupId | null>(null)
  const [typeSortDraft, setTypeSortDraft] = useState<AccountTypeId[]>([])

  useEffect(() => {
    setTypeMenuOpenGroup(null)
  }, [expandedGroup])

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

  const sortSheetModel = useMemo(() => {
    if (!typeSortGroup) return null
    const g = groups.find((x) => x.group.id === typeSortGroup)
    if (!g) return null

    const typeCards = Array.from(new Set(g.accounts.map((a) => a.type))).map((type) => {
      const accounts = g.accounts.filter((a) => a.type === type)
      const total = accounts.reduce((sum, a) => addMoney(sum, a.balance), 0)
      const opt = getAccountTypeOption(type)
      return { type, opt, accounts, total }
    })

    const byType = new Map(typeCards.map((t) => [t.type, t]))
    return { group: g.group, byType }
  }, [groups, typeSortGroup])

  const closeTypeSort = () => {
    if (typeSortGroup) {
      setManualTypeOrderByGroup((prev) => ({ ...prev, [typeSortGroup]: typeSortDraft }))
    }
    setTypeSortGroup(null)
  }

  return (
    <div ref={scrollRef} className="h-full overflow-y-auto bg-transparent">     
      <div className="px-4 pt-[104px] pb-24">
        <div className="flex flex-col gap-[4px]">
          {groups.map((g, i) => {
            const id = g.group.id as GroupId
            const isExpanded = expandedGroup === id
            const cardBg = isExpanded ? withAlpha(g.group.tone, 0.42) : '#ffffff'
            const listLeft = isExpanded ? 44 : 56

            const typeNames = Array.from(new Set(g.accounts.map((a) => getAccountTypeOption(a.type).name))).join('、')
            const updatedAt = g.accounts.length > 0 ? g.accounts.map((a) => a.updatedAt).sort().slice(-1)[0] : undefined

            const typeCards = Array.from(new Set(g.accounts.map((a) => a.type)))
              .map((type) => {
                const accounts = g.accounts.filter((a) => a.type === type)      
                const total = accounts.reduce((sum, a) => addMoney(sum, a.balance), 0)       
                const updatedAt = accounts.map((a) => a.updatedAt).sort().slice(-1)[0]
                const opt = getAccountTypeOption(type)
                return { type, opt, accounts, total, updatedAt }
              })
              .sort((a, b) => b.total - a.total)

            const typeCardsSorted =
              accountSortMode === 'balance'
                ? typeCards
                : sortByOrder(
                    typeCards,
                    (t) => t.type,
                    mergeOrder(
                      typeCards.map((t) => t.type),
                      manualTypeOrderByGroup[id],
                    ),
                  )

            // 是否需要入场动画
            const needsEnterAnimation = isInitialLoad || isReturning || isReturningFromDetail

            return (
              <motion.div
                key={id}
                ref={(el) => onGroupEl?.(id, el)}
                className={clsx(
                  'relative',
                )}
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
                  {/* Animated Background Layer - Completely removed as it's now handled by OverlayBlock */}
                  <div className="absolute inset-0 z-0 opacity-0"></div>

                  <button
                    type="button"
                    className="relative z-10 w-full text-left"
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
                          {!isExpanded ? (
                            <div className="mt-1 text-[11px] font-medium text-slate-500 truncate max-w-[220px]">
                              {typeNames}
                            </div>
                          ) : null}
                        </div>
                        <div className="text-right shrink-0">
                          <div className={clsx('text-[17px] font-semibold tracking-tight text-slate-900', hideAmounts && maskedClass)}>
                            {hideAmounts ? maskedText : formatCny(g.total)}
                          </div>
                          {!isExpanded ? (
                            <div className="mt-1 text-[10px] font-medium text-slate-400">{formatTime(updatedAt)}</div>
                          ) : null}
                        </div>
                      </div>

                      {!isExpanded ? <div className="mt-2 text-[12px] text-slate-300 leading-none">...</div> : null}
                    </div>
                  </button>
                </div>

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
                      <div className="px-3 pt-2 pb-3">
                        {accountSortMode === 'manual' ? (
                          <div className="flex justify-end px-1 pb-2">
                            <div className="relative">
                              <button
                                type="button"
                                className="w-9 h-9 rounded-full flex items-center justify-center text-slate-700 hover:bg-black/5"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setTypeMenuOpenGroup((cur) => (cur === id ? null : id))
                                }}
                                aria-label="sort menu"
                              >
                                <MoreHorizontal size={18} strokeWidth={2.5} />
                              </button>

                              <AnimatePresence>
                                {typeMenuOpenGroup === id ? (
                                  <motion.div
                                    initial={{ opacity: 0, y: 8, scale: 0.98 }}
                                    animate={{ opacity: 1, y: 0, scale: 1 }}
                                    exit={{ opacity: 0, y: 8, scale: 0.98 }}
                                    transition={{ duration: 0.15 }}
                                    onClick={(e) => e.stopPropagation()}
                                    className="absolute right-0 top-full mt-2 min-w-[160px] rounded-[18px] bg-white/90 backdrop-blur-md border border-white/70 shadow-[var(--shadow-hover)] overflow-hidden z-10"
                                  >
                                    <button
                                      type="button"
                                      className="w-full px-4 py-3 text-left text-[13px] font-medium text-slate-800 hover:bg-black/5"
                                      onClick={() => {
                                        setTypeMenuOpenGroup(null)
                                        setTypeSortDraft(typeCardsSorted.map((t) => t.type))
                                        setTypeSortGroup(id)
                                      }}
                                    >
                                      排序
                                    </button>
                                  </motion.div>
                                ) : null}
                              </AnimatePresence>
                            </div>
                          </div>
                        ) : null}

                        <div className="flex flex-col gap-2">
                          {typeCardsSorted.map((t) => {
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
                                whileTap={{ scale: 0.99 }}
                                whileHover={{
                                  backgroundColor: 'rgba(255,255,255,0.92)',
                                }}
                              >
                                <div className="flex items-center gap-3 min-w-0">
                                  <div
                                    className="w-9 h-9 rounded-2xl flex items-center justify-center"
                                    style={{ color: g.group.tone }}
                                  >
                                    <Icon size={18} />
                                  </div>
                                  <div className="min-w-0">
                                    <div className="text-[13px] font-semibold truncate" style={{ color: g.group.tone }}>
                                      {t.opt.name}
                                    </div>
                                    <div className="text-[10px] font-medium text-slate-400 mt-0.5">
                                      {t.updatedAt ? formatTime(t.updatedAt) : ''}
                                    </div>
                                  </div>
                                </div>
                                <div className="text-right shrink-0">
                                  <div
                                    className={clsx('text-[13px] font-semibold', hideAmounts && maskedClass)}
                                    style={{ color: g.group.tone }}
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

      <BottomSheet
        open={Boolean(typeSortGroup)}
        title={sortSheetModel ? `排序 - ${sortSheetModel.group.name}` : '排序'}
        onClose={closeTypeSort}
      >
        {sortSheetModel ? (
          <div className="stack">
            <div className="muted" style={{ fontSize: 12, fontWeight: 700 }}>
              拖拽调整顺序
            </div>

            <Reorder.Group
              axis="y"
              values={typeSortDraft}
              onReorder={setTypeSortDraft}
              as="div"
              className="stack"
            >
              {typeSortDraft.map((type) => {
                const item = sortSheetModel.byType.get(type)
                if (!item) return null
                const Icon = getIcon(item.type)

                return (
                  <Reorder.Item
                    key={item.type}
                    value={item.type}
                    as="div"
                    whileDrag={{ scale: 1.02 }}
                    className="assetItem"
                    style={{ cursor: 'grab', userSelect: 'none' }}
                  >
                    <div className="assetLeft">
                      <div
                        className="w-9 h-9 rounded-2xl flex items-center justify-center"
                        style={{ color: sortSheetModel.group.tone }}
                      >
                        <Icon size={18} />
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div className="assetName">{item.opt.name}</div>
                        <div className="assetSub">{item.accounts.length} 项</div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <div className={clsx('amount', hideAmounts && maskedClass)}>
                        {hideAmounts ? maskedText : formatCny(item.total)}
                      </div>
                      <GripVertical size={18} />
                    </div>
                  </Reorder.Item>
                )
              })}
            </Reorder.Group>
          </div>
        ) : null}
      </BottomSheet>
    </div>
  )
}
