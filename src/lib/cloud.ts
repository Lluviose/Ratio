import { coerceRatioBackup, type RatioBackupFile } from './backup'
import { dispatchStorageWrite } from './storageEvents'

export const CLOUD_SYNC_SETTINGS_KEY = 'ratio.cloudSync' as const

export type CloudSyncSettings = {
  serverUrl: string
  username: string
  password: string
  autoSync: boolean
  telemetryEnabled: boolean
  useCloudAi: boolean
  registrationInvite: string
  lastConnectionAt?: string
  lastBackupAt?: string
  lastRestoreAt?: string
  lastSyncAt?: string
  lastSyncStatus?: 'ok' | 'error' | 'conflict'
  lastSyncMessage?: string
}

export type CloudBackupMeta = {
  updatedAt: string
  clientCreatedAt: string
  itemCount: number
  device: string
}

export type CloudAiStatus = {
  configured: boolean
  model?: string
  reasoningEffort?: string
  apiKeyMasked?: string
  hasApiKey?: boolean
  issue: string | null
}

export class CloudRequestError extends Error {
  status: number
  code: string
  details: Record<string, unknown>

  constructor(args: { status: number; code: string; message: string; details?: Record<string, unknown> }) {
    super(args.message)
    this.name = 'CloudRequestError'
    this.status = args.status
    this.code = args.code
    this.details = args.details ?? {}
  }
}

type CloudRequestOptions = {
  signal?: AbortSignal
}

