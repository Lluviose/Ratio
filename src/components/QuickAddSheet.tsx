import { Banknote, Landmark, Plus, X } from 'lucide-react'
import { BottomSheet } from './BottomSheet'

export function QuickAddSheet(props: {
  open: boolean
  onClose: () => void
  onAddAccount: () => void
  onAddTransaction: () => void
}) {
  const { open, onClose, onAddAccount, onAddTransaction } = props

  return (
    <BottomSheet open={open} title="快速添加" onClose={onClose}>
      <div className="stack animate-[fadeIn_0.4s_ease-out]" style={{ gap: 16 }}>
        <button
          type="button"
          className="actionRow transition-transform active:scale-[0.98] hover:bg-[var(--bg)]"
          onClick={() => {
            onAddAccount()
            onClose()
          }}
        >
          <span className="actionIcon" style={{ background: 'rgba(245, 209, 138, 0.55)', color: '#926c2a' }}>
            <Landmark size={20} strokeWidth={2.5} />
          </span>
          <span className="actionText">
            <span className="actionTitle">添加账户</span>
            <span className="actionSub">现金、银行卡、股票、房产等</span>
          </span>
          <Plus size={20} opacity={0.4} />
        </button>

        <button
          type="button"
          className="actionRow transition-transform active:scale-[0.98] hover:bg-[var(--bg)]"
          onClick={() => {
            onAddTransaction()
            onClose()
          }}
        >
          <span className="actionIcon" style={{ background: 'rgba(91, 107, 255, 0.16)', color: 'var(--primary)' }}>
            <Banknote size={20} strokeWidth={2.5} />
          </span>
          <span className="actionText">
            <span className="actionTitle">记一笔</span>
            <span className="actionSub">收入/支出记录（本地保存）</span>
          </span>
          <Plus size={20} opacity={0.4} />
        </button>

        <div style={{ height: 8 }} />

        <button type="button" className="ghostBtn active:scale-[0.98]" onClick={onClose}>
          <X size={18} strokeWidth={2.5} />
          取消
        </button>
      </div>
    </BottomSheet>
  )
}
