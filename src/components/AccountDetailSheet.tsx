import { type CSSProperties, createElement, useEffect, useMemo, useState } from 'react'
import { ArrowLeftRight, MoreHorizontal, Pencil, Plus, Save, Trash2 } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { BottomSheet } from './BottomSheet'
import { SegmentedControl } from './SegmentedControl'
import { formatCny } from '../lib/format'
import { type Account, getAccountTypeOption } from '../lib/accounts'
import type { ThemeColors } from '../lib/themes'
import type { AccountOp, AccountOpInput } from '../lib/accountOps'

type ActionId = 'none' | 'rename' | 'set_balance' | 'adjust' | 'transfer'

type TransferDirection = 'out' | 'in'

type AdjustDirection = 'plus' | 'minus'

function formatTime(iso: string) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${y}-${m}-${day} ${hh}:${mm}`
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
    colors,
  } = props

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
  const [moreOpen, setMoreOpen] = useState(false)
  const [renameValue, setRenameValue] = useState('')
  const [balanceValue, setBalanceValue] = useState('')
  const [adjustDirection, setAdjustDirection] = useState<AdjustDirection>('plus')
  const [adjustAmount, setAdjustAmount] = useState('')
  const [transferDirection, setTransferDirection] = useState<TransferDirection>('out')
  const [transferPeerId, setTransferPeerId] = useState('')
  const [transferAmount, setTransferAmount] = useState('')

  useEffect(() => {
    if (!open) return
    const nextAction = initialAction ?? 'none'
    setAction(nextAction)
    setMoreOpen(false)
    setRenameValue(account?.name ?? '')
    setBalanceValue(account ? String(account.balance) : '')
    setAdjustDirection('plus')
    setAdjustAmount('')
    setTransferDirection('out')
    setTransferPeerId('')
    setTransferAmount('')
  }, [account, initialAction, open])

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

  if (!account) return <BottomSheet open={open} title="账户" onClose={onClose}><div className="muted" style={{ fontSize: 13, fontWeight: 800, textAlign: 'center', padding: 40 }}>未找到账户</div></BottomSheet>

  const actionBtnStyle: CSSProperties = {
    flex: 1,
    borderRadius: 999,
    border: '1px solid var(--hairline)',
    background: 'var(--card)',
    padding: '10px 14px',
    fontWeight: 950,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  }

  const submitRename = () => {
    const next = renameValue.trim()
    if (!next) {
      alert('请输入名称')
      return
    }
    if (next === account.name) {
      setAction('none')
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
    setAction('none')
  }

  const submitSetBalance = () => {
    const num = Number(balanceValue)
    if (!Number.isFinite(num)) {
      alert('请输入正确余额')
      return
    }

    if (num === account.balance) {
      setAction('none')
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
    setAction('none')
  }

  const submitAdjust = () => {
    const num = Number(adjustAmount)
    if (!Number.isFinite(num) || num <= 0) {
      alert('请输入正确金额')
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
    setAction('none')
  }

  const submitTransfer = () => {
    if (!transferPeerId) {
      alert('请选择账户')
      return
    }
    const peer = byId.get(transferPeerId)
    if (!peer) {
      alert('账户不存在')
      return
    }

    const num = Number(transferAmount)
    if (!Number.isFinite(num) || num <= 0) {
      alert('请输入正确金额')
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
    setAction('none')
  }

  return (
    <BottomSheet open={open} title={account.name} onClose={onClose}>
      <motion.div 
        className="flex flex-col"
        style={{ gap: 16, minHeight: '62vh' }}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        onClick={() => setMoreOpen(false)}
      >
        <div style={{ position: 'sticky', top: 0, zIndex: 6, background: 'var(--card)', paddingBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', position: 'relative' }}>
            <div>
              <div className="muted" style={{ fontSize: 12, fontWeight: 850 }}>当前余额</div>
              <div style={{ fontSize: 24, fontWeight: 950, marginTop: 4 }}>{formatCny(account.balance)}</div>
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
                      color: 'rgba(0,0,0,0.75)',
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
                    onClick={() => {
                      setMoreOpen(false)
                      if (window.confirm(`确定要删除账户「${account.name}」吗？此操作不可撤销。`)) {
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
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
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

          {action === 'set_balance' ? (
            <motion.div 
              key="set_balance"
              className="stack" 
              style={{ gap: 12 }}
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
            >
              <label className="field">
                <div className="fieldLabel">修改余额</div>
                <input className="input" inputMode="decimal" value={balanceValue} onChange={(e) => setBalanceValue(e.target.value)} autoFocus />
              </label>
              <motion.button type="button" className="primaryBtn" onClick={submitSetBalance} whileTap={{ scale: 0.98 }}>
                保存
              </motion.button>
            </motion.div>
          ) : null}

          {action === 'adjust' ? (
            <motion.div 
              key="adjust"
              className="stack" 
              style={{ gap: 12 }}
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
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
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
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
      </motion.div>
    </BottomSheet>
  )
}
