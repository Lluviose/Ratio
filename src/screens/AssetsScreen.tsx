import { AnimatePresence, motion, useMotionValue, useTransform } from 'framer-motion'
import { BarChart3, Eye, MoreHorizontal, Plus, TrendingUp } from 'lucide-react'
import { type ComponentType, useEffect, useMemo, useRef, useState } from 'react'
import type { Account, AccountGroup, AccountTypeId } from '../lib/accounts'
import { formatCny } from '../lib/format'
import { AssetsListPage } from './AssetsListPage'
import { AssetsRatioPage } from './AssetsRatioPage'
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
  onAddAccount: () => void
  onNavigate: (tab: 'trend' | 'stats' | 'settings') => void
}) {
  const { grouped, getIcon, onEditAccount, onAddAccount, onNavigate } = props

  const viewportRef = useRef<HTMLDivElement | null>(null)
  const scrollerRef = useRef<HTMLDivElement | null>(null)
  const moreRef = useRef<HTMLDivElement | null>(null)
  const [selectedType, setSelectedType] = useState<AccountTypeId | null>(null)
  const [moreOpen, setMoreOpen] = useState(false)
  const [viewport, setViewport] = useState({ w: 0, h: 0 })
  const scrollLeft = useMotionValue(0)

  const accounts = useMemo(() => grouped.groupCards.flatMap((g) => g.accounts), [grouped.groupCards])

  const scrollToPage = (index: number) => {
    const el = scrollerRef.current
    if (!el) return
    const w = el.clientWidth || 0
    el.scrollTo({ left: w * index, behavior: 'smooth' })
  }

  useEffect(() => {
    const el = viewportRef.current
    if (!el) return

    const update = () => setViewport({ w: el.clientWidth, h: el.clientHeight })
    update()

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', update)
      return () => window.removeEventListener('resize', update)
    }

    const ro = new ResizeObserver(() => update())
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    if (!moreOpen) return

    const onPointerDown = (e: PointerEvent) => {
      const root = moreRef.current
      if (!root) return
      if (e.target instanceof Node && root.contains(e.target)) return
      setMoreOpen(false)
    }

    document.addEventListener('pointerdown', onPointerDown, { capture: true })
    return () => document.removeEventListener('pointerdown', onPointerDown, { capture: true })
  }, [moreOpen])

  useEffect(() => {
    const el = scrollerRef.current
    if (!el) return

    const raf = requestAnimationFrame(() => {
      const w = el.clientWidth || 0
      if (w <= 0) return
      el.scrollLeft = w
      scrollLeft.set(w)
    })

    return () => cancelAnimationFrame(raf)
  }, [scrollLeft])

  useEffect(() => {
    const el = scrollerRef.current
    if (!el) return

    let raf = 0
    const onScroll = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        scrollLeft.set(el.scrollLeft)
      })
    }

    el.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      cancelAnimationFrame(raf)
      el.removeEventListener('scroll', onScroll)
    }
  }, [scrollLeft])

  const ratioProgress = useTransform(scrollLeft, (v) => {
    const w = viewport.w || 1
    const p = v / w
    return Math.max(0, Math.min(1, p))
  })

  const overlayFade = useTransform(scrollLeft, (v) => {
    const w = viewport.w || 1
    const idx = v / w
    if (idx <= 1) return 1
    const t = (idx - 1) / 0.08
    return Math.max(0, 1 - t)
  })

  const listHeaderY = useTransform(ratioProgress, [0, 1], [-120, 0])
  const listHeaderOpacity = ratioProgress

  const labelsOpacity = useTransform(ratioProgress, [0, 1], [1, 0])

  const miniBarOpacity = useTransform(ratioProgress, [0, 0.92, 1], [0, 0, 1])
  const miniBarY = useTransform(ratioProgress, [0, 1], [16, 0])

  const chart = useMemo(() => {
    const assetsTotal = grouped.assetsTotal || 0
    const debtTotal = grouped.debtTotal || 0
    const pct = (amount: number, total: number) => (total > 0 ? Math.round((amount / total) * 100) : 0)

    const order = ['liquid', 'invest', 'fixed', 'receivable']
    const rank = new Map(order.map((id, i) => [id, i]))

    const assets = grouped.groupCards
      .filter((g) => g.group.id !== 'debt' && g.total > 0)
      .slice()
      .sort((a, b) => (rank.get(a.group.id) ?? 999) - (rank.get(b.group.id) ?? 999))
      .map((g) => ({
        id: g.group.id,
        name: g.group.name,
        tone: g.group.tone,
        amount: g.total,
        percent: pct(g.total, assetsTotal),
        darkText: g.group.id === 'liquid' || g.group.id === 'receivable',
      }))

    const debtTone = grouped.groupCards.find((g) => g.group.id === 'debt')?.group.tone ?? '#d9d4f6'

    const debt = {
      name: '负债',
      tone: debtTone,
      amount: debtTotal,
      percent: pct(debtTotal, assetsTotal),
    }

    return { assets, debt }
  }, [grouped])

  const fullTop = 64
  const collapsedTop = 104
  const peekWidth = Math.round(Math.min(140, Math.max(96, viewport.w * 0.28)))
  const fullHeight = Math.max(0, viewport.h - fullTop)
  const collapsedHeight = Math.round(Math.min(460, Math.max(260, viewport.h * 0.58)))

  const chartTop = useTransform(ratioProgress, [0, 1], [fullTop, collapsedTop])
  const chartWidth = useTransform(ratioProgress, [0, 1], [viewport.w, peekWidth])
  const chartHeight = useTransform(ratioProgress, [0, 1], [fullHeight, collapsedHeight])

  return (
    <div ref={viewportRef} className="relative w-full h-full overflow-hidden" style={{ background: 'var(--bg)' }}>
      {/* Ratio blocks background (collapses into left peek on list page) */}
      {viewport.w > 0 && viewport.h > 0 ? (
        <motion.div className="absolute inset-0 z-0 pointer-events-none" style={{ opacity: overlayFade }}>
          <motion.div
            className="absolute left-0 rounded-[32px] overflow-hidden"
            style={{
              top: chartTop,
              width: chartWidth,
              height: chartHeight,
            }}
          >
            <div className="w-full h-full flex">
              <div className="h-full flex flex-col justify-center p-4" style={{ background: chart.debt.tone, width: '24%' }}>
                <motion.div style={{ opacity: labelsOpacity }}>
                  <div className="text-[34px] font-semibold tracking-tight leading-none text-slate-900">
                    {chart.debt.percent}
                    <span className="text-[14px] align-top ml-0.5">%</span>
                  </div>
                  <div className="mt-1 text-[12px] font-medium text-slate-800/80">{chart.debt.name}</div>
                </motion.div>
              </div>

              <div className="flex-1 h-full flex flex-col">
                {chart.assets.map((s) => (
                  <div
                    key={s.id}
                    className="p-4"
                    style={{
                      background: s.tone,
                      flexGrow: s.amount,
                      minHeight: 72,
                      color: s.darkText ? 'rgba(11, 15, 26, 0.92)' : 'rgba(255,255,255,0.95)',
                    }}
                  >
                    <motion.div style={{ opacity: labelsOpacity }}>
                      <div className="text-[38px] font-semibold tracking-tight leading-none">
                        {s.percent}
                        <span className="text-[14px] align-top ml-0.5">%</span>
                      </div>
                      <div className="mt-1 text-[12px] font-medium opacity-85">{s.name}</div>
                    </motion.div>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        </motion.div>
      ) : null}

      <motion.div className="absolute inset-x-0 top-0 z-20 px-4 pt-6 pointer-events-none" style={{ opacity: overlayFade }}>
        <motion.div
          className="flex items-start justify-between gap-3 pointer-events-auto"
          style={{ y: listHeaderY, opacity: listHeaderOpacity }}
        >
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[12px] font-medium text-slate-500/80">
              <span>我的净资产 (CNY)</span>
              <Eye size={14} className="text-slate-400" />
            </div>
            <div className="mt-1 text-[34px] font-semibold tracking-tight text-slate-900">{formatCny(grouped.netWorth)}</div>
          </div>

          <button
            type="button"
            onClick={onAddAccount}
            className="w-10 h-10 rounded-full bg-[#eae9ff] text-[#4f46e5] flex items-center justify-center shadow-sm"
            aria-label="add"
          >
            <Plus size={22} strokeWidth={2.75} />
          </button>
        </motion.div>
      </motion.div>

      <motion.div className="absolute left-4 bottom-4 z-20 pointer-events-none" style={{ opacity: overlayFade }}>
        <motion.div className="pointer-events-auto" style={{ opacity: miniBarOpacity, y: miniBarY }}>
          <div ref={moreRef} className="relative">
            <div className="flex items-center gap-1 bg-white/80 backdrop-blur-md border border-white/70 shadow-sm rounded-full p-1">
              <button
                type="button"
                className="w-11 h-11 rounded-full flex items-center justify-center text-slate-700 hover:bg-black/5"
                onClick={() => onNavigate('stats')}
                aria-label="stats"
              >
                <BarChart3 size={20} strokeWidth={2.3} />
              </button>
              <button
                type="button"
                className="w-11 h-11 rounded-full flex items-center justify-center text-slate-700 hover:bg-black/5"
                onClick={() => onNavigate('trend')}
                aria-label="trend"
              >
                <TrendingUp size={20} strokeWidth={2.3} />
              </button>
              <button
                type="button"
                className="w-11 h-11 rounded-full flex items-center justify-center text-slate-700 hover:bg-black/5"
                onClick={() => setMoreOpen((v) => !v)}
                aria-label="more"
              >
                <MoreHorizontal size={20} strokeWidth={2.3} />
              </button>
            </div>

            <AnimatePresence>
              {moreOpen ? (
                <motion.div
                  key="menu"
                  initial={{ opacity: 0, y: 8, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 8, scale: 0.98 }}
                  transition={{ duration: 0.15 }}
                  className="absolute left-0 bottom-full mb-2 min-w-[160px] rounded-[18px] bg-white/90 backdrop-blur-md border border-white/70 shadow-[var(--shadow-hover)] overflow-hidden"
                >
                  <button
                    type="button"
                    className="w-full px-4 py-3 text-left text-[13px] font-medium text-slate-800 hover:bg-black/5"
                    onClick={() => {
                      setMoreOpen(false)
                      onNavigate('settings')
                    }}
                  >
                    设置
                  </button>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>
        </motion.div>
      </motion.div>

      <div
        ref={scrollerRef}
        className="relative z-10 w-full h-full overflow-x-auto snap-x snap-mandatory flex scrollbar-hide overscroll-x-contain scroll-smooth"
        style={{ WebkitOverflowScrolling: 'touch' }}
      >
        <div
          className="w-full h-full flex-shrink-0 snap-center snap-always overflow-y-hidden"
          style={{ overscrollBehaviorY: 'none', touchAction: 'pan-x' }}
        >
          <AssetsRatioPage onBack={() => scrollToPage(1)} />
        </div>

        <div className="w-full h-full flex-shrink-0 snap-center snap-always overflow-y-auto">
          <AssetsListPage
            grouped={grouped}
            getIcon={getIcon}
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
    </div>
  )
}
