import { Download, Upload } from 'lucide-react'
import { motion } from 'framer-motion'
import { standardEase } from '../../lib/motionPresets'

export function BackupCard(props: { busy: boolean; onExport: () => void; onImportClick: () => void }) {
  const { busy, onExport, onImportClick } = props
  return (
    <motion.div
      className="card"
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.21, duration: 0.26, ease: standardEase }}
    >
      <div className="cardInner">
        <div style={{ fontWeight: 800, fontSize: 16 }}>备份与恢复</div>
        <div className="muted" style={{ marginTop: 4, fontSize: 13, fontWeight: 550 }}>
          导出为文件，或从文件导入（会覆盖当前数据）
        </div>

        <div className="stack" style={{ marginTop: 16 }}>
          <button
            type="button"
            className="assetItem"
            style={{
              width: '100%',
              textAlign: 'left',
              cursor: 'pointer',
              padding: '16px',
              background: 'var(--bg)',
              border: 'none',
            }}
            disabled={busy}
            onClick={onExport}
          >
            <div>
              <div className="assetName" style={{ fontSize: 15 }}>
                导出备份
              </div>
              <div className="assetSub" style={{ marginTop: 4 }}>
                下载一个 JSON 文件
              </div>
            </div>
            <Download size={18} />
          </button>

          <button
            type="button"
            className="assetItem"
            style={{
              width: '100%',
              textAlign: 'left',
              cursor: 'pointer',
              padding: '16px',
              background: 'var(--bg)',
              border: 'none',
            }}
            disabled={busy}
            onClick={onImportClick}
          >
            <div>
              <div className="assetName" style={{ fontSize: 15 }}>
                导入备份
              </div>
              <div className="assetSub" style={{ marginTop: 4 }}>
                从 JSON 恢复（覆盖当前）
              </div>
            </div>
            <Upload size={18} />
          </button>
        </div>
      </div>
    </motion.div>
  )
}
