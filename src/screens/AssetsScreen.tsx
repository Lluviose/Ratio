import { type ComponentType, useMemo, useRef, useState } from 'react'
import type { Account, AccountGroup, AccountTypeId } from '../lib/accounts'
import { AssetsRatioPage } from './AssetsRatioPage'
import { AssetsListPage } from './AssetsListPage'
import { AssetsTypeDetailPage } from './AssetsTypeDetailPage'

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

  const scrollerRef = useRef<HTMLDivElement | null>(null)
  const [selectedType, setSelectedType] = useState<AccountTypeId | null>(null)

  const accounts = useMemo(() => grouped.groupCards.flatMap((g) => g.accounts), [grouped.groupCards])

  const scrollToPage = (index: number) => {
    const el = scrollerRef.current
    if (!el) return
    const w = el.clientWidth || 0
    el.scrollTo({ left: w * index, behavior: 'smooth' })
  }
  
  return (
    <div
      ref={scrollerRef}
      className="w-full h-full overflow-x-auto snap-x snap-mandatory flex scrollbar-hide overscroll-x-contain scroll-smooth"
      style={{ WebkitOverflowScrolling: 'touch' }}
    >
      {/* Page 1: Ratio Chart */}
      <div
        className="w-full h-full flex-shrink-0 snap-center snap-always overflow-y-hidden"
        style={{ overscrollBehaviorY: 'none', touchAction: 'pan-x' }}
      >
        <AssetsRatioPage grouped={grouped} />
      </div>

      {/* Page 2: Asset List */}
      <div className="w-full h-full flex-shrink-0 snap-center snap-always overflow-y-auto">
        <AssetsListPage 
          grouped={grouped} 
          getIcon={getIcon}
          onAddAccount={() => {
             document.querySelector<HTMLButtonElement>('.iconBtnPrimary')?.click()
          }}
          onPickType={(type) => {
            setSelectedType(type)
            scrollToPage(2)
          }}
        />
      </div>

      <div className="w-full h-full flex-shrink-0 snap-center snap-always overflow-y-auto">
        <AssetsTypeDetailPage
          type={selectedType}
          accounts={accounts}
          getIcon={getIcon}
          onBack={() => {
            scrollToPage(1)
            setSelectedType(null)
          }}
          onEditAccount={onEditAccount}
        />
      </div>
    </div>
  )
}
