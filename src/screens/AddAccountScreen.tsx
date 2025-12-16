import { ChevronLeft, ChevronRight } from 'lucide-react'
import { accountGroups, accountTypeOptions, type AccountTypeId } from '../lib/accounts'

export function AddAccountScreen(props: {
  onBack: () => void
  onPick: (type: AccountTypeId) => void
}) {
  const { onBack, onPick } = props

  const grouped = {
    liquid: accountTypeOptions.filter((t) => t.groupId === 'liquid'),
    invest: accountTypeOptions.filter((t) => t.groupId === 'invest'),
    fixed: accountTypeOptions.filter((t) => t.groupId === 'fixed'),
    receivable: accountTypeOptions.filter((t) => t.groupId === 'receivable'),
    debt: accountTypeOptions.filter((t) => t.groupId === 'debt'),
  } as const

  const header = (title: string, tone: string) => (
    <div className="groupHeader" style={{ background: tone }}>
      {title}
    </div>
  )

  return (
    <div style={{ height: '100%', overflow: 'auto' }}>
      <div className="topBar">
        <div className="topBarRow">
          <button type="button" className="iconBtn" onClick={onBack} aria-label="back">
            <ChevronLeft size={18} />
          </button>
          <div className="title" style={{ marginRight: 40 }}>
            添加账户
          </div>
          <div style={{ width: 40 }} />
        </div>
      </div>

      <div className="content" style={{ paddingTop: 2 }}>
        <div className="stack" style={{ gap: 14 }}>
          <div>
            {header(accountGroups.liquid.name, accountGroups.liquid.tone)}
            <div className="stack" style={{ gap: 10, marginTop: 10 }}>
              {grouped.liquid.map((t) => {
                const Icon = t.icon
                return (
                  <button key={t.id} type="button" className="pickRow" onClick={() => onPick(t.id)}>
                    <span className="pickIcon" style={{ color: '#e09e43' }}>
                      <Icon size={18} />
                    </span>
                    <span className="pickName">{t.name}</span>
                    <ChevronRight size={18} opacity={0.35} />
                  </button>
                )
              })}
            </div>
          </div>

          <div>
            {header(accountGroups.invest.name, accountGroups.invest.tone)}
            <div className="stack" style={{ gap: 10, marginTop: 10 }}>
              {grouped.invest.map((t) => {
                const Icon = t.icon
                return (
                  <button key={t.id} type="button" className="pickRow" onClick={() => onPick(t.id)}>
                    <span className="pickIcon" style={{ color: '#f04638' }}>
                      <Icon size={18} />
                    </span>
                    <span className="pickName">{t.name}</span>
                    <ChevronRight size={18} opacity={0.35} />
                  </button>
                )
              })}
            </div>
          </div>

          <div>
            {header(accountGroups.fixed.name, accountGroups.fixed.tone)}
            <div className="stack" style={{ gap: 10, marginTop: 10 }}>
              {grouped.fixed.map((t) => {
                const Icon = t.icon
                return (
                  <button key={t.id} type="button" className="pickRow" onClick={() => onPick(t.id)}>
                    <span className="pickIcon" style={{ color: '#2d3bb0' }}>
                      <Icon size={18} />
                    </span>
                    <span className="pickName">{t.name}</span>
                    <ChevronRight size={18} opacity={0.35} />
                  </button>
                )
              })}
            </div>
          </div>

          <div>
            {header(accountGroups.receivable.name, accountGroups.receivable.tone)}
            <div className="stack" style={{ gap: 10, marginTop: 10 }}>
              {grouped.receivable.map((t) => {
                const Icon = t.icon
                return (
                  <button key={t.id} type="button" className="pickRow" onClick={() => onPick(t.id)}>
                    <span className="pickIcon" style={{ color: '#6a78ff' }}>
                      <Icon size={18} />
                    </span>
                    <span className="pickName">{t.name}</span>
                    <ChevronRight size={18} opacity={0.35} />
                  </button>
                )
              })}
            </div>
          </div>

          <div>
            {header(accountGroups.debt.name, accountGroups.debt.tone)}
            <div className="stack" style={{ gap: 10, marginTop: 10 }}>
              {grouped.debt.map((t) => {
                const Icon = t.icon
                return (
                  <button key={t.id} type="button" className="pickRow" onClick={() => onPick(t.id)}>
                    <span className="pickIcon" style={{ color: '#7b70c9' }}>
                      <Icon size={18} />
                    </span>
                    <span className="pickName">{t.name}</span>
                    <ChevronRight size={18} opacity={0.35} />
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
