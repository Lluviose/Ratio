import { useCallback, useEffect, useRef, useState } from 'react'
import { buildRatioBackup, coerceRatioBackup, restoreRatioBackup, type RestoreResult } from './backup'

export type AccountBackupConfig = {
  enabled: boolean
  apiBaseUrl: string
  token: string
}

export type AccountBackupStatus = {
  inFlight: boolean
  lastBackupAt: string | null
  lastError: string | null
}

function normalizeApiBaseUrl(input: string) {
  const trimmed = input.trim()
  if (!trimmed) throw new Error('账号服务地址不能为空')
  const url = new URL(trimmed)
  const href = url.toString()
  return href.endsWith('/') ? href : `${href}/`
}

function errorMessage(error: unknown) {
  if (error instanceof Error) {
    const msg = error.message || '未知错误'
    if (msg === 'Failed to fetch' || msg === 'Load failed' || msg.includes('NetworkError')) {
      return '请求失败（可能是网络问题或服务端跨域/CORS 未放行）'
    }
    return msg
  }
  return '未知错误'
}

function joinApi(baseUrl: string, path: string) {
  return new URL(path, baseUrl).toString()
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

async function readJson(res: Response) {
  try {
    return (await res.json()) as unknown
  } catch {
    return null
  }
}

async function apiRequest(baseUrl: string, path: string, init: RequestInit) {
  const url = joinApi(baseUrl, path)
  const res = await fetch(url, init)
  const data = await readJson(res)
  if (res.ok) return data

  const msg = isPlainObject(data) && typeof data.error === 'string' ? data.error : `${res.status} ${res.statusText}`.trim()
  throw new Error(msg || 'Request failed')
}

type StorageWriteDetail = { key: string }

export function useAccountBackup(config: AccountBackupConfig) {
  const latestConfigRef = useRef(config)
  useEffect(() => {
    latestConfigRef.current = config
  }, [config])

  const [status, setStatus] = useState<AccountBackupStatus>({
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
    if (!cfg.token) return

    if (inFlightRef.current) {
      pendingRef.current = true
      return
    }

    inFlightRef.current = true
    setStatus((prev) => ({ ...prev, inFlight: true, lastError: null }))

    try {
      const baseUrl = normalizeApiBaseUrl(cfg.apiBaseUrl)
      const backup = buildRatioBackup()

      await apiRequest(baseUrl, '/api/backup', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${cfg.token}`,
        },
        body: JSON.stringify(backup),
      })

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
      if (!cfg.token) return

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
    if (!cfg.enabled) throw new Error('未启用账号备份')
    if (!cfg.token) throw new Error('请先登录账号')
    if (inFlightRef.current) throw new Error('正在进行备份/恢复，请稍后再试')

    inFlightRef.current = true
    setStatus((prev) => ({ ...prev, inFlight: true, lastError: null }))
    try {
      const baseUrl = normalizeApiBaseUrl(cfg.apiBaseUrl)
      const data = await apiRequest(baseUrl, '/api/backup', {
        method: 'GET',
        headers: { Authorization: `Bearer ${cfg.token}` },
      })
      const backup = coerceRatioBackup(data)
      return restoreRatioBackup(backup)
    } catch (err) {
      setStatus((prev) => ({ ...prev, lastError: errorMessage(err) }))
      throw err
    } finally {
      inFlightRef.current = false
      setStatus((prev) => ({ ...prev, inFlight: false }))
    }
  }, [])

  const register = useCallback(async (email: string, password: string) => {
    if (inFlightRef.current) throw new Error('正在进行备份/恢复，请稍后再试')

    inFlightRef.current = true
    setStatus((prev) => ({ ...prev, inFlight: true, lastError: null }))
    try {
      const baseUrl = normalizeApiBaseUrl(latestConfigRef.current.apiBaseUrl)
      const data = await apiRequest(baseUrl, '/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      if (isPlainObject(data) && typeof data.token === 'string') return data.token
      throw new Error('注册失败')
    } catch (err) {
      setStatus((prev) => ({ ...prev, lastError: errorMessage(err) }))
      throw err
    } finally {
      inFlightRef.current = false
      setStatus((prev) => ({ ...prev, inFlight: false }))
    }
  }, [])

  const login = useCallback(async (email: string, password: string) => {
    if (inFlightRef.current) throw new Error('正在进行备份/恢复，请稍后再试')

    inFlightRef.current = true
    setStatus((prev) => ({ ...prev, inFlight: true, lastError: null }))
    try {
      const baseUrl = normalizeApiBaseUrl(latestConfigRef.current.apiBaseUrl)
      const data = await apiRequest(baseUrl, '/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      if (isPlainObject(data) && typeof data.token === 'string') return data.token
      throw new Error('登录失败')
    } catch (err) {
      setStatus((prev) => ({ ...prev, lastError: errorMessage(err) }))
      throw err
    } finally {
      inFlightRef.current = false
      setStatus((prev) => ({ ...prev, inFlight: false }))
    }
  }, [])

  const logout = useCallback(async () => {
    const cfg = latestConfigRef.current
    if (!cfg.token) return
    if (inFlightRef.current) return

    inFlightRef.current = true
    setStatus((prev) => ({ ...prev, inFlight: true, lastError: null }))
    try {
      const baseUrl = normalizeApiBaseUrl(cfg.apiBaseUrl)
      await apiRequest(baseUrl, '/api/logout', {
        method: 'POST',
        headers: { Authorization: `Bearer ${cfg.token}` },
      })
    } catch (err) {
      setStatus((prev) => ({ ...prev, lastError: errorMessage(err) }))
    } finally {
      inFlightRef.current = false
      setStatus((prev) => ({ ...prev, inFlight: false }))
    }
  }, [])

  useEffect(() => {
    if (!config.enabled) return
    if (!config.token) return

    const onWrite = (evt: Event) => {
      const ce = evt as CustomEvent<StorageWriteDetail>
      const key = ce.detail?.key
      if (typeof key !== 'string') return
      if (!key.startsWith('ratio.')) return
      if (key.startsWith('ratio.webdav.')) return
      if (key.startsWith('ratio.account.')) return
      queueBackup()
    }

    window.addEventListener('ratio:storage-write', onWrite as EventListener)
    return () => window.removeEventListener('ratio:storage-write', onWrite as EventListener)
  }, [config.enabled, config.token, queueBackup])

  useEffect(() => () => clearTimer(), [clearTimer])

  return { status, backupNow, restoreFromCloud, queueBackup, register, login, logout }
}
