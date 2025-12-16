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
      <div className="stack" style={{ gap: 12 }}>
        <button
          type="button"
          className="actionRow"
          onClick={() => {
            onAddAccount()
            onClose()
          }}
        >
          <span className="actionIcon" style={{ background: 'rgba(245, 209, 138, 0.55)' }}>
            <Landmark size={18} />
          </span>
          <span className="actionText">
            <span className="actionTitle">添加账户</span>
            <span className="actionSub">现金、银行卡、股票、房产等</span>
          </span>
          <Plus size={18} opacity={0.6} />
        </button>

        <button
          type="button"
          className="actionRow"
          onClick={() => {
            onAddTransaction()
            onClose()
          }}
        >
          <span className="actionIcon" style={{ background: 'rgba(91, 107, 255, 0.16)' }}>
            <Banknote size={18} />
          </span>
          <span className="actionText">
            <span className="actionTitle">记一笔</span>
            <span className="actionSub">收入/支出记录（本地保存）</span>
          </span>
          <Plus size={18} opacity={0.6} />
        </button>

        <button type="button" className="ghostBtn" onClick={onClose}>
          <X size={18} />
          取消
        </button>
      </div>
    </BottomSheet>
  )
}
