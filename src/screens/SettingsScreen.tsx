import { Check, Download, Upload } from 'lucide-react'
import { useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { Toggle } from '../components/Toggle'
import { buildRatioBackup, parseRatioBackup, restoreRatioBackup, stringifyRatioBackup } from '../lib/backup'
import type { WebDavBackupStatus } from '../lib/useWebDavBackup'
import type { ThemeId, ThemeOption } from '../lib/themes'

export function SettingsScreen(props: {
  themeOptions: ThemeOption[]
  theme: ThemeId
  onThemeChange: (id: ThemeId) => void
  webdavEnabled: boolean
  onWebdavEnabledChange: (next: boolean) => void
  webdavBaseUrl: string
  onWebdavBaseUrlChange: (next: string) => void
  webdavUsername: string
  onWebdavUsernameChange: (next: string) => void
  webdavPassword: string
  onWebdavPasswordChange: (next: string) => void
  webdavPath: string
  onWebdavPathChange: (next: string) => void
  webdavProxyUrl: string
  onWebdavProxyUrlChange: (next: string) => void
  webdavStatus: WebDavBackupStatus
  onWebdavBackupNow: () => void
  onWebdavRestoreFromCloud: () => void
}) {
  const {
    themeOptions,
    theme,
    onThemeChange,
    webdavEnabled,
    onWebdavEnabledChange,
    webdavBaseUrl,
    onWebdavBaseUrlChange,
    webdavUsername,
    onWebdavUsernameChange,
    webdavPassword,
    onWebdavPasswordChange,
    webdavPath,
    onWebdavPathChange,
    webdavProxyUrl,
    onWebdavProxyUrlChange,
    webdavStatus,
    onWebdavBackupNow,
    onWebdavRestoreFromCloud,
  } = props

  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [busy, setBusy] = useState(false)
  const randomSwatches = themeOptions.filter((t) => t.id !== 'random').map((t) => t.colors.invest)

  const exportBackup = () => {
    try {
      setBusy(true)
      const backup = buildRatioBackup()
      const text = stringifyRatioBackup(backup)
      const stamp = new Date().toISOString().replace(/[:.]/g, '-')
      const filename = `ratio-backup-${stamp}.json`

      const blob = new Blob([text], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 0)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Export failed'
      window.alert(msg)
    } finally {
      setBusy(false)
    }
  }

  const importBackup = async (file: File) => {
    setBusy(true)
    try {
      const text = await file.text()
      const backup = parseRatioBackup(text)
      const ok = window.confirm('导入备份会覆盖当前设备上的所有数据，是否继续？')
      if (!ok) return

      const res = restoreRatioBackup(backup)
      window.alert(`已恢复 ${res.restoredKeys.length} 项数据，页面将自动刷新。`)
      window.location.reload()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Import failed'
      window.alert(msg)
    } finally {
      setBusy(false)
    }
  }

  return (
    <motion.div
      className="stack"
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3 }}
    >
      <div className="card">
        <div className="cardInner">
          <div style={{ fontWeight: 950, fontSize: 16 }}>个性主题</div>
          <div className="muted" style={{ marginTop: 4, fontSize: 13, fontWeight: 700 }}>
            图标匹配主题色
          </div>

          <div className="stack" style={{ marginTop: 16 }}>
            {themeOptions.map((t, i) => {
              const active = t.id === theme
              return (
                <motion.div
                  key={t.id}
                  className="themeRow"
                  onClick={() => onThemeChange(t.id)}
                  role="button"
                  tabIndex={0}
                  style={{
                    background: active ? 'var(--bg)' : 'transparent',
                    borderColor: active ? 'var(--primary)' : 'rgba(11, 15, 26, 0.06)'
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') onThemeChange(t.id)
                  }}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  whileTap={{ scale: 0.99 }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div className="swatches" aria-hidden="true">
                      {(t.id === 'random' ? randomSwatches : [t.colors.liquid, t.colors.invest, t.colors.fixed]).map(
                        (color, idx) => (
                          <span key={`${t.id}-${idx}`} className="swatch" style={{ background: color }} />
                        ),
                      )}
                    </div>
                    <div style={{ fontWeight: 900, fontSize: 14 }}>{t.name}</div>
                  </div>

                  <span className={active ? 'check checkOn' : 'check'} aria-label={active ? 'selected' : 'unselected'}>
                    {active ? <Check size={12} color="#fff" strokeWidth={4} /> : null}
                  </span>
                </motion.div>
              )
            })}
          </div>
        </div>
      </div>

      <motion.div 
        className="card"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        <div className="cardInner">
          <div style={{ fontWeight: 950, fontSize: 16 }}>坚果云备份</div>
          <div className="muted" style={{ marginTop: 4, fontSize: 13, fontWeight: 700 }}>
            通过 WebDAV 自动备份（网页/PWA 直连通常会被 CORS 阻止，需要代理）
          </div>

          <div className="stack" style={{ marginTop: 16 }}>
            <div className="assetItem" style={{ padding: '16px', background: 'var(--bg)', border: 'none' }}>
              <div>
                <div className="assetName" style={{ fontSize: 15 }}>自动备份</div>
                <div className="assetSub" style={{ marginTop: 4 }}>每次修改后自动上传到坚果云</div>
              </div>
              <Toggle checked={webdavEnabled} onChange={onWebdavEnabledChange} />
            </div>

            {webdavEnabled ? (
              <div className="stack" style={{ marginTop: 4 }}>
                <div className="field">
                  <div className="fieldLabel">WebDAV 地址</div>
                  <input
                    className="input"
                    value={webdavBaseUrl}
                    placeholder="https://dav.jianguoyun.com/dav/"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    onChange={(e) => onWebdavBaseUrlChange(e.target.value)}
                  />
                </div>

                <div className="field">
                  <div className="fieldLabel">用户名（坚果云账号）</div>
                  <input
                    className="input"
                    value={webdavUsername}
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    onChange={(e) => onWebdavUsernameChange(e.target.value)}
                  />
                </div>

                <div className="field">
                  <div className="fieldLabel">应用密码</div>
                  <input
                    className="input"
                    type="password"
                    value={webdavPassword}
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    onChange={(e) => onWebdavPasswordChange(e.target.value)}
                  />
                </div>

                <div className="field">
                  <div className="fieldLabel">备份文件路径</div>
                  <input
                    className="input"
                    value={webdavPath}
                    placeholder="Apps/ratio/ratio-backup.json"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    onChange={(e) => onWebdavPathChange(e.target.value)}
                  />
                </div>

                <div className="field">
                  <div className="fieldLabel">代理地址（可选）</div>
                  <input
                    className="input"
                    value={webdavProxyUrl}
                    placeholder="https://<your-proxy>/"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    onChange={(e) => onWebdavProxyUrlChange(e.target.value)}
                  />
                </div>

                <div className="muted" style={{ fontSize: 12, fontWeight: 700 }}>
                  提示：账号与应用密码会保存在本地浏览器（不包含在备份文件中）；如出现 Load failed/Failed to fetch，请配置代理地址
                </div>

                <button type="button" className="ghostBtn" disabled={webdavStatus.inFlight} onClick={onWebdavBackupNow}>
                  {webdavStatus.inFlight ? '备份中…' : '立即备份到坚果云'}
                </button>
                <button type="button" className="ghostBtn" disabled={webdavStatus.inFlight} onClick={onWebdavRestoreFromCloud}>
                  从坚果云恢复（覆盖当前）
                </button>

                <div className="muted" style={{ fontSize: 12, fontWeight: 700 }}>
                  {webdavStatus.lastBackupAt
                    ? `上次备份：${new Date(webdavStatus.lastBackupAt).toLocaleString()}`
                    : '尚未备份'}
                </div>
                {webdavStatus.lastError ? (
                  <div style={{ fontSize: 12, fontWeight: 800, color: '#b42318' }}>
                    {webdavStatus.lastError}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </motion.div>

      <motion.div
        className="card"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25 }}
      >
        <div className="cardInner">
          <div style={{ fontWeight: 950, fontSize: 16 }}>备份与恢复</div>
          <div className="muted" style={{ marginTop: 4, fontSize: 13, fontWeight: 700 }}>
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
              onClick={exportBackup}
            >
              <div>
                <div className="assetName" style={{ fontSize: 15 }}>
                  导出备份
                </div>
                <div className="assetSub" style={{ marginTop: 4 }}>
                  下载为 JSON 文件
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
              onClick={() => fileInputRef.current?.click()}
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

      <input
        ref={fileInputRef}
        type="file"
        accept="application/json"
        style={{ display: 'none' }}
        onChange={(e) => {
          const file = e.target.files?.[0]
          e.currentTarget.value = ''
          if (!file) return
          void importBackup(file)
        }}
      />
    </motion.div>
  )
}
