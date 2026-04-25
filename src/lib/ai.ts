import { fetchCloudAiChat, getCloudSyncSettings, hasCloudCredentials } from './cloud'

export type AiChatMessage = {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export type AiFinancialContextV1 = {
  schema: 'ratio.ai.financial-context.v1'
  generatedAt: string
  data: {
    accounts: unknown
    ledger: unknown
    snapshots: unknown
    accountOps: unknown
  }
}

export function getAiEndpointIssue(): string | null {
  if (typeof window === 'undefined') return null

  const cloudSettings = getCloudSyncSettings()
  if (!cloudSettings.useCloudAi) return '请先在设置中启用云端 AI 代理'
  if (!hasCloudCredentials(cloudSettings)) return '云端 AI 已启用，但云同步账号未配置'

  let serverUrl: URL
  try {
    serverUrl = new URL(cloudSettings.serverUrl)
  } catch {
    return '云端服务器地址无效'
  }

  if (window.location.protocol === 'https:' && serverUrl.protocol === 'http:') {
    return '当前页面为 HTTPS，浏览器会拦截 HTTP 云端 AI 代理请求'
  }

  return null
}

export function getAiTransportLabel() {
  const cloudSettings = getCloudSyncSettings()
  if (cloudSettings.useCloudAi && hasCloudCredentials(cloudSettings)) return `云端代理：${cloudSettings.serverUrl}`
  return '云端 AI 未启用'
}

function safeJsonParse(raw: string | null): unknown {
  if (raw == null) return null
  try {
    return JSON.parse(raw) as unknown
  } catch {
    return raw
  }
}

export function buildAiFinancialContext(storage: Storage = localStorage): AiFinancialContextV1 {
  return {
    schema: 'ratio.ai.financial-context.v1',
    generatedAt: new Date().toISOString(),
    data: {
      accounts: safeJsonParse(storage.getItem('ratio.accounts')),
      ledger: safeJsonParse(storage.getItem('ratio.ledger')),
      snapshots: safeJsonParse(storage.getItem('ratio.snapshots')),
      accountOps: safeJsonParse(storage.getItem('ratio.accountOps')),
    },
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readResponseContent(value: unknown): string | undefined {
  if (!isRecord(value)) return undefined

  const choices = value.choices
  if (Array.isArray(choices) && choices.length > 0) {
    const first = choices[0]
    if (isRecord(first)) {
      const message = first.message
      if (isRecord(message) && typeof message.content === 'string') return message.content
      if (typeof first.text === 'string') return first.text
    }
  }

  if (typeof value.output_text === 'string') return value.output_text
  return undefined
}

export async function fetchAiChatCompletion(args: { messages: AiChatMessage[]; signal?: AbortSignal }) {
  const { messages, signal } = args

  const issue = getAiEndpointIssue()
  if (issue) throw new Error(issue)

  const cloudSettings = getCloudSyncSettings()
  const json = await fetchCloudAiChat(cloudSettings, { messages, signal })
  const content = readResponseContent(json)
  if (typeof content !== 'string' || content.trim().length === 0) throw new Error('Empty AI response')
  return content
}
