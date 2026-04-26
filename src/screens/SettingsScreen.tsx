import { Activity, Bot, Check, ChevronDown, Cloud, Download, DownloadCloud, RefreshCw, Upload, UploadCloud } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { SegmentedControl } from '../components/SegmentedControl'
import { queueToastAfterReload, useOverlay } from '../lib/overlay'
import { buildRatioBackup, parseRatioBackup, restoreRatioBackup, stringifyRatioBackup } from '../lib/backup'
import {
  CLOUD_SYNC_SETTINGS_KEY,
  CloudRequestError,
  DEFAULT_CLOUD_SYNC_SETTINGS,
  coerceCloudSyncSettings,
  createCloudUser,
  downloadCloudBackup,
  fetchCloudAiStatus,
  fetchCloudMe,
  uploadCloudBackup,
  writeCloudSyncSettingsPatch,
  type CloudBackupMeta,
  type CloudSyncSettings,
} from '../lib/cloud'
import { markCloudSyncClean, readCloudSyncDirtyToken } from '../lib/cloudSync'
import { ACCOUNT_SORT_MODE_KEY, type AccountSortMode } from '../lib/accountSort'
import { clampMonthStartDay, DEFAULT_MONTH_START_DAY, MAX_MONTH_START_DAY, MIN_MONTH_START_DAY, MONTH_START_DAY_KEY } from '../lib/monthStart'
import type { ThemeId, ThemeOption } from '../lib/themes'
import { useLocalStorageState } from '../lib/useLocalStorageState'
import { quickFade, standardEase } from '../lib/motionPresets'
import { Toggle } from '../components/Toggle'
import { trackTelemetry } from '../lib/telemetry'

type ThemeChangeOrigin = { x: number; y: number }

function getThemeChangeOrigin(el: HTMLElement): ThemeChangeOrigin {
  const swatches = el.querySelector('.swatches')
  const rect = (swatches ?? el).getBoundingClientRect()
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
}

