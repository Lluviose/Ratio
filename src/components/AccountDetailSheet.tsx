import { createElement, useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { ArrowLeftRight, MoreHorizontal, Pencil, SlidersHorizontal, Trash2, X } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { BottomSheet } from './BottomSheet'
import { SegmentedControl } from './SegmentedControl'
import { useOverlay } from '../lib/overlay'
import { formatCny } from '../lib/format'
import { type Account, getAccountTypeOption } from '../lib/accounts'
import { type ThemeColors } from '../lib/themes'
import type { AccountOp, AccountOpInput } from '../lib/accountOps'

type ActionId = 'none' | 'rename' | 'set_balance' | 'adjust' | 'transfer'

type TransferDirection = 'out' | 'in'

type AdjustDirection = 'plus' | 'minus'

function formatTime(iso: string) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${d.getMonth() + 1}月${d.getDate()}日 ${hh}:${mm}`
}

function formatSigned(amount: number) {
  if (amount > 0) return `+${formatCny(amount)}`
  if (amount < 0) return `-${formatCny(Math.abs(amount))}`
  return formatCny(amount)
}

function isDebtAccount(account: Account) {
  return account.type === 'credit_card' || account.type === 'loan' || account.type === 'payable' || account.type === 'other_debt'
}

function applyFlow(account: Account, flow: number) {
  if (isDebtAccount(account)) return account.balance - flow
  return account.balance + flow
}

export function AccountDetailSheet(props: {
  open: boolean
  accountId: string | null
  accounts: Account[]
  ops: AccountOp[]
  initialAction?: ActionId
  onClose: () => void
  onRename: (id: string, name: string) => void
  onSetBalance: (id: string, balance: number) => void
  onAdjust: (id: string, delta: number) => void
  onTransfer: (fromId: string, toId: string, amount: number) => void
  onDelete: (id: string) => void
  onAddOp: (op: AccountOpInput) => void
  onDeleteOp: (id: string) => void
  colors: ThemeColors
}) {
  const {
    open,
    accountId,
    accounts,
    ops,
    initialAction,
    onClose,
    onRename,
    onSetBalance,
    onAdjust,
    onTransfer,
    onDelete,
    onAddOp,
    onDeleteOp,
    colors,
  } = props

  const { toast, confirm } = useOverlay()

  const account = useMemo(() => {
    if (!accountId) return null
    return accounts.find((a) => a.id === accountId) ?? null
  }, [accountId, accounts])

  const byId = useMemo(() => {
    const m = new Map<string, Account>()
    for (const a of accounts) m.set(a.id, a)
    return m
  }, [accounts])

  const [action, setAction] = useState<ActionId>('none')
  const [pageDir, setPageDir] = useState<-1 | 0 | 1>(0)
  const [suppressOpsIntro, setSuppressOpsIntro] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const [renameValue, setRenameValue] = useState('')
  const [balanceValue, setBalanceValue] = useState('')
  const [noteValue, setNoteValue] = useState('')
  const balanceInputRef = useRef<HTMLInputElement | null>(null)
  const adjustInputRef = useRef<HTMLInputElement | null>(null)
  const openedAtRef = useRef<number | null>(null)
  const initKeyRef = useRef<string | null>(null)
  const [adjustDirection, setAdjustDirection] = useState<AdjustDirection>('plus')
  const [adjustAmount, setAdjustAmount] = useState('')
  const [transferDirection, setTransferDirection] = useState<TransferDirection>('out')
  const [transferPeerId, setTransferPeerId] = useState('')
  const [transferAmount, setTransferAmount] = useState('')

  const handleClosePointerDown = (e: ReactPointerEvent) => {
    e.preventDefault()
    e.stopPropagation()
    onClose()
  }

  const transitionToAction = (nextAction: ActionId) => {
    if (nextAction === action) return
    setMoreOpen(false)

    if (action !== 'none' && nextAction === 'none') {
      setPageDir(-1)
      setSuppressOpsIntro(true)
    } else if (action === 'none' && nextAction !== 'none') {
      setPageDir(1)
      setSuppressOpsIntro(false)
    } else if (action !== 'none' && nextAction !== 'none') {
      setPageDir(1)
      setSuppressOpsIntro(false)
    } else {
      setPageDir(0)
      setSuppressOpsIntro(false)
    }

    setAction(nextAction)
  }

  useLayoutEffect(() => {
    if (!open) {
      initKeyRef.current = null
      setPageDir(0)
      setSuppressOpsIntro(false)
      return
    }
    if (!accountId || !account) return
    const initKey = `${accountId}:${initialAction ?? 'none'}`
    if (initKeyRef.current === initKey) return
    initKeyRef.current = initKey

    const nextAction = initialAction ?? 'none'
    setPageDir(0)
    setSuppressOpsIntro(false)
    setAction(nextAction)
    setMoreOpen(false)
    setRenameValue(account.name)
    setBalanceValue(String(account.balance))
    setNoteValue('')
    setAdjustDirection('plus')
    setAdjustAmount('')
    setTransferDirection('out')
    setTransferPeerId('')
    setTransferAmount('')
  }, [account, accountId, initialAction, open])

  useEffect(() => {
    if (!open) {
      openedAtRef.current = null
      return
    }
    openedAtRef.current = performance.now()
  }, [open])

  useEffect(() => {
    if (!open) return
    if (action !== 'set_balance' && action !== 'adjust') return
    setMoreOpen(false)
    const openedAt = openedAtRef.current
    const openingMs = 280
    const elapsed = openedAt == null ? Number.POSITIVE_INFINITY : performance.now() - openedAt
    const delay = elapsed < openingMs ? Math.max(0, openingMs - elapsed) : 0

    const timer = window.setTimeout(() => {
      const el = action === 'set_balance' ? balanceInputRef.current : adjustInputRef.current
      if (!el) return
      el.focus()
      el.select()
    }, delay)
    return () => window.clearTimeout(timer)
  }, [action, open])

  useEffect(() => {
    if (!open || action !== 'none' || !suppressOpsIntro) return
    const timer = window.setTimeout(() => setSuppressOpsIntro(false), 0)
    return () => window.clearTimeout(timer)
  }, [action, open, suppressOpsIntro])

  const accountTypeInfo = useMemo(() => {
    if (!account) return null
    const opt = getAccountTypeOption(account.type)
    if (!opt) return null
    return {
      opt,
      tone: colors[opt.groupId],
    }
  }, [account, colors])

  const selectablePeers = useMemo(() => {
    if (!accountId) return []
    return accounts.filter((a) => a.id !== accountId)
  }, [accountId, accounts])

  const relatedOps = useMemo(() => {
    if (!accountId) return []
    return ops
      .filter((op) => {
        if (op.kind === 'rename') return op.accountId === accountId
        if (op.kind === 'set_balance') return op.accountId === accountId
        if (op.kind === 'adjust') return op.accountId === accountId
        if (op.kind === 'transfer') return op.fromId === accountId || op.toId === accountId
        return false
      })
      .slice()
      .sort((a, b) => b.at.localeCompare(a.at))
  }, [accountId, ops])

  const latestSetBalanceAtByAccountId = useMemo(() => {
    const m = new Map<string, string>()
    for (const op of ops) {
      if (op.kind !== 'set_balance') continue
      const prev = m.get(op.accountId)
      if (!prev || op.at.localeCompare(prev) > 0) m.set(op.accountId, op.at)
    }
    return m
  }, [ops])

  if (!account) return <BottomSheet open={open} title="账户" onClose={onClose}><div className="muted" style={{ fontSize: 13, fontWeight: 800, textAlign: 'center', padding: 40 }}>未找到账户</div></BottomSheet>

  const setBalanceValueTrimmed = balanceValue.trim()
  const setBalanceParsed = Number(setBalanceValueTrimmed)
  const canSubmitSetBalance = setBalanceValueTrimmed !== '' && Number.isFinite(setBalanceParsed)
  const isSetBalanceNoop = canSubmitSetBalance && setBalanceParsed === account.balance

  const pageTransition = { duration: 0.2, ease: [0.16, 1, 0.3, 1] as const }
  const pageVariants = {
    initial: (dir: number) => ({
      opacity: 0,
      x: dir === 0 ? 0 : dir * 18,
      y: 10,
    }),
    animate: { opacity: 1, x: 0, y: 0 },
    exit: (dir: number) => ({
      opacity: 0,
      x: dir === 0 ? 0 : -dir * 18,
      y: -10,
    }),
  }

  const adjustAmountTrimmed = adjustAmount.trim()
  const adjustParsed = Number(adjustAmountTrimmed)
  const canSubmitAdjust =
    adjustAmountTrimmed !== '' && Number.isFinite(adjustParsed) && adjustParsed > 0
  const previewAdjustDelta = canSubmitAdjust
    ? adjustDirection === 'plus'
      ? adjustParsed
      : -adjustParsed
    : 0
  const previewAdjustAfter = account.balance + previewAdjustDelta

  const refocusActiveInput = () => {
    const el =
      action === 'set_balance'
        ? balanceInputRef.current
        : action === 'adjust'
          ? adjustInputRef.current
          : null
    if (!el) return
    el.focus()
    el.select()
  }

  const cancelEdit = () => {
    setMoreOpen(false)
    balanceInputRef.current?.blur()
    adjustInputRef.current?.blur()
    setRenameValue(account.name)
    setBalanceValue(String(account.balance))
    setNoteValue('')
    setAdjustDirection('plus')
    setAdjustAmount('')
    setTransferDirection('out')
    setTransferPeerId('')
    setTransferAmount('')
    transitionToAction('none')
  }

  const toggleBalanceSign = () => {
    const raw = balanceValue.trim()
    if (!raw) {
      setBalanceValue('-')
      refocusActiveInput()
      return
    }
    setBalanceValue(raw.startsWith('-') ? raw.slice(1) : `-${raw}`)
    refocusActiveInput()
  }

  const submitRename = () => {
    const next = renameValue.trim()
    if (!next) {
      toast('请输入名称', { tone: 'danger' })
      return
    }
    if (next === account.name) {
      transitionToAction('none')
      return
    }

    onAddOp({
      kind: 'rename',
      at: new Date().toISOString(),
      accountType: account.type,
      accountId: account.id,
      beforeName: account.name,
      afterName: next,
    })
    onRename(account.id, next)
    transitionToAction('none')
  }

  const submitSetBalance = () => {
    const raw = balanceValue.trim()
    if (!raw) {
      toast('请输入正确余额', { tone: 'danger' })
      refocusActiveInput()
      return
    }
    const num = Number(raw)
    if (!Number.isFinite(num)) {
      toast('请输入正确余额', { tone: 'danger' })
      refocusActiveInput()
      return
    }

    if (num === account.balance) {
      balanceInputRef.current?.blur()
      transitionToAction('none')
      return
    }

    onAddOp({
      kind: 'set_balance',
      at: new Date().toISOString(),
      accountType: account.type,
      accountId: account.id,
      before: account.balance,
      after: num,
    })
    onSetBalance(account.id, num)
    balanceInputRef.current?.blur()
    setNoteValue('')
    transitionToAction('none')
  }

  const submitAdjust = () => {
    const raw = adjustAmount.trim()
    const num = Number(raw)
    if (!raw || !Number.isFinite(num) || num <= 0) {
      toast('请输入正确金额', { tone: 'danger' })
      refocusActiveInput()
      return
    }

    const delta = adjustDirection === 'plus' ? num : -num
    const after = account.balance + delta

    onAddOp({
      kind: 'adjust',
      at: new Date().toISOString(),
      accountType: account.type,
      accountId: account.id,
      delta,
      before: account.balance,
      after,
    })
    onAdjust(account.id, delta)
    setAdjustAmount('')
    setNoteValue('')
    adjustInputRef.current?.blur()
    transitionToAction('none')
  }

  const submitTransfer = () => {
    if (!transferPeerId) {
      toast('请选择账户', { tone: 'danger' })
      return
    }
    const peer = byId.get(transferPeerId)
    if (!peer) {
      toast('账户不存在', { tone: 'danger' })
      return
    }

    const num = Number(transferAmount)
    if (!Number.isFinite(num) || num <= 0) {
      toast('请输入正确金额', { tone: 'danger' })
      return
    }

    const from = transferDirection === 'out' ? account : peer
    const to = transferDirection === 'out' ? peer : account

    const fromAfter = applyFlow(from, -num)
    const toAfter = applyFlow(to, num)

    onAddOp({
      kind: 'transfer',
      at: new Date().toISOString(),
      accountType: account.type,
      fromId: from.id,
      toId: to.id,
      amount: num,
      fromBefore: from.balance,
      fromAfter,
      toBefore: to.balance,
      toAfter,
    })
    onTransfer(from.id, to.id, num)
    setTransferAmount('')
    setTransferPeerId('')
    transitionToAction('none')
  }

  const TypeIcon = accountTypeInfo?.opt.icon

  return (
    <BottomSheet
      open={open}
      title={account.name}
      onClose={onClose}
      hideHandle
      sheetStyle={{ maxHeight: '92vh', background: 'var(--bg)' }}
      bodyStyle={{ padding: 0 }}
      header={
        <div className="px-4 pt-5 pb-3 flex items-center justify-between" style={{ background: 'var(--bg)' }}>
          <button
            type="button"
            onPointerDown={handleClosePointerDown}
            className="w-11 h-11 rounded-full bg-white/80 border border-white/70 text-slate-700 flex items-center justify-center shadow-sm"
            aria-label="close"
          >
            <X size={20} strokeWidth={2.5} />
          </button>

          <div className="flex items-center gap-2">
            {action === 'none' ? (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setMoreOpen(false)
                    setRenameValue(account.name)
                    transitionToAction('rename')
                  }}
                  className="w-11 h-11 rounded-full bg-white/80 border border-white/70 text-slate-700 flex items-center justify-center shadow-sm"
                  aria-label="rename"
                >
                  <Pencil size={20} strokeWidth={2.5} />
                </button>

                <div className="relative">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      setMoreOpen((v) => !v)
                    }}
                    className="w-11 h-11 rounded-full bg-white/80 border border-white/70 text-slate-700 flex items-center justify-center shadow-sm"
                    aria-label="more"
                  >
                    <MoreHorizontal size={20} strokeWidth={2.5} />
                  </button>

                  <AnimatePresence>
                    {moreOpen ? (
                      <motion.div
                        initial={{ opacity: 0, y: 8, scale: 0.98 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 8, scale: 0.98 }}
                        transition={{ duration: 0.15 }}
                        onClick={(e) => e.stopPropagation()}
                        className="absolute right-0 top-full mt-2 min-w-[180px] rounded-[18px] bg-white/90 backdrop-blur-md border border-white/70 shadow-[var(--shadow-hover)] overflow-hidden z-10"
                      >
                        <button
                          type="button"
                          className="w-full px-4 py-3 text-left text-[13px] font-semibold text-slate-800 hover:bg-black/5"
                          onClick={() => {
                            setMoreOpen(false)
                            setTransferDirection('out')
                            setTransferPeerId('')
                            setTransferAmount('')
                            transitionToAction('transfer')
                          }}
                        >
                          <span className="inline-flex items-center gap-2">
                            <ArrowLeftRight size={16} strokeWidth={2.6} />
                            转账
                          </span>
                        </button>

                        <div className="h-px bg-black/5" />

                        <button
                          type="button"
                          className="w-full px-4 py-3 text-left text-[13px] font-semibold text-rose-600 hover:bg-rose-50"
                          onClick={async () => {
                            setMoreOpen(false)
                            const ok = await confirm({
                              title: '删除账户',
                              message: `确定要删除账户「${account.name}」吗？此操作不可撤销。`,
                              confirmText: '删除',
                              cancelText: '取消',
                              tone: 'danger',
                            })
                            if (ok) {
                              onDelete(account.id)
                              onClose()
                            }
                          }}
                        >
                          <span className="inline-flex items-center gap-2">
                            <Trash2 size={16} strokeWidth={2.6} />
                            删除账户
                          </span>
                        </button>
                      </motion.div>
                    ) : null}
                  </AnimatePresence>
                </div>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onPointerDown={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    cancelEdit()
                  }}
                  className="px-2 py-2 text-[15px] font-semibold text-slate-700 hover:text-slate-900"
                >
                  取消
                </button>
              </>
            )}
          </div>
        </div>
      }
    >
      <motion.div
        className="flex flex-col"
        style={{ minHeight: '72vh' }}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.22, delay: 0.06, ease: [0.16, 1, 0.3, 1] }}
        onClick={() => setMoreOpen(false)}
      >
        <div className="px-4 pb-6">
          <div className="flex items-center gap-2 text-slate-500">
            <div className="w-6 h-6 rounded-md bg-white/80 border border-white/70 flex items-center justify-center text-slate-500">
              {TypeIcon ? createElement(TypeIcon, { size: 14, strokeWidth: 2.5 }) : null}
            </div>
            <div className="text-[13px] font-semibold text-slate-700">{account.name}</div>
          </div>

          <div className="mt-3 h-px bg-slate-200/70" />

          <AnimatePresence mode="wait" initial={false}>
            {action === 'none' ? (
              <motion.div
                key="summary"
                custom={pageDir}
                variants={pageVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                transition={pageTransition}
              >
                <div className="mt-4 text-[34px] font-black tracking-tight text-slate-900">
                  {formatCny(account.balance)}
                </div>

                <div className="mt-5 flex gap-3">
                  <motion.button
                    type="button"
                    onClick={() => {
                      setMoreOpen(false)
                      setNoteValue('')
                      setAdjustDirection('plus')
                      setAdjustAmount('')
                      transitionToAction('adjust')
                    }}
                    whileTap={{ scale: 0.99 }}
                    className="flex-1 h-12 rounded-full bg-white/80 border border-white/70 text-slate-900 font-semibold shadow-sm"
                  >
                    期间增减
                  </motion.button>
                  <motion.button
                    type="button"
                    onClick={() => {
                      setMoreOpen(false)
                      setNoteValue('')
                      setBalanceValue(String(account.balance))
                      transitionToAction('set_balance')
                    }}
                    whileTap={{ scale: 0.99 }}
                    className="flex-1 h-12 rounded-full bg-slate-900 text-white font-semibold shadow-sm"
                  >
                    修改余额
                  </motion.button>
                </div>

                <div className="mt-7 flex items-center justify-between">
                  <div className="flex items-center gap-2 text-[13px] font-semibold text-slate-500">
                    <span>期间变动</span>
                    <SlidersHorizontal size={14} strokeWidth={2.5} className="opacity-60" />
                  </div>
                  <div className="text-[13px] font-semibold text-slate-400">金额</div>
                </div>

                <div className="mt-1 text-[11px] font-semibold text-slate-400/80">
                  这里记录的是期间净流量/校准/转账（非逐笔流水）
                </div>

                <div className="mt-3 rounded-[22px] bg-white/70 border border-white/70 overflow-hidden">
                  {relatedOps.length === 0 ? (
                    <div className="py-10 text-center text-[13px] font-semibold text-slate-400">
                      暂无操作
                    </div>
                  ) : (
                    <div>
                      {relatedOps.map((op, i) => {
                        let title = ''
                        let delta: number | null = 0
                        let after = account.balance

                        if (op.kind === 'rename') {
                          title = `重命名：${op.beforeName} → ${op.afterName}`
                          delta = null
                          after = account.balance
                        }

                        if (op.kind === 'set_balance') {
                          title = '修改余额'
                          delta = op.after - op.before
                          after = op.after
                        }

                        if (op.kind === 'adjust') {
                          title = op.delta >= 0 ? '期间净流入' : '期间净流出'
                          delta = op.delta
                          after = op.after
                        }

                        if (op.kind === 'transfer') {
                          const from = byId.get(op.fromId)
                          const to = byId.get(op.toId)
                          if (account.id === op.fromId) {
                            title = `转出到 ${to?.name ?? '账户'}`
                            delta = op.fromAfter - op.fromBefore
                            after = op.fromAfter
                          } else {
                            title = `从 ${from?.name ?? '账户'} 转入`
                            delta = op.toAfter - op.toBefore
                            after = op.toAfter
                          }
                        }

                        const deltaColor =
                          delta == null
                            ? 'text-slate-400'
                            : delta > 0
                              ? 'text-slate-900'
                              : delta < 0
                                ? 'text-rose-600'
                                : 'text-slate-400'

                        const canDeleteOp =
                          op.kind === 'set_balance' || op.kind === 'adjust' || op.kind === 'transfer'

                        const canRollbackBalance = (targetAccountId: string) => {
                          const latest = latestSetBalanceAtByAccountId.get(targetAccountId)
                          if (!latest) return true
                          return latest.localeCompare(op.at) <= 0
                        }

                        const handleDeleteOp = async () => {
                          const ok = await confirm({
                            title: '删除这条资产修改？',
                            message: `${title}（${formatTime(op.at)}）`,
                            confirmText: '删除',
                            cancelText: '取消',
                            tone: 'danger',
                          })
                          if (!ok) return

                          let rolledBack = false

                          if (op.kind === 'adjust') {
                            if (canRollbackBalance(op.accountId)) {
                              onAdjust(op.accountId, -op.delta)
                              rolledBack = true
                            }
                          }

                          if (op.kind === 'set_balance') {
                            if (canRollbackBalance(op.accountId)) {
                              onAdjust(op.accountId, op.before - op.after)
                              rolledBack = true
                            }
                          }

                          if (op.kind === 'transfer') {
                            if (canRollbackBalance(op.fromId)) {
                              onAdjust(op.fromId, op.fromBefore - op.fromAfter)
                              rolledBack = true
                            }
                            if (canRollbackBalance(op.toId)) {
                              onAdjust(op.toId, op.toBefore - op.toAfter)
                              rolledBack = true
                            }
                          }

                          onDeleteOp(op.id)
                          toast(rolledBack ? '已删除并回滚余额' : '已删除记录（余额未变）', { tone: 'success' })
                        }

                        return (
                          <motion.div
                            key={op.id}
                            initial={suppressOpsIntro ? false : { opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={
                              suppressOpsIntro
                                ? { duration: 0 }
                                : { duration: 0.18, delay: Math.min(0.25, i * 0.03) }
                            }
                            className={i === 0 ? '' : 'border-t border-black/5'}
                          >
                            <div className="px-4 py-4 flex items-start justify-between gap-4">
                              <div className="min-w-0">
                                <div className="text-[14px] font-semibold text-slate-900 truncate">
                                  {title}
                                </div>
                                <div className="mt-1 text-[11px] font-medium text-slate-400">
                                  {formatTime(op.at)}
                                </div>
                              </div>

                              <div className="text-right shrink-0 flex items-start gap-1">
                                <div>
                                  <div className={`text-[14px] font-semibold ${deltaColor}`}>
                                    {delta == null ? '—' : formatSigned(delta)}
                                  </div>
                                  <div className="mt-1 text-[11px] font-medium text-slate-400">
                                    余额 {formatCny(after)}
                                  </div>
                                </div>
                                {canDeleteOp ? (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      void handleDeleteOp()
                                    }}
                                    className="p-2 -mr-2 rounded-full text-slate-300 hover:text-rose-600 hover:bg-rose-50 active:scale-95 transition"
                                    aria-label="delete op"
                                  >
                                    <Trash2 size={16} strokeWidth={2.6} />
                                  </button>
                                ) : null}
                              </div>
                            </div>
                          </motion.div>
                        )
                      })}
                    </div>
                  )}
                </div>
              </motion.div>
            ) : action === 'adjust' ? (
              <motion.div
                key="adjust"
                custom={pageDir}
                variants={pageVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                transition={pageTransition}
              >
                <div className="mt-4 flex items-baseline gap-2">
                  <div className="text-[34px] font-black tracking-tight text-slate-900">¥</div>
                  <input
                    ref={adjustInputRef}
                    className="flex-1 min-w-0 bg-transparent outline-none text-[34px] font-black tracking-tight text-slate-900 placeholder:text-slate-400"
                    inputMode="decimal"
                    placeholder="0"
                    value={adjustAmount}
                    onChange={(e) => setAdjustAmount(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        if (canSubmitAdjust) submitAdjust()
                      }
                      if (e.key === 'Escape') {
                        e.preventDefault()
                        cancelEdit()
                      }
                    }}
                    aria-label="adjust amount"
                  />
                </div>

                <div className="mt-3 flex items-center justify-between gap-4">
                  <input
                    className="flex-1 min-w-0 bg-transparent outline-none text-[13px] font-medium text-slate-700 placeholder:text-slate-400"
                    placeholder="备注"
                    value={noteValue}
                    onChange={(e) => setNoteValue(e.target.value)}
                    aria-label="note"
                  />
                  <div className="text-[13px] font-semibold text-slate-700">期间增减</div>
                </div>

                <div className="mt-2 text-[11px] font-semibold text-slate-400">
                  “+”=期间净流入，“-”=期间净流出（非逐笔流水）
                </div>

                <div className="mt-4 flex rounded-full bg-slate-200/80 p-1">
                  {(
                    [
                      { id: 'plus' as const, label: '+' },
                      { id: 'minus' as const, label: '-' },
                    ] as const
                  ).map((item) => {
                    const isActive = adjustDirection === item.id
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setAdjustDirection(item.id)}
                        className="relative flex-1 h-11 rounded-full text-[18px] font-black"
                        style={{ color: isActive ? '#fff' : 'var(--text)' }}
                      >
                        {isActive ? (
                          <motion.div
                            layoutId="accountAdjustDirBg"
                            className="absolute inset-0 rounded-full bg-slate-900"
                            transition={{ type: 'spring', stiffness: 600, damping: 40 }}
                          />
                        ) : null}
                        <span className="relative z-10">{item.label}</span>
                      </button>
                    )
                  })}
                </div>

                <div className="mt-3">
                  <div className="text-[13px] font-semibold" style={{ color: 'var(--primary)' }}>
                    {formatSigned(previewAdjustDelta)}
                  </div>
                  <div className="mt-1 text-[12px] font-medium text-slate-500">
                    余额 {formatCny(previewAdjustAfter)}
                  </div>
                </div>

                <motion.button
                  type="button"
                  onClick={submitAdjust}
                  disabled={!canSubmitAdjust}
                  whileTap={{ scale: canSubmitAdjust ? 0.99 : 1 }}
                  className={`mt-6 w-full h-14 rounded-[22px] font-semibold text-[16px] transition-colors ${canSubmitAdjust ? 'bg-slate-900 text-white shadow-sm' : 'bg-slate-200 text-slate-400'}`}
                >
                  完成
                </motion.button>
              </motion.div>
            ) : action === 'set_balance' ? (
              <motion.div
                key="set_balance"
                custom={pageDir}
                variants={pageVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                transition={pageTransition}
              >
                <div className="mt-4 flex items-center justify-between gap-3">
                  <div className="flex items-baseline gap-2 flex-1 min-w-0">
                    <div className="text-[34px] font-black tracking-tight text-slate-900">¥</div>
                    <input
                      ref={balanceInputRef}
                      className="flex-1 min-w-0 bg-transparent outline-none text-[34px] font-black tracking-tight text-slate-900 placeholder:text-slate-400"
                      inputMode="decimal"
                      placeholder="0"
                      value={balanceValue}
                      onChange={(e) => setBalanceValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          if (canSubmitSetBalance && !isSetBalanceNoop) submitSetBalance()
                        }
                        if (e.key === 'Escape') {
                          e.preventDefault()
                          cancelEdit()
                        }
                      }}
                      aria-label="set balance"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={toggleBalanceSign}
                    className="px-2 py-2 rounded-full text-[13px] font-semibold text-slate-500 hover:bg-white/60"
                    aria-label="toggle sign"
                  >
                    +/-
                  </button>
                </div>

                <div className="mt-3 flex items-center justify-between gap-4">
                  <input
                    className="flex-1 min-w-0 bg-transparent outline-none text-[13px] font-medium text-slate-700 placeholder:text-slate-400"
                    placeholder="备注"
                    value={noteValue}
                    onChange={(e) => setNoteValue(e.target.value)}
                    aria-label="note"
                  />
                  <div className="text-[13px] font-semibold text-slate-700">修改余额</div>
                </div>

                <div className="mt-3 flex items-center justify-between text-[12px] font-medium text-slate-400">
                  <div>当前余额</div>
                  <div className="text-slate-500">{formatCny(account.balance)}</div>
                </div>

                <motion.button
                  type="button"
                  onClick={submitSetBalance}
                  disabled={!canSubmitSetBalance || isSetBalanceNoop}
                  whileTap={{ scale: canSubmitSetBalance && !isSetBalanceNoop ? 0.99 : 1 }}
                  className={`mt-6 w-full h-14 rounded-[22px] font-semibold text-[16px] transition-colors ${canSubmitSetBalance && !isSetBalanceNoop ? 'bg-slate-900 text-white shadow-sm' : 'bg-slate-200 text-slate-400'}`}
                >
                  完成
                </motion.button>
              </motion.div>
            ) : action === 'rename' ? (
              <motion.div
                key="rename"
                custom={pageDir}
                variants={pageVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                transition={pageTransition}
              >
                <div className="mt-4 text-[34px] font-black tracking-tight text-slate-900">
                  {formatCny(account.balance)}
                </div>

                <div className="mt-5">
                  <div className="text-[13px] font-semibold text-slate-500">账户名称</div>
                  <input
                    className="input mt-2"
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        submitRename()
                      }
                      if (e.key === 'Escape') {
                        e.preventDefault()
                        cancelEdit()
                      }
                    }}
                    autoFocus
                  />
                </div>

                <motion.button
                  type="button"
                  onClick={submitRename}
                  whileTap={{ scale: 0.99 }}
                  className="mt-6 w-full h-14 rounded-[22px] bg-slate-900 text-white font-semibold text-[16px] shadow-sm"
                >
                  完成
                </motion.button>
              </motion.div>
            ) : (
              <motion.div
                key="transfer"
                custom={pageDir}
                variants={pageVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                transition={pageTransition}
              >
                <div className="mt-4 text-[34px] font-black tracking-tight text-slate-900">
                  {formatCny(account.balance)}
                </div>

                <div className="mt-5">
                  <div style={{ display: 'flex', justifyContent: 'center' }}>
                    <SegmentedControl
                      options={[
                        { value: 'out', label: '转出' },
                        { value: 'in', label: '转入' },
                      ]}
                      value={transferDirection}
                      onChange={(v) => setTransferDirection(v as TransferDirection)}
                    />
                  </div>

                  <div className="mt-4 stack" style={{ gap: 12 }}>
                    <label className="field">
                      <div className="fieldLabel">对方账户</div>
                      <select className="select" value={transferPeerId} onChange={(e) => setTransferPeerId(e.target.value)}>
                        <option value="">请选择</option>
                        {selectablePeers.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.name}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="field">
                      <div className="fieldLabel">金额</div>
                      <div className="relative">
                        <input
                          className="input"
                          inputMode="decimal"
                          placeholder="0.00"
                          value={transferAmount}
                          onChange={(e) => setTransferAmount(e.target.value)}
                          style={{ fontSize: 20, fontWeight: 900, paddingLeft: 24 }}
                        />
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted-text)] font-black">¥</span>
                      </div>
                    </label>
                  </div>

                  <motion.button
                    type="button"
                    onClick={submitTransfer}
                    whileTap={{ scale: 0.99 }}
                    className="mt-6 w-full h-14 rounded-[22px] bg-slate-900 text-white font-semibold text-[16px] shadow-sm"
                  >
                    完成
                  </motion.button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/*
        <div style={{ position: 'sticky', top: 0, zIndex: 6, background: 'var(--card)', paddingBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', position: 'relative' }}>
            <div>
              <div className="muted" style={{ fontSize: 12, fontWeight: 850 }}>当前余额</div>
              <div style={{ marginTop: 4 }}>
                <AnimatePresence mode="wait" initial={false}>
                  {action === 'set_balance' ? (
                    <motion.div
                      key="balanceInput"
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -6 }}
                      transition={{ duration: 0.16 }}
                    >
                      <input
                        ref={balanceInputRef}
                        className="input"
                        inputMode="decimal"
                        value={balanceValue}
                        onChange={(e) => setBalanceValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault()
                            e.stopPropagation()
                            submitSetBalance()
                            return
                          }
                          if (e.key === 'Escape') {
                            e.preventDefault()
                            e.stopPropagation()
                            cancelEdit()
                          }
                        }}
                        style={{
                          height: 46,
                          borderRadius: 16,
                          fontSize: 24,
                          fontWeight: 950,
                          padding: '0 14px',
                        }}
                        aria-label="edit balance"
                      />
                    </motion.div>
                  ) : (
                    <motion.button
                      key="balanceText"
                      type="button"
                      onClick={() => setAction('set_balance')}
                      className="text-left"
                      style={{
                        fontSize: 24,
                        fontWeight: 950,
                        padding: 0,
                        border: 'none',
                        background: 'transparent',
                        cursor: 'pointer',
                        color: 'var(--text)',
                      }}
                      whileTap={{ scale: 0.99 }}
                      whileHover={{ opacity: 0.85 }}
                      aria-label="edit balance"
                    >
                      {formatCny(account.balance)}
                    </motion.button>
                  )}
                </AnimatePresence>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {accountTypeInfo ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: 8,
                      background: accountTypeInfo.tone,
                      color: pickForegroundColor(accountTypeInfo.tone),
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {createElement(accountTypeInfo.opt.icon, { size: 14, strokeWidth: 2.5 })}
                  </div>
                  <div className="muted" style={{ fontSize: 13, fontWeight: 850 }}>
                    {accountTypeInfo.opt.name}
                  </div>
                </div>
              ) : (
                <div className="muted" style={{ fontSize: 13, fontWeight: 850 }}>
                  {account.type}
                </div>
              )}
              {action === 'set_balance' ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <motion.button
                    type="button"
                    className="iconBtn hover:bg-[var(--hairline)] transition-colors"
                    style={{ width: 38, height: 38 }}
                    onClick={cancelSetBalance}
                    whileTap={{ scale: 0.92 }}
                    aria-label="cancel"
                  >
                    <X size={18} strokeWidth={2.8} />
                  </motion.button>
                  <motion.button
                    type="button"
                    className="iconBtn iconBtnPrimary shadow-sm"
                    style={{ width: 38, height: 38 }}
                    onClick={submitSetBalance}
                    whileTap={{ scale: 0.92 }}
                    disabled={!canSubmitSetBalance}
                    aria-label="save"
                  >
                    <Check size={18} strokeWidth={2.8} />
                  </motion.button>
                </div>
              ) : (
                <motion.button
                  type="button"
                  className="iconBtn hover:bg-[var(--hairline)] transition-colors"
                  onClick={(e) => {
                    e.stopPropagation()
                    setMoreOpen((v) => !v)
                  }}
                  whileTap={{ scale: 0.92 }}
                  aria-label="more"
                >
                  <MoreHorizontal size={18} />
                </motion.button>
              )}
            </div>

            <AnimatePresence>
              {moreOpen ? (
                <motion.div
                  initial={{ opacity: 0, y: -6, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -6, scale: 0.98 }}
                  transition={{ duration: 0.16 }}
                  onClick={(e) => e.stopPropagation()}
                  style={{
                    position: 'absolute',
                    right: 0,
                    top: '100%',
                    marginTop: 10,
                    background: 'var(--card)',
                    border: '1px solid var(--hairline)',
                    borderRadius: 18,
                    padding: 6,
                    boxShadow: 'var(--shadow-hover)',
                    minWidth: 160,
                    zIndex: 10,
                  }}
                >
                  <button
                    type="button"
                    onClick={() => {
                      setMoreOpen(false)
                      setAction('rename')
                    }}
                    style={{
                      width: '100%',
                      borderRadius: 14,
                      padding: '10px 12px',
                      fontWeight: 900,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                    }}
                    className="hover:bg-[var(--bg)] transition-colors"
                  >
                    <Pencil size={16} strokeWidth={2.6} />
                    重命名
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setMoreOpen(false)
                      setAction('transfer')
                    }}
                    style={{
                      width: '100%',
                      borderRadius: 14,
                      padding: '10px 12px',
                      fontWeight: 900,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                    }}
                    className="hover:bg-[var(--bg)] transition-colors"
                  >
                    <ArrowLeftRight size={16} strokeWidth={2.6} />
                    转账
                  </button>

                  <div style={{ height: 1, background: 'var(--hairline)', margin: '4px 0' }} />

                  <button
                    type="button"
                    onClick={async () => {
                      setMoreOpen(false)
                      const ok = await confirm({
                        title: '删除账户',
                        message: `确定要删除账户「${account.name}」吗？此操作不可撤销。`,
                        confirmText: '删除',
                        cancelText: '取消',
                        tone: 'danger',
                      })
                      if (ok) {
                        onDelete(account.id)
                        onClose()
                      }
                    }}
                    style={{
                      width: '100%',
                      borderRadius: 14,
                      padding: '10px 12px',
                      fontWeight: 900,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      color: '#ef4444',
                    }}
                    className="hover:bg-red-50 transition-colors"
                  >
                    <Trash2 size={16} strokeWidth={2.6} />
                    删除账户
                  </button>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>

          <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
            {[
              { id: 'adjust', icon: Plus, label: '增减金额' },
              { id: 'set_balance', icon: Save, label: '修改余额' },
            ].map((item) => (
              <motion.button 
                key={item.id}
                type="button" 
                style={actionBtnStyle} 
                onClick={() => setAction(item.id as ActionId)}
                whileTap={{ scale: 0.95 }}
                whileHover={{ scale: 1.02, backgroundColor: 'var(--bg)' }}
                animate={action === item.id ? { borderColor: 'var(--primary)', color: 'var(--primary)', backgroundColor: 'rgba(91, 107, 255, 0.05)' } : {}}
              >
                <item.icon size={16} strokeWidth={2.6} />
                {item.label}
              </motion.button>
            ))}
          </div>
        </div>

        <AnimatePresence mode="wait">
          {action === 'rename' ? (
            <motion.div
              key="rename"
              className="stack"
              style={{ gap: 12 }}
              initial={{ opacity: 0, y: -6, height: 0 }}
              animate={{ opacity: 1, y: 0, height: 'auto' }}
              exit={{ opacity: 0, y: -6, height: 0 }}
              transition={{ duration: 0.16 }}
            >
              <label className="field">
                <div className="fieldLabel">账户名称</div>
                <input className="input" value={renameValue} onChange={(e) => setRenameValue(e.target.value)} autoFocus />
              </label>
              <motion.button type="button" className="primaryBtn" onClick={submitRename} whileTap={{ scale: 0.98 }}>
                保存
              </motion.button>
            </motion.div>
          ) : null}

          {action === 'adjust' ? (
            <motion.div
              key="adjust"
              className="stack"
              style={{ gap: 12 }}
              initial={{ opacity: 0, y: -6, height: 0 }}
              animate={{ opacity: 1, y: 0, height: 'auto' }}
              exit={{ opacity: 0, y: -6, height: 0 }}
              transition={{ duration: 0.16 }}
            >
              <div style={{ display: 'flex', justifyContent: 'center' }}>       
                <SegmentedControl
                  options={[
                    { value: 'plus', label: '增加' },
                    { value: 'minus', label: '减少' },
                  ]}
                  value={adjustDirection}
                  onChange={(v) => setAdjustDirection(v as AdjustDirection)}
                />
              </div>
              <label className="field">
                <div className="fieldLabel">金额</div>
                <div className="relative">
                  <input
                    className="input"
                    inputMode="decimal"
                    placeholder="0.00"
                    value={adjustAmount}
                    onChange={(e) => setAdjustAmount(e.target.value)}
                    style={{ fontSize: 20, fontWeight: 900, paddingLeft: 24 }}
                    autoFocus
                  />
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted-text)] font-black">¥</span>
                </div>
              </label>
              <motion.button type="button" className="primaryBtn" onClick={submitAdjust} whileTap={{ scale: 0.98 }}>
                保存
              </motion.button>
            </motion.div>
          ) : null}

          {action === 'transfer' ? (
            <motion.div
              key="transfer"
              className="stack"
              style={{ gap: 12 }}
              initial={{ opacity: 0, y: -6, height: 0 }}
              animate={{ opacity: 1, y: 0, height: 'auto' }}
              exit={{ opacity: 0, y: -6, height: 0 }}
              transition={{ duration: 0.16 }}
            >
              <div style={{ display: 'flex', justifyContent: 'center' }}>       
                <SegmentedControl
                  options={[
                    { value: 'out', label: '转出' },
                    { value: 'in', label: '转入' },
                  ]}
                  value={transferDirection}
                  onChange={(v) => setTransferDirection(v as TransferDirection)}
                />
              </div>

              <label className="field">
                <div className="fieldLabel">对方账户</div>
                <select className="select" value={transferPeerId} onChange={(e) => setTransferPeerId(e.target.value)}>
                  <option value="">请选择</option>
                  {selectablePeers.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="field">
                <div className="fieldLabel">金额</div>
                <div className="relative">
                  <input
                    className="input"
                    inputMode="decimal"
                    placeholder="0.00"
                    value={transferAmount}
                    onChange={(e) => setTransferAmount(e.target.value)}
                    style={{ fontSize: 20, fontWeight: 900, paddingLeft: 24 }}
                  />
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted-text)] font-black">¥</span>
                </div>
              </label>

              <motion.button type="button" className="primaryBtn" onClick={submitTransfer} whileTap={{ scale: 0.98 }}>
                保存
              </motion.button>
            </motion.div>
          ) : null}
        </AnimatePresence>

        <div style={{ height: 1, background: 'var(--hairline)', margin: '6px 0' }} />

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontWeight: 950, fontSize: 14 }}>操作记录</div>

          <div style={{ marginTop: 12, flex: 1 }}>
            {relatedOps.length === 0 ? (
              <div className="muted" style={{ fontSize: 13, fontWeight: 800, textAlign: 'center', padding: '14px 0' }}>
                暂无操作
              </div>
            ) : (
              <div className="stack" style={{ gap: 10 }}>
                {relatedOps.map((op, i) => {
                  let title = ''
                  let delta = 0
                  let after = account.balance

                  if (op.kind === 'rename') {
                    title = `重命名：${op.beforeName} → ${op.afterName}`
                    delta = 0
                    after = account.balance
                  }

                  if (op.kind === 'set_balance') {
                    title = '修改余额'
                    delta = op.after - op.before
                    after = op.after
                  }

                  if (op.kind === 'adjust') {
                    title = op.delta >= 0 ? '增加金额' : '减少金额'
                    delta = op.delta
                    after = op.after
                  }

                  if (op.kind === 'transfer') {
                    const from = byId.get(op.fromId)
                    const to = byId.get(op.toId)
                    if (account.id === op.fromId) {
                      title = `转出到 ${to?.name ?? '账户'}`
                      delta = op.fromAfter - op.fromBefore
                      after = op.fromAfter
                    } else {
                      title = `从 ${from?.name ?? '账户'} 转入`
                      delta = op.toAfter - op.toBefore
                      after = op.toAfter
                    }
                  }

                  return (
                    <motion.div
                      key={op.id}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.05 }}
                      style={{
                        border: '1px solid var(--hairline)',
                        borderRadius: 18,
                        background: 'rgba(255, 255, 255, 0.7)',
                        padding: 12,
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'baseline' }}>
                        <div style={{ fontWeight: 950, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {title}
                        </div>
                        <div
                          style={{
                            fontWeight: 950,
                            fontSize: 13,
                            color: delta > 0 ? '#47d16a' : delta < 0 ? '#ff6b57' : 'var(--muted-text)',
                          }}
                        >
                          {formatSigned(delta)}
                        </div>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginTop: 6 }}>
                        <div className="muted" style={{ fontSize: 11, fontWeight: 800 }}>
                          {formatTime(op.at)}
                        </div>
                        <div className="muted" style={{ fontSize: 11, fontWeight: 800 }}>
                          余额 {formatCny(after)}
                        </div>
                      </div>
                    </motion.div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
        */}
      </motion.div>
    </BottomSheet>
  )
}
