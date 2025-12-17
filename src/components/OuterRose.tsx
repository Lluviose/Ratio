import { motion } from 'framer-motion'
import { type PetalData, calculatePetalRadius, calculateStaggerDelay } from '../lib/roseChartUtils'
import { type AccountGroupId } from '../lib/accounts'

/**
 * Minimum touch target size in points for accessibility (WCAG 2.1)
 */
export const MIN_TOUCH_TARGET_SIZE = 44

export type OuterRoseProps = {
  petals: PetalData[]
  maxAmount: number
  selectedAccountId: string | null
  selectedGroupId: AccountGroupId | null
  onSelectAccount: (id: string | null) => void
  onSelectGroup: (id: AccountGroupId) => void
  cx: number
  cy: number
  innerRadius: number
  maxOuterRadius: number
  animationProgress: number
  baseDelay?: number
  staggerInterval?: number
  prefersReducedMotion?: boolean
}

/**
 * Convert degrees to radians
 */
function degToRad(deg: number): number {
  return (deg * Math.PI) / 180
}

/**
 * Calculate SVG path for a petal (sector shape).
 * Angles are in degrees, starting from top (12 o'clock) going clockwise.
 */
function describePetalPath(
  cx: number,
  cy: number,
  innerRadius: number,
  outerRadius: number,
  startAngle: number,
  endAngle: number
): string {
  // Convert to standard SVG coordinates (0 degrees = 3 o'clock, counterclockwise)
  // We want 0 degrees = 12 o'clock, clockwise
  // So we rotate by -90 degrees
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
 * Calculate the touch target dimensions for a petal.
 * Returns the approximate width and height of the petal's bounding box.
 * 
 * @param innerRadius - Inner radius of the petal
 * @param outerRadius - Outer radius of the petal
 * @param startAngle - Start angle in degrees
 * @param endAngle - End angle in degrees
 * @returns Object with width and height of the touch target
 * 
 * **Feature: double-rose-chart, Property 11: Touch target minimum size**
 * **Validates: Requirements 6.1**
 */
export function calculateTouchTargetSize(
  innerRadius: number,
  outerRadius: number,
  startAngle: number,
  endAngle: number
): { width: number; height: number } {
  const angularWidth = endAngle - startAngle
  const angularWidthRad = degToRad(angularWidth)
  
  // The radial height is the difference between outer and inner radius
  const radialHeight = outerRadius - innerRadius
  
  // The arc width at the outer edge (approximation for touch target)
  // Using the average radius for a more representative width
  const avgRadius = (innerRadius + outerRadius) / 2
  const arcWidth = avgRadius * angularWidthRad
  
  return {
    width: arcWidth,
    height: radialHeight
  }
}

/**
 * Check if a petal meets the minimum touch target size requirement.
 * 
 * @param innerRadius - Inner radius of the petal
 * @param outerRadius - Outer radius of the petal
 * @param startAngle - Start angle in degrees
 * @param endAngle - End angle in degrees
 * @param minSize - Minimum touch target size (default: 44 points)
 * @returns True if the petal meets the minimum size requirement
 */
export function meetsTouchTargetRequirement(
  innerRadius: number,
  outerRadius: number,
  startAngle: number,
  endAngle: number,
  minSize: number = MIN_TOUCH_TARGET_SIZE
): boolean {
  const { width, height } = calculateTouchTargetSize(
    innerRadius,
    outerRadius,
    startAngle,
    endAngle
  )
  return width >= minSize && height >= minSize
}

/**
 * OuterRose component renders the outer rose chart with animated petals.
 * 
 * Features:
 * - Calculates start/end angles for each petal (equal distribution)
 * - Maps petal data to Petal components
 * - Coordinates animation progress across all petals
 * - Handles touch target sizing for accessibility
 * 
 * **Validates: Requirements 2.1, 3.1, 6.1**
 */
export function OuterRose({
  petals,
  maxAmount,
  selectedAccountId,
  selectedGroupId,
  onSelectAccount,
  onSelectGroup,
  cx,
  cy,
  innerRadius,
  maxOuterRadius,
  animationProgress,
  baseDelay = 100,
  staggerInterval = 50,
  prefersReducedMotion = false
}: OuterRoseProps) {
  if (petals.length === 0) {
    return null
  }

  // Animation duration for each petal (400-600ms as per requirements)
  // Set to 0 if user prefers reduced motion
  const petalDuration = prefersReducedMotion ? 0 : 500

  return (
    <g className="outer-rose">
      {petals.map((petal) => {
        // Calculate target radius for this petal based on its amount
        const targetRadius = calculatePetalRadius(
          petal.amount,
          maxAmount,
          innerRadius,
          maxOuterRadius
        )

        // Calculate animated radius based on animation progress
        const animatedRadius = innerRadius + (targetRadius - innerRadius) * animationProgress

        // Calculate stagger delay for this petal (0 if reduced motion preferred)
        const delay = prefersReducedMotion ? 0 : calculateStaggerDelay(petal.index, baseDelay, staggerInterval)

        // Determine selection states
        const isSelected = selectedAccountId === petal.id
        const isGroupSelected = selectedGroupId === petal.groupId
        const hasSelection = selectedAccountId !== null || selectedGroupId !== null
        const isDimmed = hasSelection && !isSelected && !isGroupSelected

        // Generate path for the petal
        const path = describePetalPath(
          cx,
          cy,
          innerRadius,
          animatedRadius,
          petal.startAngle,
          petal.endAngle
        )

        const handleClick = () => {
          if (isSelected) {
            // Deselect if already selected
            onSelectAccount(null)
          } else {
            // Select this account and its group
            onSelectAccount(petal.id)
            onSelectGroup(petal.groupId)
          }
        }

        return (
          <motion.path
            key={petal.id}
            d={path}
            fill={petal.colorVariant}
            initial={{ opacity: 0 }}
            animate={{
              opacity: isDimmed ? 0.3 : 1,
              d: describePetalPath(
                cx,
                cy,
                innerRadius,
                targetRadius,
                petal.startAngle,
                petal.endAngle
              )
            }}
            transition={{
              d: {
                delay: delay / 1000,
                duration: petalDuration / 1000,
                ease: [0.34, 1.56, 0.64, 1] // Custom spring-like easing
              },
              opacity: { duration: 0.2, ease: 'easeOut' }
            }}
            style={{
              cursor: 'pointer',
              stroke: isSelected ? '#fff' : 'none',
              strokeWidth: isSelected ? 2 : 0,
            }}
            onClick={handleClick}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          />
        )
      })}
    </g>
  )
}
