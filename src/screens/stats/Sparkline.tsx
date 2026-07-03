import { useId } from 'react'
import { dateKeyToUtcDays } from '../../lib/savingsGoal'

export type SparklinePoint = { date: string; value: number }

const VIEW_W = 100
const VIEW_H = 40
const PAD_Y = 3.5

/**
 * Dependency-free area sparkline. X positions follow real date spacing (not
 * index), so irregular snapshot cadences render truthfully; a dashed baseline
 * marks the range's starting value to make "above/below start" readable at a
 * glance. Scales to its container via a stretched viewBox with a
 * non-scaling stroke.
 */
export function Sparkline(props: { points: SparklinePoint[]; color: string; height?: number }) {
  const { points, color, height = 72 } = props
  // useId emits colon-wrapped ids (":r1:") that break url(#…) references in
  // some engines — strip to a safe fragment name.
  const gradientId = `spark-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`

  if (points.length < 2) return null

  const days = points.map((point, index) => dateKeyToUtcDays(point.date) ?? index)
  const dayMin = Math.min(...days)
  const daySpan = Math.max(...days) - dayMin
  const values = points.map((point) => point.value)
  const valueMin = Math.min(...values)
  const valueSpan = Math.max(...values) - valueMin
  const innerH = VIEW_H - PAD_Y * 2

  const coords = points.map((point, index) => {
    const x = daySpan > 0 ? ((days[index] - dayMin) / daySpan) * VIEW_W : (index / (points.length - 1)) * VIEW_W
    const y = valueSpan > 0 ? PAD_Y + (1 - (point.value - valueMin) / valueSpan) * innerH : VIEW_H / 2
    return { x, y }
  })

  const line = coords
    .map((coord, index) => `${index === 0 ? 'M' : 'L'}${coord.x.toFixed(2)},${coord.y.toFixed(2)}`)
    .join(' ')
  const area = `${line} L${VIEW_W},${VIEW_H} L0,${VIEW_H} Z`
  const baselineY = coords[0].y

  return (
    <svg
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      preserveAspectRatio="none"
      aria-hidden="true"
      style={{ width: '100%', height, display: 'block' }}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.26} />
          <stop offset="100%" stopColor={color} stopOpacity={0.02} />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gradientId})`} />
      <line
        x1={0}
        x2={VIEW_W}
        y1={baselineY}
        y2={baselineY}
        stroke="rgba(100, 116, 139, 0.32)"
        strokeWidth={1}
        strokeDasharray="2 4"
        vectorEffect="non-scaling-stroke"
      />
      <path
        d={line}
        fill="none"
        stroke={color}
        strokeWidth={2.4}
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}
