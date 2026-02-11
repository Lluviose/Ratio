import { type ComponentType, createElement, useEffect, useMemo, useState } from 'react'
import { ChevronLeft, GripVertical, MoreHorizontal } from 'lucide-react'
import { AnimatePresence, motion, Reorder } from 'framer-motion'
import { BottomSheet } from '../components/BottomSheet'
import {
  ACCOUNT_ORDER_BY_TYPE_KEY,
  ACCOUNT_SORT_MODE_KEY,
  mergeOrder,
  sortAccountsByBalanceDesc,
  sortByOrder,
  type AccountSortMode,
  type ManualAccountOrderByType,
} from '../lib/accountSort'
import { formatCny } from '../lib/format'
import { addMoney } from '../lib/money'
import { accountGroups, getAccountTypeOption, type Account, type AccountTypeId } from '../lib/accounts'
import { accountDetailSheetLayoutId } from '../lib/layoutIds'
import { pickForegroundColor } from '../lib/themes'
import { useLocalStorageState } from '../lib/useLocalStorageState'

export function AssetsTypeDetailPage(props: {
  type: AccountTypeId | null
  accounts: Account[]
  getIcon: (type: AccountTypeId) => ComponentType<{ size?: number }>
  onBack: () => void
  onEditAccount: (account: Account) => void
  hideAmounts: boolean
  themeColor: string
  activeAccountId?: string | null
}) {
  const { type, accounts, onBack, onEditAccount, hideAmounts, themeColor, activeAccountId } = props

  const [accountSortMode] = useLocalStorageState<AccountSortMode>(ACCOUNT_SORT_MODE_KEY, 'balance')
  const [manualAccountOrderByType, setManualAccountOrderByType] = useLocalStorageState<ManualAccountOrderByType>(
    ACCOUNT_ORDER_BY_TYPE_KEY,
    {},
  )

  const [moreOpen, setMoreOpen] = useState(false)
  const [sortOpen, setSortOpen] = useState(false)
  const [sortDraft, setSortDraft] = useState<string[]>([])

  const info = useMemo(() => {
    if (!type) return null
    const opt = getAccountTypeOption(type)
    const group = accountGroups[opt.groupId]
    return { opt, group }
  }, [type])

  const list = useMemo(() => {
    if (!type) return []
    const raw = accounts.filter((a) => a.type === type)
    if (accountSortMode === 'balance') return sortAccountsByBalanceDesc(raw)
    return sortByOrder(
      raw,
      (a) => a.id,
      mergeOrder(
        raw.map((a) => a.id),
        manualAccountOrderByType[type],
      ),
    )
  }, [accountSortMode, accounts, manualAccountOrderByType, type])

  const total = useMemo(() => list.reduce((sum, a) => addMoney(sum, a.balance), 0), [list])  
  const maskedText = '*****'
  const maskedClass = 'tracking-[0.28em]'

  useEffect(() => {
    setMoreOpen(false)
    setSortOpen(false)
    setSortDraft([])
  }, [type])

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
        transition={{ type: 'spring', stiffness: 400, damping: 30 }}
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

          {accountSortMode === 'manual' ? (
            <div className="relative">
              <button
                type="button"
                className="w-10 h-10 rounded-full bg-[var(--card)] border border-[var(--hairline)] flex items-center justify-center text-[var(--text)] shadow-sm"
                onClick={(e) => {
                  e.stopPropagation()
                  setMoreOpen((v) => !v)
                }}
                aria-label="more"
              >
                <MoreHorizontal size={18} />
              </button>

              <AnimatePresence>
                {moreOpen ? (
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
                        setMoreOpen(false)
                        setSortDraft(list.map((a) => a.id))
                        setSortOpen(true)
                      }}
                    >
                      排序
                    </button>
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </div>
          ) : null}
        </div>
      </motion.div>

      <div className="px-4 pt-4 pb-8">
        <motion.div
          className="bg-[var(--card)] rounded-[24px] border border-[var(--hairline)] overflow-hidden"
          style={{ boxShadow: 'var(--shadow-soft)' }}
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 400, damping: 30, delay: 0.05 }}
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
            {list.map((account, i) => {
              const isActive = Boolean(activeAccountId && activeAccountId === account.id)

              return (
                <motion.div
                  key={account.id}
                  layoutId={accountDetailSheetLayoutId(account.id)}
                  layout="position"
                  className="p-3 rounded-[22px] bg-[var(--bg)] border border-[var(--hairline)] shadow-[0_10px_26px_-22px_rgba(0,0,0,0.28)] cursor-pointer"
                  onClick={() => {
                    if (isActive) return
                    onEditAccount(account)
                  }}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.1 + i * 0.03 }}
                  whileTap={{ scale: 0.985 }}
                  style={{ borderRadius: 22, pointerEvents: isActive ? 'none' : 'auto' }}
                >
                  <motion.div
                    className="flex items-center justify-between gap-3"
                    initial={false}
                    animate={{ opacity: isActive ? 0 : 1 }}
                    transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-2xl bg-white/80 flex items-center justify-center text-slate-700 shadow-sm border border-white/70">
                        {createElement(info.opt.icon, { size: 18 })}
                      </div>
                      <div className="font-bold text-sm text-slate-800 truncate">{account.name}</div>
                    </div>
                    <div className={hideAmounts ? `font-black text-sm text-[var(--text)] ${maskedClass}` : 'font-black text-sm text-[var(--text)]'}>
                      {hideAmounts ? maskedText : formatCny(account.balance)}
                    </div>
                  </motion.div>
                </motion.div>
              )
            })}
          </div>
        </motion.div>
      </div>

      <BottomSheet
        open={sortOpen}
        title={`排序 - ${info.opt.name}`}
        onClose={() => {
          if (type) {
            setManualAccountOrderByType((prev) => ({ ...prev, [type]: sortDraft }))
          }
          setSortOpen(false)
        }}
      >
        <div className="stack">
          <div className="muted" style={{ fontSize: 12, fontWeight: 700 }}>
            拖拽调整顺序
          </div>

          <Reorder.Group axis="y" values={sortDraft} onReorder={setSortDraft} as="div" className="stack">
            {sortDraft.map((accountId) => {
              const account = list.find((a) => a.id === accountId)
              if (!account) return null

              return (
                <Reorder.Item
                  key={account.id}
                  value={account.id}
                  as="div"
                  whileDrag={{ scale: 1.02 }}
                  className="assetItem"
                  style={{ cursor: 'grab', userSelect: 'none' }}
                >
                  <div className="assetLeft">
                    <div className="w-9 h-9 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-500 shadow-sm border border-slate-200/50">
                      {createElement(info.opt.icon, { size: 18 })}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div className="assetName">{account.name}</div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <div className={hideAmounts ? `amount ${maskedClass}` : 'amount'}>
                      {hideAmounts ? maskedText : formatCny(account.balance)}
                    </div>
                    <GripVertical size={18} />
                  </div>
                </Reorder.Item>
              )
            })}
          </Reorder.Group>
        </div>
      </BottomSheet>
    </div>
  )
}
