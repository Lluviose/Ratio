import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import type { AccountOp } from '../lib/accountOps'
import type { Snapshot } from '../lib/snapshots'
import type { ThemeColors } from '../lib/themes'
import {
  SAVINGS_GOAL_KEY,
  SAVINGS_PACE_ALGORITHM_KEY,
  coerceSavingsGoal,
  coerceSavingsPaceAlgorithm,
  getNetChangePace,
  getSavingsGoalSummary,
  type SavingsGoal,
  type SavingsPaceAlgorithm,
} from '../lib/savingsGoal'
import { DEFAULT_MONTH_START_DAY, MONTH_START_DAY_KEY, clampMonthStartDay } from '../lib/monthStart'
import { MONTHLY_ESTIMATED_INCOME_KEY, coerceMonthlyEstimatedIncome } from '../lib/monthlyDisposable'
import {
  buildCurrentSnapshotStats,
  buildStatsRangeView,
  getLatestSnapshot,
  type StatsRangeId,
} from '../lib/snapshotDerived'
import { useLocalStorageState } from '../lib/useLocalStorageState'
import { emphasizedEase } from '../lib/motionPresets'
import { SavingsOverviewCard } from './stats/SavingsOverviewCard'
import { DisposableCard } from './stats/DisposableCard'
import { ForecastCard } from './stats/ForecastCard'
import { SnapshotInsightCard } from './stats/SnapshotInsightCard'
import { RangeTrendSection } from './stats/RangeTrendSection'
import { SavingsGoalSheet } from './stats/SavingsGoalSheet'
import { MilestoneCelebration } from './stats/MilestoneCelebration'
import { useMilestoneCelebration } from './stats/useMilestoneCelebration'

// 页面与卡片编排：容器先上浮，卡片按序跟进
const statsStackVariants = {
  hidden: { opacity: 0, y: 20 },
  show: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.4,
      ease: emphasizedEase,
      staggerChildren: 0.06,
      delayChildren: 0.05,
    },
  },
}

const statsCardVariants = {
  hidden: { opacity: 0, y: 18, scale: 0.99 },
  show: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.38, ease: emphasizedEase } },
}

export function StatsScreen(props: { snapshots: Snapshot[]; accountOps: AccountOp[]; colors: ThemeColors }) {
  const { snapshots, accountOps, colors } = props
  const [range, setRange] = useState<StatsRangeId>('6m')
  const [monthStartDayRaw] = useLocalStorageState<number>(MONTH_START_DAY_KEY, DEFAULT_MONTH_START_DAY)
  const [paceAlgorithm, setPaceAlgorithm] = useLocalStorageState<SavingsPaceAlgorithm>(SAVINGS_PACE_ALGORITHM_KEY, 'smart', {
    coerce: coerceSavingsPaceAlgorithm,
  })
  const [goal, setGoal] = useLocalStorageState<SavingsGoal | null>(SAVINGS_GOAL_KEY, null, {
    coerce: coerceSavingsGoal,
  })
  const [monthlyEstimatedIncome, setMonthlyEstimatedIncome] = useLocalStorageState<number>(MONTHLY_ESTIMATED_INCOME_KEY, 0, {
    coerce: coerceMonthlyEstimatedIncome,
  })
  const [goalSheetOpen, setGoalSheetOpen] = useState(false)
  const monthStartDay = clampMonthStartDay(monthStartDayRaw)

  // The net-change pace is computed once per (snapshots, settings) change and
  // shared by the goal summary, the disposable estimator and the forecast card.
  const pace = useMemo(
    () => getNetChangePace(snapshots, { monthStartDay, algorithm: paceAlgorithm }),
    [monthStartDay, paceAlgorithm, snapshots],
  )
  const goalSummary = useMemo(
    () => getSavingsGoalSummary(goal, snapshots, { monthStartDay, algorithm: paceAlgorithm, pace }),
    [goal, monthStartDay, pace, paceAlgorithm, snapshots],
  )
  const latestSnapshot = useMemo(() => getLatestSnapshot(snapshots), [snapshots])
  const latestNetWorth = goalSummary?.currentNetWorth ?? latestSnapshot?.net ?? 0
  const currentStats = useMemo(() => buildCurrentSnapshotStats(latestSnapshot), [latestSnapshot])
  const view = useMemo(() => buildStatsRangeView(snapshots, range, monthStartDay), [monthStartDay, range, snapshots])
  const celebrationMilestone = useMilestoneCelebration(goal, goalSummary)

  return (
    <div className="stack iosInsightsPage iosStatsPage" style={{ padding: '0 16px calc(92px + var(--safe-bottom))' }}>
      <motion.div initial="hidden" animate="show" variants={statsStackVariants}>
        <div className="stack iosStatsStack">
          <motion.div variants={statsCardVariants}>
            <SavingsOverviewCard
              goal={goal}
              summary={goalSummary}
              latestNetWorth={latestNetWorth}
              snapshotCount={snapshots.length}
              color={colors.invest}
              onEdit={() => setGoalSheetOpen(true)}
            />
          </motion.div>

          <AnimatePresence>
            {celebrationMilestone != null ? (
              <MilestoneCelebration milestone={celebrationMilestone} color={colors.invest} />
            ) : null}
          </AnimatePresence>

          <motion.div variants={statsCardVariants}>
            <DisposableCard
              snapshots={snapshots}
              accountOps={accountOps}
              summary={goalSummary}
              latestSnapshot={latestSnapshot}
              monthStartDay={monthStartDay}
              paceAlgorithm={paceAlgorithm}
              manualIncome={monthlyEstimatedIncome}
              pace={pace}
              color={colors.invest}
              onChangeIncome={setMonthlyEstimatedIncome}
            />
          </motion.div>

          <motion.div variants={statsCardVariants}>
            <ForecastCard
              algorithm={paceAlgorithm}
              summary={goalSummary}
              color={colors.invest}
              onChangeAlgorithm={setPaceAlgorithm}
            />
          </motion.div>

          {currentStats ? (
            <motion.div variants={statsCardVariants}>
              <SnapshotInsightCard stats={currentStats} colors={colors} />
            </motion.div>
          ) : null}

          <motion.div variants={statsCardVariants}>
            <RangeTrendSection view={view} range={range} onRangeChange={setRange} colors={colors} />
          </motion.div>
        </div>
      </motion.div>

      <SavingsGoalSheet
        open={goalSheetOpen}
        goal={goal}
        currentNetWorth={latestNetWorth}
        onClose={() => setGoalSheetOpen(false)}
        onSave={setGoal}
        onClear={() => setGoal(null)}
      />
    </div>
  )
}