export const DEFAULT_CLOUD_SYNC_SETTINGS: CloudSyncSettings = {
  serverUrl: 'http://localhost:8787',
  username: '',
  password: '',
  autoSync: false,
  telemetryEnabled: false,
  useCloudAi: false,
  registrationInvite: '',
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function asString(value: unknown, fallback = '') {
  return typeof value === 'string' ? value : fallback
}

const runtimeCloudSecrets = {
  password: '',
  registrationInvite: '',
}

function omitCloudSecrets<T extends { password?: unknown; registrationInvite?: unknown }>(
  value: T,
): Omit<T, 'password' | 'registrationInvite'> {
  const persisted = { ...value }
  delete persisted.password
  delete persisted.registrationInvite
  return persisted
}

function stripPersistedSecrets(value: Record<string, unknown>, storage: Storage) {
  if (!('password' in value) && !('registrationInvite' in value)) return
  try {
    const rest = omitCloudSecrets(value)
    const raw = JSON.stringify(rest)
    storage.setItem(CLOUD_SYNC_SETTINGS_KEY, raw)
    if (typeof localStorage !== 'undefined' && storage === localStorage) {
      dispatchStorageWrite(CLOUD_SYNC_SETTINGS_KEY, raw)
    }
  } catch {
    // Best effort cleanup for older settings written before secrets were session-only.
  }
}

export function coerceCloudSyncSettings(value: unknown): CloudSyncSettings {
  if (!isRecord(value)) return { ...DEFAULT_CLOUD_SYNC_SETTINGS, ...runtimeCloudSecrets }
  const migratedSecret = {
    password: runtimeCloudSecrets.password || asString(value.password),
    registrationInvite: runtimeCloudSecrets.registrationInvite || asString(value.registrationInvite),
  }
  runtimeCloudSecrets.password = migratedSecret.password
  runtimeCloudSecrets.registrationInvite = migratedSecret.registrationInvite
  return {
    serverUrl: asString(value.serverUrl, DEFAULT_CLOUD_SYNC_SETTINGS.serverUrl),
    username: asString(value.username),
    password: migratedSecret.password,
    autoSync: value.autoSync === true,
    telemetryEnabled: value.telemetryEnabled === true,
    useCloudAi: value.useCloudAi === true,
    registrationInvite: migratedSecret.registrationInvite,
    lastConnectionAt: typeof value.lastConnectionAt === 'string' ? value.lastConnectionAt : undefined,
    lastBackupAt: typeof value.lastBackupAt === 'string' ? value.lastBackupAt : undefined,
    lastRestoreAt: typeof value.lastRestoreAt === 'string' ? value.lastRestoreAt : undefined,
    lastSyncAt: typeof value.lastSyncAt === 'string' ? value.lastSyncAt : undefined,
    lastSyncStatus:
      value.lastSyncStatus === 'ok' || value.lastSyncStatus === 'error' || value.lastSyncStatus === 'conflict'
        ? value.lastSyncStatus
        : undefined,
    lastSyncMessage: typeof value.lastSyncMessage === 'string' ? value.lastSyncMessage : undefined,
  }
}

export function getCloudSyncSettings(storage: Storage = localStorage): CloudSyncSettings {
  try {
    const raw = storage.getItem(CLOUD_SYNC_SETTINGS_KEY)
    if (!raw) return { ...DEFAULT_CLOUD_SYNC_SETTINGS, ...runtimeCloudSecrets }
    const parsed = JSON.parse(raw) as unknown
    if (isRecord(parsed)) stripPersistedSecrets(parsed, storage)
    return coerceCloudSyncSettings(parsed)
  } catch {
    return { ...DEFAULT_CLOUD_SYNC_SETTINGS, ...runtimeCloudSecrets }
  }
}

export function writeCloudSyncSettingsPatch(patch: Partial<CloudSyncSettings>, storage: Storage = localStorage) {
  const current = getCloudSyncSettings(storage)
  if (patch.password !== undefined) runtimeCloudSecrets.password = patch.password
  if (patch.registrationInvite !== undefined) runtimeCloudSecrets.registrationInvite = patch.registrationInvite
  const persisted = omitCloudSecrets({ ...current, ...patch })
  const raw = JSON.stringify(persisted)
  storage.setItem(CLOUD_SYNC_SETTINGS_KEY, raw)
  if (typeof localStorage !== 'undefined' && storage === localStorage) {
    dispatchStorageWrite(CLOUD_SYNC_SETTINGS_KEY, raw)
  }
}

export function serializeCloudSyncSettings(settings: CloudSyncSettings) {
  return omitCloudSecrets(settings)
}

export function hasCloudCredentials(settings: CloudSyncSettings) {
  return Boolean(settings.serverUrl.trim() && settings.username.trim() && settings.password)
}

export function mergeCloudSyncSettings(current: CloudSyncSettings, patch: Partial<CloudSyncSettings>): CloudSyncSettings {
  const next = { ...current, ...patch }
  const serverChanged = patch.serverUrl !== undefined && patch.serverUrl !== current.serverUrl
  const usernameChanged = patch.username !== undefined && patch.username !== current.username
  const passwordChanged = patch.password !== undefined && patch.password !== current.password

  if (serverChanged || usernameChanged) {
    return {
      ...next,
      lastConnectionAt: undefined,
      lastBackupAt: undefined,
      lastRestoreAt: undefined,
      lastSyncAt: undefined,
      lastSyncStatus: undefined,
      lastSyncMessage: undefined,
    }
  }

  if (passwordChanged) {
    return {
      ...next,
      lastConnectionAt: undefined,
      lastSyncAt: undefined,
      lastSyncStatus: undefined,
      lastSyncMessage: undefined,
    }
  }

  return next
}

function normalizeServerUrl(serverUrl: string) {
  const trimmed = serverUrl.trim().replace(/\/+$/, '')
  if (!trimmed) throw new Error('Cloud server URL is required')
  return trimmed
}

function cloudUrl(settings: CloudSyncSettings, apiPath: string) {
  return `${normalizeServerUrl(settings.serverUrl)}${apiPath.startsWith('/') ? apiPath : `/${apiPath}`}`
}

export function getCloudEndpointIssue(settings: Pick<CloudSyncSettings, 'serverUrl'>): string | null {
  if (typeof window === 'undefined') return null

  let serverUrl: URL
  try {
    serverUrl = new URL(normalizeServerUrl(settings.serverUrl))
  } catch {
    return 'Cloud server URL is invalid'
  }

  if (window.location.protocol === 'https:' && serverUrl.protocol === 'http:') {
    return 'Current page uses HTTPS, so the cloud server must also use HTTPS'
  }

  return null
}

function basicAuth(username: string, password: string) {
  const text = `${username}:${password}`
  const bytes = new TextEncoder().encode(text)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return `Basic ${btoa(binary)}`
}

async function readError(res: Response) {
  try {
    const json = (await res.json()) as unknown
    if (isRecord(json)) {
      const error = json.error
      if (isRecord(error) && typeof error.message === 'string') {
        const { code, message, ...details } = error
        return new CloudRequestError({
          status: res.status,
          code: typeof code === 'string' ? code : 'error',
          message,
          details,
        })
      }
    }
  } catch {
    // fall through
  }
  return new CloudRequestError({
    status: res.status,
    code: 'http_error',
    message: `${res.status} ${res.statusText}`,
  })
}

export async function cloudRequest<T>(
  settings: CloudSyncSettings,
  apiPath: string,
  init: RequestInit = {},
): Promise<T> {
  if (!hasCloudCredentials(settings)) throw new Error('Cloud account is not configured')
  const endpointIssue = getCloudEndpointIssue(settings)
  if (endpointIssue) throw new Error(endpointIssue)

  const headers = new Headers(init.headers)
  headers.set('Authorization', basicAuth(settings.username.trim(), settings.password))
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')

  const res = await fetch(cloudUrl(settings, apiPath), {
    ...init,
    headers,
  })
  if (!res.ok) throw await readError(res)
  return (await res.json()) as T
}

export async function createCloudUser(settings: CloudSyncSettings, options: CloudRequestOptions = {}) {
  const endpointIssue = getCloudEndpointIssue(settings)
  if (endpointIssue) throw new Error(endpointIssue)

  const res = await fetch(cloudUrl(settings, '/api/users'), {
    method: 'POST',
    signal: options.signal,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: settings.username.trim(),
      password: settings.password,
      inviteCode: settings.registrationInvite.trim(),
    }),
  })
  if (!res.ok) throw await readError(res)
  return (await res.json()) as { user: { username: string; createdAt: string } }
}

