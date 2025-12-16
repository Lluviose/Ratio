export function formatMoney(value: number) {
  const abs = Math.abs(value)
  const sign = value < 0 ? '-' : ''
  if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(2)}m`
  if (abs >= 10_000) return `${sign}${Math.round(abs).toLocaleString('en-US')}`
  return `${sign}${abs.toLocaleString('en-US')}`
}

export function formatCny(value: number) {
  return `¥${Math.round(value).toLocaleString('zh-CN')}`
}
