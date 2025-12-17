import { useMemo } from 'react'
import { PieChart, Pie, Cell, ResponsiveContainer, Sector } from 'recharts'
import { type AccountGroup, type Account, type AccountGroupId, accountGroups } from '../lib/accounts'
import { formatCny } from '../lib/format'

type AccountData = {
  account: Account
  amount: number
  percentTotal: number
  percentGroup: number
  groupId: AccountGroupId
  groupTone: string
}

type DoubleRoseChartProps = {
  grouped: {
    groupCards: {
      group: AccountGroup
      accounts: Account[]
      total: number
    }[]
    assetsTotal: number
  }
  selectedGroupId: AccountGroupId | null
  onSelectGroup: (id: AccountGroupId | null) => void
  selectedAccountId: string | null
  onSelectAccount: (id: string | null) => void
}

// Helper to adjust color brightness
function adjustColor(hex: string, amount: number) {
  const color = hex.replace('#', '')
  const num = parseInt(color, 16)
  let r = (num >> 16) + amount
  let g = ((num >> 8) & 0x00ff) + amount
  let b = (num & 0x0000ff) + amount

  if (r > 255) r = 255; else if (r < 0) r = 0
  if (g > 255) g = 255; else if (g < 0) g = 0
  if (b > 255) b = 255; else if (b < 0) b = 0

  return '#' + (g | (b << 8) | (r << 16)).toString(16).padStart(6, '0')
}

// Custom Active Shape for Inner Pie (optional, maybe just standard hover)
// But for mobile tap, we might want a highlight.

