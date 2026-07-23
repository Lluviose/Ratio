import type { LocalBackupEntry } from '../../lib/localBackups'

export const kindLabel = (kind: LocalBackupEntry['kind']) =>
  kind === 'daily' ? '每日快照' : kind === 'pre' ? '操作前快照' : '降级期间数据'

export const formatSnapshotTime = (createdAt: string) => {
  // daily 是 YYYY-MM-DD、其余是 ISO 时间戳，统一转本地「M月d日 (HH:mm)」
  const hasTime = createdAt.includes('T')
  const date = new Date(hasTime ? createdAt : `${createdAt}T00:00:00`)
  if (Number.isNaN(date.getTime())) return createdAt
  const base = `${date.getMonth() + 1}月${date.getDate()}日`
  if (!hasTime) return base
  return `${base} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}
