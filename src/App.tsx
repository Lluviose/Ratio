import { BarChart3, ChevronLeft, Settings as SettingsIcon, TrendingUp, Wallet } from 'lucide-react'
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { AssetsScreen } from './screens/AssetsScreen'
import { TourScreen } from './screens/TourScreen'
import { AccountDetailSheet } from './components/AccountDetailSheet'
import { AddAccountScreen } from './screens/AddAccountScreen'
import { LazyAiAssistant } from './components/LazyAiAssistant'
import { LazyLoadBoundary } from './components/LazyLoadBoundary'
import { ScreenSkeleton } from './components/ScreenSkeleton'
import { type Account } from './lib/accounts'
import { useAccounts } from './lib/useAccounts'
import { useSnapshots } from './lib/useSnapshots'
import { useAccountOps } from './lib/useAccountOps'
import { accountDetailSheetLayoutId } from './lib/layoutIds'
import { pickForegroundColor, pickRandomThemeId, realThemeOptions, themeOptions, type RealThemeId, type ThemeId } from './lib/themes'
import { useLocalStorageState } from './lib/useLocalStorageState'
import { useDailySnapshotSync } from './lib/useDailySnapshotSync'
import { OverlayProvider } from './components/OverlayProvider'
import { navSpring, screenTransition } from './lib/motionPresets'
import { useReducedMotion } from './lib/useReducedMotion'

type TabId = 'assets' | 'trend' | 'stats' | 'settings'
type ViewId = 'main' | 'addAccount'
type ThemeChangeOrigin = { x: number; y: number }
type ThemeTransition = {
  key: number
  targetTheme: ThemeId
  color: string
  origin: ThemeChangeOrigin
  radius: number
  reducedMotion: boolean
}

const tabOrder: Record<TabId, number> = {
  assets: 0,
  trend: 1,
  stats: 2,
  settings: 3,
}

const screenVariants = {
  initial: (direction: number) => ({
    opacity: 0,
    x: direction >= 0 ? 22 : -22,
  }),
  animate: {
    opacity: 1,
    x: 0,
  },
  exit: (direction: number) => ({
    opacity: 0,
    x: direction >= 0 ? -22 : 22,
  }),
}

const loadTrendScreen = () => import('./screens/TrendScreen')
const loadStatsScreen = () => import('./screens/StatsScreen')
const loadSettingsScreen = () => import('./screens/SettingsScreen')

const TrendScreen = lazy(() => loadTrendScreen().then((mod) => ({ default: mod.TrendScreen })))
const StatsScreen = lazy(() => loadStatsScreen().then((mod) => ({ default: mod.StatsScreen })))
const SettingsScreen = lazy(() => loadSettingsScreen().then((mod) => ({ default: mod.SettingsScreen })))

function preloadTab(tab: TabId) {
  if (tab === 'trend') return loadTrendScreen()
  if (tab === 'stats') return loadStatsScreen()
  if (tab === 'settings') return loadSettingsScreen()
  return Promise.resolve()
}

function scheduleIdleWork(work: () => void) {
  if (typeof window === 'undefined') return () => {}

  const idleWindow = window as Window & {
    requestIdleCallback?: (callback: IdleRequestCallback, options?: IdleRequestOptions) => number
    cancelIdleCallback?: (handle: number) => void
  }

  if (typeof idleWindow.requestIdleCallback === 'function') {
    const id = idleWindow.requestIdleCallback(work, { timeout: 3500 })
    return () => idleWindow.cancelIdleCallback?.(id)
  }

  const timer = window.setTimeout(work, 1400)
  return () => window.clearTimeout(timer)
}

function ScreenLoadError() {
  return (
    <div className="muted" style={{ padding: 28, textAlign: 'center', fontSize: 13, fontWeight: 800 }}>
      模块加载失败，请检查网络后刷新
    </div>
  )
}

