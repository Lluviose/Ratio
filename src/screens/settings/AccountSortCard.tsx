import { motion } from 'framer-motion'
import { SegmentedControl } from '../../components/SegmentedControl'
import { standardEase } from '../../lib/motionPresets'
import type { AccountSortMode } from '../../lib/accountSort'

export function AccountSortCard(props: { accountSortMode: AccountSortMode; onChange: (mode: AccountSortMode) => void }) {
  const { accountSortMode, onChange } = props
  return (
    <motion.div
      className="card"
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.05, duration: 0.26, ease: standardEase }}
    >
      <div className="cardInner">
        <div style={{ fontWeight: 800, fontSize: 16 }}>账户排序</div>
        <div className="muted" style={{ marginTop: 4, fontSize: 13, fontWeight: 550 }}>
          影响资产页二级与三级列表的显示顺序
        </div>

        <div style={{ marginTop: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <SegmentedControl<AccountSortMode>
            options={[
              { value: 'manual', label: '手动' },
              { value: 'balance', label: '余额↓' },
            ]}
            value={accountSortMode}
            onChange={onChange}
          />
        </div>

        {accountSortMode === 'manual' ? (
          <div className="muted" style={{ marginTop: 10, fontSize: 12, fontWeight: 550 }}>
            手动模式：可在列表右上角“…”菜单中调整顺序
          </div>
        ) : null}
      </div>
    </motion.div>
  )
}
