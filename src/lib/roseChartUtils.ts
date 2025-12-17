import { type Account, type AccountGroup, type AccountGroupId } from './accounts'

/**
 * Linear interpolation between two values.
 * 
 * Formula: result = a + (b - a) * t
 * 
 * @param a - Start value
 * @param b - End value
 * @param t - Interpolation factor (0 = a, 1 = b)
 * @returns The interpolated value
 * 
 * **Feature: double-rose-chart, Property 8: Interpolation correctness for transitions**
 * **Validates: Requirements 4.2**
 */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

/**
 * GroupedAccounts type matching the structure from useAccounts
 */
export type GroupedAccounts = {
  groupCards: {
    group: AccountGroup
    accounts: Account[]
    total: number
  }[]
  assetsTotal: number
  debtTotal: number
  netWorth: number
}

/**
 * Inner ring data for a single group segment
 */
export type InnerRingData = {
  id: AccountGroupId
  name: string
  tone: string
  amount: number
  percent: number
  startAngle: number
  endAngle: number
}

/**
 * Petal data for a single account in the outer rose
 */
export type PetalData = {
  id: string
  account: Account
  amount: number
  percentTotal: number
  percentGroup: number
  groupId: AccountGroupId
  groupTone: string
  colorVariant: string
  index: number
  startAngle: number
  endAngle: number
  targetRadius: number
}

/**
 * Calculate petal radius using square root scaling for visual balance.
 * 
 * Formula: radius = innerRadius + availableLength * (0.35 + 0.65 * sqrt(balance / maxBalance))
 * 
 * @param balance - The account balance
 * @param maxBalance - The maximum balance among all accounts
 * @param innerRadius - The inner radius where petals start
 * @param maxOuterRadius - The maximum outer radius petals can reach
 * @returns The calculated radius for the petal
 * 
 * **Feature: double-rose-chart, Property 4: Petal radius follows square root scaling**
 * **Validates: Requirements 2.2**
 */
export function calculatePetalRadius(
  balance: number,
  maxBalance: number,
  innerRadius: number,
  maxOuterRadius: number
): number {
  if (maxBalance <= 0 || balance < 0) {
    return innerRadius
  }
  
  const availableLength = maxOuterRadius - innerRadius
  const ratio = Math.sqrt(Math.min(balance, maxBalance) / maxBalance)
  return innerRadius + availableLength * (0.35 + 0.65 * ratio)
}

/**
 * Adjust hex color brightness by a given amount.
 * 
 * @param hex - The base hex color (e.g., '#ff6b57')
 * @param amount - The brightness adjustment (-255 to 255)
 * @returns The adjusted hex color
 */
export function adjustBrightness(hex: string, amount: number): string {
  const color = hex.replace('#', '')
  const num = parseInt(color, 16)
  
  let r = (num >> 16) + amount
  let g = ((num >> 8) & 0x00ff) + amount
  let b = (num & 0x0000ff) + amount

  r = Math.max(0, Math.min(255, r))
  g = Math.max(0, Math.min(255, g))
  b = Math.max(0, Math.min(255, b))

  return '#' + ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')
}

/**
 * Get a color variant for a petal based on its group tone and index.
 * Creates brightness variation within the same hue family.
 * 
 * @param baseTone - The base color tone of the group (hex)
 * @param index - The index of the account within its group
 * @returns A brightness-adjusted variant of the base tone
 * 
 * **Feature: double-rose-chart, Property 5: Petal color derives from group tone**
 * **Validates: Requirements 2.3**
 */
export function getColorVariant(baseTone: string, index: number): string {
  // Adjustment cycles through -20, -10, 0, +10, +20 based on index
  const adjustment = (index % 5) * 10 - 20
  return adjustBrightness(baseTone, adjustment)
}

/**
 * Calculate stagger delay for animation based on petal index.
 * 
 * @param index - The index of the petal
 * @param baseDelay - The base delay before any animation starts (ms)
 * @param staggerInterval - The interval between each petal's animation start (ms)
 * @returns The delay in milliseconds for this petal's animation
 * 
 * **Feature: double-rose-chart, Property 7: Stagger delay proportional to index**
 * **Validates: Requirements 3.2**
 */
export function calculateStaggerDelay(
  index: number,
  baseDelay: number,
  staggerInterval: number
): number {
  return baseDelay + index * staggerInterval
}

