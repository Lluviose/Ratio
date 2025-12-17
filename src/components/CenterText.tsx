import { motion, AnimatePresence } from 'framer-motion'
import { formatCny } from '../lib/format'

export type CenterTextProps = {
  selectedGroup: { name: string; amount: number } | null
  selectedAccount: { name: string; balance: number } | null
  netWorth: number
  cx: number
  cy: number
  opacity?: number
}

/**
 * Determines what text content to display based on selection state.
 * 
 * Priority:
 * 1. If an account is selected, show account name and balance
 * 2. If a group is selected (but no account), show group name and amount
 * 3. If nothing is selected, show "净资产" and net worth
 * 
 * **Feature: double-rose-chart, Property 2: Center text reflects selection state**
 * **Feature: double-rose-chart, Property 10: Account selection updates center text**
 * **Validates: Requirements 1.4, 5.2**
 */
export function getCenterTextContent(
  selectedGroup: { name: string; amount: number } | null,
  selectedAccount: { name: string; balance: number } | null,
  netWorth: number
): { label: string; amount: number } {
  if (selectedAccount) {
    return {
      label: selectedAccount.name,
      amount: selectedAccount.balance
    }
  }
  
  if (selectedGroup) {
    return {
      label: selectedGroup.name,
      amount: selectedGroup.amount
    }
  }
  
  return {
    label: '净资产',
    amount: netWorth
  }
}

/**
 * CenterText component displays contextual information in the center of the rose chart.
 * 
 * Features:
 * - Display group name and amount when group is selected
 * - Display account name and balance when account is selected
 * - Display "净资产" and net worth when nothing is selected
 * - Apply fade-in animation after main chart animation
 * 
 * **Validates: Requirements 1.4, 1.5, 5.1, 5.2**
 */
export function CenterText({
  selectedGroup,
  selectedAccount,
  netWorth,
  cx,
  cy,
  opacity = 1
}: CenterTextProps) {
  const { label, amount } = getCenterTextContent(selectedGroup, selectedAccount, netWorth)
  
  // Generate a unique key based on selection state for AnimatePresence
  const contentKey = selectedAccount?.name ?? selectedGroup?.name ?? 'networth'

  return (
    <g className="center-text" style={{ pointerEvents: 'none' }}>
      <AnimatePresence mode="wait">
        <motion.g
          key={contentKey}
          initial={{ opacity: 0 }}
          animate={{ opacity }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
        >
          {/* Label text (group name, account name, or "净资产") */}
          <text
            x={cx}
            y={cy - 8}
            textAnchor="middle"
            dominantBaseline="middle"
            className="fill-[var(--muted-text)]"
            style={{
              fontSize: '12px',
              fontWeight: 700
            }}
          >
            {label}
          </text>
          
          {/* Amount text */}
          <text
            x={cx}
            y={cy + 12}
            textAnchor="middle"
            dominantBaseline="middle"
            className="fill-[var(--text)]"
            style={{
              fontSize: '14px',
              fontWeight: 900
            }}
          >
            {formatCny(amount)}
          </text>
        </motion.g>
      </AnimatePresence>
    </g>
  )
}
