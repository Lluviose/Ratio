import { ChevronRight } from 'lucide-react'
import { motion } from 'framer-motion'
import { BottomSheet } from './BottomSheet'
import { getAccountTypeOption, type Account } from '../lib/accounts'
import { formatCny } from '../lib/format'
import { useLocalStorageState } from '../lib/useLocalStorageState'
import { tapPressSoft } from '../lib/motionPresets'

// App 管理归档列表与详情切换，取消归档后列表数量随账户状态更新。
export function ItemArchiveSheet(props: {
  open: boolean
  accounts: Account[]
  onClose: () => void
  onPick: (account: Account) => void
}) {
  const [hideAmounts] = useLocalStorageState('ratio.hideAmounts', false)
  return (
    <BottomSheet open={props.open} title="已归档物品" onClose={props.onClose}>
      <div className="stack">
        <p className="muted text-xs">保留原值与历史，不计入当前资产。打开物品可取消归档。</p>
        {props.accounts.length === 0 ? <p className="muted text-sm py-4 text-center">暂无已归档物品</p> : null}
        {props.accounts.map((account) => (
          <motion.button key={account.id} type="button" whileTap={tapPressSoft} className="assetItem w-full text-left" aria-label={`archived item ${account.name}`} onClick={() => props.onPick(account)}>
            <span className="min-w-0 flex-1">
              <span className="assetName block truncate">{account.name}</span>
              <span className="assetSub block">{getAccountTypeOption(account.type).name} · 已归档</span>
            </span>
            <span className="amount">{hideAmounts ? '*****' : formatCny(account.balance)}</span>
            <ChevronRight size={16} />
          </motion.button>
        ))}
      </div>
    </BottomSheet>
  )
}
