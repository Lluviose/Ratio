import { useCallback, useEffect, useRef, useState } from 'react'
import { buildRatioBackup, parseRatioBackup, restoreRatioBackup, stringifyRatioBackup, type RestoreResult } from './backup'
import { createWebDavClient, ensureWebDavParentDirs, webdavGetText, webdavPutText } from './webdav'

export type WebDavBackupConfig = {
  enabled: boolean
  baseUrl: string
  username: string
  password: string
  path: string
}

export type WebDavBackupStatus = {
  inFlight: boolean
  lastBackupAt: string | null
  lastError: string | null
}

function errorMessage(error: unknown) {
  if (error instanceof Error) {
    const msg = error.message || '未知错误'
    if (msg === 'Failed to fetch') return '请求失败（可能是网络问题或浏览器跨域/CORS 限制）'
    return msg
  }
  return '未知错误'
}

function validateConfig(config: WebDavBackupConfig) {
  const path = config.path.trim()
  if (!path) throw new Error('备份路径不能为空')

  const client = createWebDavClient({
    baseUrl: config.baseUrl,
    username: config.username,
    password: config.password,
  })

  return { client, path }
}

type StorageWriteDetail = { key: string }

export function useWebDavBackup(config: WebDavBackupConfig) {
  const latestConfigRef = useRef(config)
  useEffect(() => {
    latestConfigRef.current = config
  }, [config])

  const [status, setStatus] = useState<WebDavBackupStatus>({
    inFlight: false,
    lastBackupAt: null,
    lastError: null,
  })

  const inFlightRef = useRef(false)
  const pendingRef = useRef(false)
  const timerIdRef = useRef<number | null>(null)

  const clearTimer = useCallback(() => {
    if (timerIdRef.current == null) return
    window.clearTimeout(timerIdRef.current)
    timerIdRef.current = null
  }, [])

  const runBackup = useCallback(async () => {
    const cfg = latestConfigRef.current
    if (!cfg.enabled) return

    if (inFlightRef.current) {
      pendingRef.current = true
      return
    }

    inFlightRef.current = true
    setStatus((prev) => ({ ...prev, inFlight: true, lastError: null }))

    try {
      const { client, path } = validateConfig(cfg)
      const backup = buildRatioBackup()
      const text = stringifyRatioBackup(backup)

      await ensureWebDavParentDirs(client, path)
      await webdavPutText(client, path, text)

      setStatus((prev) => ({ ...prev, lastBackupAt: new Date().toISOString(), lastError: null }))
    } catch (err) {
      setStatus((prev) => ({ ...prev, lastError: errorMessage(err) }))
    } finally {
      inFlightRef.current = false
      setStatus((prev) => ({ ...prev, inFlight: false }))

      if (pendingRef.current) {
        pendingRef.current = false
        clearTimer()
        timerIdRef.current = window.setTimeout(() => {
          timerIdRef.current = null
          void runBackup()
        }, 500)
      }
    }
  }, [clearTimer])

  const queueBackup = useCallback(
    (delayMs: number = 1500) => {
      const cfg = latestConfigRef.current
      if (!cfg.enabled) return

      pendingRef.current = true
      clearTimer()
      timerIdRef.current = window.setTimeout(() => {
        timerIdRef.current = null
        if (!pendingRef.current) return
        pendingRef.current = false
        void runBackup()
      }, delayMs)
    },
    [clearTimer, runBackup],
  )

  const backupNow = useCallback(async () => {
    clearTimer()
    pendingRef.current = false
    await runBackup()
  }, [clearTimer, runBackup])

  const restoreFromCloud = useCallback(async (): Promise<RestoreResult> => {
    const cfg = latestConfigRef.current
    if (!cfg.enabled) throw new Error('未开启坚果云备份')

    if (inFlightRef.current) throw new Error('正在进行备份/恢复，请稍后再试')
    inFlightRef.current = true
    setStatus((prev) => ({ ...prev, inFlight: true, lastError: null }))

    try {
      const { client, path } = validateConfig(cfg)
      const text = await webdavGetText(client, path)
      const backup = parseRatioBackup(text)
      return restoreRatioBackup(backup)
    } catch (err) {
      setStatus((prev) => ({ ...prev, lastError: errorMessage(err) }))
      throw err
    } finally {
      inFlightRef.current = false
      setStatus((prev) => ({ ...prev, inFlight: false }))
    }
  }, [])

  useEffect(() => {
    if (!config.enabled) return

    const onWrite = (evt: Event) => {
      const ce = evt as CustomEvent<StorageWriteDetail>
      const key = ce.detail?.key
      if (typeof key !== 'string') return
      if (!key.startsWith('ratio.')) return
      if (key.startsWith('ratio.webdav.')) return
      queueBackup()
    }

    window.addEventListener('ratio:storage-write', onWrite as EventListener)
    return () => window.removeEventListener('ratio:storage-write', onWrite as EventListener)
  }, [config.enabled, queueBackup])

  useEffect(() => () => clearTimer(), [clearTimer])

  return { status, backupNow, restoreFromCloud, queueBackup }
}
