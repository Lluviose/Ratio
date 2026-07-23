import { Activity, Bot } from 'lucide-react'
import { motion } from 'framer-motion'
import { standardEase } from '../../lib/motionPresets'
import { Toggle } from '../../components/Toggle'
import type { CloudSyncSettings } from '../../lib/cloud'

export function CloudAiCard(props: {
  cloudSync: CloudSyncSettings
  cloudReady: boolean
  busy: boolean
  cloudAiStatus: string
  updateCloudSync: (patch: Partial<CloudSyncSettings>) => void
  onCheckStatus: () => Promise<void>
}) {
  const { cloudSync, cloudReady, busy, cloudAiStatus, updateCloudSync, onCheckStatus } = props

  const cloudAiHint = !cloudReady
    ? '先完成云同步连接配置'
    : !cloudSync.useCloudAi
      ? '开启后可在资产页使用 AI 分析'
      : '发送财务摘要、最近快照和最近账户操作'

  return (
    <motion.div
      className="card"
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.17, duration: 0.26, ease: standardEase }}
    >
      <div className="cardInner">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Bot size={18} />
          <div style={{ fontWeight: 800, fontSize: 16 }}>AI 接口</div>
        </div>
        <div className="muted" style={{ marginTop: 4, fontSize: 13, fontWeight: 550 }}>
          AI 对话端口由云端后台统一配置，前端只保存是否启用代理。
        </div>

        <div className="stack" style={{ marginTop: 16 }}>
          <div className="assetItem" style={{ background: 'var(--bg)', border: 'none', padding: 14 }}>
            <div>
              <div className="assetName">使用云端 AI 代理</div>
              <div className="assetSub" style={{ marginTop: 4 }}>
                {cloudAiHint}
              </div>
            </div>
            <Toggle
              checked={cloudSync.useCloudAi}
              disabled={busy || (!cloudReady && !cloudSync.useCloudAi)}
              onChange={(useCloudAi) => updateCloudSync({ useCloudAi })}
            />
          </div>

          <button
            type="button"
            className="assetItem"
            disabled={busy || !cloudReady}
            onClick={onCheckStatus}
          >
            <div>
              <div className="assetName">检查云端 AI</div>
              <div className="assetSub">读取后台统一配置的可用状态</div>
            </div>
            <Activity size={18} />
          </button>

          {cloudAiStatus ? (
            <div className="muted" style={{ fontSize: 12, fontWeight: 600 }}>
              {cloudAiStatus}
            </div>
          ) : null}
        </div>
      </div>
    </motion.div>
  )
}
