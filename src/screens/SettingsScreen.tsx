import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { queueToastAfterReload, useOverlay } from '../lib/overlay'
import {
  buildRatioBackup,
  parseRatioBackup,
  restoreRatioBackup,
  stringifyRatioBackup,
  summarizeRatioBackupContent,
  type RatioBackupContentSummary,
} from '../lib/backup'
import {
  listLocalBackups,
  restoreLocalBackup,
  writePreOperationLocalBackup,
  type LocalBackupEntry,
} from '../lib/localBackups'
import {
  CLOUD_SYNC_SETTINGS_KEY,
  DEFAULT_CLOUD_SYNC_SETTINGS,
  coerceCloudSyncSettings,
  mergeCloudSyncSettings,
  writeCloudSyncSettingsPatch,
} from '../lib/cloud'
import { cancelPendingCloudAutoSync, markCloudSyncClean } from '../lib/cloudSync'
import { ACCOUNT_SORT_MODE_KEY, type AccountSortMode } from '../lib/accountSort'
import { COLOR_MODE_KEY, coerceColorMode, type ColorMode } from '../lib/colorMode'
import { enterDemoMode, exitDemoMode } from '../lib/demoData'
import { isDemoModeActive } from '../lib/demoMode'
import { storageKernel } from '../lib/storageKernel'
import { clampMonthStartDay, DEFAULT_MONTH_START_DAY, MONTH_START_DAY_KEY } from '../lib/monthStart'
import type { ThemeId, ThemeOption } from '../lib/themes'
import { useLocalStorageState } from '../lib/useLocalStorageState'
import { standardEase } from '../lib/motionPresets'
import { AppearanceCard } from './settings/AppearanceCard'
import { DemoCard } from './settings/DemoCard'
import { ThemeCard, type ThemeChangeOrigin } from './settings/ThemeCard'
import { AccountSortCard } from './settings/AccountSortCard'
import { MonthStartCard } from './settings/MonthStartCard'
import { CloudSyncCard } from './settings/CloudSyncCard'
import { CloudAiCard } from './settings/CloudAiCard'
import { BackupCard } from './settings/BackupCard'
import { LocalSnapshotsCard } from './settings/LocalSnapshotsCard'
import { formatSnapshotTime, kindLabel } from './settings/localSnapshotFormat'
import { useCloudSyncActions } from './settings/useCloudSyncActions'

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
  const [colorMode, setColorMode] = useLocalStorageState<ColorMode>(COLOR_MODE_KEY, 'system', {
    coerce: coerceColorMode,
  })
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
  const { toast, confirm } = useOverlay()
  // 演示模式进出都会整页刷新，读一次即可
  const [demoActive] = useState(() => isDemoModeActive())
  // 本机滚动快照列表：恢复/导入路径都会整页刷新，同样读一次即可
  const [localSnapshots] = useState<LocalBackupEntry[]>(() => listLocalBackups())

  const { busy, setBusy, registerCloud, testCloud, uploadCloud, restoreCloud, checkCloudAiStatus } =
    useCloudSyncActions({ cloudSyncRef, demoActive, setCloudAiStatus, setCloudConfigExpanded })

  useEffect(() => {
    cloudSyncRef.current = cloudSync
  }, [cloudSync])

  useEffect(() => {
    if (monthStartDayRaw !== monthStartDay) setMonthStartDayRaw(monthStartDay)
  }, [monthStartDay, monthStartDayRaw, setMonthStartDayRaw])

  const handleEnterDemo = async () => {
    const ok = await confirm({
      title: '进入演示模式',
      message: '将展示一套带 18 个月历史的示例账本；你现有的数据会安全暂存，退出演示后自动恢复。',
      confirmText: '进入演示',
      cancelText: '取消',
    })
    if (!ok) return

    setBusy(true)
    try {
      enterDemoMode()
      if (!(await storageKernel.flush())) {
        // 落盘失败：回滚内存态，避免「界面已演示、磁盘还是真实数据」的分裂；
        // 失败批次与回滚写入都留在队列里按先后序自动重试
        try {
          exitDemoMode()
        } catch {
          // 回滚失败保持现状，用户可从设置手动退出
        }
        toast('数据未能写入本机存储，已取消进入演示，请稍后重试', { tone: 'danger' })
        setBusy(false)
        return
      }
      queueToastAfterReload('已进入演示模式', { tone: 'success' })
      window.location.reload()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Enter demo failed'
      toast(msg, { tone: 'danger' })
      setBusy(false)
    }
  }

  const handleExitDemo = async () => {
    const ok = await confirm({
      title: '退出演示',
      message: '将清除演示数据，并恢复你进入演示前的全部数据。',
      confirmText: '退出并恢复',
      cancelText: '取消',
    })
    if (!ok) return

    setBusy(true)
    try {
      exitDemoMode()
      if (!(await storageKernel.flush())) {
        // 内存已是真实数据（安全侧）；失败批次会随后续 flush 自动重试
        toast('数据未能完全写入本机存储，已取消刷新；稍后会自动重试', { tone: 'danger' })
        setBusy(false)
        return
      }
      queueToastAfterReload('已恢复你的数据', { tone: 'success' })
      window.location.reload()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Exit demo failed'
      toast(msg, { tone: 'danger' })
      setBusy(false)
    }
  }

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
    if (demoActive) {
      toast('演示模式下不可导入备份，请先退出演示', { tone: 'danger' })
      return
    }

    // 先解析并预检内容，确认弹窗展示计数：coerce 只校验文件结构，
    // 「合法 JSON 但内容退化」的备份此前会静默恢复成空账本
    let backup: ReturnType<typeof parseRatioBackup>
    let summary: RatioBackupContentSummary
    try {
      backup = parseRatioBackup(await file.text())
      summary = summarizeRatioBackupContent(backup)
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Import failed', { tone: 'danger' })
      return
    }

    const contentLine = `账户 ${summary.accountCount ?? '?'} · 快照 ${summary.snapshotCount ?? '?'} · 操作记录 ${summary.opCount ?? '?'}`
    const message = summary.looksEmpty
      ? `该备份看起来是空的（${contentLine}），继续导入会清空当前设备上的数据！`
      : summary.corruptKeys.length > 0
        ? `备份中 ${summary.corruptKeys.join('、')} 无法解析，可能已损坏。继续导入会覆盖当前设备上的所有数据。`
        : `该备份包含：${contentLine}。导入会覆盖当前设备上的所有数据，是否继续？`
    const ok = await confirm({
      title: '导入备份',
      message,
      confirmText: '继续导入',
      cancelText: '取消',
      tone: 'danger',
    })
    if (!ok) return

    setBusy(true)
    try {
      // 覆盖前抢一代本机快照：导入了错误/损坏的备份仍可回退
      writePreOperationLocalBackup()
      const res = restoreRatioBackup(backup)
      cancelPendingCloudAutoSync()
      markCloudSyncClean()
      if (cloudSyncRef.current.autoSync) {
        writeCloudSyncSettingsPatch({
          lastBackupAt: undefined,
          lastSyncAt: new Date().toISOString(),
          lastSyncStatus: 'conflict',
          lastSyncMessage: 'Imported a local backup; confirm before uploading to cloud',
        })
      }
      if (!(await storageKernel.flush())) {
        toast('数据未能写入本机存储，已取消刷新；可稍后重试或从本机快照恢复', { tone: 'danger' })
        return
      }
      queueToastAfterReload(`已恢复 ${res.restoredKeys.length} 项数据`, { tone: 'success' })
      window.location.reload()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Import failed'
      toast(msg, { tone: 'danger' })
    } finally {
      setBusy(false)
    }
  }

  const restoreLocalSnapshot = async (entry: LocalBackupEntry) => {
    if (demoActive) {
      toast('演示模式下不可恢复本机快照，请先退出演示', { tone: 'danger' })
      return
    }
    const ok = await confirm({
      title: '恢复本机快照',
      message: `将把数据恢复到「${formatSnapshotTime(entry.createdAt)} · ${kindLabel(entry.kind)}」的状态；当前数据会先另存一代快照。`,
      confirmText: '恢复',
      cancelText: '取消',
      tone: 'danger',
    })
    if (!ok) return

    setBusy(true)
    try {
      writePreOperationLocalBackup()
      const res = restoreLocalBackup(entry.key)
      cancelPendingCloudAutoSync()
      markCloudSyncClean()
      if (cloudSyncRef.current.autoSync) {
        writeCloudSyncSettingsPatch({
          lastBackupAt: undefined,
          lastSyncAt: new Date().toISOString(),
          lastSyncStatus: 'conflict',
          lastSyncMessage: 'Restored a local snapshot; confirm before uploading to cloud',
        })
      }
      if (!(await storageKernel.flush())) {
        toast('数据未能写入本机存储，已取消刷新', { tone: 'danger' })
        return
      }
      queueToastAfterReload(`已恢复 ${res.restoredKeys.length} 项数据`, { tone: 'success' })
      window.location.reload()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Restore failed', { tone: 'danger' })
    } finally {
      setBusy(false)
    }
  }

  const updateCloudSync = (patch: Partial<typeof cloudSync>) => {
    const identityChanged =
      (patch.serverUrl !== undefined && patch.serverUrl !== cloudSync.serverUrl) ||
      (patch.username !== undefined && patch.username !== cloudSync.username)
    const credentialsChanged = patch.password !== undefined && patch.password !== cloudSync.password

    if (identityChanged || credentialsChanged) {
      setCloudAiStatus('')
      setCloudConfigExpanded(true)
    }
    setCloudSync((current) => mergeCloudSyncSettings(current, patch))
  }

  const cloudReady = Boolean(cloudSync.serverUrl.trim() && cloudSync.username.trim() && cloudSync.password)

  return (
    <motion.div
      className="stack contentWithNavEndPadding"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: standardEase }}
    >
      <AppearanceCard colorMode={colorMode} onChange={setColorMode} />

      <DemoCard demoActive={demoActive} busy={busy} onEnterDemo={handleEnterDemo} onExitDemo={handleExitDemo} />

      <ThemeCard themeOptions={themeOptions} theme={theme} activeThemeColor={activeThemeColor} onThemeChange={onThemeChange} />

      <AccountSortCard accountSortMode={accountSortMode} onChange={setAccountSortMode} />

      <MonthStartCard monthStartDay={monthStartDay} onChange={setMonthStartDayRaw} />

      <CloudSyncCard
        cloudSync={cloudSync}
        cloudReady={cloudReady}
        cloudConfigExpanded={cloudConfigExpanded}
        setCloudConfigExpanded={setCloudConfigExpanded}
        busy={busy}
        updateCloudSync={updateCloudSync}
        onTest={testCloud}
        onRegister={registerCloud}
        onUpload={() => uploadCloud()}
        onRestore={restoreCloud}
      />

      <CloudAiCard
        cloudSync={cloudSync}
        cloudReady={cloudReady}
        busy={busy}
        cloudAiStatus={cloudAiStatus}
        updateCloudSync={updateCloudSync}
        onCheckStatus={checkCloudAiStatus}
      />

      <BackupCard busy={busy} onExport={exportBackup} onImportClick={() => fileInputRef.current?.click()} />

      <LocalSnapshotsCard localSnapshots={localSnapshots} busy={busy} onRestore={restoreLocalSnapshot} />

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
