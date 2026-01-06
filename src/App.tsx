import { ChevronLeft } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { AssetsScreen } from './screens/AssetsScreen'
import { TourScreen } from './screens/TourScreen'
import { SettingsScreen } from './screens/SettingsScreen'
import { StatsScreen } from './screens/StatsScreen'
import { TrendScreen } from './screens/TrendScreen'
import { AccountDetailSheet } from './components/AccountDetailSheet'
import { AddAccountScreen } from './screens/AddAccountScreen'
import { AiAssistant } from './components/AiAssistant'
import { type Account } from './lib/accounts'
import { useAccounts } from './lib/useAccounts'
import { useSnapshots } from './lib/useSnapshots'
import { useAccountOps } from './lib/useAccountOps'
import { pickForegroundColor, pickRandomThemeId, realThemeOptions, themeOptions, type RealThemeId, type ThemeId } from './lib/themes'
import { useLocalStorageState } from './lib/useLocalStorageState'
import { OverlayProvider } from './components/OverlayProvider'

type TabId = 'assets' | 'trend' | 'stats' | 'settings'
type ViewId = 'main' | 'addAccount'

function hexToRgbTriplet(hex: string): string | null {
  const raw = hex.trim().replace(/^#/, '')
  if (raw.length === 3) {
    const r = Number.parseInt(raw[0] + raw[0], 16)
    const g = Number.parseInt(raw[1] + raw[1], 16)
    const b = Number.parseInt(raw[2] + raw[2], 16)
    if ([r, g, b].some((v) => Number.isNaN(v))) return null
    return `${r} ${g} ${b}`
  }
  if (raw.length === 6) {
    const r = Number.parseInt(raw.slice(0, 2), 16)
    const g = Number.parseInt(raw.slice(2, 4), 16)
    const b = Number.parseInt(raw.slice(4, 6), 16)
    if ([r, g, b].some((v) => Number.isNaN(v))) return null
    return `${r} ${g} ${b}`
  }
  return null
}

export default function App() {
  const [tab, setTab] = useState<TabId>('assets')
  const [view, setView] = useState<ViewId>('main')
  const [theme, setTheme] = useLocalStorageState<ThemeId>('ratio.theme', 'matisse2')
  const [randomTheme, setRandomTheme] = useState<RealThemeId>(() => pickRandomThemeId())
  const [tourSeen, setTourSeen] = useLocalStorageState<boolean>('ratio.tourSeen', false)
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null)
  const [detailAction, setDetailAction] = useState<'none' | 'rename' | 'set_balance' | 'adjust' | 'transfer'>('none')
  const [hasVisitedAssets, setHasVisitedAssets] = useState(false)

  const accounts = useAccounts()
  const accountOps = useAccountOps()
  const { snapshots, upsertFromAccounts } = useSnapshots()

  const resolvedTheme = theme === 'random' ? randomTheme : theme

  const currentTheme = useMemo(
    () => realThemeOptions.find((t) => t.id === resolvedTheme) || realThemeOptions[0],
    [resolvedTheme],
  )
  const themeColors = currentTheme.colors

  const groupedWithTheme = useMemo(() => {
    const cards = accounts.grouped.groupCards.map((c) => ({
      ...c,
      group: {
        ...c.group,
        tone: themeColors[c.group.id],
      },
    }))
    return {
      ...accounts.grouped,
      groupCards: cards,
    }
  }, [accounts.grouped, themeColors])

  useEffect(() => {
    document.documentElement.dataset.theme = resolvedTheme
    document.documentElement.style.setProperty('--primary', themeColors.invest)
    document.documentElement.style.setProperty('--primary-contrast', pickForegroundColor(themeColors.invest))
    const rgb = hexToRgbTriplet(themeColors.invest)
    if (rgb) document.documentElement.style.setProperty('--primary-rgb', rgb)
  }, [resolvedTheme, themeColors])

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

  // 追踪是否已访问过资产页面，用于控制返回时不显示初始动画
  useEffect(() => {
    if (tab === 'assets') {
      // 延迟设置，确保首次加载时动画正常播放
      const timer = setTimeout(() => {
        setHasVisitedAssets(true)
      }, 800)
      return () => clearTimeout(timer)
    }
  }, [tab])

  return (
    <div className="appViewport">
      <div className="appFrame">
        <OverlayProvider>
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
                colors={themeColors}
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
                        grouped={groupedWithTheme}
                        getIcon={accounts.getIcon}
                        onAddAccount={() => setView('addAccount')}
                        addButtonTone={themeColors.debt}
                        onNavigate={(next) => setTab(next)}
                        onEditAccount={(a: Account) => {
                          setSelectedAccountId(a.id)
                          setDetailAction('none')
                        }}
                        skipInitialAnimation={hasVisitedAssets}
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
                      <TrendScreen snapshots={snapshots} colors={themeColors} />
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
                      <StatsScreen snapshots={snapshots} colors={themeColors} />
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
                        onThemeChange={(id) => {
                          if (id === 'random') setRandomTheme(pickRandomThemeId())
                          setTheme(id)
                        }}
                      />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {tab === 'assets' && view === 'main' && selectedAccountId == null ? <AiAssistant /> : null}

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
                onDelete={accounts.deleteAccount}
                onAddOp={accountOps.addOp}
                onDeleteOp={accountOps.deleteOp}
                colors={themeColors}
              />
            </motion.div>
          )}
          </AnimatePresence>
        </OverlayProvider>
      </div>
    </div>
  )
}
