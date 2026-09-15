import { createElement, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { flushSync } from 'react-dom'
import { Archive, ArchiveRestore, ArrowLeftRight, MoreHorizontal, Pencil, SlidersHorizontal, Trash2, X } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { BottomSheet } from './BottomSheet'
import { useOverlay } from '../lib/overlay'
import { addMoney, moneyEquals, normalizeMoney, subtractMoney } from '../lib/money'
import {
  appendMoneyExpressionOperator,
  evaluateMoneyExpression,
  type MoneyExpressionOperator,
} from '../lib/moneyExpression'
import { type Account, type AccountTypeId, getAccountTypeOption } from '../lib/accounts'
import { formatDateKey, isItemAccountType, normalizeStoredDateKey, todayDateKey } from '../lib/accountCost'
import { hapticSuccess } from '../lib/haptics'
import { applyAccountFlow, canApplyBalanceDelta, isNegativeAccountBalance } from '../lib/accountBalance'
import { buildLatestSetBalanceAtMap, buildOpRollbackPlan, canRollbackBalance } from '../lib/opRollback'
import { type ThemeColors } from '../lib/themes'
import type { AccountOp, AccountOpInput } from '../lib/accountOps'
import { formatCny, formatSigned, formatTime, normalizeNoteValue, toDatetimeLocalValue, toMoneyInputValue } from './accountDetail/format'
import { pageTransition, pageVariants } from './accountDetail/pageMotion'
import { OpsHistoryList } from './accountDetail/OpsHistoryList'
import { AdjustPage, type AdjustDirection } from './accountDetail/AdjustPage'
import { SetBalancePage } from './accountDetail/SetBalancePage'
import { RenamePage } from './accountDetail/RenamePage'
import { NEW_ITEM_PEER_ID, TransferPage, type TransferDirection } from './accountDetail/TransferPage'
import { RevaluePage, type RevalueDirection } from './accountDetail/RevaluePage'
import { SetCostPage } from './accountDetail/SetCostPage'
import { ItemValueCard } from './accountDetail/ItemValueCard'

type ActionId = 'none' | 'rename' | 'set_balance' | 'adjust' | 'transfer' | 'revalue' | 'set_cost'

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
  // 物品原值/购入日期（固定资产分组）；可选：不传则详情页不显示原值区
  onSetItemCost?: (id: string, cost: number, acquiredAt?: string) => void
  // 转出时新建物品作为转入方：返回新建账户（net 由随后的转账带入）
  onCreateItem?: (input: { type: AccountTypeId; name?: string; cost: number; net: number; acquiredAt?: string }) => Account
  onArchive?: (id: string) => void
  onUnarchive?: (id: string) => void
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
    onSetItemCost,
    onCreateItem,
    onArchive,
    onUnarchive,
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
  // 新建记录的「记录时间」（datetime-local 取值，本地时区分钟精度）。
  // 初始值是打开动作页的时刻；提交时未改动则仍用精确的当前时刻（保持既有行为与排序精度）。
  const [recordTimeValue, setRecordTimeValue] = useState('')
  const [recordTimeInitValue, setRecordTimeInitValue] = useState('')
  const balanceInputRef = useRef<HTMLInputElement | null>(null)
  const adjustInputRef = useRef<HTMLInputElement | null>(null)
  const revalueInputRef = useRef<HTMLInputElement | null>(null)
  const costInputRef = useRef<HTMLInputElement | null>(null)
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
  const [newItemType, setNewItemType] = useState<AccountTypeId>('other_fixed')
  const [newItemName, setNewItemName] = useState('')
  // 物品：减值/增值 与 原值 两个动作页的输入态
  const [revalueDirection, setRevalueDirection] = useState<RevalueDirection>('down')
  const [revalueAmount, setRevalueAmount] = useState('')
  const [costValue, setCostValue] = useState('')
  const [acquiredAtValue, setAcquiredAtValue] = useState('')
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

  const resetRecordTime = useCallback(() => {
    const nowValue = toDatetimeLocalValue(new Date())
    setRecordTimeInitValue(nowValue)
    setRecordTimeValue(nowValue)
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
      resetRecordTime()
      transitionToAction('adjust')
    })
    focusAmountInput(adjustInputRef.current)
  }

  const openSetBalanceAction = () => {
    flushSync(() => {
      setMoreOpen(false)
      setNoteValue('')
      setBalanceValue('')
      resetRecordTime()
      transitionToAction('set_balance')
    })
    focusAmountInput(balanceInputRef.current)
  }

  const openRevalueAction = () => {
    flushSync(() => {
      setMoreOpen(false)
      setNoteValue('')
      setRevalueDirection('down')
      setRevalueAmount('')
      resetRecordTime()
      transitionToAction('revalue')
    })
    focusAmountInput(revalueInputRef.current)
  }

  const openSetCostAction = () => {
    if (!account) return
    flushSync(() => {
      setMoreOpen(false)
      setNoteValue('')
      setCostValue(account.cost != null ? toMoneyInputValue(account.cost) : '')
      setAcquiredAtValue(account.acquiredAt ?? '')
      transitionToAction('set_cost')
    })
    focusAmountInput(costInputRef.current)
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
      setRevalueAmount('')
      setCostValue('')
      setAcquiredAtValue('')
      setNoteValue('')
      setRecordTimeInitValue('')
      setRecordTimeValue('')
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
    resetRecordTime()
    setAdjustDirection('plus')
    setAdjustAmount('')
    setRevalueDirection('down')
    setRevalueAmount('')
    setCostValue('')
    setAcquiredAtValue('')
    setTransferDirection('out')
    setTransferPeerId('')
    setTransferAmount('')
    setNewItemType('other_fixed')
    setNewItemName('')
  }, [account, accountId, initialAction, open, resetRecordTime])

  useEffect(() => {
    if (!open) {
      openedAtRef.current = null
      return
    }
    openedAtRef.current = performance.now()
  }, [open])

  const amountInputRefFor = useCallback(
    (target: ActionId): HTMLInputElement | null => {
      if (target === 'set_balance') return balanceInputRef.current
      if (target === 'adjust') return adjustInputRef.current
      if (target === 'revalue') return revalueInputRef.current
      if (target === 'set_cost') return costInputRef.current
      return null
    },
    [],
  )
  const isAmountAction = action === 'set_balance' || action === 'adjust' || action === 'revalue' || action === 'set_cost'

  useLayoutEffect(() => {
    if (!open) return
    if (!isAmountAction) return
    setMoreOpen(false)
    focusAmountInput(amountInputRefFor(action))
  }, [action, amountInputRefFor, focusAmountInput, isAmountAction, open])

  useEffect(() => {
    if (!open) return
    if (!isAmountAction) return
    setMoreOpen(false)
    const openedAt = openedAtRef.current
    const openingMs = 280
    const elapsed = openedAt == null ? Number.POSITIVE_INFINITY : performance.now() - openedAt
    const delay = elapsed < openingMs ? Math.max(0, openingMs - elapsed) : 0

    const timer = window.setTimeout(() => {
      const el = amountInputRefFor(action)
      if (!el) return
      focusAmountInput(el)
    }, delay)
    return () => window.clearTimeout(timer)
  }, [action, amountInputRefFor, focusAmountInput, isAmountAction, open])

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
    return accounts.filter((a) => a.id !== accountId && !a.archivedAt)
  }, [accountId, accounts])

  const relatedOps = useMemo(() => {
    if (!accountId) return []
    return ops
      .filter((op) => {
        if (op.kind === 'rename') return op.accountId === accountId
        if (op.kind === 'set_balance') return op.accountId === accountId
        if (op.kind === 'adjust') return op.accountId === accountId
        if (op.kind === 'revalue') return op.accountId === accountId
        if (op.kind === 'set_cost') return op.accountId === accountId
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
        sheetClassName="sheet--solid"
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
  const editingRevalueOp = editingOp?.kind === 'revalue' ? editingOp : null
  const editingTransferOp = editingOp?.kind === 'transfer' ? editingOp : null
  const isItem = isItemAccountType(account.type)
  const balanceWord = isItem ? '净值' : '余额'
  const nextNote = normalizeNoteValue(noteValue)

  // 新建记录的记录时间预览：未改动/无效 → null（视为当前时刻）；改动 → 解析为 ISO
  const customRecordAt = (() => {
    const trimmed = recordTimeValue.trim()
    if (!trimmed || trimmed === recordTimeInitValue) return null
    const parsed = new Date(trimmed)
    if (Number.isNaN(parsed.getTime())) return null
    return parsed.toISOString()
  })()
  const recordTimeMax = toDatetimeLocalValue(new Date())
  // 新建时按所选记录时间预判可否改余额：回溯到最近一次「修改余额」校准之前 → 仅记录
  const canApplyNewRecord = canRollbackFor(account.id, customRecordAt ?? new Date().toISOString())
  const canApplySetBalanceDiff = editingSetBalanceOp
    ? canRollbackFor(editingSetBalanceOp.accountId, editingSetBalanceOp.at)
    : canApplyNewRecord
  const canApplyAdjustDiff = editingAdjustOp
    ? canRollbackFor(editingAdjustOp.accountId, editingAdjustOp.at)
    : canApplyNewRecord
  const canApplyRevalueDiff = editingRevalueOp
    ? canRollbackFor(editingRevalueOp.accountId, editingRevalueOp.at)
    : canApplyNewRecord

  const refocusActiveInput = () => {
    const el = action === 'transfer' ? transferInputRef.current : amountInputRefFor(action)
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

  const appendCostOperator = (operator: MoneyExpressionOperator) => {
    setCostValue((value) => appendMoneyExpressionOperator(value, operator))
    focusInputAtEnd(costInputRef.current)
  }

  const clearCostExpression = () => {
    setCostValue('')
    focusInputAtEnd(costInputRef.current)
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
    revalueInputRef.current?.blur()
    costInputRef.current?.blur()
    setEditingOpId(null)
    setSwipedOpId(null)
    setRenameValue(account.name)
    setBalanceValue('')
    setNoteValue('')
    setAdjustDirection('plus')
    setAdjustAmount('')
    setRevalueDirection('down')
    setRevalueAmount('')
    setCostValue('')
    setAcquiredAtValue('')
    setTransferDirection('out')
    setTransferPeerId('')
    setTransferAmount('')
    setNewItemType('other_fixed')
    setNewItemName('')
    transitionToAction('none')
  }

  // 物品全部转出后（净值归零）询问：保留 or 归档。归档当前账户则顺带关闭详情。
  const offerArchiveIfEmptied = async (target: Account, after: number) => {
    if (!onArchive || !isItemAccountType(target.type) || target.archivedAt || after !== 0) return
    const ok = await confirm({
      title: '已全部转出',
      message: `「${target.name}」的净值已为 0。归档后不再计入资产与统计，历史保留，可随时在资产列表的「已归档物品」中取消归档。`,
      confirmText: '归档物品',
      cancelText: '保留',
      tone: 'default',
    })
    if (!ok) return
    onArchive(target.id)
    toast(`已归档「${target.name}」`, { tone: 'success' })
    if (target.id === account.id) onClose()
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

  // 提交时对记录时间独立复核（与金额校验同一模式）：无效或晚于现在拒绝；
  // 未改动时间时仍用精确的当前时刻，保持与既有行为一致的排序精度
  const resolveNewRecordAt = (): { at: string; isCustom: boolean } | null => {
    const trimmed = recordTimeValue.trim()
    if (!trimmed || trimmed === recordTimeInitValue) {
      return { at: new Date().toISOString(), isCustom: false }
    }
    const parsed = new Date(trimmed)
    if (Number.isNaN(parsed.getTime())) {
      toast('记录时间无效', { tone: 'danger' })
      return null
    }
    if (parsed.getTime() > Date.now()) {
      toast('记录时间不能晚于现在', { tone: 'danger' })
      return null
    }
    return { at: parsed.toISOString(), isCustom: true }
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
      if (canApply) hapticSuccess()
      toast(canApply ? '已保存' : '已保存（余额未变）', { tone: canApply ? 'success' : 'neutral' })

      balanceInputRef.current?.blur()
      setNoteValue('')
      setEditingOpId(null)
      transitionToAction('none')
      return
    }

    const resolvedAt = resolveNewRecordAt()
    if (!resolvedAt) {
      refocusActiveInput()
      return
    }

    // 未选自定义时间且值没变：维持「无变化直接关闭」的既有行为；
    // 选了时间则总是落一条记录（补记本身就是目的）
    if (!resolvedAt.isCustom && moneyEquals(num, account.balance)) {
      balanceInputRef.current?.blur()
      transitionToAction('none')
      return
    }

    // 回溯到最近校准之前 → 仅记录，不改当前余额（后续校准已确认过那之后的真实余额）
    const canApply = canRollbackFor(account.id, resolvedAt.at)
    onAddOp({
      kind: 'set_balance',
      at: resolvedAt.at,
      accountType: account.type,
      accountId: account.id,
      before: normalizeMoney(account.balance),
      after: num,
      note: nextNote,
    })
    if (!canApply) {
      toast('已记录（余额未变）', { tone: 'neutral' })
    } else if (!moneyEquals(num, account.balance)) {
      onSetBalance(account.id, num)
    }
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
      if (canApply) hapticSuccess()
      toast(canApply ? '已保存' : '已保存（余额未变）', { tone: canApply ? 'success' : 'neutral' })

      setAdjustAmount('')
      setNoteValue('')
      adjustInputRef.current?.blur()
      setEditingOpId(null)
      transitionToAction('none')
      return
    }

    const resolvedAt = resolveNewRecordAt()
    if (!resolvedAt) {
      refocusActiveInput()
      return
    }

    // 回溯到最近校准之前 → 仅记录，不改当前余额；此时不做「操作后余额为负」校验
    // （余额不会变，delta 只是补记的期间流量）
    const canApply = canRollbackFor(account.id, resolvedAt.at)
    const after = addMoney(account.balance, delta)
    if (canApply && isNegativeAccountBalance(after)) {
      toast('操作后余额不能为负', { tone: 'danger' })
      refocusActiveInput()
      return
    }

    onAddOp({
      kind: 'adjust',
      at: resolvedAt.at,
      accountType: account.type,
      accountId: account.id,
      delta,
      before: normalizeMoney(account.balance),
      after,
      note: nextNote,
    })
    if (canApply) {
      onAdjust(account.id, delta)
    } else {
      toast('已记录（余额未变）', { tone: 'neutral' })
    }
    setAdjustAmount('')
    setNoteValue('')
    adjustInputRef.current?.blur()
    transitionToAction('none')
  }

  // 减值/增值：与期间增减同一套回滚/回溯语义，只是 kind 不同（统计口径排除）
  const submitRevalue = () => {
    const raw = revalueAmount.trim()
    const parsed = Number(raw)
    const num = normalizeMoney(parsed)
    if (!raw || !Number.isFinite(parsed) || num <= 0) {
      toast('请输入正确金额', { tone: 'danger' })
      refocusActiveInput()
      return
    }

    const delta = revalueDirection === 'down' ? -num : num

    if (editingRevalueOp) {
      if (moneyEquals(delta, editingRevalueOp.delta) && nextNote === editingRevalueOp.note) {
        revalueInputRef.current?.blur()
        setEditingOpId(null)
        transitionToAction('none')
        return
      }

      const canApply = canRollbackFor(editingRevalueOp.accountId, editingRevalueOp.at)
      const diff = subtractMoney(delta, editingRevalueOp.delta)
      if (canApply && !canApplyBalanceDelta(account.balance, diff)) {
        toast('保存后净值不能为负', { tone: 'danger' })
        refocusActiveInput()
        return
      }
      if (canApply && diff !== 0) onAdjust(editingRevalueOp.accountId, diff)

      onUpdateOp(editingRevalueOp.id, { ...editingRevalueOp, delta, after: addMoney(editingRevalueOp.before, delta), note: nextNote })
      if (canApply) hapticSuccess()
      toast(canApply ? '已保存' : '已保存（净值未变）', { tone: canApply ? 'success' : 'neutral' })

      setRevalueAmount('')
      setNoteValue('')
      revalueInputRef.current?.blur()
      setEditingOpId(null)
      transitionToAction('none')
      return
    }

    const resolvedAt = resolveNewRecordAt()
    if (!resolvedAt) {
      refocusActiveInput()
      return
    }

    const canApply = canRollbackFor(account.id, resolvedAt.at)
    const after = addMoney(account.balance, delta)
    if (canApply && isNegativeAccountBalance(after)) {
      toast('减值后净值不能为负', { tone: 'danger' })
      refocusActiveInput()
      return
    }

    onAddOp({
      kind: 'revalue',
      at: resolvedAt.at,
      accountType: account.type,
      accountId: account.id,
      delta,
      before: normalizeMoney(account.balance),
      after,
      note: nextNote,
    })
    if (canApply) {
      onAdjust(account.id, delta)
      hapticSuccess()
    } else {
      toast('已记录（净值未变）', { tone: 'neutral' })
    }
    setRevalueAmount('')
    setNoteValue('')
    revalueInputRef.current?.blur()
    transitionToAction('none')
  }

  // 原值：只改 cost/acquiredAt，落一条 set_cost 历史；不涉及余额回滚
  const submitSetCost = () => {
    const evaluated = evaluateMoneyExpression(costValue)
    const num = evaluated.ok ? normalizeMoney(evaluated.value) : 0
    if (!costValue.trim() || !evaluated.ok || num <= 0) {
      toast('请输入正确原值', { tone: 'danger' })
      refocusActiveInput()
      return
    }
    const nextAcquiredAt = acquiredAtValue.trim() || undefined
    if (nextAcquiredAt && (!normalizeStoredDateKey(nextAcquiredAt) || nextAcquiredAt > todayDateKey())) {
      toast('请选择有效的购入日期，不能晚于今天', { tone: 'danger' })
      return
    }
    const costUnchanged = account.cost != null && moneyEquals(num, account.cost)
    const dateUnchanged = (nextAcquiredAt ?? '') === (account.acquiredAt ?? '')
    if (costUnchanged && dateUnchanged && !nextNote) {
      costInputRef.current?.blur()
      transitionToAction('none')
      return
    }

    onSetItemCost?.(account.id, num, nextAcquiredAt)
    if (!costUnchanged || nextNote) {
      onAddOp({
        kind: 'set_cost',
        at: new Date().toISOString(),
        accountType: account.type,
        accountId: account.id,
        before: account.cost ?? null,
        after: num,
        note: nextNote,
      })
    }
    hapticSuccess()
    costInputRef.current?.blur()
    setNoteValue('')
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
      if (canApplyFrom && canApplyTo) hapticSuccess()
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

    // 转出到「新建物品」：物品以 0 净值创建，转账把金额带成初始净值，原值 = 转出金额
    if (transferPeerId === NEW_ITEM_PEER_ID) {
      if (!onCreateItem || transferDirection !== 'out') {
        toast('当前无法新建物品', { tone: 'danger' })
        return
      }
      const evaluated = evaluateMoneyExpression(transferAmount)
      const num = evaluated.ok ? evaluated.value : 0
      if (!evaluated.ok || num <= 0) {
        toast('请输入正确金额', { tone: 'danger' })
        refocusActiveInput()
        return
      }
      const fromBefore = normalizeMoney(account.balance)
      const fromAfter = applyAccountFlow(account.type, fromBefore, -num)
      if (isNegativeAccountBalance(fromAfter)) {
        toast('转账后余额不能为负', { tone: 'danger' })
        return
      }

      const created = onCreateItem({
        type: newItemType,
        name: newItemName,
        cost: num,
        net: 0,
        acquiredAt: todayDateKey(),
      })
      const now = Date.now()
      onAddOp({
        kind: 'set_cost',
        at: new Date(now - 1).toISOString(),
        accountType: created.type,
        accountId: created.id,
        before: null,
        after: normalizeMoney(num),
        note: `购入，资金来自「${account.name}」`,
      })
      onAddOp({
        kind: 'transfer',
        at: new Date(now).toISOString(),
        accountType: account.type,
        fromId: account.id,
        toId: created.id,
        amount: num,
        fromBefore,
        fromAfter,
        toBefore: 0,
        toAfter: normalizeMoney(num),
      })
      onTransfer(account.id, created.id, num)
      hapticSuccess()
      toast(`已新建物品「${created.name}」`, { tone: 'success' })
      setTransferAmount('')
      setTransferPeerId('')
      setNewItemName('')
      transitionToAction('none')
      void offerArchiveIfEmptied(account, fromAfter)
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
    void offerArchiveIfEmptied(from, fromAfter)
  }

  const startEditOp = (op: AccountOp) => {
    const affectedIds = op.kind === 'transfer' ? [op.fromId, op.toId] : [op.accountId]
    if (affectedIds.some((id) => byId.get(id)?.archivedAt)) {
      toast('请先取消相关物品的归档，再修改历史记录', { tone: 'neutral' })
      return
    }
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

    if (op.kind === 'revalue') {
      setEditingOpId(op.id)
      setNoteValue(op.note ?? '')
      setRevalueDirection(op.delta < 0 ? 'down' : 'up')
      setRevalueAmount(toMoneyInputValue(Math.abs(op.delta)))
      transitionToAction('revalue')
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
    const affectedIds = op.kind === 'transfer' ? [op.fromId, op.toId] : [op.accountId]
    if (op.kind !== 'set_cost' && affectedIds.some((id) => byId.get(id)?.archivedAt)) {
      toast('请先取消相关物品的归档，再删除历史记录', { tone: 'neutral' })
      return
    }
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
        ? `；其中部分账户${balanceWord}不变（后续校准或${balanceWord}不足）`
        : `；${balanceWord}不变（后续校准或${balanceWord}不足）`

    const rollbackSummary =
      op.kind === 'set_cost'
        ? '只删除这条原值记录，当前原值与净值都不变'
        : willRollbackCount > 0
          ? `将回滚：${willRollback.map((t) => `${getAccountName(t.accountId)} ${formatSigned(t.delta)}`).join('；')}${
              willRollbackCount < affectedCount ? noRollbackHint : ''
            }`
          : `${balanceWord}不会变化（后续校准或${balanceWord}不足）`

    const confirmTitle =
      op.kind === 'transfer'
        ? '删除这条转账记录？'
        : op.kind === 'set_balance'
          ? `删除这条修改${balanceWord}记录？`
          : op.kind === 'adjust'
            ? '删除这条期间变动记录？'
            : op.kind === 'revalue'
              ? `删除这条${op.delta < 0 ? '减值' : '增值'}记录？`
              : op.kind === 'set_cost'
                ? '删除这条原值记录？'
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
        ? op.kind === 'set_cost'
          ? '已删除记录'
          : `已删除记录（${balanceWord}未变）`
        : rolledBackCount === affectedCount
          ? `已删除并回滚${balanceWord}`
          : `已删除，已回滚部分${balanceWord}`
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
      sheetClassName="sheet--solid"
      sheetStyle={{ maxHeight: '92vh' }}
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
                        {account.archivedAt ? (
                          <button
                            type="button"
                            className="w-full px-4 py-3 text-left text-[13px] font-semibold text-slate-800 hover:bg-black/5"
                            onClick={() => {
                              setMoreOpen(false)
                              onUnarchive?.(account.id)
                              toast('已取消归档', { tone: 'success' })
                            }}
                          >
                            <span className="inline-flex items-center gap-2">
                              <ArchiveRestore size={16} strokeWidth={2.6} />
                              取消归档
                            </span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="w-full px-4 py-3 text-left text-[13px] font-semibold text-slate-800 hover:bg-black/5"
                            onClick={() => {
                              setMoreOpen(false)
                              setTransferDirection('out')
                              setTransferPeerId('')
                              setTransferAmount('')
                              setNewItemType('other_fixed')
                              setNewItemName('')
                              transitionToAction('transfer')
                            }}
                          >
                            <span className="inline-flex items-center gap-2">
                              <ArrowLeftRight size={16} strokeWidth={2.6} />
                              转账
                            </span>
                          </button>
                        )}

                        {isItem && !account.archivedAt && onArchive ? (
                          <>
                            <div className="h-px bg-black/5" />
                            <button
                              type="button"
                              className="w-full px-4 py-3 text-left text-[13px] font-semibold text-slate-800 hover:bg-black/5"
                              onClick={async () => {
                                setMoreOpen(false)
                                const ok = await confirm({
                                  title: '归档物品',
                                  message: `「${account.name}」归档后不再计入资产与统计，历史保留，可随时取消归档。${
                                    account.balance > 0 ? `当前净值 ${formatCny(account.balance)} 将一并退出汇总。` : ''
                                  }`,
                                  confirmText: '归档',
                                  cancelText: '取消',
                                  tone: 'default',
                                })
                                if (!ok) return
                                onArchive(account.id)
                                toast(`已归档「${account.name}」`, { tone: 'success' })
                                onClose()
                              }}
                            >
                              <span className="inline-flex items-center gap-2">
                                <Archive size={16} strokeWidth={2.6} />
                                归档物品
                              </span>
                            </button>
                          </>
                        ) : null}

                        <div className="h-px bg-black/5" />

                        <button
                          type="button"
                          className="w-full px-4 py-3 text-left text-[13px] font-semibold text-rose-600 hover:bg-rose-50"
                          onClick={async () => {
                            setMoreOpen(false)
                            const ok = await confirm({
                              title: isItem ? '删除物品' : '删除账户',
                              message: `确定要删除${isItem ? '物品' : '账户'}「${account.name}」吗？此操作不可撤销。`,
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
                            {isItem ? '删除物品' : '删除账户'}
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
                {isItem ? (
                  <div className="mt-4 text-[11px] font-semibold text-slate-400">账面净值</div>
                ) : null}
                <motion.div
                  key={`balance-${account.balance}`}
                  className={`${isItem ? 'mt-0.5' : 'mt-4'} text-[34px] font-black tracking-tight text-slate-900`}
                  initial={{ opacity: 0, y: 8, scale: 0.99 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ type: 'spring', stiffness: 480, damping: 36, mass: 0.8 }}
                >
                  {formatCny(account.balance)}
                </motion.div>

                {isItem && account.archivedAt ? (
                  <motion.div
                    className="mt-5 flex items-center justify-between gap-3 rounded-[22px] border border-white/70 bg-white/70 px-4 py-3 shadow-sm"
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ type: 'spring', stiffness: 480, damping: 36, mass: 0.8 }}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-slate-200/70 text-slate-500">
                        <Archive size={16} strokeWidth={2.6} />
                      </span>
                      <div className="min-w-0">
                        <div className="text-[13px] font-semibold text-slate-900">已归档</div>
                        <div className="text-[11px] font-medium text-slate-400 truncate">
                          {formatDateKey(account.archivedAt.slice(0, 10))} · 不计入资产与统计
                        </div>
                      </div>
                    </div>
                    <motion.button
                      type="button"
                      aria-label="unarchive action"
                      onClick={() => {
                        onUnarchive?.(account.id)
                        toast('已取消归档', { tone: 'success' })
                      }}
                      whileTap={{ scale: 0.96 }}
                      className="shrink-0 h-9 rounded-full bg-slate-900 px-3.5 text-[12px] font-semibold text-white shadow-sm"
                    >
                      取消归档
                    </motion.button>
                  </motion.div>
                ) : isItem ? (
                  <div className="mt-5 flex gap-3">
                    <motion.button
                      type="button"
                      aria-label="set balance action"
                      onPointerDown={(e) => handleActionPointerDown(e, openSetBalanceAction)}
                      onClick={() => handleActionClick(openSetBalanceAction)}
                      whileTap={{ scale: 0.965, y: 1 }}
                      transition={{ type: 'spring', stiffness: 700, damping: 40, mass: 0.6 }}
                      className="flex-1 h-12 rounded-full bg-white/80 border border-white/70 text-slate-900 font-semibold shadow-sm"
                    >
                      修改净值
                    </motion.button>
                    <motion.button
                      type="button"
                      aria-label="revalue action"
                      onPointerDown={(e) => handleActionPointerDown(e, openRevalueAction)}
                      onClick={() => handleActionClick(openRevalueAction)}
                      whileTap={{ scale: 0.965, y: 1 }}
                      transition={{ type: 'spring', stiffness: 700, damping: 40, mass: 0.6 }}
                      className="flex-1 h-12 rounded-full bg-slate-900 text-white font-semibold shadow-sm"
                    >
                      记录减值
                    </motion.button>
                  </div>
                ) : (
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
                )}

                {isItem && onSetItemCost ? (
                  <ItemValueCard account={account} tone={accountTypeInfo?.tone ?? 'var(--primary)'} onEditCost={openSetCostAction} />
                ) : null}

                <div className="mt-7 flex items-center justify-between">
                  <div className="flex items-center gap-2 text-[13px] font-semibold text-slate-500">
                    <span>{isItem ? '价值变动' : '期间变动'}</span>
                    <SlidersHorizontal size={14} strokeWidth={2.5} className="opacity-60" />
                  </div>
                  <div className="text-[13px] font-semibold text-slate-400">金额</div>
                </div>

                <div className="mt-1 text-[11px] font-semibold text-slate-400/80">
                  {isItem ? '这里记录的是减值/增值、净值校准与原值变更' : '这里记录的是期间净流量/校准/转账（非逐笔流水）'}
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
                  balanceLabel={balanceWord}
                  emptyHint={isItem ? '用上方「记录减值」或「修改净值」记一笔，这里会保留历史' : undefined}
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
                  recordTime={recordTimeValue}
                  recordTimeMax={recordTimeMax}
                  amountInputProps={amountInputProps}
                  inputRef={adjustInputRef}
                  onChangeAmount={setAdjustAmount}
                  onChangeNote={setNoteValue}
                  onChangeRecordTime={setRecordTimeValue}
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
                  recordTime={recordTimeValue}
                  recordTimeMax={recordTimeMax}
                  expressionInputProps={expressionInputProps}
                  inputRef={setBalanceInputNode}
                  onChangeValue={setBalanceValue}
                  onChangeNote={setNoteValue}
                  onChangeRecordTime={setRecordTimeValue}
                  onOperator={appendBalanceOperator}
                  onClearExpression={clearBalanceExpression}
                  onSubmit={submitSetBalance}
                  onCancel={cancelEdit}
                />
              </motion.div>
            ) : action === 'revalue' ? (
              <motion.div
                key="revalue"
                custom={pageDir}
                variants={pageVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                transition={pageTransition}
              >
                <RevaluePage
                  account={account}
                  editingOp={editingRevalueOp}
                  direction={revalueDirection}
                  amount={revalueAmount}
                  note={noteValue}
                  canApplyDiff={canApplyRevalueDiff}
                  recordTime={recordTimeValue}
                  recordTimeMax={recordTimeMax}
                  amountInputProps={amountInputProps}
                  inputRef={revalueInputRef}
                  onChangeAmount={setRevalueAmount}
                  onChangeNote={setNoteValue}
                  onChangeRecordTime={setRecordTimeValue}
                  onChangeDirection={setRevalueDirection}
                  onSubmit={submitRevalue}
                  onCancel={cancelEdit}
                />
              </motion.div>
            ) : action === 'set_cost' ? (
              <motion.div
                key="set_cost"
                custom={pageDir}
                variants={pageVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                transition={pageTransition}
              >
                <SetCostPage
                  account={account}
                  value={costValue}
                  note={noteValue}
                  acquiredAt={acquiredAtValue}
                  expressionInputProps={expressionInputProps}
                  inputRef={costInputRef}
                  onChangeValue={setCostValue}
                  onChangeNote={setNoteValue}
                  onChangeAcquiredAt={setAcquiredAtValue}
                  onOperator={appendCostOperator}
                  onClearExpression={clearCostExpression}
                  onSubmit={submitSetCost}
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
                  allowNewItem={Boolean(onCreateItem) && !account.archivedAt}
                  newItemType={newItemType}
                  newItemName={newItemName}
                  expressionInputProps={expressionInputProps}
                  inputRef={transferInputRef}
                  onChangeDirection={(dir) => {
                    setTransferDirection(dir)
                    if (dir !== 'out' && transferPeerId === NEW_ITEM_PEER_ID) setTransferPeerId('')
                  }}
                  onChangePeer={setTransferPeerId}
                  onChangeAmount={setTransferAmount}
                  onChangeNewItemType={setNewItemType}
                  onChangeNewItemName={setNewItemName}
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