/**
 * Process grouped accounts data to prepare inner ring segments.
 * Filters out debt group and zero-balance groups.
 * 
 * @param grouped - The grouped accounts data
 * @returns Array of inner ring data with calculated angles
 * 
 * **Validates: Requirements 1.1, 1.2**
 */
export function processGroups(grouped: GroupedAccounts): InnerRingData[] {
  // Filter out debt and zero-balance groups
  const validGroups = grouped.groupCards.filter(
    g => g.group.id !== 'debt' && g.total > 0
  )
  
  if (validGroups.length === 0 || grouped.assetsTotal <= 0) {
    return []
  }
  
  let currentAngle = 0
  
  return validGroups.map(g => {
    const percent = g.total / grouped.assetsTotal
    const angleSpan = percent * 360
    const startAngle = currentAngle
    const endAngle = currentAngle + angleSpan
    currentAngle = endAngle
    
    return {
      id: g.group.id,
      name: g.group.name,
      tone: g.group.tone,
      amount: g.total,
      percent,
      startAngle,
      endAngle
    }
  })
}

/**
 * Process grouped accounts to prepare petal data for the outer rose.
 * Aggregates accounts beyond maxPetals into an "Others" petal.
 * 
 * @param grouped - The grouped accounts data
 * @param maxPetals - Maximum number of individual petals before aggregation (default: 12)
 * @returns Object containing petal data array and max amount
 * 
 * **Feature: double-rose-chart, Property 6: Account aggregation at threshold**
 * **Validates: Requirements 2.5**
 */
export function processPetals(
  grouped: GroupedAccounts,
  maxPetals: number = 12
): { petals: PetalData[]; maxAmount: number } {
  // Collect all valid accounts (non-debt, positive balance)
  const allAccounts: Array<{
    account: Account
    amount: number
    groupId: AccountGroupId
    groupTone: string
    groupTotal: number
  }> = []
  
  grouped.groupCards.forEach(g => {
    if (g.group.id === 'debt') return
    
    g.accounts.forEach(a => {
      if (a.balance <= 0) return
      
      allAccounts.push({
        account: a,
        amount: a.balance,
        groupId: g.group.id,
        groupTone: g.group.tone,
        groupTotal: g.total
      })
    })
  })
  
  if (allAccounts.length === 0) {
    return { petals: [], maxAmount: 0 }
  }
  
  // Sort by amount descending
  allAccounts.sort((a, b) => b.amount - a.amount)
  
  let maxAmount = allAccounts[0]?.amount || 0
  let accountsToProcess: typeof allAccounts
  let othersAmount = 0
  
  // Aggregate if more than maxPetals
  if (allAccounts.length > maxPetals) {
    accountsToProcess = allAccounts.slice(0, maxPetals)
    const others = allAccounts.slice(maxPetals)
    othersAmount = others.reduce((sum, a) => sum + a.amount, 0)
    maxAmount = Math.max(maxAmount, othersAmount)
  } else {
    accountsToProcess = allAccounts
  }
  
  const totalPetals = accountsToProcess.length + (othersAmount > 0 ? 1 : 0)
  const anglePerPetal = totalPetals > 0 ? 360 / totalPetals : 0
  const paddingAngle = 2 // degrees of padding between petals
  const effectiveAngle = anglePerPetal - paddingAngle
  
  // Track index within each group for color variation
  const groupIndexMap: Record<string, number> = {}
  
  const petals: PetalData[] = accountsToProcess.map((item, index) => {
    // Get and increment group index
    const groupKey = item.groupId
    const groupIndex = groupIndexMap[groupKey] || 0
    groupIndexMap[groupKey] = groupIndex + 1
    
    const startAngle = index * anglePerPetal
    const endAngle = startAngle + effectiveAngle
    
    return {
      id: item.account.id,
      account: item.account,
      amount: item.amount,
      percentTotal: grouped.assetsTotal > 0 ? item.amount / grouped.assetsTotal : 0,
      percentGroup: item.groupTotal > 0 ? item.amount / item.groupTotal : 0,
      groupId: item.groupId,
      groupTone: item.groupTone,
      colorVariant: getColorVariant(item.groupTone, groupIndex),
      index,
      startAngle,
      endAngle,
      targetRadius: 0 // Will be calculated by component with actual dimensions
    }
  })
  
  // Add "Others" petal if needed
  if (othersAmount > 0) {
    const othersIndex = petals.length
    const startAngle = othersIndex * anglePerPetal
    const endAngle = startAngle + effectiveAngle
    
    const othersAccount: Account = {
      id: 'others',
      name: '其他',
      type: 'other_liquid',
      balance: othersAmount,
      updatedAt: ''
    }
    
    petals.push({
      id: 'others',
      account: othersAccount,
      amount: othersAmount,
      percentTotal: grouped.assetsTotal > 0 ? othersAmount / grouped.assetsTotal : 0,
      percentGroup: 0,
      groupId: 'liquid', // Neutral assignment
      groupTone: '#e5e7eb', // Gray for "Others"
      colorVariant: '#e5e7eb',
      index: othersIndex,
      startAngle,
      endAngle,
      targetRadius: 0
    })
  }
  
  return { petals, maxAmount }
}


