import { BarChart3, Palette, PieChart, TrendingUp, Plus } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { AssetsScreen } from './screens/AssetsScreen.tsx'
import { TourScreen } from './screens/TourScreen.tsx'
import { SettingsScreen } from './screens/SettingsScreen.tsx'
import { StatsScreen } from './screens/StatsScreen.tsx'
import { TrendScreen } from './screens/TrendScreen.tsx'
import { QuickAddSheet } from './components/QuickAddSheet.tsx'
import { AccountDetailSheet } from './components/AccountDetailSheet.tsx'
import { AddAccountScreen } from './screens/AddAccountScreen.tsx'
import { type Account } from './lib/accounts.ts'
import { useAccounts } from './lib/useAccounts.ts'
import { useSnapshots } from './lib/useSnapshots.ts'
import { useAccountOps } from './lib/useAccountOps.ts'
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
  const [quickAddOpen, setQuickAddOpen] = useState(false)
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null)
  const [detailAction, setDetailAction] = useState<'none' | 'rename' | 'set_balance' | 'adjust' | 'transfer'>('none')

  const accounts = useAccounts()
  const accountOps = useAccountOps()
  const { snapshots, upsertFromAccounts } = useSnapshots()

  useEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])

  useEffect(() => {
    if (accounts.accounts.length === 0) return
    upsertFromAccounts(accounts.accounts)
  }, [accounts.accounts, upsertFromAccounts])

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
            onPick={(type, customName) => {
              const next = accounts.addAccount(type, customName)
              setView('main')
              setSelectedAccountId(next.id)
              setDetailAction('set_balance')
            }}
          />
        ) : (
          <>
            <div className="topBar">
              <div className="topBarRow">
                <div className="title animate-[fadeIn_0.4s_ease-out]">{title}</div>
                <div style={{ display: 'flex', gap: 10 }}>
                  {tab === 'assets' ? (
                    <button
                      type="button"
                      className="iconBtn iconBtnPrimary transition-transform active:scale-95 hover:scale-105"
                      aria-label="add"
                      onClick={() => setQuickAddOpen(true)}
                    >
                      <Plus size={22} strokeWidth={3} />
                    </button>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="content">
              {tab === 'assets' ? (
                <AssetsScreen
                  grouped={accounts.grouped}
                  getIcon={accounts.getIcon}
                  onEditAccount={(a: Account) => {
                    setSelectedAccountId(a.id)
                    setDetailAction('none')
                  }}
                />
              ) : null}
              {tab === 'trend' ? <TrendScreen snapshots={snapshots} /> : null}
              {tab === 'stats' ? <StatsScreen snapshots={snapshots} /> : null}
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
            />

            <AccountDetailSheet
              open={Boolean(selectedAccountId)}
              accountId={selectedAccountId}
              accounts={accounts.accounts}
              ops={accountOps.ops}
              initialAction={detailAction}
              onClose={() => {
                setSelectedAccountId(null)
                setDetailAction('none')
              }}
              onRename={accounts.renameAccount}
              onSetBalance={accounts.updateBalance}
              onAdjust={accounts.adjustBalance}
              onTransfer={accounts.transfer}
              onAddOp={accountOps.addOp}
            />

            <div className="navBar">
              <div className="navBarGrid">
                <button
                  type="button"
                  className={tab === 'assets' ? 'navItem navItemActive' : 'navItem'}
                  onClick={() => setTab('assets')}
                >
                  <PieChart size={20} strokeWidth={tab === 'assets' ? 2.5 : 2} />
                  <div className="navLabel">资产</div>
                </button>
                <button
                  type="button"
                  className={tab === 'trend' ? 'navItem navItemActive' : 'navItem'}
                  onClick={() => setTab('trend')}
                >
                  <TrendingUp size={20} strokeWidth={tab === 'trend' ? 2.5 : 2} />
                  <div className="navLabel">趋势</div>
                </button>
                <button
                  type="button"
                  className={tab === 'stats' ? 'navItem navItemActive' : 'navItem'}
                  onClick={() => setTab('stats')}
                >
                  <BarChart3 size={20} strokeWidth={tab === 'stats' ? 2.5 : 2} />
                  <div className="navLabel">统计</div>
                </button>
                <button
                  type="button"
                  className={tab === 'settings' ? 'navItem navItemActive' : 'navItem'}
                  onClick={() => setTab('settings')}
                >
                  <Palette size={20} strokeWidth={tab === 'settings' ? 2.5 : 2} />
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
