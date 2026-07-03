import { useEffect, useRef, useState } from 'react'
import { normalizeMoney } from '../../lib/money'
import type { SavingsGoal, SavingsGoalSummary } from '../../lib/savingsGoal'
import { clampProgress } from './statsFormat'

export const GOAL_MILESTONES = [0.25, 0.5, 0.75, 1] as const

const MILESTONE_STORAGE_PREFIX = 'ratio.savingsGoal.maxMilestone.'
const CELEBRATION_MS = 5200

export type GoalMilestoneInfo = {
  progress: number
  pct: number
  amount: number
  amountLeft: number
}

export function getNextGoalMilestone(summary: SavingsGoalSummary): GoalMilestoneInfo | null {
  if (summary.targetAmount <= 0) return null

  const currentProgress = clampProgress(summary.progress)
  const nextProgress = summary.isComplete
    ? 1
    : GOAL_MILESTONES.find((milestone) => currentProgress < milestone - 0.0001) ?? 1
  const amount = normalizeMoney(summary.targetAmount * nextProgress)

  return {
    progress: nextProgress,
    pct: Math.round(nextProgress * 100),
    amount,
    amountLeft: Math.max(0, normalizeMoney(amount - summary.currentNetWorth)),
  }
}

export function getReachedGoalMilestone(progress: number) {
  const safeProgress = clampProgress(progress)
  for (let i = GOAL_MILESTONES.length - 1; i >= 0; i -= 1) {
    const milestone = GOAL_MILESTONES[i]
    if (safeProgress >= milestone - 0.0001) return milestone
  }
  return null
}

function getGoalMilestoneStorageKey(goal: SavingsGoal) {
  return `${MILESTONE_STORAGE_PREFIX}${goal.startDate}.${goal.startNetWorth}.${goal.targetAmount}.${goal.targetDate}`
}

function readSavedGoalMilestone(key: string) {
  try {
    const saved = Number(localStorage.getItem(key) ?? '0')
    return Number.isFinite(saved) ? saved : 0
  } catch {
    return 0
  }
}

function writeSavedGoalMilestone(key: string, milestone: number) {
  try {
    localStorage.setItem(key, String(milestone))
  } catch {
    // Ignore storage failures; the animation can simply replay later.
  }
}

/**
 * Fires a one-shot milestone value (0.25/0.5/0.75/1) when the goal first
 * crosses a threshold it has not celebrated before, then clears itself.
 * Persisted per goal signature so celebrations don't replay on every visit.
 */
export function useMilestoneCelebration(goal: SavingsGoal | null, summary: SavingsGoalSummary | null) {
  const [milestone, setMilestone] = useState<number | null>(null)
  const celebrationKeyRef = useRef<string | null>(null)

  useEffect(() => {
    if (!goal || !summary) {
      setMilestone(null)
      return
    }

    const reached = getReachedGoalMilestone(summary.progress)
    if (reached == null) {
      setMilestone(null)
      return
    }

    const key = getGoalMilestoneStorageKey(goal)
    const celebrationKey = `${key}.${reached}`
    if (celebrationKeyRef.current !== celebrationKey) {
      const saved = readSavedGoalMilestone(key)
      if (reached <= saved) {
        setMilestone(null)
        return
      }
      celebrationKeyRef.current = celebrationKey
      writeSavedGoalMilestone(key, reached)
    }

    setMilestone(reached)

    const timer = window.setTimeout(() => setMilestone(null), CELEBRATION_MS)
    return () => window.clearTimeout(timer)
  }, [goal, summary])

  return milestone
}
