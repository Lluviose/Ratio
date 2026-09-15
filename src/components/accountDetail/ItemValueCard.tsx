import { motion, AnimatePresence } from 'framer-motion'
import { CalendarDays, ChevronRight, Tag } from 'lucide-react'
import type { Account } from '../../lib/accounts'
import { formatDateKey, formatRatioPercent, summarizeItemValue } from '../../lib/accountCost'
import { progressFillTransition, standardEase } from '../../lib/motionPresets'
import { formatCny } from './format'

// 物品价值卡：原值 / 累计减值 / 保值率。点击进入「记录/修正原值」。
// 保值条只动 scaleX（transform），比例大于 1（增值）时封顶满格并以描边提示。
export function ItemValueCard(props: {
  account: Account
  tone: string
  onEditCost: () => void
}) {
  const { account, tone, onEditCost } = props
  const summary = summarizeItemValue(account.cost, account.balance)

  if (!summary) {
    return (
      <motion.button
        type="button"
        onClick={onEditCost}
        whileTap={{ scale: 0.985 }}
        transition={{ type: 'spring', stiffness: 700, damping: 40, mass: 0.6 }}
        className="mt-4 w-full rounded-[22px] border border-dashed border-slate-300/80 bg-white/50 px-4 py-4 text-left"
        aria-label="record cost"
      >
        <div className="flex items-center gap-3">
          <span
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl"
            style={{ background: `color-mix(in srgb, ${tone} 16%, transparent)`, color: tone }}
          >
            <Tag size={16} strokeWidth={2.6} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[14px] font-semibold text-slate-900">记录原值</div>
            <div className="mt-0.5 text-[11px] font-medium text-slate-400">填入购入价格后，这里会显示累计减值与保值率</div>
          </div>
          <ChevronRight size={16} strokeWidth={2.6} className="shrink-0 text-slate-400" />
        </div>
      </motion.button>
    )
  }

  const isGain = summary.impairment < 0
  const fill = Math.max(0, Math.min(1, summary.retainedRatio))
  const percentLabel = formatRatioPercent(summary.impairmentRatio)
  const badgeKey = `${isGain ? 'gain' : 'loss'}-${percentLabel}`

  return (
    <motion.button
      type="button"
      onClick={onEditCost}
      whileTap={{ scale: 0.985 }}
      transition={{ type: 'spring', stiffness: 700, damping: 40, mass: 0.6 }}
      className="mt-4 w-full rounded-[22px] border border-white/70 bg-white/70 px-4 pt-4 pb-3.5 text-left shadow-sm"
      aria-label="edit cost"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] font-semibold text-slate-400">原值</div>
          <div className="mt-0.5 text-[17px] font-black tracking-tight text-slate-900">{formatCny(summary.cost)}</div>
        </div>
        <div className="text-right">
          <div className="text-[11px] font-semibold text-slate-400">{isGain ? '累计增值' : '累计减值'}</div>
          <div className="mt-0.5 flex items-center justify-end gap-1.5">
            <span className={`text-[17px] font-black tracking-tight ${isGain ? 'text-emerald-600' : 'text-rose-600'}`}>
              {formatCny(Math.abs(summary.impairment))}
            </span>
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.span
                key={badgeKey}
                initial={{ opacity: 0, scale: 0.8, y: 2 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.12 } }}
                transition={{ type: 'spring', stiffness: 560, damping: 30, mass: 0.6 }}
                className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${isGain ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}
              >
                {summary.impairment === 0 ? '' : isGain ? '+' : '-'}
                {percentLabel}
              </motion.span>
            </AnimatePresence>
          </div>
        </div>
      </div>

      <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-slate-200/70">
        <motion.div
          className="h-full w-full rounded-full"
          style={{ background: tone, transformOrigin: 'left center' }}
          initial={false}
          animate={{ scaleX: fill }}
          transition={progressFillTransition}
        />
      </div>

      <div className="mt-2.5 flex items-center justify-between text-[11px] font-medium text-slate-400">
        <div className="flex items-center gap-1.5">
          <span>保值 {formatRatioPercent(summary.retainedRatio)}</span>
          {isGain ? <span className="text-emerald-600">（高于原值）</span> : null}
        </div>
        {account.acquiredAt ? (
          <motion.div
            className="flex items-center gap-1"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.2, ease: standardEase, delay: 0.1 }}
          >
            <CalendarDays size={12} strokeWidth={2.4} />
            <span>{formatDateKey(account.acquiredAt)} 购入</span>
          </motion.div>
        ) : (
          <span className="text-slate-300">未填购入日期</span>
        )}
      </div>
    </motion.button>
  )
}
