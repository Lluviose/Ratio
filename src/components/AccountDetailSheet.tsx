import { createElement, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { flushSync } from 'react-dom'
import { ArrowLeftRight, MoreHorizontal, Pencil, SlidersHorizontal, Trash2, X } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { BottomSheet } from './BottomSheet'
import { useOverlay } from '../lib/overlay'
import { addMoney, moneyEquals, normalizeMoney, subtractMoney } from '../lib/money'
import {
  appendMoneyExpressionOperator,
  evaluateMoneyExpression,
  type MoneyExpressionOperator,
} from '../lib/moneyExpression'
import { type Account, getAccountTypeOption } from '../lib/accounts'
import { applyAccountFlow, canApplyBalanceDelta, isNegativeAccountBalance } from '../lib/accountBalance'
import { buildLatestSetBalanceAtMap, buildOpRollbackPlan, canRollbackBalance } from '../lib/opRollback'
import { type ThemeColors } from '../lib/themes'
import type { AccountOp, AccountOpInput } from '../lib/accountOps'
import { formatCny, formatSigned, formatTime, normalizeNoteValue, toMoneyInputValue } from './accountDetail/format'
import { pageTransition, pageVariants } from './accountDetail/pageMotion'
import { OpsHistoryList } from './accountDetail/OpsHistoryList'
import { AdjustPage, type AdjustDirection } from './accountDetail/AdjustPage'
import { SetBalancePage } from './accountDetail/SetBalancePage'
import { RenamePage } from './accountDetail/RenamePage'
import { TransferPage, type TransferDirection } from './accountDetail/TransferPage'

type ActionId = 'none' | 'rename' | 'set_balance' | 'adjust' | 'transfer'

export function AccountDetailSheet(props: {
  open: boolean
  accountId: string | null
  accounts: Account[]
  ops: AccountOp[]
  initialAction?: ActionId
  sheetMotion?: 'slide' | 'morph'
  sheetLayoutId?: string
  onExitComplete?: () => void
  onClose: () => void
  onRename: (id: string, name: string) => void
  onSetBalance: (id: string, balance: number) => void
  onAdjust: (id: string, delta: number) => void
  onTransfer: (fromId: string, toId: string, amount: number) => void
  onDelete: (id: string) => void
  onAddOp: (op: AccountOpInput) => void
  onDeleteOp: (id: string) => void
  onUpdateOp: (id: string, next: AccountOp) => void
  colors: ThemeColors
}) {
  const {
    open,
    accountId,
    accounts,
    ops,
    initialAction,
    sheetMotion,
    sheetLayoutId,
    onExitComplete,
    onClose,
    onRename,
    onSetBalance,
    onAdjust,
    onTransfer,
    onDelete,
    onAddOp,
    onDeleteOp,
    onUpdateOp,
    colors,
  } = props

  const isMorph = sheetMotion === 'morph' && Boolean(sheetLayoutId)

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
  const [editingOpId, setEditingOpId] = useState<string | null>(null)
  const [swipedOpId, setSwipedOpId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [balanceValue, setBalanceValue] = useState('')
  const [noteValue, setNoteValue] = useState('')
  const balanceInputRef = useRef<HTMLInputElement | null>(null)
  const adjustInputRef = useRef<HTMLInputElement | null>(null)
  const transferInputRef = useRef<HTMLInputElement | null>(null)
  const suppressOpClickRef = useRef(false)
  const suppressActionClickRef = useRef(false)
  const openedAtRef = useRef<number | null>(null)
  const initKeyRef = useRef<string | null>(null)
  const [adjustDirection, setAdjustDirection] = useState<AdjustDirection>('plus')
  const [adjustAmount, setAdjustAmount] = useState('')
  const [transferDirection, setTransferDirection] = useState<TransferDirection>('out')
  const [transferPeerId, setTransferPeerId] = useState('')
  const [transferAmount, setTransferAmount] = useState('')
  const isIPhone = typeof navigator !== 'undefined' && /iPhone/i.test(navigator.userAgent)
  const amountInputProps = isIPhone
    ? ({
        type: 'tel',
        inputMode: 'tel',
        pattern: '[0-9.]*',
        enterKeyHint: 'done',
        autoComplete: 'one-time-code',
        autoCorrect: 'off',
        spellCheck: false,
      } as const)
    : ({ inputMode: 'decimal', enterKeyHint: 'done', autoComplete: 'off' } as const)
  const expressionInputProps = isIPhone
    ? ({
        type: 'tel',
        inputMode: 'tel',
        pattern: '[0-9+\\-.]*',
        enterKeyHint: 'done',
        autoComplete: 'one-time-code',
        autoCorrect: 'off',
        spellCheck: false,
      } as const)
    : ({
        inputMode: 'decimal',
        enterKeyHint: 'done',
        autoComplete: 'off',
        autoCorrect: 'off',
        spellCheck: false,
      } as const)

  const focusAmountInput = useCallback((input: HTMLInputElement | null, selectText = true) => {
    if (!input) return
    try {
      input.focus({ preventScroll: true })
    } catch {
      input.focus()
    }
    if (!selectText) return
    try {
      input.select()
    } catch {
      const pos = input.value.length
      input.setSelectionRange(pos, pos)
    }
  }, [])

  const handleClosePointerDown = (e: ReactPointerEvent) => {
    e.preventDefault()
    e.stopPropagation()
    onClose()
  }

  const transitionToAction = (nextAction: ActionId) => {
    if (nextAction === action) return
    setMoreOpen(false)
    setSwipedOpId(null)

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

  const openAdjustAction = () => {
    flushSync(() => {
      setMoreOpen(false)
      setNoteValue('')
      setAdjustDirection('plus')
      setAdjustAmount('')
      transitionToAction('adjust')
    })
    focusAmountInput(adjustInputRef.current)
  }

  const openSetBalanceAction = () => {
    flushSync(() => {
      setMoreOpen(false)
      setNoteValue('')
      setBalanceValue('')
      transitionToAction('set_balance')
    })
    focusAmountInput(balanceInputRef.current)
  }

  const handleActionPointerDown = (e: ReactPointerEvent, openAction: () => void) => {
    if (e.pointerType === 'mouse') return

    e.preventDefault()
    e.stopPropagation()
    suppressActionClickRef.current = true
    window.setTimeout(() => {
      suppressActionClickRef.current = false
    }, 500)
    openAction()
  }

  const handleActionClick = (openAction: () => void) => {
    if (suppressActionClickRef.current) {
      suppressActionClickRef.current = false
      return
    }
    openAction()
  }

  useLayoutEffect(() => {
    if (!open) {
      initKeyRef.current = null
      setAction('none')
      setPageDir(0)
      setSuppressOpsIntro(false)
      setMoreOpen(false)
      setEditingOpId(null)
      setSwipedOpId(null)
      setBalanceValue('')
      setAdjustAmount('')
      setNoteValue('')
      suppressActionClickRef.current = false
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
    setEditingOpId(null)
    setSwipedOpId(null)
    setRenameValue(account.name)
    setBalanceValue('')
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

  useLayoutEffect(() => {
    if (!open) return
    if (action !== 'set_balance' && action !== 'adjust') return
    setMoreOpen(false)
    const el = action === 'set_balance' ? balanceInputRef.current : adjustInputRef.current
    focusAmountInput(el)
  }, [action, focusAmountInput, open])

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
      focusAmountInput(el)
    }, delay)
    return () => window.clearTimeout(timer)
  }, [action, focusAmountInput, open])

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

  const shouldStaggerOpsIntro = !suppressOpsIntro && relatedOps.length <= 12

  const latestSetBalanceAtByAccountId = useMemo(() => buildLatestSetBalanceAtMap(ops), [ops])

  const editingOp = useMemo(() => {
    if (!editingOpId) return null
    return ops.find((op) => op.id === editingOpId) ?? null
  }, [editingOpId, ops])

  useEffect(() => {
    if (editingOpId && !editingOp) setEditingOpId(null)
  }, [editingOp, editingOpId])

  const canRollbackFor = (targetAccountId: string, at: string) =>
    canRollbackBalance(latestSetBalanceAtByAccountId, targetAccountId, at)

  const setBalanceInputNode = useCallback((node: HTMLInputElement | null) => {
    balanceInputRef.current = node
    if (node && open && action === 'set_balance') focusAmountInput(node)
  }, [action, focusAmountInput, open])

  if (!account)
    return (
      <BottomSheet
        open={open}
        title="账户"
        onClose={onClose}
        sheetMotion={sheetMotion}
        sheetLayoutId={sheetLayoutId}
        onExitComplete={onExitComplete}
      >
        <div className="muted" style={{ fontSize: 13, fontWeight: 600, textAlign: 'center', padding: 40 }}>
          未找到账户
        </div>
      </BottomSheet>
    )

  const editingSetBalanceOp = editingOp?.kind === 'set_balance' ? editingOp : null
  const editingAdjustOp = editingOp?.kind === 'adjust' ? editingOp : null
  const editingTransferOp = editingOp?.kind === 'transfer' ? editingOp : null
  const nextNote = normalizeNoteValue(noteValue)
  const canApplySetBalanceDiff = editingSetBalanceOp ? canRollbackFor(editingSetBalanceOp.accountId, editingSetBalanceOp.at) : true
  const canApplyAdjustDiff = editingAdjustOp ? canRollbackFor(editingAdjustOp.accountId, editingAdjustOp.at) : true

  const refocusActiveInput = () => {
    const el =
      action === 'set_balance'
        ? balanceInputRef.current
        : action === 'adjust'
          ? adjustInputRef.current
          : action === 'transfer'
            ? transferInputRef.current
            : null
    if (!el) return
    focusAmountInput(el)
  }

  const focusInputAtEnd = (input: HTMLInputElement | null) => {
    if (!input || typeof window === 'undefined') return
    window.requestAnimationFrame(() => {
      input.focus()
      const pos = input.value.length
      input.setSelectionRange(pos, pos)
    })
  }

  const appendBalanceOperator = (operator: MoneyExpressionOperator) => {
    setBalanceValue((value) => appendMoneyExpressionOperator(value, operator))
    focusInputAtEnd(balanceInputRef.current)
  }

  const clearBalanceExpression = () => {
    setBalanceValue('')
    focusInputAtEnd(balanceInputRef.current)
  }

  const appendTransferOperator = (operator: MoneyExpressionOperator) => {
    setTransferAmount((value) => appendMoneyExpressionOperator(value, operator))
    focusInputAtEnd(transferInputRef.current)
  }

  const clearTransferExpression = () => {
    setTransferAmount('')
    focusInputAtEnd(transferInputRef.current)
  }

  const cancelEdit = () => {
    setMoreOpen(false)
    balanceInputRef.current?.blur()
    adjustInputRef.current?.blur()
    setEditingOpId(null)
    setSwipedOpId(null)
    setRenameValue(account.name)
    setBalanceValue('')
    setNoteValue('')
    setAdjustDirection('plus')
    setAdjustAmount('')
    setTransferDirection('out')
    setTransferPeerId('')
    setTransferAmount('')
    transitionToAction('none')
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
    const evaluated = evaluateMoneyExpression(balanceValue)
    if (!balanceValue.trim() || !evaluated.ok) {
      toast('请输入正确余额', { tone: 'danger' })
      refocusActiveInput()
      return
    }

    const num = evaluated.value
    if (isNegativeAccountBalance(num)) {
      toast('余额不能为负', { tone: 'danger' })
      refocusActiveInput()
      return
    }

    if (editingSetBalanceOp) {
      if (moneyEquals(num, editingSetBalanceOp.after) && nextNote === editingSetBalanceOp.note) {
        balanceInputRef.current?.blur()
        setEditingOpId(null)
        transitionToAction('none')
        return
      }

      const canApply = canRollbackFor(editingSetBalanceOp.accountId, editingSetBalanceOp.at)
      const diff = subtractMoney(num, editingSetBalanceOp.after)
      if (canApply && !canApplyBalanceDelta(account.balance, diff)) {
        toast('保存后余额不能为负', { tone: 'danger' })
        refocusActiveInput()
        return
      }
      if (canApply && diff !== 0) onAdjust(editingSetBalanceOp.accountId, diff)

      onUpdateOp(editingSetBalanceOp.id, { ...editingSetBalanceOp, after: num, note: nextNote })
      toast(canApply ? '已保存' : '已保存（余额未变）', { tone: canApply ? 'success' : 'neutral' })

      balanceInputRef.current?.blur()
      setNoteValue('')
      setEditingOpId(null)
      transitionToAction('none')
      return
    }

    if (moneyEquals(num, account.balance)) {
      balanceInputRef.current?.blur()
      transitionToAction('none')
      return
    }

    onAddOp({
      kind: 'set_balance',
      at: new Date().toISOString(),
      accountType: account.type,
      accountId: account.id,
      before: normalizeMoney(account.balance),
      after: num,
      note: nextNote,
    })
    onSetBalance(account.id, num)
    balanceInputRef.current?.blur()
    setNoteValue('')
    transitionToAction('none')
  }

  const submitAdjust = () => {
    const raw = adjustAmount.trim()
    const parsed = Number(raw)
    const num = normalizeMoney(parsed)
    if (!raw || !Number.isFinite(parsed) || num <= 0) {
      toast('请输入正确金额', { tone: 'danger' })
      refocusActiveInput()
      return
    }

    const delta = adjustDirection === 'plus' ? num : -num

    if (editingAdjustOp) {
      if (moneyEquals(delta, editingAdjustOp.delta) && nextNote === editingAdjustOp.note) {
        adjustInputRef.current?.blur()
        setEditingOpId(null)
        transitionToAction('none')
        return
      }

      const canApply = canRollbackFor(editingAdjustOp.accountId, editingAdjustOp.at)
      const diff = subtractMoney(delta, editingAdjustOp.delta)
      if (canApply && !canApplyBalanceDelta(account.balance, diff)) {
        toast('操作后余额不能为负', { tone: 'danger' })
        refocusActiveInput()
        return
      }
      if (canApply && diff !== 0) onAdjust(editingAdjustOp.accountId, diff)

      onUpdateOp(editingAdjustOp.id, { ...editingAdjustOp, delta, after: addMoney(editingAdjustOp.before, delta), note: nextNote })
      toast(canApply ? '已保存' : '已保存（余额未变）', { tone: canApply ? 'success' : 'neutral' })

      setAdjustAmount('')
      setNoteValue('')
      adjustInputRef.current?.blur()
      setEditingOpId(null)
      transitionToAction('none')
      return
    }

    const after = addMoney(account.balance, delta)
    if (isNegativeAccountBalance(after)) {
      toast('操作后余额不能为负', { tone: 'danger' })
      refocusActiveInput()
      return
    }

    onAddOp({
      kind: 'adjust',
      at: new Date().toISOString(),
      accountType: account.type,
      accountId: account.id,
      delta,
      before: normalizeMoney(account.balance),
      after,
      note: nextNote,
    })
    onAdjust(account.id, delta)
    setAdjustAmount('')
    setNoteValue('')
    adjustInputRef.current?.blur()
    transitionToAction('none')
  }

  const submitTransfer = () => {
    if (editingTransferOp) {
      const evaluated = evaluateMoneyExpression(transferAmount)
      const num = evaluated.ok ? evaluated.value : 0
      if (!evaluated.ok || num <= 0) {
        toast('请输入正确金额', { tone: 'danger' })
        refocusActiveInput()
        return
      }
      if (moneyEquals(num, editingTransferOp.amount)) {
        setTransferAmount('')
        setTransferPeerId('')
        setEditingOpId(null)
        transitionToAction('none')
        return
      }

      const from = byId.get(editingTransferOp.fromId)
      const to = byId.get(editingTransferOp.toId)
      if (!from || !to) {
        toast('账户不存在', { tone: 'danger' })
        return
      }

      const fromBefore = normalizeMoney(editingTransferOp.fromBefore)
      const toBefore = normalizeMoney(editingTransferOp.toBefore)
      const nextFromAfter = applyAccountFlow(from.type, fromBefore, -num)
      const nextToAfter = applyAccountFlow(to.type, toBefore, num)
      if (isNegativeAccountBalance(nextFromAfter) || isNegativeAccountBalance(nextToAfter)) {
        toast('转账后余额不能为负', { tone: 'danger' })
        return
      }

      const diffFrom = subtractMoney(nextFromAfter, normalizeMoney(editingTransferOp.fromAfter))
      const diffTo = subtractMoney(nextToAfter, normalizeMoney(editingTransferOp.toAfter))

      const canApplyFrom = canRollbackFor(editingTransferOp.fromId, editingTransferOp.at)
      const canApplyTo = canRollbackFor(editingTransferOp.toId, editingTransferOp.at)
      if (
        (canApplyFrom && !canApplyBalanceDelta(from.balance, diffFrom)) ||
        (canApplyTo && !canApplyBalanceDelta(to.balance, diffTo))
      ) {
        toast('保存后余额不能为负', { tone: 'danger' })
        return
      }
      if (canApplyFrom && diffFrom !== 0) onAdjust(editingTransferOp.fromId, diffFrom)
      if (canApplyTo && diffTo !== 0) onAdjust(editingTransferOp.toId, diffTo)

      onUpdateOp(editingTransferOp.id, {
        ...editingTransferOp,
        amount: num,
        fromAfter: nextFromAfter,
        toAfter: nextToAfter,
      })
      toast(canApplyFrom && canApplyTo ? '已保存' : '已保存（部分余额未变）', { tone: canApplyFrom && canApplyTo ? 'success' : 'neutral' })

      setTransferAmount('')
      setTransferPeerId('')
      setEditingOpId(null)
      transitionToAction('none')
      return
    }

    if (!transferPeerId) {
      toast('请选择账户', { tone: 'danger' })
      return
    }
    const peer = byId.get(transferPeerId)
    if (!peer) {
      toast('账户不存在', { tone: 'danger' })
      return
    }

    const evaluated = evaluateMoneyExpression(transferAmount)
    const num = evaluated.ok ? evaluated.value : 0
    if (!evaluated.ok || num <= 0) {
      toast('请输入正确金额', { tone: 'danger' })
      refocusActiveInput()
      return
    }

    const from = transferDirection === 'out' ? account : peer
    const to = transferDirection === 'out' ? peer : account

    const fromBefore = normalizeMoney(from.balance)
    const toBefore = normalizeMoney(to.balance)
    const fromAfter = applyAccountFlow(from.type, fromBefore, -num)
    const toAfter = applyAccountFlow(to.type, toBefore, num)
    if (isNegativeAccountBalance(fromAfter) || isNegativeAccountBalance(toAfter)) {
      toast('转账后余额不能为负', { tone: 'danger' })
      return
    }

    onAddOp({
      kind: 'transfer',
      at: new Date().toISOString(),
      accountType: account.type,
      fromId: from.id,
      toId: to.id,
      amount: num,
      fromBefore,
      fromAfter,
      toBefore,
      toAfter,
    })
    onTransfer(from.id, to.id, num)
    setTransferAmount('')
    setTransferPeerId('')
    transitionToAction('none')
  }

  const startEditOp = (op: AccountOp) => {
    if (op.kind === 'set_balance') {
      setEditingOpId(op.id)
      setNoteValue(op.note ?? '')
      setBalanceValue(toMoneyInputValue(op.after))
      transitionToAction('set_balance')
      return
    }

    if (op.kind === 'adjust') {
      setEditingOpId(op.id)
      setNoteValue(op.note ?? '')
      setAdjustDirection(op.delta >= 0 ? 'plus' : 'minus')
      setAdjustAmount(toMoneyInputValue(Math.abs(op.delta)))
      transitionToAction('adjust')
      return
    }

    if (op.kind === 'transfer') {
      const direction = account.id === op.fromId ? 'out' : 'in'
      const peerId = direction === 'out' ? op.toId : op.fromId
      setEditingOpId(op.id)
      setNoteValue('')
      setTransferDirection(direction)
      setTransferPeerId(peerId)
      setTransferAmount(toMoneyInputValue(op.amount))
      transitionToAction('transfer')
    }
  }

  const confirmDeleteOp = async (op: AccountOp, title: string) => {
    const getAccountName = (id: string) => byId.get(id)?.name ?? '账户'
    const rollbackTargets = buildOpRollbackPlan(op, {
      latestSetBalanceAtByAccountId,
      getAccountBalance: (id) => byId.get(id)?.balance,
    })

    const affectedCount = rollbackTargets.length
    const willRollback = rollbackTargets.filter((t) => t.canRollback && t.delta !== 0)
    const willRollbackCount = willRollback.length

    const noRollbackHint =
      affectedCount > 1
        ? '；其中部分账户余额不变（后续校准或余额不足）'
        : '；余额不变（后续校准或余额不足）'

    const rollbackSummary =
      willRollbackCount > 0
        ? `将回滚：${willRollback.map((t) => `${getAccountName(t.accountId)} ${formatSigned(t.delta)}`).join('；')}${
            willRollbackCount < affectedCount ? noRollbackHint : ''
          }`
        : '余额不会变化（后续校准或余额不足）'

    const confirmTitle =
      op.kind === 'transfer'
        ? '删除这条转账记录？'
        : op.kind === 'set_balance'
          ? '删除这条修改余额记录？'
          : op.kind === 'adjust'
            ? '删除这条期间变动记录？'
            : '删除这条记录？'

    const ok = await confirm({
      title: confirmTitle,
      message: `${title}（${formatTime(op.at)}）；${rollbackSummary}`,
      confirmText: willRollbackCount > 0 ? '删除并回滚' : '仅删除记录',
      cancelText: '取消',
      tone: 'danger',
    })
    if (!ok) return

    const rolledBackAccountIds: string[] = []
    for (const t of rollbackTargets) {
      if (!t.canRollback) continue
      if (t.delta === 0) continue
      onAdjust(t.accountId, t.delta)
      rolledBackAccountIds.push(t.accountId)
    }

    onDeleteOp(op.id)
    setSwipedOpId(null)

    const rolledBackCount = rolledBackAccountIds.length
    const toastMessage =
      rolledBackCount === 0
        ? '已删除记录（余额未变）'
        : rolledBackCount === affectedCount
          ? '已删除并回滚余额'
          : '已删除，已回滚部分余额'
    const tone = rolledBackCount === 0 ? 'neutral' : 'success'
    toast(toastMessage, { tone })
  }

  const TypeIcon = accountTypeInfo?.opt.icon

  return (
    <BottomSheet
      open={open}
      title={account.name}
      onClose={onClose}
      hideHandle
      sheetMotion={sheetMotion}
      sheetLayoutId={sheetLayoutId}
      onExitComplete={onExitComplete}
      sheetStyle={{ maxHeight: '92vh', background: 'var(--bg)' }}
      bodyStyle={{ padding: 0 }}
      header={
        <motion.div
          className="px-4 pt-5 pb-3 flex items-center justify-between"
          style={{ background: 'var(--bg)' }}
          initial={isMorph ? { opacity: 0 } : false}
          animate={{
            opacity: 1,
            transition: { duration: 0.18, delay: isMorph ? 0.03 : 0, ease: [0.16, 1, 0.3, 1] },
          }}
          exit={{ opacity: 0, transition: { duration: isMorph ? 0.1 : 0.14, ease: [0.16, 1, 0.3, 1] } }}
        >
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
                        initial={{ opacity: 0, y: -8, scale: 0.92 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -6, scale: 0.96, transition: { duration: 0.13, ease: [0.4, 0, 1, 1] } }}
                        transition={{ type: 'spring', stiffness: 560, damping: 38, mass: 0.7 }}
                        style={{ transformOrigin: 'top right' }}
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
        </motion.div>
      }
    >
      <motion.div
        className="flex flex-col"
        style={{ minHeight: '72vh' }}
        initial={isMorph ? { opacity: 0 } : { opacity: 0, y: 10 }}
        animate={{
          opacity: 1,
          y: 0,
          transition: { duration: isMorph ? 0.18 : 0.22, delay: isMorph ? 0.06 : 0.06, ease: [0.16, 1, 0.3, 1] },
        }}
        exit={{ opacity: 0, y: isMorph ? 0 : 10, transition: { duration: isMorph ? 0.12 : 0.14, ease: [0.16, 1, 0.3, 1] } }}
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

          <AnimatePresence mode="popLayout" initial={false}>
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
                <motion.div
                  key={`balance-${account.balance}`}
                  className="mt-4 text-[34px] font-black tracking-tight text-slate-900"
                  initial={{ opacity: 0, y: 8, scale: 0.99 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ type: 'spring', stiffness: 480, damping: 36, mass: 0.8 }}
                >
                  {formatCny(account.balance)}
                </motion.div>

                <div className="mt-5 flex gap-3">
                  <motion.button
                    type="button"
                    aria-label="adjust balance action"
                    onPointerDown={(e) => handleActionPointerDown(e, openAdjustAction)}
                    onClick={() => handleActionClick(openAdjustAction)}
                    whileTap={{ scale: 0.965, y: 1 }}
                    transition={{ type: 'spring', stiffness: 700, damping: 40, mass: 0.6 }}
                    className="flex-1 h-12 rounded-full bg-white/80 border border-white/70 text-slate-900 font-semibold shadow-sm"
                  >
                    期间增减
                  </motion.button>
                  <motion.button
                    type="button"
                    aria-label="set balance action"
                    onPointerDown={(e) => handleActionPointerDown(e, openSetBalanceAction)}
                    onClick={() => handleActionClick(openSetBalanceAction)}
                    whileTap={{ scale: 0.965, y: 1 }}
                    transition={{ type: 'spring', stiffness: 700, damping: 40, mass: 0.6 }}
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

                <OpsHistoryList
                  account={account}
                  relatedOps={relatedOps}
                  getAccountName={(id) => byId.get(id)?.name}
                  shouldStaggerOpsIntro={shouldStaggerOpsIntro}
                  swipedOpId={swipedOpId}
                  setSwipedOpId={setSwipedOpId}
                  suppressOpClickRef={suppressOpClickRef}
                  onEditOp={startEditOp}
                  onDeleteOp={(op, title) => {
                    void confirmDeleteOp(op, title)
                  }}
                />
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
                <AdjustPage
                  account={account}
                  editingOp={editingAdjustOp}
                  direction={adjustDirection}
                  amount={adjustAmount}
                  note={noteValue}
                  canApplyDiff={canApplyAdjustDiff}
                  amountInputProps={amountInputProps}
                  inputRef={adjustInputRef}
                  onChangeAmount={setAdjustAmount}
                  onChangeNote={setNoteValue}
                  onChangeDirection={setAdjustDirection}
                  onSubmit={submitAdjust}
                  onCancel={cancelEdit}
                />
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
                <SetBalancePage
                  account={account}
                  editingOp={editingSetBalanceOp}
                  value={balanceValue}
                  note={noteValue}
                  canApplyDiff={canApplySetBalanceDiff}
                  expressionInputProps={expressionInputProps}
                  inputRef={setBalanceInputNode}
                  onChangeValue={setBalanceValue}
                  onChangeNote={setNoteValue}
                  onOperator={appendBalanceOperator}
                  onClearExpression={clearBalanceExpression}
                  onSubmit={submitSetBalance}
                  onCancel={cancelEdit}
                />
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
                <RenamePage
                  account={account}
                  value={renameValue}
                  onChange={setRenameValue}
                  onSubmit={submitRename}
                  onCancel={cancelEdit}
                />
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
                <TransferPage
                  account={account}
                  editingOp={editingTransferOp}
                  direction={transferDirection}
                  peerId={transferPeerId}
                  amount={transferAmount}
                  selectablePeers={selectablePeers}
                  expressionInputProps={expressionInputProps}
                  inputRef={transferInputRef}
                  onChangeDirection={setTransferDirection}
                  onChangePeer={setTransferPeerId}
                  onChangeAmount={setTransferAmount}
                  onOperator={appendTransferOperator}
                  onClearExpression={clearTransferExpression}
                  onSubmit={submitTransfer}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>


      </motion.div>
    </BottomSheet>
  )
}
