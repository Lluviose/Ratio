import { Landmark, Plus, X } from 'lucide-react'
import { motion } from 'framer-motion'
import { BottomSheet } from './BottomSheet'

export function QuickAddSheet(props: {
  open: boolean
  onClose: () => void
  onAddAccount: () => void
}) {
  const { open, onClose, onAddAccount } = props

  return (
    <BottomSheet open={open} title="快速添加" onClose={onClose}>
      <motion.div 
        className="stack" 
        style={{ gap: 16 }}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        <motion.button
          type="button"
          className="actionRow"
          whileTap={{ scale: 0.98 }}
          whileHover={{ backgroundColor: 'var(--bg)' }}
          onClick={() => {
            onAddAccount()
            onClose()
          }}
        >
          <span className="actionIcon" style={{ background: 'rgba(91, 107, 255, 0.12)', color: 'var(--primary)' }}>
            <Landmark size={20} strokeWidth={2.5} />
          </span>
          <span className="actionText">
            <span className="actionTitle">添加账户</span>
            <span className="actionSub">现金、银行卡、股票、房产等</span>
          </span>
          <Plus size={20} opacity={0.4} />
        </motion.button>

        <div style={{ height: 8 }} />

        <motion.button 
          type="button" 
          className="ghostBtn" 
          whileTap={{ scale: 0.98 }}
          onClick={onClose}
        >
          <X size={18} strokeWidth={2.5} />
          取消
        </motion.button>
      </motion.div>
    </BottomSheet>
  )
}
