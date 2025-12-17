import { motion } from 'framer-motion'
import { type PetalData, calculateStaggerDelay } from '../lib/roseChartUtils'

export type PetalProps = {
  data: PetalData
  startAngle: number
  endAngle: number
  innerRadius: number
  outerRadius: number
  cx: number
  cy: number
  fill: string
  isSelected: boolean
  isDimmed: boolean
  animationDelay: number
  animationProgress: number
  onClick: () => void
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
 * Petal component renders a single sector shape for the outer rose chart.
 * 
 * Features:
 * - Renders sector shape using SVG path with calculated radius
 * - Implements Framer Motion animation for radius expansion
 * - Applies staggered animation delay based on index
 * - Handles tap/click events to select account
 * - Applies highlight/dim states based on selection
 * 
 * **Validates: Requirements 2.1, 2.2, 2.4, 3.1, 3.2**
 */
export function Petal({
  startAngle,
  endAngle,
  innerRadius,
  outerRadius,
  cx,
  cy,
  fill,
  isSelected,
  isDimmed,
  animationDelay,
  animationProgress,
  onClick
}: PetalProps) {
  // Calculate animated radius based on animation progress
  // Start from innerRadius (zero height) and expand to full outerRadius
  const animatedRadius = innerRadius + (outerRadius - innerRadius) * animationProgress

  const path = describePetalPath(
    cx,
    cy,
    innerRadius,
    animatedRadius,
    startAngle,
    endAngle
  )

  return (
    <motion.path
      d={path}
      fill={fill}
      initial={{ opacity: 0 }}
      animate={{ 
        opacity: isDimmed ? 0.3 : 1,
      }}
      transition={{
        opacity: { duration: 0.2, ease: 'easeOut' },
        delay: animationDelay / 1000 // Convert ms to seconds for framer-motion
      }}
      style={{
        cursor: 'pointer',
        stroke: isSelected ? '#fff' : 'none',
        strokeWidth: isSelected ? 2 : 0,
      }}
      onClick={onClick}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
    />
  )
}

/**
 * Props for the animated petal with built-in stagger calculation
 */
export type AnimatedPetalProps = {
  data: PetalData
  innerRadius: number
  maxOuterRadius: number
  cx: number
  cy: number
  isSelected: boolean
  isDimmed: boolean
  baseDelay?: number
  staggerInterval?: number
  onClick: () => void
}

/**
 * AnimatedPetal wraps Petal with automatic stagger delay calculation
 * and radius animation using Framer Motion.
 * 
 * This component handles the full animation lifecycle:
 * 1. Initial state: petal has zero height (radius = innerRadius)
 * 2. Animation: petal expands to target radius with staggered delay
 * 3. Final state: petal at full calculated radius
 * 
 * **Validates: Requirements 2.1, 2.2, 2.4, 3.1, 3.2**
 */
export function AnimatedPetal({
  data,
  innerRadius,
  maxOuterRadius,
  cx,
  cy,
  isSelected,
  isDimmed,
  baseDelay = 100,
  staggerInterval = 50,
  onClick
}: AnimatedPetalProps) {
  const delay = calculateStaggerDelay(data.index, baseDelay, staggerInterval)
  
  // Animation duration for each petal (400-600ms as per requirements)
  const duration = 500

  return (
    <motion.g
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: delay / 1000, duration: 0.1 }}
    >
      <motion.path
        initial={{
          d: describePetalPath(cx, cy, innerRadius, innerRadius, data.startAngle, data.endAngle)
        }}
        animate={{
          d: describePetalPath(cx, cy, innerRadius, data.targetRadius || maxOuterRadius, data.startAngle, data.endAngle),
          opacity: isDimmed ? 0.3 : 1
        }}
        transition={{
          d: { 
            delay: delay / 1000, 
            duration: duration / 1000, 
            ease: [0.34, 1.56, 0.64, 1] // Custom spring-like easing
          },
          opacity: { duration: 0.2, ease: 'easeOut' }
        }}
        fill={data.colorVariant}
        style={{
          cursor: 'pointer',
          stroke: isSelected ? '#fff' : 'none',
          strokeWidth: isSelected ? 2 : 0,
        }}
        onClick={onClick}
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
      />
    </motion.g>
  )
}

/**
 * Calculate petal angles for equal distribution.
 * This is a pure function that can be tested independently.
 * 
 * @param petalCount - Number of petals to distribute
 * @param paddingAngle - Angle padding between petals in degrees (default: 2)
 * @returns Array of { startAngle, endAngle } for each petal
 * 
 * **Feature: double-rose-chart, Property 3: Petals have equal angular width**
 * **Validates: Requirements 2.1**
 */
export function calculatePetalAngles(
  petalCount: number,
  paddingAngle: number = 2
): Array<{ startAngle: number; endAngle: number; angularWidth: number }> {
  if (petalCount <= 0) {
    return []
  }

  const totalAngle = 360
  const anglePerPetal = totalAngle / petalCount
  const effectiveAngle = anglePerPetal - paddingAngle

  return Array.from({ length: petalCount }, (_, index) => {
    const startAngle = index * anglePerPetal
    const endAngle = startAngle + effectiveAngle
    return {
      startAngle,
      endAngle,
      angularWidth: effectiveAngle
    }
  })
}