export function DoubleRoseChart(props: DoubleRoseChartProps) {
  const { grouped, selectedGroupId, onSelectGroup, selectedAccountId, onSelectAccount } = props
  
  // 1. Prepare Inner Data (Groups)
  // Filter out debt for the chart structure as requested
  const innerData = useMemo(() => {
    return grouped.groupCards
      .filter(g => g.group.id !== 'debt')
      .map(g => ({
        name: g.group.id,
        value: g.total,
        group: g.group,
        total: g.total,
        percent: g.total / grouped.assetsTotal
      }))
      .filter(d => d.value > 0) // Hide empty groups? Or keep them? Usually pie hides 0
  }, [grouped])

  // 2. Prepare Outer Data (Accounts)
  // Flatten accounts from the same groups
  const outerData = useMemo(() => {
    const allAccounts: AccountData[] = []
    let maxAmount = 0

    // Collect all valid accounts
    grouped.groupCards.forEach(g => {
      if (g.group.id === 'debt') return
      g.accounts.forEach(a => {
        if (a.balance <= 0) return // Skip 0 or negative balance in rose for now
        if (a.balance > maxAmount) maxAmount = a.balance
        allAccounts.push({
          account: a,
          amount: a.balance,
          percentTotal: a.balance / grouped.assetsTotal,
          percentGroup: a.balance / g.total,
          groupId: g.group.id,
          groupTone: g.group.tone
        })
      })
    })

    // Sort by Group then by Balance desc? Or just by Group to align with inner pie?
    // To align with inner pie, we should probably sort by Group ID order or keep the order consistent.
    // However, inner pie sorts by... default is usually value or order provided.
    // Recharts Pie preserves order. `innerData` is derived from `grouped.groupCards` which is ordered by `accountGroups` keys in `useAccounts`?
    // Let's check `useAccounts`. `Object.keys(byGroup)` - iteration order.
    // So we should maintain that order.
    
    // Sort allAccounts based on the index of their group in innerData to ensure color continuity if we aligned them?
    // Actually, if we use two separate Pies, they align by startAngle/endAngle.
    // Inner Pie uses `value` (amount).
    // Outer Pie uses `value=1` (equal angle).
    // They will NOT align visually (inner is proportional, outer is equal slices).
    // This is expected for "Double Layer" where outer is a Rose chart (typically equal angle).
    // If we wanted them aligned (nested), outer would need to be proportional too, or inner equal.
    // User asked for: "Inner donut ring shows major asset group proportions; outer rose... shows individual accounts... Angle: Equal... Radius: Mapped"
    // So they are NOT radially aligned. That's fine. It's a "Rose around a Donut".

    // Limit to top N accounts + Others for mobile readability
    const limit = 12
    const sorted = allAccounts.sort((a, b) => b.amount - a.amount)
    if (sorted.length <= limit) return { data: sorted, maxAmount }

    const top = sorted.slice(0, limit)
    const others = sorted.slice(limit)
    const otherTotal = others.reduce((sum, a) => sum + a.amount, 0)
    
    if (otherTotal > 0) {
      // Create a fake "Others" account
      // We need a groupId/tone. Maybe grey? Or mixed?
      // Let's just use the largest group's tone or a neutral one.
      top.push({
        account: { id: 'others', name: '其他', type: 'other_liquid', balance: otherTotal, updatedAt: '' }, // Fake account
        amount: otherTotal,
        percentTotal: otherTotal / grouped.assetsTotal,
        percentGroup: 0, // Mixed
        groupId: 'liquid', // Dummy
        groupTone: '#e5e7eb' // Gray
      })
    }
    
    return { data: top, maxAmount: Math.max(maxAmount, otherTotal) }
  }, [grouped])

  // Dimensions
  // We rely on ResponsiveContainer, but we need relative radii.
  // Let's assume a viewBox of 400x400 (cx=200, cy=200).
  // Inner Donut: inner 50, outer 80
  // Outer Rose: base 85. Max length 110. (Total radius ~195)
  
  const renderCustomizedLabel = (props: unknown) => {
    void props
    // Maybe no labels on chart for mobile, too cluttered. Rely on Legend/Tooltip.
    return null
  }

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          {/* Inner Pie: Groups */}
          <Pie
            data={innerData}
            dataKey="value"
            cx="50%"
            cy="50%"
            innerRadius="25%"
            outerRadius="40%"
            paddingAngle={2}
            stroke="none"
            label={renderCustomizedLabel}
            onClick={(data) => {
              const gid = data.group.id
              onSelectGroup(selectedGroupId === gid ? null : gid)
              onSelectAccount(null) // Reset account selection
            }}
          >
            {innerData.map((entry, index) => (
              <Cell 
                key={`cell-inner-${index}`} 
                fill={entry.group.tone} 
                opacity={selectedGroupId && selectedGroupId !== entry.group.id ? 0.3 : 1}
              />
            ))}
          </Pie>

          {/* Outer Pie: Accounts (Rose) */}
          <Pie
            data={outerData.data}
            dataKey={() => 1} // Equal angle
            cx="50%"
            cy="50%"
            innerRadius="42%" // Start slightly outside inner
            outerRadius={() => "80%"} // Max radius for layout calculation
            shape={(props: any) => {
              const { cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill, payload } = props
              const val = payload.amount
              const max = outerData.maxAmount
              
              // Calculate Rose Radius
              // len = avail * (0.35 + 0.65 * sqrt(amount / max))
              // We need "avail". innerRadius is provided in pixels by Recharts.
              // outerRadius (from Pie prop) is provided in pixels.
              // avail = outerRadius - innerRadius
              
              const ir = innerRadius
              const or = outerRadius
              const avail = or - ir
              const ratio = Math.sqrt(val / max)
              const len = avail * (0.35 + 0.65 * ratio)
              const finalOuter = ir + len
              
              // We can also adjust innerRadius per user spec: "innerRadius = baseOuter - thickness"
              // But here we set innerRadius on Pie to 45%. 
              // If we want floating petals, we can just change `innerRadius` passed to Sector.
              // User said "outer ring band rose petals".
              // Let's keep it simple: Sector starting at `ir` ending at `finalOuter`.
              
              const isSelected = selectedAccountId === payload.account.id
              const isGroupSelected = selectedGroupId === payload.groupId
              const isDimmed = (selectedAccountId && !isSelected) || (selectedGroupId && !isGroupSelected)
              
              return (
                <g>
                  <Sector
                    cx={cx}
                    cy={cy}
                    innerRadius={ir}
                    outerRadius={finalOuter}
                    startAngle={startAngle}
                    endAngle={endAngle}
                    fill={fill}
                    opacity={isDimmed ? 0.3 : 1}
                    stroke={isSelected ? '#fff' : 'none'}
                    strokeWidth={2}
                    cursor="pointer"
                    onClick={(e) => {
                      e.stopPropagation()
                      onSelectAccount(isSelected ? null : payload.account.id)
                      // Also select group?
                      onSelectGroup(payload.groupId)
                    }}
                  />
                </g>
              )
            }}
            paddingAngle={2}
          >
             {outerData.data.map((entry, index) => (
              <Cell 
                key={`cell-outer-${index}`} 
                fill={adjustColor(entry.groupTone, (index % 5) * 10 - 20)} 
              />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      
      {/* Center Info - Only if something selected? Or always Total? */}
      {/* User said: "Top/Center displays 'Group Name + Total + Pct'" when selected */}
      
      <div 
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          textAlign: 'center',
          pointerEvents: 'none',
          width: '40%'
        }}
      >
        {/* We can put total assets here or selected group info */}
        <div className="text-xs text-[var(--muted-text)] font-bold">
          {selectedGroupId ? accountGroups[selectedGroupId].name : '净资产'}
        </div>
        <div className="text-sm font-black text-[var(--text)]">
          {selectedGroupId 
            ? formatCny(grouped.groupCards.find(g => g.group.id === selectedGroupId)?.total || 0)
            : formatCny(grouped.assetsTotal) // This is Assets Total (excluding debt)
          }
        </div>
      </div>
    </div>
  )
}