function withAlpha(color: string, alpha: number): string {
  const raw = color.trim().replace(/^#/, '')
  if (raw.length !== 3 && raw.length !== 6) return color

  const full = raw.length === 3 ? raw.split('').map((v) => v + v).join('') : raw
  const r = Number.parseInt(full.slice(0, 2), 16)
  const g = Number.parseInt(full.slice(2, 4), 16)
  const b = Number.parseInt(full.slice(4, 6), 16)
  if ([r, g, b].some((v) => Number.isNaN(v))) return color

  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

function isAbortError(err: unknown) {
  return typeof err === 'object' && err !== null && 'name' in err && Reflect.get(err, 'name') === 'AbortError'
}

export function SettingsScreen(props: {
  themeOptions: ThemeOption[]
  theme: ThemeId
  activeThemeColor: string
  onThemeChange: (id: ThemeId, origin?: ThemeChangeOrigin) => void
}) {
  const { themeOptions, theme, activeThemeColor, onThemeChange } = props

  const [accountSortMode, setAccountSortMode] = useLocalStorageState<AccountSortMode>(
    ACCOUNT_SORT_MODE_KEY,
    'balance',
  )
  const [monthStartDayRaw, setMonthStartDayRaw] = useLocalStorageState<number>(
    MONTH_START_DAY_KEY,
    DEFAULT_MONTH_START_DAY,
  )
  const [cloudSync, setCloudSync] = useLocalStorageState(CLOUD_SYNC_SETTINGS_KEY, DEFAULT_CLOUD_SYNC_SETTINGS, {
    coerce: coerceCloudSyncSettings,
  })
  const [cloudAiStatus, setCloudAiStatus] = useState<string>('')
  const [cloudConfigExpanded, setCloudConfigExpanded] = useState(() => !cloudSync.lastBackupAt)
  const monthStartDay = clampMonthStartDay(monthStartDayRaw)

  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const cloudSyncRef = useRef(cloudSync)
  const mountedRef = useRef(true)
  const cloudAbortRef = useRef<AbortController | null>(null)
  const [busy, setBusy] = useState(false)
  const { toast, confirm } = useOverlay()

  useEffect(() => {
    cloudSyncRef.current = cloudSync
  }, [cloudSync])

  useEffect(() => {
    return () => {
      mountedRef.current = false
      cloudAbortRef.current?.abort()
    }
  }, [])

  useEffect(() => {
    if (monthStartDayRaw !== monthStartDay) setMonthStartDayRaw(monthStartDay)
  }, [monthStartDay, monthStartDayRaw, setMonthStartDayRaw])

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
      toast(msg, { tone: 'danger' })
    } finally {
      setBusy(false)
    }
  }

  const importBackup = async (file: File) => {
    const ok = await confirm({
      title: '导入备份',
      message: '导入备份会覆盖当前设备上的所有数据，是否继续？',
      confirmText: '继续导入',
      cancelText: '取消',
      tone: 'danger',
    })
    if (!ok) return

    setBusy(true)
    try {
      const text = await file.text()
      const backup = parseRatioBackup(text)
      const res = restoreRatioBackup(backup)
      queueToastAfterReload(`已恢复 ${res.restoredKeys.length} 项数据`, { tone: 'success' })
      window.location.reload()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Import failed'
      toast(msg, { tone: 'danger' })
    } finally {
      setBusy(false)
    }
  }

  const updateCloudSync = (patch: Partial<typeof cloudSync>) => {
    const endpointChanged =
      (patch.serverUrl !== undefined && patch.serverUrl !== cloudSync.serverUrl) ||
      (patch.username !== undefined && patch.username !== cloudSync.username)
    if (endpointChanged) {
      setCloudAiStatus('')
      setCloudConfigExpanded(true)
    }
    setCloudSync((current) => {
      if (!endpointChanged) return { ...current, ...patch }
      return {
        ...current,
        ...patch,
        lastBackupAt: undefined,
        lastRestoreAt: undefined,
        lastSyncAt: undefined,
        lastSyncStatus: undefined,
        lastSyncMessage: undefined,
      }
    })
  }

  const cloudReady = Boolean(cloudSync.serverUrl.trim() && cloudSync.username.trim() && cloudSync.password)

  const isSameCloudTarget = (settings: CloudSyncSettings) => {
    const current = cloudSyncRef.current
    return (
      current.serverUrl.trim() === settings.serverUrl.trim() &&
      current.username.trim() === settings.username.trim() &&
      current.password === settings.password
    )
  }

  const notifyCloudTargetChanged = () => {
    if (!mountedRef.current) return
    toast('云同步配置已变更，请重新操作', { tone: 'neutral' })
  }

  const startCloudOperation = () => {
    cloudAbortRef.current?.abort()
    const controller = new AbortController()
    cloudAbortRef.current = controller
    if (mountedRef.current) setBusy(true)
    return controller
  }

  const finishCloudOperation = (controller: AbortController) => {
    if (cloudAbortRef.current !== controller) return
    cloudAbortRef.current = null
    if (mountedRef.current) setBusy(false)
  }

  const canUseCloudResult = (controller: AbortController) => mountedRef.current && !controller.signal.aborted

  const cloudSyncStatusLabel =
    cloudSync.lastSyncStatus === 'ok'
      ? '正常'
      : cloudSync.lastSyncStatus === 'conflict'
        ? '冲突'
        : cloudSync.lastSyncStatus === 'error'
          ? '失败'
          : ''

  const readConflictMeta = (err: unknown): CloudBackupMeta | null => {
    if (!(err instanceof CloudRequestError)) return null
    if (err.code !== 'backup_conflict') return null
    const meta = err.details.meta
    if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return null
    const record = meta as Record<string, unknown>
    if (typeof record.updatedAt !== 'string') return null
    return {
      updatedAt: record.updatedAt,
      clientCreatedAt: typeof record.clientCreatedAt === 'string' ? record.clientCreatedAt : record.updatedAt,
      itemCount: typeof record.itemCount === 'number' ? record.itemCount : 0,
      device: typeof record.device === 'string' ? record.device : '',
    }
  }

  const registerCloud = async () => {
    const requestSettings = cloudSyncRef.current
    const controller = startCloudOperation()
    try {
      const res = await createCloudUser(requestSettings, { signal: controller.signal })
      if (!canUseCloudResult(controller)) return
      if (!isSameCloudTarget(requestSettings)) {
        notifyCloudTargetChanged()
        return
      }
      writeCloudSyncSettingsPatch({ registrationInvite: '' })
      toast(`云账号已创建：${res.user.username}`, { tone: 'success' })
      trackTelemetry('cloud_register')
    } catch (err) {
      if (isAbortError(err)) return
      if (!mountedRef.current) return
      const msg = err instanceof Error ? err.message : 'Cloud register failed'
      toast(msg, { tone: 'danger' })
    } finally {
      finishCloudOperation(controller)
    }
  }

  const testCloud = async () => {
    const requestSettings = cloudSyncRef.current
    const controller = startCloudOperation()
    try {
      const res = await fetchCloudMe(requestSettings, { signal: controller.signal })
      if (!canUseCloudResult(controller)) return
      if (!isSameCloudTarget(requestSettings)) {
        notifyCloudTargetChanged()
        return
      }
      toast(`已连接：${res.user.username}`, { tone: 'success' })
      trackTelemetry('cloud_connect_test')
    } catch (err) {
      if (isAbortError(err)) return
      if (!mountedRef.current) return
      const msg = err instanceof Error ? err.message : 'Cloud connection failed'
      toast(msg, { tone: 'danger' })
    } finally {
      finishCloudOperation(controller)
    }
  }

  const uploadCloud = async (force = false, requestSettings: CloudSyncSettings = cloudSyncRef.current): Promise<void> => {
    let retrying = false
    const controller = startCloudOperation()
    try {
      const dirtyToken = readCloudSyncDirtyToken()
      const backup = buildRatioBackup()
      const meta = await uploadCloudBackup(requestSettings, backup, {
        expectedUpdatedAt: requestSettings.lastBackupAt,
        force,
        signal: controller.signal,
      })
      if (!canUseCloudResult(controller)) return
      if (!isSameCloudTarget(requestSettings)) {
        notifyCloudTargetChanged()
        return
      }
      const syncedAt = new Date().toISOString()
      markCloudSyncClean(dirtyToken)
      writeCloudSyncSettingsPatch({
        lastBackupAt: meta.updatedAt,
        lastSyncAt: syncedAt,
        lastSyncStatus: 'ok',
        lastSyncMessage: `已上传 ${meta.itemCount} 项数据`,
      })
      setCloudConfigExpanded(false)
      toast(`已上传 ${meta.itemCount} 项数据`, { tone: 'success' })
      trackTelemetry('cloud_backup_upload', { itemCount: meta.itemCount, force })
    } catch (err) {
      if (isAbortError(err)) return
      const conflictMeta = readConflictMeta(err)
      if (err instanceof CloudRequestError && err.code === 'backup_conflict' && !force) {
        if (!canUseCloudResult(controller)) return
        const conflictMessage = conflictMeta ? `云端备份已更新：${conflictMeta.updatedAt}` : '云端备份状态已变化'
        if (isSameCloudTarget(requestSettings)) {
          writeCloudSyncSettingsPatch({
            lastSyncAt: new Date().toISOString(),
            lastSyncStatus: 'conflict',
            lastSyncMessage: conflictMessage,
          })
        }
        if (mountedRef.current) setBusy(false)
        const ok = await confirm({
          title: '云端备份已更新',
          message: conflictMeta
            ? `云端已有更新的备份（${conflictMeta.updatedAt}）。继续上传会覆盖云端数据。`
            : '云端备份状态已变化。继续上传会覆盖当前云端状态。',
          confirmText: '覆盖云端备份',
          cancelText: '取消',
          tone: 'danger',
        })
        if (!canUseCloudResult(controller)) return
        if (ok) {
          if (!isSameCloudTarget(requestSettings)) {
            notifyCloudTargetChanged()
            return
          }
          retrying = true
          return uploadCloud(true, requestSettings)
        }
        return
      }
      if (!mountedRef.current) return
      const msg = err instanceof Error ? err.message : 'Cloud upload failed'
      if (isSameCloudTarget(requestSettings)) {
        writeCloudSyncSettingsPatch({
          lastSyncAt: new Date().toISOString(),
          lastSyncStatus: 'error',
          lastSyncMessage: msg,
        })
      }
      toast(msg, { tone: 'danger' })
    } finally {
      if (!retrying) finishCloudOperation(controller)
    }
  }

  const restoreCloud = async () => {
    const ok = await confirm({
      title: '从云端恢复',
      message: '云端备份会覆盖当前设备上的 Ratio 数据。继续前建议先导出一个本地备份。',
      confirmText: '恢复云端备份',
      cancelText: '取消',
      tone: 'danger',
    })
    if (!ok || !mountedRef.current) return

    const requestSettings = cloudSyncRef.current
    const controller = startCloudOperation()
    try {
      const res = await downloadCloudBackup(requestSettings, { signal: controller.signal })
      if (!canUseCloudResult(controller)) return
      if (!isSameCloudTarget(requestSettings)) {
        notifyCloudTargetChanged()
        return
      }
      if (!res.backup) {
        toast('云端还没有备份', { tone: 'neutral' })
        return
      }
      const restore = restoreRatioBackup(res.backup)
      const restoredAt = new Date().toISOString()
      markCloudSyncClean()
      writeCloudSyncSettingsPatch({
        lastRestoreAt: restoredAt,
        lastBackupAt: res.meta?.updatedAt ?? requestSettings.lastBackupAt,
        lastSyncAt: restoredAt,
        lastSyncStatus: 'ok',
        lastSyncMessage: `已从云端恢复 ${restore.restoredKeys.length} 项数据`,
      })
      trackTelemetry('cloud_backup_restore', { restoredKeys: restore.restoredKeys.length })
      queueToastAfterReload(`已从云端恢复 ${restore.restoredKeys.length} 项数据`, { tone: 'success' })
      window.location.reload()
    } catch (err) {
      if (isAbortError(err)) return
      if (!mountedRef.current) return
      const msg = err instanceof Error ? err.message : 'Cloud restore failed'
      if (isSameCloudTarget(requestSettings)) {
        writeCloudSyncSettingsPatch({
          lastSyncAt: new Date().toISOString(),
          lastSyncStatus: 'error',
          lastSyncMessage: msg,
        })
      }
      toast(msg, { tone: 'danger' })
    } finally {
      finishCloudOperation(controller)
    }
  }

  const checkCloudAiStatus = async () => {
    const requestSettings = cloudSyncRef.current
    const controller = startCloudOperation()
    try {
      const res = await fetchCloudAiStatus(requestSettings, { signal: controller.signal })
      if (!canUseCloudResult(controller)) return
      if (!isSameCloudTarget(requestSettings)) {
        notifyCloudTargetChanged()
        return
      }
      if (!res.ai.configured) {
        const message = res.ai.issue ? `云端 AI 配置不完整：${res.ai.issue}` : '云端 AI 未配置'
        setCloudAiStatus(message)
        toast(message, { tone: 'neutral' })
        return
      }
      setCloudAiStatus(
        `云端 AI 配置完整：${res.ai.model} / reasoning ${res.ai.reasoningEffort}${
          res.ai.hasApiKey ? ` / key ${res.ai.apiKeyMasked}` : ''
        }`,
      )
      toast('云端 AI 配置完整', { tone: 'success' })
      trackTelemetry('cloud_ai_status_check', { configured: true })
    } catch (err) {
      if (isAbortError(err)) return
      if (!mountedRef.current) return
      const msg = err instanceof Error ? err.message : 'Check AI status failed'
      toast(msg, { tone: 'danger' })
    } finally {
      finishCloudOperation(controller)
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
              const activeAccent = active ? activeThemeColor : t.colors.invest
              const activeBackground = active ? withAlpha(activeAccent, 0.1) : 'transparent'
              const activeShadow = active ? `0 12px 28px -24px ${withAlpha(activeAccent, 0.72)}` : undefined
              return (
                <motion.div
                  key={t.id}
                  className="themeRow"
                  onClick={(e) => onThemeChange(t.id, getThemeChangeOrigin(e.currentTarget))}
                  role="button"
                  tabIndex={0}
                  style={{
                    background: activeBackground,
                    borderColor: active ? activeAccent : 'rgba(11, 15, 26, 0.06)',
                    boxShadow: activeShadow,
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      onThemeChange(t.id, getThemeChangeOrigin(e.currentTarget))
                    }
                  }}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{
                    opacity: { delay: i * 0.05, duration: 0.18, ease: standardEase },
                    y: { delay: i * 0.05, duration: 0.18, ease: standardEase },
                  }}
                  whileTap={{ scale: 0.99 }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div className="swatches" aria-hidden="true">
                      {(t.id === 'random' ? randomSwatches : [t.colors.liquid, t.colors.invest, t.colors.fixed]).map(
                        (color, idx) => (
                          <motion.span
                            key={`${t.id}-${idx}`}
                            className="swatch"
                            style={{ background: color }}
                            animate={{ y: active ? -1 : 0, scale: active ? 1.04 : 1 }}
                            transition={{ ...quickFade, delay: active ? idx * 0.025 : 0 }}
                          />
                        ),
                      )}
                    </div>
                    <div style={{ fontWeight: 900, fontSize: 14 }}>{t.name}</div>
                  </div>

                  <motion.span
                    className={active ? 'check checkOn' : 'check'}
                    aria-label={active ? 'selected' : 'unselected'}
                    style={active ? { background: activeAccent, borderColor: activeAccent } : undefined}
                    animate={{ scale: active ? 1.06 : 1 }}
                    transition={quickFade}
                  >
                    <AnimatePresence initial={false}>
                      {active ? (
                        <motion.span
                          key="check"
                          initial={{ opacity: 0, scale: 0.62, rotate: -18 }}
                          animate={{ opacity: 1, scale: 1, rotate: 0 }}
                          exit={{ opacity: 0, scale: 0.72 }}
                          transition={quickFade}
                        >
                          <Check size={12} color="#fff" strokeWidth={4} />
                        </motion.span>
                      ) : null}
                    </AnimatePresence>
                  </motion.span>
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
        transition={{ delay: 0.16 }}
      >
        <div className="cardInner">
          <div style={{ fontWeight: 950, fontSize: 16 }}>账户排序</div>
          <div className="muted" style={{ marginTop: 4, fontSize: 13, fontWeight: 700 }}>
            影响资产页二级与三级列表的显示顺序
          </div>

          <div style={{ marginTop: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
            <SegmentedControl<AccountSortMode>
              options={[
                { value: 'manual', label: '手动' },
                { value: 'balance', label: '余额↓' },
              ]}
              value={accountSortMode}
              onChange={setAccountSortMode}
            />
          </div>

          {accountSortMode === 'manual' ? (
            <div className="muted" style={{ marginTop: 10, fontSize: 12, fontWeight: 700 }}>
              手动模式：可在列表右上角“…”菜单中调整顺序
            </div>
          ) : null}
        </div>
      </motion.div>

      <motion.div
        className="card"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.24 }}
      >
        <div className="cardInner">
          <div style={{ fontWeight: 950, fontSize: 16 }}>月度开始日</div>
          <div className="muted" style={{ marginTop: 4, fontSize: 13, fontWeight: 700 }}>
            用于按月聚合的统计口径（例如趋势页的 6月/1年）
          </div>

          <div style={{ marginTop: 16 }}>
            <label className="field">
              <div className="fieldLabel">每月从哪一天开始</div>
              <select
                className="select"
                value={String(monthStartDay)}
                onChange={(e) => setMonthStartDayRaw(Number(e.target.value))}
              >
                {Array.from({ length: MAX_MONTH_START_DAY - MIN_MONTH_START_DAY + 1 }, (_, idx) => {
                  const d = MIN_MONTH_START_DAY + idx
                  return (
                    <option key={d} value={String(d)}>
                      {d}号
                    </option>
                  )
                })}
              </select>
            </label>
          </div>
        </div>
      </motion.div>

      <motion.div
        className="card"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
      >
        <div className="cardInner">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Cloud size={18} />
            <div style={{ fontWeight: 950, fontSize: 16 }}>云同步</div>
          </div>
          <div className="muted" style={{ marginTop: 4, fontSize: 13, fontWeight: 700 }}>
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
              <motion.span animate={{ rotate: cloudConfigExpanded ? 180 : 0 }} transition={quickFade}>
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
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.22, ease: standardEase }}
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
                  <span className="badge" style={{ fontWeight: 800 }}>
                    自动备份
                  </span>
                ) : null}
                {cloudSync.telemetryEnabled ? (
                  <span className="badge" style={{ fontWeight: 800 }}>
                    日志遥测
                  </span>
                ) : null}
              </div>
            ) : null}

            {cloudConfigExpanded ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 10 }}>
                <button type="button" className="primaryBtn" disabled={busy || !cloudReady} onClick={testCloud}>
                  <RefreshCw size={16} />
                  <span>测试连接</span>
                </button>
                <button type="button" className="primaryBtn" disabled={busy || !cloudReady} onClick={registerCloud}>
                  <span>创建账号</span>
                </button>
              </div>
            ) : null}

            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 10 }}>
              <button type="button" className="assetItem" disabled={busy || !cloudReady} onClick={() => void uploadCloud()}>
                <div>
                  <div className="assetName">上传</div>
                  <div className="assetSub">覆盖云端备份</div>
                </div>
                <UploadCloud size={18} />
              </button>
              <button type="button" className="assetItem" disabled={busy || !cloudReady} onClick={restoreCloud}>
                <div>
                  <div className="assetName">恢复</div>
                  <div className="assetSub">覆盖本机数据</div>
                </div>
                <DownloadCloud size={18} />
              </button>
            </div>

            <div className="muted" style={{ fontSize: 12, fontWeight: 800 }}>
              {cloudSync.lastBackupAt ? `最近上传：${cloudSync.lastBackupAt}` : '尚未上传云端备份'}
            </div>
            {cloudSync.lastSyncAt ? (
              <div
                className="muted"
                style={{
                  fontSize: 12,
                  fontWeight: 800,
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

      <motion.div
        className="card"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.34 }}
      >
        <div className="cardInner">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Bot size={18} />
            <div style={{ fontWeight: 950, fontSize: 16 }}>AI 接口</div>
          </div>
          <div className="muted" style={{ marginTop: 4, fontSize: 13, fontWeight: 700 }}>
            AI 对话端口由云端后台统一配置，前端只保存是否启用代理。
          </div>

          <div className="stack" style={{ marginTop: 16 }}>
            <div className="assetItem" style={{ background: 'var(--bg)', border: 'none', padding: 14 }}>
              <div>
                <div className="assetName">使用云端 AI 代理</div>
                <div className="assetSub" style={{ marginTop: 4 }}>
                  需要先连接云同步账号，AI 服务参数在 Docker Compose 后台配置
                </div>
              </div>
              <Toggle checked={cloudSync.useCloudAi} disabled={busy} onChange={(useCloudAi) => updateCloudSync({ useCloudAi })} />
            </div>

            <button
              type="button"
              className="assetItem"
              disabled={busy || !cloudReady}
              onClick={checkCloudAiStatus}
            >
              <div>
                <div className="assetName">检查云端 AI</div>
                <div className="assetSub">读取后台统一配置的可用状态</div>
              </div>
              <Activity size={18} />
            </button>

            {cloudAiStatus ? (
              <div className="muted" style={{ fontSize: 12, fontWeight: 800 }}>
                {cloudAiStatus}
              </div>
            ) : null}
          </div>
        </div>
      </motion.div>

      <motion.div
        className="card"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.38 }}
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
