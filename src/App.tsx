import { BarChart3, Palette, PieChart, TrendingUp } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { AssetsScreen } from './screens/AssetsScreen.tsx'
import { TourScreen } from './screens/TourScreen.tsx'
import { SettingsScreen } from './screens/SettingsScreen.tsx'
import { StatsScreen } from './screens/StatsScreen.tsx'
import { TrendScreen } from './screens/TrendScreen.tsx'
import { AddTransactionSheet } from './components/AddTransactionSheet.tsx'
import { EditBalanceSheet } from './components/EditBalanceSheet.tsx'
import { QuickAddSheet } from './components/QuickAddSheet.tsx'
import { AddAccountScreen } from './screens/AddAccountScreen.tsx'
import { type Account } from './lib/accounts.ts'
import { useAccounts } from './lib/useAccounts.ts'
import { useLedger } from './lib/useLedger.ts'
import { themeOptions, type ThemeId } from './lib/themes.ts'
import { useLocalStorageState } from './lib/useLocalStorageState.ts'

type TabId = 'assets' | 'trend' | 'stats' | 'settings'
type ViewId = 'main' | 'addAccount'

export default function App() {
  const [tab, setTab] = useState<TabId>('assets')
  const [view, setView] = useState<ViewId>('main')
  const [theme, setTheme] = useLocalStorageState<ThemeId>('ratio.theme', 'matisse2')
  const [crossPlatformSync, setCrossPlatformSync] = useLocalStorageState<boolean>('ratio.sync', false)
  const [tourSeen, setTourSeen] = useLocalStorageState<boolean>('ratio.tourSeen', false)
  const [addTxOpen, setAddTxOpen] = useState(false)
  const [quickAddOpen, setQuickAddOpen] = useState(false)
  const [editing, setEditing] = useState<Account | null>(null)

  const ledger = useLedger()
  const accounts = useAccounts()

  useEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])

  const title = useMemo(() => {
    switch (tab) {
      case 'assets':
        return '资产'
      case 'trend':
        return '趋势'
      case 'stats':
        return '统计'
      case 'settings':
        return '设置'
      default:
        return 'ratio'
    }
  }, [tab])

  return (
    <div className="appViewport">
      <div className="appFrame">
        {!tourSeen ? (
          <TourScreen onClose={() => setTourSeen(true)} />
        ) : view === 'addAccount' ? (
          <AddAccountScreen
            onBack={() => setView('main')}
            onPick={(type) => {
              const next = accounts.addAccount(type)
              setView('main')
              setEditing(next)
            }}
          />
        ) : (
          <>
            <div className="topBar">
              <div className="topBarRow">
                <div className="title">{title}</div>
                <div style={{ display: 'flex', gap: 10 }}>
                  {tab === 'assets' ? (
                    <button
                      type="button"
                      className="iconBtn iconBtnPrimary"
                      aria-label="add"
                      onClick={() => setQuickAddOpen(true)}
                    >
                      <span style={{ fontWeight: 900, fontSize: 18, lineHeight: 1 }}>+</span>
                    </button>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="content">
              {tab === 'assets' ? (
                <AssetsScreen
                  recent={ledger.recent}
                  grouped={accounts.grouped}
                  getIcon={accounts.getIcon}
                  onEditAccount={(a: Account) => setEditing(a)}
                />
              ) : null}
              {tab === 'trend' ? <TrendScreen /> : null}
              {tab === 'stats' ? <StatsScreen /> : null}
              {tab === 'settings' ? (
                <SettingsScreen
                  themeOptions={themeOptions}
                  theme={theme}
                  onThemeChange={setTheme}
                  crossPlatformSync={crossPlatformSync}
                  onCrossPlatformSyncChange={setCrossPlatformSync}
                />
              ) : null}
            </div>

            <QuickAddSheet
              open={quickAddOpen}
              onClose={() => setQuickAddOpen(false)}
              onAddAccount={() => setView('addAccount')}
              onAddTransaction={() => setAddTxOpen(true)}
            />

            <AddTransactionSheet
              open={addTxOpen}
              onClose={() => setAddTxOpen(false)}
              onSubmit={(tx) => ledger.addTransaction(tx)}
              accounts={accounts.accounts.map((a) => a.name)}
            />

            <EditBalanceSheet
              open={Boolean(editing)}
              title={editing?.name ?? '修改余额'}
              initialValue={editing?.balance ?? 0}
              onClose={() => setEditing(null)}
              onSave={(next) => {
                if (!editing) return
                accounts.updateBalance(editing.id, next)
                setEditing(null)
              }}
            />

            <div className="navBar">
              <div className="navBarGrid">
                <button
                  type="button"
                  className={tab === 'assets' ? 'navItem navItemActive' : 'navItem'}
                  onClick={() => setTab('assets')}
                >
                  <PieChart size={18} />
                  <div className="navLabel">资产</div>
                </button>
                <button
                  type="button"
                  className={tab === 'trend' ? 'navItem navItemActive' : 'navItem'}
                  onClick={() => setTab('trend')}
                >
                  <TrendingUp size={18} />
                  <div className="navLabel">趋势</div>
                </button>
                <button
                  type="button"
                  className={tab === 'stats' ? 'navItem navItemActive' : 'navItem'}
                  onClick={() => setTab('stats')}
                >
                  <BarChart3 size={18} />
                  <div className="navLabel">统计</div>
                </button>
                <button
                  type="button"
                  className={tab === 'settings' ? 'navItem navItemActive' : 'navItem'}
                  onClick={() => setTab('settings')}
                >
                  <Palette size={18} />
                  <div className="navLabel">主题</div>
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
