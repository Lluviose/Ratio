import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { type AccountGroupId } from '../lib/accounts'
import { 
  type GroupedAccounts, 
  processGroups, 
  processPetals,
  calculatePetalRadius 
} from '../lib/roseChartUtils'
import { useReducedMotion } from '../lib/useReducedMotion'
import { InnerRing, calculateInnerRingAngles } from './InnerRing'
import { OuterRose } from './OuterRose'
import { CenterText } from './CenterText'

export type EnhancedDoubleRoseChartProps = {
  grouped: GroupedAccounts
  selectedGroupId: AccountGroupId | null
  onSelectGroup: (id: AccountGroupId | null) => void
  selectedAccountId: string | null
  onSelectAccount: (id: string | null) => void
  isAnimating?: boolean
}

/**
 * EnhancedDoubleRoseChart composes InnerRing, OuterRose, and CenterText components
 * into a cohesive double-layer rose chart visualization.
 * 
 * Features:
 * - Manages selection state (selectedGroupId, selectedAccountId)
 * - Calculates layout dimensions based on container size
 * - Handles click-outside to clear selection
 * - Coordinates animation timing between layers
 * 
 * **Validates: Requirements 1.3, 2.4, 6.2**
 */
export function EnhancedDoubleRoseChart({
  grouped,
  selectedGroupId,
  onSelectGroup,
  selectedAccountId,
  onSelectAccount,
  isAnimating = true
}: EnhancedDoubleRoseChartProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 })
  const prefersReducedMotion = useReducedMotion()
  
  // If user prefers reduced motion, skip animations entirely
  const shouldAnimate = isAnimating && !prefersReducedMotion
  const [animationProgress, setAnimationProgress] = useState(shouldAnimate ? 0 : 1)


  // Measure container dimensions
  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        const { width, height } = containerRef.current.getBoundingClientRect()
        setDimensions({ width, height })
      }
    }
    
    updateDimensions()
    
    const resizeObserver = new ResizeObserver(updateDimensions)
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current)
    }
    
    return () => resizeObserver.disconnect()
  }, [])

  // Run entrance animation (respects reduced motion preference)
  useEffect(() => {
    // Skip animation if user prefers reduced motion
    if (prefersReducedMotion) {
      setAnimationProgress(1)
      return
    }
    
    if (isAnimating && dimensions.width > 0) {
      setAnimationProgress(0)
      const duration = 800 // Total animation duration in ms
      const startTime = performance.now()
      
      const animate = (currentTime: number) => {
        const elapsed = currentTime - startTime
        const progress = Math.min(elapsed / duration, 1)
        setAnimationProgress(progress)
        
        if (progress < 1) {
          requestAnimationFrame(animate)
        }
      }
      
      requestAnimationFrame(animate)
    } else if (!isAnimating) {
      setAnimationProgress(1)
    }
  }, [isAnimating, dimensions.width, prefersReducedMotion])

  // Handle click outside to clear selection
  const handleBackgroundClick = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    // Only clear if clicking directly on the SVG background
    if (e.target === e.currentTarget) {
      onSelectGroup(null)
      onSelectAccount(null)
    }
  }, [onSelectGroup, onSelectAccount])

  // Calculate layout dimensions
  const size = Math.min(dimensions.width, dimensions.height)
  const cx = dimensions.width / 2
  const cy = dimensions.height / 2
  
  // Radii configuration
  const innerRingInnerRadius = size * 0.12
  const innerRingOuterRadius = size * 0.20
  const outerRoseInnerRadius = size * 0.21
  const outerRoseMaxRadius = size * 0.42

  // Process data for inner ring
  const innerRingData = useMemo(() => {
    const groups = processGroups(grouped)
    return calculateInnerRingAngles(groups, grouped.assetsTotal)
  }, [grouped])

  // Process data for outer rose
  const { petals, maxAmount } = useMemo(() => {
    return processPetals(grouped, 12)
  }, [grouped])

  // Calculate target radii for petals
  const petalsWithRadii = useMemo(() => {
    return petals.map(petal => ({
      ...petal,
      targetRadius: calculatePetalRadius(
        petal.amount,
        maxAmount,
        outerRoseInnerRadius,
        outerRoseMaxRadius
      )
    }))
  }, [petals, maxAmount, outerRoseInnerRadius, outerRoseMaxRadius])


  // Get selected group info for center text
  const selectedGroupInfo = useMemo(() => {
    if (!selectedGroupId) return null
    const groupCard = grouped.groupCards.find(g => g.group.id === selectedGroupId)
    if (!groupCard) return null
    return {
      name: groupCard.group.name,
      amount: groupCard.total
    }
  }, [selectedGroupId, grouped.groupCards])

  // Get selected account info for center text
  const selectedAccountInfo = useMemo(() => {
    if (!selectedAccountId) return null
    for (const groupCard of grouped.groupCards) {
      const account = groupCard.accounts.find(a => a.id === selectedAccountId)
      if (account) {
        return {
          name: account.name,
          balance: account.balance
        }
      }
    }
    // Check if it's the "others" aggregated account
    const othersPetal = petals.find(p => p.id === 'others')
    if (othersPetal && selectedAccountId === 'others') {
      return {
        name: othersPetal.account.name,
        balance: othersPetal.amount
      }
    }
    return null
  }, [selectedAccountId, grouped.groupCards, petals])

  // Handle group selection from inner ring
  const handleSelectGroup = useCallback((id: AccountGroupId | null) => {
    onSelectGroup(id)
    // Clear account selection when selecting a group
    if (id !== null) {
      onSelectAccount(null)
    }
  }, [onSelectGroup, onSelectAccount])

  // Handle account selection from outer rose
  const handleSelectAccount = useCallback((id: string | null) => {
    onSelectAccount(id)
  }, [onSelectAccount])

  // Handle group selection from outer rose (when clicking a petal)
  const handleSelectGroupFromPetal = useCallback((id: AccountGroupId) => {
    onSelectGroup(id)
  }, [onSelectGroup])

  // Don't render until we have dimensions
  if (dimensions.width === 0 || dimensions.height === 0) {
    return <div ref={containerRef} className="w-full h-full" />
  }

  // Calculate center text opacity (fade in after main animation)
  const centerTextOpacity = Math.max(0, (animationProgress - 0.5) * 2)

  return (
    <div ref={containerRef} className="w-full h-full relative">
      <svg
        width={dimensions.width}
        height={dimensions.height}
        viewBox={`0 0 ${dimensions.width} ${dimensions.height}`}
        onClick={handleBackgroundClick}
        style={{ cursor: 'default' }}
      >
        {/* Inner Ring Layer */}
        <InnerRing
          segments={innerRingData}
          selectedGroupId={selectedGroupId}
          onSelectGroup={handleSelectGroup}
          cx={cx}
          cy={cy}
          innerRadius={innerRingInnerRadius}
          outerRadius={innerRingOuterRadius}
          animationProgress={animationProgress}
          prefersReducedMotion={prefersReducedMotion}
        />

        {/* Outer Rose Layer */}
        <OuterRose
          petals={petalsWithRadii}
          maxAmount={maxAmount}
          selectedAccountId={selectedAccountId}
          selectedGroupId={selectedGroupId}
          onSelectAccount={handleSelectAccount}
          onSelectGroup={handleSelectGroupFromPetal}
          cx={cx}
          cy={cy}
          innerRadius={outerRoseInnerRadius}
          maxOuterRadius={outerRoseMaxRadius}
          animationProgress={animationProgress}
          prefersReducedMotion={prefersReducedMotion}
        />

        {/* Center Text Layer */}
        <CenterText
          selectedGroup={selectedGroupInfo}
          selectedAccount={selectedAccountInfo}
          netWorth={grouped.netWorth}
          cx={cx}
          cy={cy}
          opacity={centerTextOpacity}
        />
      </svg>
    </div>
  )
}
