import { type AccountGroupId } from '../lib/accounts'

export type InnerRingSegment = {
  id: AccountGroupId
  name: string
  tone: string
  amount: number
  percent: number
  startAngle: number
  endAngle: number
}

type InnerRingProps = {
  segments: InnerRingSegment[]
  selectedGroupId: AccountGroupId | null
  onSelectGroup: (id: AccountGroupId | null) => void
  cx: number
  cy: number
  innerRadius: number
  outerRadius: number
  animationProgress?: number
  prefersReducedMotion?: boolean
}

/**
 * Convert degrees to radians
 */
function degToRad(deg: number): number {
  return (deg * Math.PI) / 180
}

/**
 * Calculate SVG arc path for a segment.
 * Angles are in degrees, starting from top (12 o'clock) going clockwise.
 */
function describeArc(
  cx: number,
  cy: number,
  innerRadius: number,
  outerRadius: number,
  startAngle: number,
  endAngle: number
): string {
  // Convert to standard SVG coordinates (0 degrees = 3 o'clock, counterclockwise)
  // We want 0 degrees = 12 o'clock, clockwise
  // So we rotate by -90 degrees and negate the direction
  const startRad = degToRad(startAngle - 90)
  const endRad = degToRad(endAngle - 90)

  // Calculate points
  const x1 = cx + outerRadius * Math.cos(startRad)
  const y1 = cy + outerRadius * Math.sin(startRad)
  const x2 = cx + outerRadius * Math.cos(endRad)
  const y2 = cy + outerRadius * Math.sin(endRad)
  const x3 = cx + innerRadius * Math.cos(endRad)
  const y3 = cy + innerRadius * Math.sin(endRad)
  const x4 = cx + innerRadius * Math.cos(startRad)
  const y4 = cy + innerRadius * Math.sin(startRad)

  // Determine if arc is greater than 180 degrees
  const largeArcFlag = endAngle - startAngle > 180 ? 1 : 0

  // Path: outer arc, line to inner, inner arc (reverse), close
  return [
    `M ${x1} ${y1}`,
    `A ${outerRadius} ${outerRadius} 0 ${largeArcFlag} 1 ${x2} ${y2}`,
    `L ${x3} ${y3}`,
    `A ${innerRadius} ${innerRadius} 0 ${largeArcFlag} 0 ${x4} ${y4}`,
    'Z'
  ].join(' ')
}

/**
 * InnerRing component renders proportional arc segments for asset groups.
 * 
 * - Filters out debt group and zero-balance groups (handled by processGroups)
 * - Applies group tone colors to each segment
 * - Handles tap/click events to select group
 * - Applies opacity dimming for non-selected groups when a selection exists
 * 
 * **Validates: Requirements 1.1, 1.2, 1.3**
 */
export function InnerRing({
  segments,
  selectedGroupId,
  onSelectGroup,
  cx,
  cy,
  innerRadius,
  outerRadius,
  animationProgress = 1,
  prefersReducedMotion = false
}: InnerRingProps) {
  if (segments.length === 0) {
    return null
  }

  const handleSegmentClick = (id: AccountGroupId) => {
    // Toggle selection: if already selected, deselect; otherwise select
    onSelectGroup(selectedGroupId === id ? null : id)
  }

  // When reduced motion is preferred, skip scale animation
  const effectiveProgress = prefersReducedMotion ? 1 : animationProgress

  return (
    <g 
      className="inner-ring"
      style={{ 
        opacity: effectiveProgress,
        transform: prefersReducedMotion ? 'none' : `scale(${0.8 + 0.2 * effectiveProgress})`,
        transformOrigin: `${cx}px ${cy}px`
      }}
    >
      {segments.map((segment) => {
        const isSelected = selectedGroupId === segment.id
        const isDimmed = selectedGroupId !== null && !isSelected
        
        const path = describeArc(
          cx,
          cy,
          innerRadius,
          outerRadius,
          segment.startAngle,
          segment.endAngle
        )

        return (
          <path
            key={segment.id}
            d={path}
            fill={segment.tone}
            opacity={isDimmed ? 0.3 : 1}
            style={{
              cursor: 'pointer',
              transition: 'opacity 200ms ease-out'
            }}
            onClick={() => handleSegmentClick(segment.id)}
          />
        )
      })}
    </g>
  )
}

/**
 * Calculate proportional arc angles for inner ring segments.
 * This is a pure function that can be tested independently.
 * 
 * @param groups - Array of groups with amounts
 * @param totalAmount - Total amount for percentage calculation
 * @returns Array of segments with calculated start/end angles
 * 
 * **Property 1: Inner ring displays proportional arcs for non-debt groups**
 * **Validates: Requirements 1.1**
 */
export function calculateInnerRingAngles<T extends { amount: number }>(
  groups: T[],
  totalAmount: number
): Array<T & { startAngle: number; endAngle: number; percent: number }> {
  if (totalAmount <= 0 || groups.length === 0) {
    return []
  }

  let currentAngle = 0
  
  return groups.map(group => {
    const percent = group.amount / totalAmount
    const angleSpan = percent * 360
    const startAngle = currentAngle
    const endAngle = currentAngle + angleSpan
    currentAngle = endAngle
    
    return {
      ...group,
      percent,
      startAngle,
      endAngle
    }
  })
}
