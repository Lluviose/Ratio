export const AI_BASE_URL = 'https://cliapi.shinonome.com.cn' as const
export const AI_API_KEY = 'caiwu' as const
export const AI_MODEL = 'gpt-5.2' as const
export const AI_REASONING_EFFORT = 'xhigh' as const

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

export function getAiEndpointIssue(baseUrl: string = AI_BASE_URL): string | null {
  if (typeof window === 'undefined') return null

  let aiUrl: URL
  try {
    aiUrl = new URL(baseUrl)
  } catch {
    return 'AI 端点地址无效'
  }

  if (window.location.protocol === 'https:' && aiUrl.protocol === 'http:') {
    return '当前页面为 HTTPS，浏览器会拦截 HTTP AI 接口请求'
  }

  return null
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

function tryReadText(res: Response) {
  try {
    return res.text()
  } catch {
    return Promise.resolve('')
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

  const url = new URL('/v1/chat/completions', AI_BASE_URL)
  const res = await fetch(url, {
    method: 'POST',
    signal,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${AI_API_KEY}`,
    },
    body: JSON.stringify({
      model: AI_MODEL,
      messages,
      reasoning_effort: AI_REASONING_EFFORT,
    }),
  })

  if (!res.ok) {
    const text = await tryReadText(res)
    const message = text ? `${res.status} ${res.statusText}: ${text}` : `${res.status} ${res.statusText}`
    throw new Error(message)
  }

  const json = (await res.json()) as unknown
  const content = readResponseContent(json)

  if (typeof content !== 'string' || content.trim().length === 0) throw new Error('Empty AI response')
  return content
}
