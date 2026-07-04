import { motion } from 'framer-motion'
import type { Account } from '../../lib/accounts'
import { formatCny } from './format'

// 重命名页
export function RenamePage(props: {
  account: Account
  value: string
  onChange: (value: string) => void
  onSubmit: () => void
  onCancel: () => void
}) {
  const { account, value, onChange, onSubmit, onCancel } = props

  return (
    <>
      <div className="mt-4 text-[34px] font-black tracking-tight text-slate-900">
        {formatCny(account.balance)}
      </div>

      <div className="mt-5">
        <div className="text-[13px] font-semibold text-slate-500">账户名称</div>
        <input
          className="input mt-2"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              onSubmit()
            }
            if (e.key === 'Escape') {
              e.preventDefault()
              onCancel()
            }
          }}
          autoFocus
        />
      </div>

      <motion.button
        type="button"
        onClick={onSubmit}
        whileTap={{ scale: 0.99 }}
        className="mt-6 w-full h-14 rounded-[22px] bg-slate-900 text-white font-semibold text-[16px] shadow-sm"
      >
        完成
      </motion.button>
    </>
  )
}
