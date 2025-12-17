import { ChevronLeft } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
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
        <AnimatePresence mode="wait">
          {!tourSeen ? (
            <motion.div
              key="tour"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.05 }}
              transition={{ duration: 0.3 }}
              style={{ height: '100%' }}
            >
              <TourScreen onClose={() => setTourSeen(true)} />
            </motion.div>
          ) : view === 'addAccount' ? (
            <motion.div
              key="addAccount"
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%', zIndex: 10 }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              style={{ height: '100%', position: 'absolute', inset: 0, background: 'var(--bg)', zIndex: 10 }}
            >
              <AddAccountScreen
                onBack={() => setView('main')}
                onPick={(type, customName) => {
                  const next = accounts.addAccount(type, customName)
                  setView('main')
                  setSelectedAccountId(next.id)
                  setDetailAction('set_balance')
                }}
              />
            </motion.div>
          ) : (
            <motion.div
              key="main"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              style={{ height: '100%', display: 'flex', flexDirection: 'column' }}
            >
              {tab !== 'assets' ? (
                <div className="topBar">
                  <div className="topBarRow">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <button
                        type="button"
                        className="iconBtn"
                        aria-label="back"
                        onClick={() => setTab('assets')}
                      >
                        <ChevronLeft size={20} strokeWidth={2.5} />
                      </button>
                      <AnimatePresence mode="wait">
                        <motion.div
                          key={title}
                          initial={{ y: 10, opacity: 0 }}
                          animate={{ y: 0, opacity: 1 }}
                          exit={{ y: -10, opacity: 0 }}
                          transition={{ duration: 0.2 }}
                          className="title"
                        >
                          {title}
                        </motion.div>
                      </AnimatePresence>
                    </div>
                    <div style={{ display: 'flex', gap: 10 }} />
                  </div>
                </div>
              ) : null}

              <div className={tab === 'assets' ? 'relative flex-1 min-h-0' : 'content relative'}>
                <AnimatePresence mode="wait">
                  {tab === 'assets' && (
                    <motion.div
                      key="assets"
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 20 }}
                      transition={{ duration: 0.2 }}
                      style={{ height: '100%' }}
                    >
                      <AssetsScreen
                        grouped={accounts.grouped}
                        getIcon={accounts.getIcon}
                        onAddAccount={() => setQuickAddOpen(true)}
                        onNavigate={(next) => setTab(next)}
                        onEditAccount={(a: Account) => {
                          setSelectedAccountId(a.id)
                          setDetailAction('none')
                        }}
                      />
                    </motion.div>
                  )}
                  {tab === 'trend' && (
                    <motion.div
                      key="trend"
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      transition={{ duration: 0.2 }}
                      style={{ height: '100%' }}
                    >
                      <TrendScreen snapshots={snapshots} />
                    </motion.div>
                  )}
                  {tab === 'stats' && (
                    <motion.div
                      key="stats"
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      transition={{ duration: 0.2 }}
                      style={{ height: '100%' }}
                    >
                      <StatsScreen snapshots={snapshots} />
                    </motion.div>
                  )}
                  {tab === 'settings' && (
                    <motion.div
                      key="settings"
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      transition={{ duration: 0.2 }}
                      style={{ height: '100%' }}
                    >
                      <SettingsScreen
                        themeOptions={themeOptions}
                        theme={theme}
                        onThemeChange={setTheme}
                        crossPlatformSync={crossPlatformSync}
                        onCrossPlatformSyncChange={setCrossPlatformSync}
                      />
                    </motion.div>
                  )}
                </AnimatePresence>
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
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
