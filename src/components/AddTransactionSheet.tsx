import { motion } from 'framer-motion'
import { useMemo, useState } from 'react'
import { BottomSheet } from './BottomSheet'
import { SegmentedControl } from './SegmentedControl'
import type { Transaction, TxType } from '../lib/ledger'
import { normalizeAmount } from '../lib/ledger'

const categories = ['餐饮', '交通', '购物', '房租', '工资', '其他']
const defaultAccounts = ['现金', '银行卡', '支付宝', '微信']

export function AddTransactionSheet(props: {
  open: boolean
  onClose: () => void
  onSubmit: (tx: Omit<Transaction, 'id'>) => void
  accounts?: string[]
}) {
  const { open, onClose, onSubmit, accounts } = props

  const today = useMemo(() => new Date().toISOString().slice(0, 10), [])

  const [type, setType] = useState<TxType>('expense')
  const [amount, setAmount] = useState('')
  const [category, setCategory] = useState(categories[0] ?? '其他')
  const accountOptions = (accounts && accounts.length > 0 ? accounts : defaultAccounts)
  const [account, setAccount] = useState(accountOptions[0] ?? '现金')
  const [date, setDate] = useState(today)
  const [note, setNote] = useState('')

  const safeAccount = accountOptions.includes(account) ? account : (accountOptions[0] ?? '现金')

  const reset = () => {
    setType('expense')
    setAmount('')
    setCategory(categories[0] ?? '其他')
    setAccount(accountOptions[0] ?? '现金')
    setDate(today)
    setNote('')
  }

  const submit = () => {
    const num = Number(amount)
    if (!Number.isFinite(num) || num <= 0) {
      alert('请输入正确金额')
      return
    }

    onSubmit({
      type,
      amount: normalizeAmount(type, num),
      category,
      account: safeAccount,
      date,
      note,
    })
    reset()
    onClose()
  }

  return (
    <BottomSheet open={open} title="记一笔" onClose={onClose}>
      <motion.div 
        className="stack"
        style={{ gap: 20 }}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', damping: 30, stiffness: 400, delay: 0.1 }}
      >
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <SegmentedControl
            options={[
              { value: 'expense', label: '支出' },
              { value: 'income', label: '收入' },
            ]}
            value={type}
            onChange={setType}
          />
        </div>

        <div className="stack" style={{ gap: 16 }}>
          <label className="field">
            <div className="fieldLabel">金额</div>
            <div className="relative">
              <input
                className="input"
                inputMode="decimal"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                style={{ fontSize: 20, fontWeight: 900, paddingLeft: 24 }}
                autoFocus
              />
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted-text)] font-black">¥</span>
            </div>
          </label>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <label className="field">
              <div className="fieldLabel">分类</div>
              <select className="select" value={category} onChange={(e) => setCategory(e.target.value)}>
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <div className="fieldLabel">账户</div>
              <select className="select" value={safeAccount} onChange={(e) => setAccount(e.target.value)}>
                {accountOptions.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="field">
            <div className="fieldLabel">日期</div>
            <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>

          <label className="field">
            <div className="fieldLabel">备注</div>
            <input className="input" placeholder="可选" value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
        </div>

        <button type="button" className="primaryBtn" onClick={submit}>
          保存
        </button>
      </motion.div>
    </BottomSheet>
  )
}
