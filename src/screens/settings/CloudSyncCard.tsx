import { ChevronDown, Cloud, DownloadCloud, RefreshCw, UploadCloud } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'
import type { Dispatch, SetStateAction } from 'react'
import { standardEase } from '../../lib/motionPresets'
import { Toggle } from '../../components/Toggle'
import type { CloudSyncSettings } from '../../lib/cloud'

export function CloudSyncCard(props: {
  cloudSync: CloudSyncSettings
  cloudReady: boolean
  cloudConfigExpanded: boolean
  setCloudConfigExpanded: Dispatch<SetStateAction<boolean>>
  busy: boolean
  updateCloudSync: (patch: Partial<CloudSyncSettings>) => void
  onTest: () => Promise<void>
  onRegister: () => Promise<void>
  onUpload: () => Promise<void>
  onRestore: () => Promise<void>
}) {
  const {
    cloudSync,
    cloudReady,
    cloudConfigExpanded,
    setCloudConfigExpanded,
    busy,
    updateCloudSync,
    onTest,
    onRegister,
    onUpload,
    onRestore,
  } = props

  const cloudSyncStatusLabel =
    cloudSync.lastSyncStatus === 'ok'
      ? '正常'
      : cloudSync.lastSyncStatus === 'conflict'
        ? '冲突'
        : cloudSync.lastSyncStatus === 'error'
          ? '失败'
          : ''

  return (
    <motion.div
      className="card"
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.13, duration: 0.26, ease: standardEase }}
    >
      <div className="cardInner">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Cloud size={18} />
          <div style={{ fontWeight: 800, fontSize: 16 }}>云同步</div>
        </div>
        <div className="muted" style={{ marginTop: 4, fontSize: 13, fontWeight: 550 }}>
          通过自托管后端备份 Ratio 数据。账号密码只保存在当前设备，不会写入备份文件。
        </div>

        <div className="stack" style={{ marginTop: 16 }}>
          <button
            type="button"
            className="assetItem"
            onClick={() => setCloudConfigExpanded((value) => !value)}
            aria-expanded={cloudConfigExpanded}
            style={{ background: 'var(--bg)', border: 'none', padding: 14, textAlign: 'left', width: '100%' }}
          >
            <div style={{ minWidth: 0 }}>
              <div className="assetName">连接配置</div>
              <div
                className="assetSub"
                style={{ marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
              >
                {cloudReady ? `${cloudSync.username.trim()} · ${cloudSync.serverUrl.trim()}` : '未完成'}
              </div>
            </div>
            <motion.span animate={{ rotate: cloudConfigExpanded ? 180 : 0 }} transition={{ type: 'spring', stiffness: 520, damping: 34, mass: 0.7 }}>
              <ChevronDown size={18} />
            </motion.span>
          </button>

          <AnimatePresence initial={false}>
            {cloudConfigExpanded ? (
              <motion.div
                key="cloud-config"
                className="stack"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0, transition: { duration: 0.2, ease: [0.4, 0, 1, 1] } }}
                transition={{ height: { duration: 0.3, ease: [0.05, 0.7, 0.1, 1] }, opacity: { duration: 0.24, ease: standardEase } }}
                style={{ overflow: 'hidden' }}
              >
                <label className="field">
                  <div className="fieldLabel">服务器地址</div>
                  <input
                    className="input"
                    value={cloudSync.serverUrl}
                    placeholder="http://localhost:8787"
                    disabled={busy}
                    onChange={(e) => updateCloudSync({ serverUrl: e.target.value })}
                  />
                </label>

                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 10 }}>
                  <label className="field">
                    <div className="fieldLabel">账号</div>
                    <input
                      className="input"
                      value={cloudSync.username}
                      autoComplete="username"
                      disabled={busy}
                      onChange={(e) => updateCloudSync({ username: e.target.value })}
                    />
                  </label>
                  <label className="field">
                    <div className="fieldLabel">密码</div>
                    <input
                      className="input"
                      type="password"
                      value={cloudSync.password}
                      autoComplete="current-password"
                      disabled={busy}
                      onChange={(e) => updateCloudSync({ password: e.target.value })}
                    />
                  </label>
                </div>

                <label className="field">
                  <div className="fieldLabel">创建账号邀请码</div>
                  <input
                    className="input"
                    type="password"
                    value={cloudSync.registrationInvite}
                    autoComplete="off"
                    placeholder="后端配置邀请码时填写"
                    disabled={busy}
                    onChange={(e) => updateCloudSync({ registrationInvite: e.target.value })}
                  />
                </label>

                <div className="assetItem" style={{ background: 'var(--bg)', border: 'none', padding: 14 }}>
                  <div>
                    <div className="assetName">自动备份</div>
                    <div className="assetSub" style={{ marginTop: 4 }}>
                      数据变更后自动上传，最短间隔 30 秒
                    </div>
                  </div>
                  <Toggle checked={cloudSync.autoSync} disabled={busy} onChange={(autoSync) => updateCloudSync({ autoSync })} />
                </div>

                <div className="assetItem" style={{ background: 'var(--bg)', border: 'none', padding: 14 }}>
                  <div>
                    <div className="assetName">日志遥测</div>
                    <div className="assetSub" style={{ marginTop: 4 }}>
                      仅上传错误、页面切换和同步结果，不包含账号余额明细
                    </div>
                  </div>
                  <Toggle
                    checked={cloudSync.telemetryEnabled}
                    disabled={busy}
                    onChange={(telemetryEnabled) => updateCloudSync({ telemetryEnabled })}
                  />
                </div>
              </motion.div>
            ) : null}
          </AnimatePresence>

          {!cloudConfigExpanded ? (
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {cloudSync.autoSync ? (
                <span className="badge" style={{ fontWeight: 600 }}>
                  自动备份
                </span>
              ) : null}
              {cloudSync.telemetryEnabled ? (
                <span className="badge" style={{ fontWeight: 600 }}>
                  日志遥测
                </span>
              ) : null}
            </div>
          ) : null}

          {cloudConfigExpanded ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 10 }}>
              <button type="button" className="primaryBtn" disabled={busy || !cloudReady} onClick={onTest}>
                <RefreshCw size={16} />
                <span>测试连接</span>
              </button>
              <button
                type="button"
                className="ghostBtn"
                style={{ height: 52, borderRadius: 20 }}
                disabled={busy || !cloudReady}
                onClick={onRegister}
              >
                <span>创建账号</span>
              </button>
            </div>
          ) : null}

          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 10 }}>
            <button type="button" className="assetItem" disabled={busy || !cloudReady} onClick={() => void onUpload()}>
              <div>
                <div className="assetName">上传</div>
                <div className="assetSub">覆盖云端备份</div>
              </div>
              <UploadCloud size={18} />
            </button>
            <button type="button" className="assetItem" disabled={busy || !cloudReady} onClick={onRestore}>
              <div>
                <div className="assetName">恢复</div>
                <div className="assetSub">覆盖本机数据</div>
              </div>
              <DownloadCloud size={18} />
            </button>
          </div>

          <div className="muted" style={{ fontSize: 12, fontWeight: 600 }}>
            {cloudSync.lastBackupAt ? `最近上传：${cloudSync.lastBackupAt}` : '尚未上传云端备份'}
          </div>
          {cloudSync.lastSyncAt ? (
            <div
              className="muted"
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: cloudSync.lastSyncStatus === 'conflict' || cloudSync.lastSyncStatus === 'error' ? '#b91c1c' : undefined,
              }}
            >
              最近同步：{cloudSyncStatusLabel} · {cloudSync.lastSyncAt}
              {cloudSync.lastSyncMessage ? ` · ${cloudSync.lastSyncMessage}` : ''}
            </div>
          ) : null}
        </div>
      </div>
    </motion.div>
  )
}