/**
 * Parse a hex color string to RGB values.
 * 
 * @param hex - Hex color string (e.g., '#ff6b57' or 'ff6b57')
 * @returns Object with r, g, b values (0-255)
 */
export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const color = hex.replace('#', '')
  const num = parseInt(color, 16)
  
  return {
    r: (num >> 16) & 0xff,
    g: (num >> 8) & 0xff,
    b: num & 0xff
  }
}

/**
 * Calculate the relative luminance of a color.
 * Based on WCAG 2.1 formula: https://www.w3.org/WAI/GL/wiki/Relative_luminance
 * 
 * @param r - Red value (0-255)
 * @param g - Green value (0-255)
 * @param b - Blue value (0-255)
 * @returns Relative luminance (0-1)
 * 
 * **Feature: double-rose-chart, Property 12: Color contrast accessibility**
 * **Validates: Requirements 6.5**
 */
export function calculateRelativeLuminance(r: number, g: number, b: number): number {
  // Convert to sRGB
  const rsRGB = r / 255
  const gsRGB = g / 255
  const bsRGB = b / 255
  
  // Apply gamma correction
  const rLinear = rsRGB <= 0.03928 ? rsRGB / 12.92 : Math.pow((rsRGB + 0.055) / 1.055, 2.4)
  const gLinear = gsRGB <= 0.03928 ? gsRGB / 12.92 : Math.pow((gsRGB + 0.055) / 1.055, 2.4)
  const bLinear = bsRGB <= 0.03928 ? bsRGB / 12.92 : Math.pow((bsRGB + 0.055) / 1.055, 2.4)
  
  // Calculate luminance
  return 0.2126 * rLinear + 0.7152 * gLinear + 0.0722 * bLinear
}

/**
 * Calculate the contrast ratio between two colors.
 * Based on WCAG 2.1 formula: https://www.w3.org/WAI/GL/wiki/Contrast_ratio
 * 
 * @param color1 - First hex color
 * @param color2 - Second hex color
 * @returns Contrast ratio (1-21)
 * 
 * **Feature: double-rose-chart, Property 12: Color contrast accessibility**
 * **Validates: Requirements 6.5**
 */
export function calculateContrastRatio(color1: string, color2: string): number {
  const rgb1 = hexToRgb(color1)
  const rgb2 = hexToRgb(color2)
  
  const l1 = calculateRelativeLuminance(rgb1.r, rgb1.g, rgb1.b)
  const l2 = calculateRelativeLuminance(rgb2.r, rgb2.g, rgb2.b)
  
  const lighter = Math.max(l1, l2)
  const darker = Math.min(l1, l2)
  
  return (lighter + 0.05) / (darker + 0.05)
}

/**
 * Check if a color meets WCAG AA contrast requirements against a background.
 * WCAG AA requires:
 * - 4.5:1 for normal text
 * - 3:1 for large text and graphical objects
 * 
 * @param foreground - Foreground hex color
 * @param background - Background hex color
 * @param isLargeOrGraphic - Whether this is large text or a graphical object (default: true for chart elements)
 * @returns True if the contrast meets WCAG AA requirements
 * 
 * **Feature: double-rose-chart, Property 12: Color contrast accessibility**
 * **Validates: Requirements 6.5**
 */
export function meetsWcagAAContrast(
  foreground: string,
  background: string,
  isLargeOrGraphic: boolean = true
): boolean {
  const ratio = calculateContrastRatio(foreground, background)
  const requiredRatio = isLargeOrGraphic ? 3 : 4.5
  return ratio >= requiredRatio
}
