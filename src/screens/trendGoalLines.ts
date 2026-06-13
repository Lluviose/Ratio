import {
  addDaysToDateKey,
  dateKeyToUtcDays,
  diffDateDays,
  getActiveSavingsGoalDate,
  getGoalComparisonValue,
  getLinearGoalValue,
  getSavingsProjectionStartDate,
  type SavingsGoal,
  type SavingsGoalSummary,
} from '../lib/savingsGoal'

export type TrendPoint = {
  date: string
  dateKey: string
  dateValue?: number
  idx: number
  net: number | null | undefined
  debt: number | null | undefined
  cash: number | null | undefined
  invest: number | null | undefined
  fixed: number | null | undefined
  receivable: number | null | undefined
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
    dateValue: dateKeyToUtcDays(dateKey) ?? 0,
    idx: -1,
    net: undefined,
    debt: undefined,
    cash: undefined,
    invest: undefined,
    fixed: undefined,
    receivable: undefined,
    goalTarget: null,
    goalComparison: null,
    projectedBridgeNet: null,
    projectedNet: null,
  }
}

function interpolateValue(startValue: number, endValue: number, startDate: string, endDate: string, dateKey: string) {
  const totalDays = diffDateDays(startDate, endDate)
  const offsetDays = diffDateDays(startDate, dateKey)
  if (totalDays == null || offsetDays == null || totalDays <= 0) return endValue
  return startValue + (endValue - startValue) * (offsetDays / totalDays)
}

function findLastRecordedPointBefore(points: TrendPoint[], dateKey: string) {
  let best: TrendPoint | null = null
  for (const point of points) {
    if (point.dateKey >= dateKey || typeof point.net !== 'number' || !Number.isFinite(point.net)) continue
    if (!best || point.dateKey > best.dateKey) best = point
  }
  return best
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
  clipStartDate?: string | null,
) {
  if (!goal || !summary || points.length === 0) return points

  const firstDate = points[0]?.dateKey
  if (!firstDate) return points
  const lineClipStartDate = clipStartDate && dateKeyToUtcDays(clipStartDate) != null ? clipStartDate : firstDate
  const goalLineStartDate = goal.startDate > lineClipStartDate ? goal.startDate : lineClipStartDate

  const byDate = new Map<string, TrendPoint>()
  for (const point of points) {
    byDate.set(point.dateKey, {
      ...point,
      dateValue: point.dateValue ?? dateKeyToUtcDays(point.dateKey) ?? 0,
      goalTarget: null,
      goalComparison: null,
      projectedBridgeNet: null,
      projectedNet: null,
    })
  }

  const ensurePoint = (dateKey: string, label?: string) => {
    if (dateKey < lineClipStartDate) return
    if (!byDate.has(dateKey)) byDate.set(dateKey, makeGoalPoint(dateKey, label ?? labelForDate(dateKey)))
  }

  const projectionStartDate = getSavingsProjectionStartDate(summary.latestDate)
  const forecastStartDate = projectionStartDate >= firstDate
    ? projectionStartDate
    : getActiveSavingsGoalDate(summary.latestDate)
  const targetTrendEnd = getForecastEndDate(forecastStartDate, goal.targetDate, futureCadence)

  ensurePoint(targetTrendEnd, targetTrendEnd === goal.targetDate ? '目标' : '展望')
  ensurePoint(goalLineStartDate)
  if (targetTrendEnd > forecastStartDate) addFutureCheckpoints(ensurePoint, forecastStartDate, targetTrendEnd, futureCadence)

  let projectionEnd: string | null = null
  let projectionAnchorDate: string | null = null
  let bridgeStartDate: string | null = null
  let bridgeStartNet: number | null = null
  if (summary.avgDailyNetChange != null) {
    const requestedProjectionEnd = getProjectionRequestEndDate(goal, summary, forecastStartDate)
    projectionEnd = getForecastEndDate(forecastStartDate, requestedProjectionEnd, futureCadence)
    projectionAnchorDate = summary.latestDate && summary.latestDate >= firstDate ? summary.latestDate : forecastStartDate
    const anchorHasRecordedNet = points.some((point) => (
      point.dateKey === projectionAnchorDate &&
      typeof point.net === 'number' &&
      Number.isFinite(point.net)
    ))
    if (!anchorHasRecordedNet) {
      const lastRecordedPoint = findLastRecordedPointBefore(points, projectionAnchorDate)
      if (
        lastRecordedPoint &&
        typeof lastRecordedPoint.net === 'number' &&
        Number.isFinite(lastRecordedPoint.net)
      ) {
        bridgeStartDate = lastRecordedPoint.dateKey
        bridgeStartNet = lastRecordedPoint.net
      }
    }
    ensurePoint(projectionAnchorDate)
    ensurePoint(forecastStartDate)
    ensurePoint(projectionEnd, getProjectionEndLabel(projectionEnd, goal, summary))
    addFutureCheckpoints(ensurePoint, forecastStartDate, projectionEnd, futureCadence)
  }

  const merged = Array.from(byDate.values()).sort((a, b) => a.dateKey.localeCompare(b.dateKey))
  for (const point of merged) {
    point.goalTarget = point.dateKey >= goalLineStartDate ? getLinearGoalValue(goal, point.dateKey) : null
    point.goalComparison = point.dateKey >= goalLineStartDate ? getGoalComparisonValue(goal, point.dateKey) : null

    if (projectionEnd && projectionAnchorDate && summary.avgDailyNetChange != null) {
      let bridgeValue: number | null = null
      if (bridgeStartDate && bridgeStartNet != null && point.dateKey >= bridgeStartDate && point.dateKey <= projectionAnchorDate) {
        bridgeValue = interpolateValue(bridgeStartNet, summary.currentNetWorth, bridgeStartDate, projectionAnchorDate, point.dateKey)
      } else if (projectionAnchorDate < forecastStartDate && point.dateKey >= projectionAnchorDate && point.dateKey <= forecastStartDate) {
        bridgeValue = summary.currentNetWorth
      }

      if (bridgeValue != null) {
        point.projectedBridgeNet = bridgeValue
      }

      const daysFromForecastStart = diffDateDays(forecastStartDate, point.dateKey)
      if (daysFromForecastStart != null && point.dateKey <= projectionEnd) {
        if (daysFromForecastStart >= 0) {
          point.projectedNet = summary.currentNetWorth + summary.avgDailyNetChange * daysFromForecastStart
        }
      }
    }
  }

  return merged
}