function BottomTabNav(props: { tab: TabId; onNavigate: (tab: TabId) => void }) {
  const { tab, onNavigate } = props
  const options: Array<{ id: TabId; label: string; icon: typeof Wallet }> = [
    { id: 'assets', label: '资产', icon: Wallet },
    { id: 'trend', label: '趋势', icon: TrendingUp },
    { id: 'stats', label: '统计', icon: BarChart3 },
    { id: 'settings', label: '设置', icon: SettingsIcon },
  ]

  return (
    <div className="navBar">
      <div className="navBarGrid">
        {options.map((item) => {
          const active = item.id === tab
          const Icon = item.icon
          return (
            <button
              key={item.id}
              type="button"
              className={active ? 'navItem navItemActive' : 'navItem'}
              onClick={() => onNavigate(item.id)}
              aria-current={active ? 'page' : undefined}
            >
              {active ? <motion.div className="navActiveIndicator" layoutId="bottomNavActive" transition={navSpring} /> : null}
              <motion.span className="navIcon" animate={{ y: active ? -1 : 0, opacity: active ? 1 : 0.72 }} transition={screenTransition}>
                <Icon size={20} strokeWidth={2.5} />
              </motion.span>
              <motion.span className="navLabel" animate={{ opacity: active ? 1 : 0.68 }} transition={screenTransition}>
                {item.label}
              </motion.span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

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

function getThemeTransitionRadius(origin: ThemeChangeOrigin): number {
  if (typeof window === 'undefined') return 900
  const maxX = Math.max(origin.x, window.innerWidth - origin.x)
  const maxY = Math.max(origin.y, window.innerHeight - origin.y)
  return Math.ceil(Math.hypot(maxX, maxY) + 96)
}

function getThemeTransitionOrigin(origin?: ThemeChangeOrigin): ThemeChangeOrigin {
  if (origin) return origin
  if (typeof window === 'undefined') return { x: 200, y: 400 }
  return { x: window.innerWidth / 2, y: window.innerHeight / 2 }
}

function pickNextRandomTheme(current: RealThemeId): RealThemeId {
  let next = pickRandomThemeId()
  if (next !== current || realThemeOptions.length <= 1) return next

  const fallback = realThemeOptions.find((t) => t.id !== current && t.id !== 'random')?.id as RealThemeId | undefined
  if (fallback) next = fallback
  return next
}

function ThemeTransitionOverlay(props: { transition: ThemeTransition }) {
  const { transition } = props
  const { color, origin, radius, reducedMotion } = transition

  if (reducedMotion) {
    return (
      <motion.div
        className="themeTransitionLayer"
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.2 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
        style={{ background: color }}
      />
    )
  }

  return (
    <motion.div
      className="themeTransitionLayer"
      initial={{ opacity: 1 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
    >
      <motion.div
        className="themeTransitionBloom"
        initial={{ scale: 0.04, opacity: 0.62 }}
        animate={{ scale: 1, opacity: [0.62, 0.46, 0.18] }}
        transition={{
          scale: { duration: 0.58, ease: [0.16, 1, 0.3, 1] },
          opacity: { duration: 0.72, times: [0, 0.45, 1], ease: [0.16, 1, 0.3, 1] },
        }}
        style={{
          left: origin.x - radius,
          top: origin.y - radius,
          width: radius * 2,
          height: radius * 2,
          background: `radial-gradient(circle, ${color} 0%, ${color} 42%, transparent 72%)`,
        }}
      />
      <motion.div
        className="themeTransitionWash"
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 0.16, 0.08] }}
        transition={{ duration: 0.72, times: [0, 0.45, 1], ease: [0.16, 1, 0.3, 1] }}
        style={{ background: color }}
      />
    </motion.div>
  )
}

export default function App() {
  const [tab, setTab] = useState<TabId>('assets')
  const [view, setView] = useState<ViewId>('main')
  const [theme, setTheme] = useLocalStorageState<ThemeId>('ratio.theme', 'matisse2')
  const [randomTheme, setRandomTheme] = useState<RealThemeId>(() => pickRandomThemeId())
  const [tourSeen, setTourSeen] = useLocalStorageState<boolean>('ratio.tourSeen', false)
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null)
  const [detailTransitionAccountId, setDetailTransitionAccountId] = useState<string | null>(null)
  const [detailAction, setDetailAction] = useState<'none' | 'rename' | 'set_balance' | 'adjust' | 'transfer'>('none')
  const [hasVisitedAssets, setHasVisitedAssets] = useState(false)
  const [tabDirection, setTabDirection] = useState(1)
  const [themeTransition, setThemeTransition] = useState<ThemeTransition | null>(null)
  const themeTransitionSeqRef = useRef(0)
  const themeTransitionTimersRef = useRef<number[]>([])

  const accounts = useAccounts()
  const accountOps = useAccountOps()
  const { snapshots, upsertFromAccounts } = useSnapshots()
  const prefersReducedMotion = useReducedMotion()

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

  useDailySnapshotSync(accounts.accounts, snapshots.length, upsertFromAccounts)

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

  useEffect(() => {
    if (!tourSeen) return

    return scheduleIdleWork(() => {
      void loadTrendScreen().catch(() => undefined)
      void loadStatsScreen().catch(() => undefined)
      void loadSettingsScreen().catch(() => undefined)
    })
  }, [tourSeen])

  const clearThemeTransitionTimers = useCallback(() => {
    for (const timer of themeTransitionTimersRef.current) {
      window.clearTimeout(timer)
    }
    themeTransitionTimersRef.current = []
  }, [])

  useEffect(() => clearThemeTransitionTimers, [clearThemeTransitionTimers])

  const handleThemeChange = useCallback(
    (id: ThemeId, origin?: ThemeChangeOrigin) => {
      if (id !== 'random' && id === theme) return

      clearThemeTransitionTimers()
      const nextRandomTheme = id === 'random' ? pickNextRandomTheme(randomTheme) : randomTheme
      const nextResolvedTheme = id === 'random' ? nextRandomTheme : id
      const nextTheme = realThemeOptions.find((t) => t.id === nextResolvedTheme) || realThemeOptions[0]
      const nextOrigin = getThemeTransitionOrigin(origin)
      const key = themeTransitionSeqRef.current + 1
      themeTransitionSeqRef.current = key

      setThemeTransition({
        key,
        targetTheme: id,
        color: nextTheme.colors.invest,
        origin: nextOrigin,
        radius: getThemeTransitionRadius(nextOrigin),
        reducedMotion: prefersReducedMotion,
      })

      const applyDelay = prefersReducedMotion ? 70 : 210
      const clearDelay = prefersReducedMotion ? 260 : 820

      const applyTimer = window.setTimeout(() => {
        if (id === 'random') setRandomTheme(nextRandomTheme)
        setTheme(id)
      }, applyDelay)

      const clearTimer = window.setTimeout(() => {
        setThemeTransition((current) => (current?.key === key ? null : current))
      }, clearDelay)

      themeTransitionTimersRef.current = [applyTimer, clearTimer]
    },
    [clearThemeTransitionTimers, prefersReducedMotion, randomTheme, setTheme, theme],
  )

  const navigateTab = (next: TabId) => {
    if (next === tab) return
    void preloadTab(next).catch(() => undefined)
    setTabDirection(Math.sign(tabOrder[next] - tabOrder[tab]) || 1)
    setTab(next)
  }

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
                  setDetailTransitionAccountId(null)
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
                        onClick={() => navigateTab('assets')}
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

              <div className={tab === 'assets' ? 'relative flex-1 min-h-0' : 'content contentWithNav relative'}>
                <AnimatePresence mode="wait" custom={tabDirection}>
                  {tab === 'assets' && (
                    <motion.div
                      key="assets"
                      custom={tabDirection}
                      variants={screenVariants}
                      initial="initial"
                      animate="animate"
                      exit="exit"
                      transition={screenTransition}
                      style={{ height: '100%' }}
                    >
                      <AssetsScreen
                        grouped={groupedWithTheme}
                        getIcon={accounts.getIcon}
                        onAddAccount={() => setView('addAccount')}
                        addButtonTone={themeColors.debt}
                        onNavigate={navigateTab}
                        onEditAccount={(a: Account) => {
                          setSelectedAccountId(a.id)
                          setDetailTransitionAccountId(a.id)
                          setDetailAction('none')
                        }}
                        skipInitialAnimation={hasVisitedAssets}
                        activeAccountId={detailTransitionAccountId}
                      />
                    </motion.div>
                  )}
                  {tab === 'trend' && (
                    <motion.div
                      key="trend"
                      custom={tabDirection}
                      variants={screenVariants}
                      initial="initial"
                      animate="animate"
                      exit="exit"
                      transition={screenTransition}
                      style={{ height: '100%' }}
                    >
                      <LazyLoadBoundary fallback={<ScreenLoadError />}>
                        <Suspense fallback={<ScreenSkeleton screen="trend" />}>
                          <TrendScreen snapshots={snapshots} colors={themeColors} />
                        </Suspense>
                      </LazyLoadBoundary>
                    </motion.div>
                  )}
                  {tab === 'stats' && (
                    <motion.div
                      key="stats"
                      custom={tabDirection}
                      variants={screenVariants}
                      initial="initial"
                      animate="animate"
                      exit="exit"
                      transition={screenTransition}
                      style={{ height: '100%' }}
                    >
                      <LazyLoadBoundary fallback={<ScreenLoadError />}>
                        <Suspense fallback={<ScreenSkeleton screen="stats" />}>
                          <StatsScreen snapshots={snapshots} colors={themeColors} />
                        </Suspense>
                      </LazyLoadBoundary>
                    </motion.div>
                  )}
                  {tab === 'settings' && (
                    <motion.div
                      key="settings"
                      custom={tabDirection}
                      variants={screenVariants}
                      initial="initial"
                      animate="animate"
                      exit="exit"
                      transition={screenTransition}
                      style={{ height: '100%' }}
                    >
                      <LazyLoadBoundary fallback={<ScreenLoadError />}>
                        <Suspense fallback={<ScreenSkeleton screen="settings" />}>
                          <SettingsScreen
                            themeOptions={themeOptions}
                            theme={themeTransition?.targetTheme ?? theme}
                            onThemeChange={handleThemeChange}
                          />
                        </Suspense>
                      </LazyLoadBoundary>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {tab !== 'assets' ? <BottomTabNav tab={tab} onNavigate={navigateTab} /> : null}

              {tab === 'assets' && view === 'main' && selectedAccountId == null ? <LazyAiAssistant /> : null}

              <AccountDetailSheet
                open={Boolean(selectedAccountId)}
                accountId={selectedAccountId ?? detailTransitionAccountId}
                accounts={accounts.accounts}
                ops={accountOps.ops}
                initialAction={detailAction}
                sheetMotion={detailTransitionAccountId ? 'morph' : 'slide'}
                sheetLayoutId={detailTransitionAccountId ? accountDetailSheetLayoutId(detailTransitionAccountId) : undefined}
                onExitComplete={() => setDetailTransitionAccountId(null)}
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
                onUpdateOp={accountOps.updateOp}
                colors={themeColors}
              />
            </motion.div>
          )}
          </AnimatePresence>
          <AnimatePresence initial={false}>
            {themeTransition ? <ThemeTransitionOverlay key={themeTransition.key} transition={themeTransition} /> : null}
          </AnimatePresence>
        </OverlayProvider>
      </div>
    </div>
  )
}
