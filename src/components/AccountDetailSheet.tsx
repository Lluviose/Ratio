import { useEffect, useMemo, useState } from 'react'
import { clsx } from 'clsx'
import { ArrowLeftRight, Pencil, Plus, Save, Trash2 } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { BottomSheet } from './BottomSheet'
import { formatCny } from '../lib/format'
import type { Account } from '../lib/accounts'
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
    setRenameValue(account?.name ?? '')
    setBalanceValue(account ? String(account.balance) : '')
    setAdjustDirection('plus')
    setAdjustAmount('')
    setTransferDirection('out')
    setTransferPeerId('')
    setTransferAmount('')
  }, [account, initialAction, open])

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

  const QuickActionBtn = ({ icon: Icon, label, active, onClick, color }: { icon: any, label: string, active: boolean, onClick: () => void, color?: string }) => (
    <motion.button
      type="button"
      onClick={onClick}
      className={clsx(
        "flex flex-col items-center justify-center gap-2 p-4 rounded-[24px] border transition-all duration-200",
        active ? "bg-indigo-50 border-indigo-200 text-indigo-600" : "bg-white border-slate-100 text-slate-600 hover:bg-slate-50"
      )}
      whileTap={{ scale: 0.96 }}
      style={{ boxShadow: active ? 'none' : '0 2px 8px -2px rgba(0,0,0,0.05)' }}
    >
      <div className={clsx(
        "w-10 h-10 rounded-full flex items-center justify-center",
        active ? "bg-indigo-100" : "bg-slate-50"
      )}>
        <Icon size={20} strokeWidth={2.5} style={{ color: color }} />
      </div>
      <span className="text-[13px] font-bold">{label}</span>
    </motion.button>
  )

  return (
    <BottomSheet open={open} title={account.name} onClose={onClose}>
      <motion.div 
        className="flex flex-col px-1"
        style={{ gap: 20, minHeight: '65vh' }}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        {/* Header - Balance Display */}
        <AnimatePresence>
          {action === 'none' && (
            <motion.div
              className="flex flex-col items-center py-6 bg-slate-50/50 rounded-[32px] border border-slate-100/50 overflow-hidden"
              initial={{ opacity: 0, height: 0, scale: 0.95 }}
              animate={{ opacity: 1, height: 'auto', scale: 1 }}
              exit={{ opacity: 0, height: 0, scale: 0.95 }}
              transition={{ duration: 0.25, ease: [0.32, 0.72, 0, 1] }}
            >
              <div className="text-[12px] font-bold text-slate-400 mb-1 tracking-wider uppercase">当前余额</div>
              <motion.div
                className="text-[40px] font-black text-slate-900 tracking-tight leading-none"
                layoutId={`account-balance-${account.id}`}
              >
                {formatCny(account.balance)}
              </motion.div>
              <div className="mt-3 px-3 py-1 rounded-full bg-white border border-slate-100 text-[11px] font-bold text-slate-500 shadow-sm">
                {account.type}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Action Forms Area (Moved up for better keyboard experience) */}
        <AnimatePresence mode="wait">
          {action !== 'none' && (
            <motion.div
              key={action}
              initial={{ opacity: 0, height: 0, y: -10 }}
              animate={{ opacity: 1, height: 'auto', y: 0 }}
              exit={{ opacity: 0, height: 0, y: -10 }}
              className="overflow-hidden bg-white rounded-[28px] p-4 border-2 border-indigo-100 shadow-xl shadow-indigo-100/20"
            >
              {action === 'rename' && (
                <div className="flex flex-col gap-4">
                  <div className="flex items-center justify-between">
                    <span className="text-[14px] font-bold text-slate-700">重命名账户</span>
                    <button onClick={() => setAction('none')} className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 text-slate-500">
                      <Plus size={18} className="rotate-45" />
                    </button>
                  </div>
                  <input 
                    className="w-full h-12 px-4 rounded-2xl bg-slate-50 border border-slate-200 font-bold text-slate-800 focus:outline-none focus:border-indigo-400 transition-colors"
                    value={renameValue} 
                    onChange={(e) => setRenameValue(e.target.value)} 
                    autoFocus 
                  />
                  <button className="h-12 w-full bg-indigo-600 text-white rounded-2xl font-black shadow-lg shadow-indigo-200" onClick={submitRename}>
                    保存更改
                  </button>
                </div>
              )}

              {action === 'set_balance' && (
                <div className="flex flex-col gap-4">
                  <div className="flex items-center justify-between">
                    <span className="text-[14px] font-bold text-slate-700">修改当前余额</span>
                    <button onClick={() => setAction('none')} className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 text-slate-500">
                      <Plus size={18} className="rotate-45" />
                    </button>
                  </div>
                  <div className="relative">
                    <input 
                      className="w-full h-14 pl-10 pr-4 rounded-2xl bg-slate-50 border border-slate-200 font-black text-[20px] text-slate-900 focus:outline-none focus:border-indigo-400 transition-colors"
                      inputMode="decimal" 
                      value={balanceValue} 
                      onChange={(e) => setBalanceValue(e.target.value)} 
                      autoFocus 
                    />
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-black text-lg">¥</span>
                  </div>
                  <button className="h-12 w-full bg-emerald-600 text-white rounded-2xl font-black shadow-lg shadow-emerald-200" onClick={submitSetBalance}>
                    确认修改
                  </button>
                </div>
              )}

              {action === 'adjust' && (
                <div className="flex flex-col gap-4">
                  <div className="flex items-center justify-between">
                    <span className="text-[14px] font-bold text-slate-700">金额增减</span>
                    <button onClick={() => setAction('none')} className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 text-slate-500">
                      <Plus size={18} className="rotate-45" />
                    </button>
                  </div>
                  <div className="flex p-1 bg-slate-50 rounded-2xl border border-slate-100">
                    <button 
                      className={clsx("flex-1 py-2 rounded-xl text-[13px] font-bold transition-all", adjustDirection === 'plus' ? "bg-indigo-600 text-white shadow-md" : "text-slate-500 hover:bg-white/50")}
                      onClick={() => setAdjustDirection('plus')}
                    >增加</button>
                    <button 
                      className={clsx("flex-1 py-2 rounded-xl text-[13px] font-bold transition-all", adjustDirection === 'minus' ? "bg-rose-600 text-white shadow-md" : "text-slate-500 hover:bg-white/50")}
                      onClick={() => setAdjustDirection('minus')}
                    >减少</button>
                  </div>
                  <div className="relative">
                    <input
                      className="w-full h-14 pl-10 pr-4 rounded-2xl bg-slate-50 border border-slate-200 font-black text-[24px] text-slate-900 focus:outline-none focus:border-indigo-400 transition-colors"
                      inputMode="decimal"
                      placeholder="0.00"
                      value={adjustAmount}
                      onChange={(e) => setAdjustAmount(e.target.value)}
                      autoFocus
                    />
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-black text-xl">¥</span>
                  </div>
                  <button className={clsx("h-12 w-full text-white rounded-2xl font-black shadow-lg", adjustDirection === 'plus' ? "bg-indigo-600 shadow-indigo-200" : "bg-rose-600 shadow-rose-200")} onClick={submitAdjust}>
                    保存记录
                  </button>
                </div>
              )}

              {action === 'transfer' && (
                <div className="flex flex-col gap-4">
                  <div className="flex items-center justify-between">
                    <span className="text-[14px] font-bold text-slate-700">内部转账</span>
                    <button onClick={() => setAction('none')} className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 text-slate-500">
                      <Plus size={18} className="rotate-45" />
                    </button>
                  </div>
                  <div className="flex p-1 bg-slate-50 rounded-2xl border border-slate-100">
                    <button 
                      className={clsx("flex-1 py-2 rounded-xl text-[13px] font-bold transition-all", transferDirection === 'out' ? "bg-cyan-600 text-white shadow-md" : "text-slate-500 hover:bg-white/50")}
                      onClick={() => setTransferDirection('out')}
                    >转出</button>
                    <button 
                      className={clsx("flex-1 py-2 rounded-xl text-[13px] font-bold transition-all", transferDirection === 'in' ? "bg-cyan-600 text-white shadow-md" : "text-slate-500 hover:bg-white/50")}
                      onClick={() => setTransferDirection('in')}
                    >转入</button>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <span className="text-[11px] font-bold text-slate-400 ml-1">对方账户</span>
                    <select className="w-full h-12 px-4 rounded-2xl bg-slate-50 border border-slate-200 font-bold text-slate-800" value={transferPeerId} onChange={(e) => setTransferPeerId(e.target.value)}>
                      <option value="">选择一个账户</option>
                      {selectablePeers.map((a) => (
                        <option key={a.id} value={a.id}>{a.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="relative">
                    <input
                      className="w-full h-14 pl-10 pr-4 rounded-2xl bg-slate-50 border border-slate-200 font-black text-[24px] text-slate-900 focus:outline-none focus:border-indigo-400 transition-colors"
                      inputMode="decimal"
                      placeholder="0.00"
                      value={transferAmount}
                      onChange={(e) => setTransferAmount(e.target.value)}
                    />
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-black text-xl">¥</span>
                  </div>
                  <button className="h-12 w-full bg-cyan-600 text-white rounded-2xl font-black shadow-lg shadow-cyan-200" onClick={submitTransfer}>
                    确认转账
                  </button>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Lower Content Wrapper - Fades when an action is active */}
        <motion.div 
          className="flex flex-col gap-5"
          animate={{ 
            opacity: action === 'none' ? 1 : 0.4,
            scale: action === 'none' ? 1 : 0.98,
            pointerEvents: action === 'none' ? 'auto' : 'none'
          }}
          transition={{ duration: 0.2 }}
        >
          {/* Quick Actions Grid */}
          <div className="grid grid-cols-2 gap-3">
            <QuickActionBtn 
              icon={Plus} 
              label="增减金额" 
              active={action === 'adjust'} 
              onClick={() => setAction('adjust')} 
              color="#4f46e5"
            />
            <QuickActionBtn 
              icon={ArrowLeftRight} 
              label="账户转账" 
              active={action === 'transfer'} 
              onClick={() => setAction('transfer')} 
              color="#0891b2"
            />
            <QuickActionBtn 
              icon={Pencil} 
              label="重命名" 
              active={action === 'rename'} 
              onClick={() => setAction('rename')} 
              color="#924e00"
            />
            <QuickActionBtn 
              icon={Save} 
              label="修改余额" 
              active={action === 'set_balance'} 
              onClick={() => setAction('set_balance')} 
              color="#059669"
            />
          </div>

          {/* History Section */}
          <div className="flex flex-col flex-1">
            <div className="flex items-center justify-between mb-3 px-1">
              <span className="text-[15px] font-black text-slate-900">操作记录</span>
              <span className="text-[11px] font-bold text-slate-400">{relatedOps.length} 条记录</span>
            </div>

            <div className="flex flex-col gap-2.5">
              {relatedOps.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 bg-slate-50/50 rounded-[28px] border border-dashed border-slate-200">
                  <div className="text-slate-300 mb-2"><Plus size={32} strokeWidth={1} /></div>
                  <div className="text-[13px] font-bold text-slate-400">暂无任何变动记录</div>
                </div>
              ) : (
                relatedOps.map((op, i) => {
                  let title = ''
                  let delta = 0
                  let after = account.balance

                  if (op.kind === 'rename') {
                    title = `重命名：${op.beforeName} → ${op.afterName}`
                    delta = 0
                    after = account.balance
                  }

                  if (op.kind === 'set_balance') {
                    title = '初始余额设置'
                    delta = op.after - op.before
                    after = op.after
                  }

                  if (op.kind === 'adjust') {
                    title = op.delta >= 0 ? '手动增加金额' : '手动减少金额'
                    delta = op.delta
                    after = op.after
                  }

                  if (op.kind === 'transfer') {
                    const from = byId.get(op.fromId)
                    const to = byId.get(op.toId)
                    if (account.id === op.fromId) {
                      title = `转账至 ${to?.name ?? '外部'}`
                      delta = op.fromAfter - op.fromBefore
                      after = op.fromAfter
                    } else {
                      title = `从 ${from?.name ?? '外部'} 转入`
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
                      className="p-4 bg-white border border-slate-100 rounded-[22px] shadow-sm flex flex-col gap-2"
                    >
                      <div className="flex justify-between items-start gap-3">
                        <div className="text-[14px] font-bold text-slate-800 leading-snug flex-1">{title}</div>
                        <div className={clsx("text-[15px] font-black shrink-0", delta > 0 ? "text-emerald-500" : delta < 0 ? "text-rose-500" : "text-slate-400")}>
                          {delta !== 0 ? formatSigned(delta) : '—'}
                        </div>
                      </div>
                      <div className="flex justify-between items-center">
                        <div className="text-[11px] font-medium text-slate-400">{formatTime(op.at)}</div>
                        <div className="text-[11px] font-bold text-slate-500 bg-slate-50 px-2 py-0.5 rounded-md">
                          余额 {formatCny(after)}
                        </div>
                      </div>
                    </motion.div>
                  )
                })
              )}
            </div>
          </div>

          {/* Footer Actions */}
          <div className="mt-4 pt-4 border-t border-slate-100 flex justify-center">
            <button
              type="button"
              className="flex items-center gap-2 px-6 py-3 rounded-2xl text-rose-500 hover:bg-rose-50 transition-colors"
              onClick={() => {
                if (window.confirm(`确定要删除账户「${account.name}」吗？\n此操作将移除该账户的所有记录且不可恢复。`)) {
                  onDelete(account.id)
                  onClose()
                }
              }}
            >
              <Trash2 size={16} strokeWidth={2.5} />
              <span className="text-[13px] font-black">删除此账户</span>
            </button>
          </div>
        </motion.div>
      </motion.div>
    </BottomSheet>
  )
}
