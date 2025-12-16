import { type ComponentType } from 'react'
import type { Account, AccountGroup, AccountTypeId } from '../lib/accounts'
import { AssetsRatioPage } from './AssetsRatioPage'
import { AssetsListPage } from './AssetsListPage'

export type GroupedAccounts = {
  groupCards: Array<{ group: AccountGroup; accounts: Account[]; total: number }>
  assetsTotal: number
  debtTotal: number
  netWorth: number
}

export function AssetsScreen(props: {
  grouped: GroupedAccounts
  getIcon: (type: AccountTypeId) => ComponentType<{ size?: number }>
  onEditAccount: (account: Account) => void
}) {
  const { grouped, getIcon, onEditAccount } = props
  
  return (
    <div className="w-full h-full overflow-x-auto snap-x snap-mandatory flex scrollbar-hide">
      {/* Page 1: Ratio Chart */}
      <div className="w-full h-full flex-shrink-0 snap-center overflow-y-auto">
        <AssetsRatioPage grouped={grouped} />
      </div>

      {/* Page 2: Asset List */}
      <div className="w-full h-full flex-shrink-0 snap-center overflow-y-auto">
        <AssetsListPage 
          grouped={grouped} 
          getIcon={getIcon}
          onEditAccount={onEditAccount}
          onAddAccount={() => {
             document.querySelector<HTMLButtonElement>('.iconBtnPrimary')?.click()
          }}
        />
      </div>
    </div>
  )
}
