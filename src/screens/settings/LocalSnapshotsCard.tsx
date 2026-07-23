import { History } from 'lucide-react'
import { motion } from 'framer-motion'
import { standardEase } from '../../lib/motionPresets'
import type { LocalBackupEntry } from '../../lib/localBackups'
import { formatSnapshotTime, kindLabel } from './localSnapshotFormat'

export function LocalSnapshotsCard(props: {
  localSnapshots: LocalBackupEntry[]
  busy: boolean
  onRestore: (entry: LocalBackupEntry) => Promise<void>
}) {
  const { localSnapshots, busy, onRestore } = props
  if (localSnapshots.length === 0) return null
  return (
    <motion.div
      className="card"
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.25, duration: 0.26, ease: standardEase }}
    >
      <div className="cardInner">
        <div style={{ fontWeight: 800, fontSize: 16 }}>本机快照</div>
        <div className="muted" style={{ marginTop: 4, fontSize: 13, fontWeight: 550 }}>
          自动保留的近期数据副本（每日一份 + 危险操作前抢存），导错备份或误清数据时可回退
        </div>

        <div className="stack" style={{ marginTop: 16 }}>
          {localSnapshots.map((entry) => (
            <button
              key={entry.key}
              type="button"
              className="assetItem"
              style={{ background: 'var(--bg)', border: 'none', padding: 14, width: '100%', textAlign: 'left' }}
              disabled={busy}
              onClick={() => void onRestore(entry)}
            >
              <div>
                <div className="assetName">
                  {formatSnapshotTime(entry.createdAt)} · {kindLabel(entry.kind)}
                </div>
                <div className="assetSub" style={{ marginTop: 4 }}>
                  {Math.max(1, Math.round(entry.sizeBytes / 1024))} KB · 点按恢复到该时刻
                </div>
              </div>
              <History size={18} />
            </button>
          ))}
        </div>
      </div>
    </motion.div>
  )
}
