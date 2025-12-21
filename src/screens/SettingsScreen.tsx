import { Check, Download, Upload } from 'lucide-react'
import { useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { SegmentedControl } from '../components/SegmentedControl'
import { buildRatioBackup, parseRatioBackup, restoreRatioBackup, stringifyRatioBackup } from '../lib/backup'
import type { AccountBackupStatus } from '../lib/useAccountBackup'
import type { WebDavBackupStatus } from '../lib/useWebDavBackup'
import type { ThemeId, ThemeOption } from '../lib/themes'

type CloudMode = 'none' | 'webdav' | 'account'

export function SettingsScreen(props: {
  themeOptions: ThemeOption[]
  theme: ThemeId
  onThemeChange: (id: ThemeId) => void
  cloudMode: CloudMode
  onCloudModeChange: (next: CloudMode) => void
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
  accountApiBaseUrl: string
  onAccountApiBaseUrlChange: (next: string) => void
  accountEmail: string
  onAccountEmailChange: (next: string) => void
  accountToken: string
  accountStatus: AccountBackupStatus
  onAccountRegister: (email: string, password: string) => Promise<void>
  onAccountLogin: (email: string, password: string) => Promise<void>
  onAccountLogout: () => Promise<void>
  onAccountBackupNow: () => void
  onAccountRestoreFromCloud: () => void
}) {
  const {
    themeOptions,
    theme,
    onThemeChange,
    cloudMode,
    onCloudModeChange,
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
    accountApiBaseUrl,
    onAccountApiBaseUrlChange,
    accountEmail,
    onAccountEmailChange,
    accountToken,
    accountStatus,
    onAccountRegister,
    onAccountLogin,
    onAccountLogout,
    onAccountBackupNow,
    onAccountRestoreFromCloud,
  } = props

  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [busy, setBusy] = useState(false)
  const [accountPassword, setAccountPassword] = useState('')
  const [accountAuthBusy, setAccountAuthBusy] = useState(false)

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

  const accountLoggedIn = Boolean(accountToken)

  const runRegister = async () => {
    const email = accountEmail.trim()
    const password = accountPassword
    if (!email) return window.alert('请输入邮箱')
    if (!password) return window.alert('请输入密码')
    setAccountAuthBusy(true)
    try {
      await onAccountRegister(email, password)
      setAccountPassword('')
    } catch (err) {
      const msg = err instanceof Error ? err.message : '注册失败'
      window.alert(msg)
    } finally {
      setAccountAuthBusy(false)
    }
  }

  const runLogin = async () => {
    const email = accountEmail.trim()
    const password = accountPassword
    if (!email) return window.alert('请输入邮箱')
    if (!password) return window.alert('请输入密码')
    setAccountAuthBusy(true)
    try {
      await onAccountLogin(email, password)
      setAccountPassword('')
    } catch (err) {
      const msg = err instanceof Error ? err.message : '登录失败'
      window.alert(msg)
    } finally {
      setAccountAuthBusy(false)
    }
  }

  const runLogout = async () => {
    setAccountAuthBusy(true)
    try {
      await onAccountLogout()
      setAccountPassword('')
    } catch (err) {
      const msg = err instanceof Error ? err.message : '退出失败'
      window.alert(msg)
    } finally {
      setAccountAuthBusy(false)
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
                    borderColor: active ? 'var(--primary)' : 'rgba(11, 15, 26, 0.06)',
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
          <div style={{ fontWeight: 950, fontSize: 16 }}>云备份</div>
          <div className="muted" style={{ marginTop: 4, fontSize: 13, fontWeight: 700 }}>
            坚果云 WebDAV 与账号云备份二选一；每次修改后自动备份
          </div>

          <div style={{ marginTop: 12 }}>
            <SegmentedControl
              value={cloudMode}
              onChange={onCloudModeChange}
              options={[
                { value: 'none', label: '关闭' },
                { value: 'webdav', label: '坚果云' },
                { value: 'account', label: '账号' },
              ]}
            />
          </div>

          {cloudMode === 'webdav' ? (
            <div className="stack" style={{ marginTop: 16 }}>
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
                提示：账号与应用密码保存在本地浏览器（不包含在备份文件中）；如出现 Load failed/Failed to fetch，请配置代理地址
              </div>

              <button type="button" className="ghostBtn" disabled={webdavStatus.inFlight} onClick={onWebdavBackupNow}>
                {webdavStatus.inFlight ? '备份中…' : '立即备份到坚果云'}
              </button>
              <button
                type="button"
                className="ghostBtn"
                disabled={webdavStatus.inFlight}
                onClick={onWebdavRestoreFromCloud}
              >
                从坚果云恢复（覆盖当前）
              </button>

              <div className="muted" style={{ fontSize: 12, fontWeight: 700 }}>
                {webdavStatus.lastBackupAt ? `上次备份：${new Date(webdavStatus.lastBackupAt).toLocaleString()}` : '尚未备份'}
              </div>
              {webdavStatus.lastError ? (
                <div style={{ fontSize: 12, fontWeight: 800, color: '#b42318' }}>{webdavStatus.lastError}</div>
              ) : null}
            </div>
          ) : cloudMode === 'account' ? (
            <div className="stack" style={{ marginTop: 16 }}>
              <div className="field">
                <div className="fieldLabel">账号服务地址</div>
                <input
                  className="input"
                  value={accountApiBaseUrl}
                  placeholder="https://<your-railway-app>.up.railway.app/"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  onChange={(e) => onAccountApiBaseUrlChange(e.target.value)}
                />
              </div>

              <div className="field">
                <div className="fieldLabel">邮箱</div>
                <input
                  className="input"
                  value={accountEmail}
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  onChange={(e) => onAccountEmailChange(e.target.value)}
                />
              </div>

              <div className="field">
                <div className="fieldLabel">密码</div>
                <input
                  className="input"
                  type="password"
                  value={accountPassword}
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  onChange={(e) => setAccountPassword(e.target.value)}
                />
              </div>

              <div className="muted" style={{ fontSize: 12, fontWeight: 700 }}>
                {accountLoggedIn ? '已登录（token 保存在本地，不包含在备份中）' : '未登录：请先注册或登录'}
              </div>

              {accountLoggedIn ? (
                <button
                  type="button"
                  className="ghostBtn"
                  disabled={accountAuthBusy || accountStatus.inFlight}
                  onClick={() => void runLogout()}
                >
                  退出登录
                </button>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <button
                    type="button"
                    className="ghostBtn"
                    disabled={accountAuthBusy || accountStatus.inFlight}
                    onClick={() => void runRegister()}
                  >
                    注册
                  </button>
                  <button
                    type="button"
                    className="ghostBtn"
                    disabled={accountAuthBusy || accountStatus.inFlight}
                    onClick={() => void runLogin()}
                  >
                    登录
                  </button>
                </div>
              )}

              <button
                type="button"
                className="ghostBtn"
                disabled={!accountLoggedIn || accountStatus.inFlight}
                onClick={onAccountBackupNow}
              >
                {accountStatus.inFlight ? '备份中…' : '立即备份到云端'}
              </button>
              <button
                type="button"
                className="ghostBtn"
                disabled={!accountLoggedIn || accountStatus.inFlight}
                onClick={onAccountRestoreFromCloud}
              >
                从云端恢复（覆盖当前）
              </button>

              <div className="muted" style={{ fontSize: 12, fontWeight: 700 }}>
                {accountStatus.lastBackupAt ? `上次备份：${new Date(accountStatus.lastBackupAt).toLocaleString()}` : '尚未备份'}
              </div>
              {accountStatus.lastError ? (
                <div style={{ fontSize: 12, fontWeight: 800, color: '#b42318' }}>{accountStatus.lastError}</div>
              ) : null}
            </div>
          ) : (
            <div className="muted" style={{ marginTop: 16, fontSize: 12, fontWeight: 700 }}>
              未启用云备份
            </div>
          )}
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
