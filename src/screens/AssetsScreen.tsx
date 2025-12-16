import { Eye, EyeOff } from 'lucide-react'
import { type ComponentType, useMemo } from 'react'
import { formatCny } from '../lib/format'
import type { Transaction } from '../lib/ledger'
import type { Account, AccountGroup, AccountTypeId } from '../lib/accounts'

type GroupedAccounts = {
  groupCards: Array<{ group: AccountGroup; accounts: Account[]; total: number }>
  assetsTotal: number
  debtTotal: number
  netWorth: number
}

export function AssetsScreen(props: {
  grouped: GroupedAccounts
  getIcon: (type: AccountTypeId) => ComponentType<{ size?: number }>
  onEditAccount: (account: Account) => void
  recent: Transaction[]
  privacyMode: boolean
}) {
  const { grouped, getIcon, onEditAccount, recent, privacyMode } = props

  const showMoney = (value: number) => {
    if (!privacyMode) return formatCny(value)
    if (value === 0) return '¥0'
    return '¥****'
  }

  const groupMeta = useMemo(() => {
    const map: Record<string, { textColor: string }> = {
      liquid: { textColor: 'rgba(11, 15, 26, 0.90)' },
      invest: { textColor: 'white' },
      fixed: { textColor: 'white' },
      receivable: { textColor: 'rgba(11, 15, 26, 0.90)' },
      debt: { textColor: 'rgba(11, 15, 26, 0.90)' },
    }
    return map
  }, [])

  const formatUpdated = (iso?: string) => {
    if (!iso) return ''
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return ''
    const m = d.getMonth() + 1
    const day = d.getDate()
    return `${m}月${day}日更新`
  }

  return (
    <div className="stack">
      <div className="card">
        <div className="cardInner">
          <div className="row">
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div className="muted" style={{ fontSize: 12, fontWeight: 800 }}>
                  我的净资产 (CNY)
                </div>
                <span className="muted" aria-hidden="true">
                  {privacyMode ? <EyeOff size={16} /> : <Eye size={16} />}
                </span>
              </div>
              <div className="h1" style={{ marginTop: 6 }}>
                {showMoney(grouped.netWorth)}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
            <span className="badge">资产 {showMoney(grouped.assetsTotal)}</span>
            <span className="badge">负债 {showMoney(grouped.debtTotal)}</span>
          </div>
        </div>
      </div>

      <div className="stack" style={{ gap: 12 }}>
        {grouped.groupCards.map((g) => {
          const gid = g.group.id
          const meta = groupMeta[gid] ?? { textColor: 'rgba(11, 15, 26, 0.90)' }
          const updatedAt = g.accounts.map((a) => a.updatedAt).sort().at(-1)
          const accountNames = g.accounts
            .map((a) => a.name)
            .filter(Boolean)
            .slice(0, 2)
            .join('、')

          return (
            <div key={g.group.id} className="card">
              <div className="groupSummary" style={{ background: g.group.tone, color: meta.textColor }}>
                <div>
                  <div className="groupTitle">{g.group.name}</div>
                  <div className="groupSub">
                    <span>{g.accounts.length > 0 ? (privacyMode ? '***' : accountNames) : '点击 + 添加账户'}</span>
                    <span style={{ marginLeft: 10 }}>{formatUpdated(updatedAt)}</span>
                  </div>
                </div>
                <div className="groupAmount" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {g.group.id === 'debt' ? <span className="minusBadge" aria-hidden="true">−</span> : null}
                  {showMoney(g.total)}
                </div>
              </div>

              {g.accounts.length === 0 ? null : (
                <div className="groupList">
                  {g.accounts.map((a) => {
                    const Icon = getIcon(a.type)
                    return (
                      <button
                        key={a.id}
                        type="button"
                        className="subRow"
                        onClick={() => onEditAccount(a)}
                      >
                        <span className="subIcon">
                          <Icon size={18} />
                        </span>
                        <span className="subText">
                          <span className="subName">{privacyMode ? '***' : a.name}</span>
                          <span className="subHint">修改余额</span>
                        </span>
                        <span className="subAmount">{showMoney(a.balance)}</span>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>

      <div className="card">
        <div className="cardInner">
          <div className="row" style={{ marginBottom: 10 }}>
            <div style={{ fontWeight: 950, fontSize: 14 }}>最近记账</div>
            <div className="muted" style={{ fontSize: 12, fontWeight: 800 }}>
              {recent.length} 条
            </div>
          </div>

          {recent.length === 0 ? (
            <div className="muted" style={{ fontSize: 12, fontWeight: 800 }}>
              还没有记录，点右上角 + 记一笔
            </div>
          ) : (
            <div className="stack" style={{ gap: 10 }}>
              {recent.map((tx) => {
                const isExpense = tx.amount < 0
                const color = isExpense ? 'rgba(239, 68, 68, 0.95)' : '#47d16a'
                const amount = privacyMode ? '¥****' : formatCny(tx.amount)
                return (
                  <div key={tx.id} className="assetItem" style={{ padding: '10px 12px' }}>
                    <div className="assetLeft">
                      <span className="dot" style={{ background: color }} />
                      <div>
                        <div className="assetName">
                          {tx.category} · {privacyMode ? '***' : tx.account}
                        </div>
                        <div className="assetSub">{privacyMode ? '****-**-**' : tx.date}</div>
                      </div>
                    </div>
                    <div className="amount" style={{ color }}>
                      {amount}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