export function fetchCloudMe(settings: CloudSyncSettings, options: CloudRequestOptions = {}) {
  return cloudRequest<{ user: { username: string; createdAt: string } }>(settings, '/api/me', {
    signal: options.signal,
  })
}

export function uploadCloudBackup(
  settings: CloudSyncSettings,
  backup: RatioBackupFile,
  options: { expectedUpdatedAt?: string; force?: boolean; signal?: AbortSignal } = {},
) {
  return cloudRequest<CloudBackupMeta>(settings, '/api/backup', {
    method: 'PUT',
    signal: options.signal,
    body: JSON.stringify({
      backup,
      expectedUpdatedAt: options.expectedUpdatedAt ?? '',
      force: options.force === true,
      device: typeof navigator === 'undefined' ? 'unknown' : navigator.userAgent.slice(0, 120),
    }),
  })
}

export async function fetchCloudBackupMeta(settings: CloudSyncSettings, options: CloudRequestOptions = {}) {
  try {
    return await cloudRequest<{ meta: CloudBackupMeta | null }>(settings, '/api/backup/meta', {
      signal: options.signal,
    })
  } catch (error) {
    if (error instanceof CloudRequestError && error.status === 404) {
      const res = await cloudRequest<{ meta: CloudBackupMeta | null }>(settings, '/api/backup', {
        signal: options.signal,
      })
      return { meta: res.meta }
    }
    throw error
  }
}

export async function downloadCloudBackup(settings: CloudSyncSettings, options: CloudRequestOptions = {}) {
  const res = await cloudRequest<{ backup: unknown; meta: CloudBackupMeta | null }>(settings, '/api/backup', {
    signal: options.signal,
  })
  return {
    backup: res.backup ? coerceRatioBackup(res.backup) : null,
    meta: res.meta,
  }
}

export function fetchCloudAiStatus(settings: CloudSyncSettings, options: CloudRequestOptions = {}) {
  return cloudRequest<{ ai: CloudAiStatus }>(settings, '/api/ai/status', {
    signal: options.signal,
  })
}

export function fetchCloudAiChat(settings: CloudSyncSettings, body: { messages: unknown[]; signal?: AbortSignal }) {
  return cloudRequest<unknown>(settings, '/api/ai/chat', {
    method: 'POST',
    signal: body.signal,
    body: JSON.stringify({ messages: body.messages }),
  })
}

export function sendCloudTelemetry(settings: CloudSyncSettings, events: unknown[], options: CloudRequestOptions = {}) {
  return cloudRequest<{ accepted: number }>(settings, '/api/telemetry', {
    method: 'POST',
    signal: options.signal,
    body: JSON.stringify({ events }),
  })
}
