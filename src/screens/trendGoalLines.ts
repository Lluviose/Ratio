import {
  addDaysToDateKey,
  diffDateDays,
  getActiveSavingsGoalDate,
  getGoalComparisonValue,
  getLinearGoalValue,
  type SavingsGoal,
  type SavingsGoalSummary,
} from '../lib/savingsGoal'

export type TrendPoint = {
  date: string
  dateKey: string
  idx: number
  net: number | null
  debt: number | null
  cash: number | null
  invest: number | null
  fixed: number | null
  receivable: number | null
  goalTarget?: number | null
  goalComparison?: number | null
  projectedBridgeNet?: number | null
  projectedNet?: number | null
}

export type FutureCadence = {
  stepDays: number
  maxPoints: number
  horizonDays: number
}

function getForecastEndDate(startDate: string, requestedEndDate: string, cadence: FutureCadence) {
  const days = diffDateDays(startDate, requestedEndDate)
  if (days == null || days <= 0) return requestedEndDate

  const horizonDays = Math.max(cadence.stepDays, Math.round(cadence.horizonDays))
  if (days <= horizonDays) return requestedEndDate

  return addDaysToDateKey(startDate, horizonDays) ?? requestedEndDate
}

function getProjectionEndLabel(endDate: string, goal: SavingsGoal, summary: SavingsGoalSummary) {
  if (endDate === goal.targetDate) return '目标'
  if (summary.projectedDate && endDate === summary.projectedDate) return '预计'
  return '展望'
}

function getProjectionRequestEndDate(goal: SavingsGoal, summary: SavingsGoalSummary, forecastStartDate: string) {
  if (summary.projectedDate && summary.projectedDate > forecastStartDate) return summary.projectedDate
  return goal.targetDate > forecastStartDate ? goal.targetDate : forecastStartDate
}

function makeGoalPoint(dateKey: string, label?: string): TrendPoint {
  return {
    date: label ?? dateKey,
    dateKey,
    idx: -1,
    net: null,
    debt: null,
    cash: null,
    invest: null,
    fixed: null,
    receivable: null,
    goalTarget: null,
    goalComparison: null,
    projectedBridgeNet: null,
    projectedNet: null,
  }
}

function addFutureCheckpoints(
  ensurePoint: (dateKey: string, label?: string) => void,
  startDate: string,
  endDate: string,
  cadence: FutureCadence,
) {
  const days = diffDateDays(startDate, endDate)
  if (days == null || days <= 0) return

  const stepDays = Math.max(1, Math.round(cadence.stepDays))
  const maxPoints = Math.max(0, Math.floor(cadence.maxPoints))
  if (maxPoints <= 0) return

  const effectiveStepDays = Math.max(stepDays, Math.ceil(days / (maxPoints + 1)))
  let added = 0
  for (let offset = effectiveStepDays; offset < days && added < maxPoints; offset += effectiveStepDays) {
    const next = addDaysToDateKey(startDate, offset)
    if (next && next > startDate && next < endDate) ensurePoint(next)
    added += 1
  }
}

export function withGoalTrendLines(
  points: TrendPoint[],
  goal: SavingsGoal | null,
  summary: SavingsGoalSummary | null,
  futureCadence: FutureCadence,
  labelForDate: (dateKey: string) => string = (dateKey) => dateKey,
) {
  if (!goal || !summary || points.length === 0) return points

  const firstDate = points[0]?.dateKey
  if (!firstDate) return points

  const byDate = new Map<string, TrendPoint>()
  for (const point of points) {
    byDate.set(point.dateKey, { ...point, goalTarget: null, goalComparison: null, projectedBridgeNet: null, projectedNet: null })
  }

  const ensurePoint = (dateKey: string, label?: string) => {
    if (dateKey < firstDate) return
    if (!byDate.has(dateKey)) byDate.set(dateKey, makeGoalPoint(dateKey, label ?? labelForDate(dateKey)))
  }

  const forecastStartDate = getActiveSavingsGoalDate(summary.latestDate)
  const targetTrendEnd = getForecastEndDate(forecastStartDate, goal.targetDate, futureCadence)

  ensurePoint(targetTrendEnd, targetTrendEnd === goal.targetDate ? '目标' : '展望')
  if (goal.startDate >= firstDate) ensurePoint(goal.startDate)
  if (targetTrendEnd > forecastStartDate) addFutureCheckpoints(ensurePoint, forecastStartDate, targetTrendEnd, futureCadence)

  let projectionEnd: string | null = null
  let projectionAnchorDate: string | null = null
  if (summary.avgDailyNetChange != null) {
    const requestedProjectionEnd = getProjectionRequestEndDate(goal, summary, forecastStartDate)
    projectionEnd = getForecastEndDate(forecastStartDate, requestedProjectionEnd, futureCadence)
    projectionAnchorDate = summary.latestDate && summary.latestDate >= firstDate ? summary.latestDate : forecastStartDate
    ensurePoint(projectionAnchorDate)
    ensurePoint(forecastStartDate)
    ensurePoint(projectionEnd, getProjectionEndLabel(projectionEnd, goal, summary))
    addFutureCheckpoints(ensurePoint, forecastStartDate, projectionEnd, futureCadence)
  }

  const merged = Array.from(byDate.values()).sort((a, b) => a.dateKey.localeCompare(b.dateKey))
  for (const point of merged) {
    point.goalTarget = getLinearGoalValue(goal, point.dateKey)
    point.goalComparison = point.dateKey >= goal.startDate ? getGoalComparisonValue(goal, point.dateKey) : null

    if (projectionEnd && projectionAnchorDate && summary.avgDailyNetChange != null) {
      if (point.dateKey === projectionAnchorDate) {
        point.projectedBridgeNet = summary.currentNetWorth
        if (point.dateKey === forecastStartDate) point.projectedNet = summary.currentNetWorth
        continue
      }

      const daysFromForecastStart = diffDateDays(forecastStartDate, point.dateKey)
      if (daysFromForecastStart != null && point.dateKey <= projectionEnd) {
        if (daysFromForecastStart >= 0) {
          point.projectedNet = summary.currentNetWorth + summary.avgDailyNetChange * daysFromForecastStart
        }
        if (point.dateKey === forecastStartDate) {
          point.projectedBridgeNet = summary.currentNetWorth
        }
      }
    }
  }

  return merged
}
