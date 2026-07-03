import { AnimatePresence, motion } from 'framer-motion'
import { ArrowUp, Copy, RotateCcw, Sparkles, Square, Trash2, X } from 'lucide-react'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { buildAiSystemMessage, fetchAiChatCompletion, getAiEndpointIssue, getAiTransportLabel, type AiChatMessage } from '../lib/ai'
import { CLOUD_SYNC_SETTINGS_KEY, DEFAULT_CLOUD_SYNC_SETTINGS, coerceCloudSyncSettings } from '../lib/cloud'
import { useLocalStorageState } from '../lib/useLocalStorageState'

type UiMessage = {
  role: 'user' | 'assistant'
  content: string
}

const AI_CHAT_SESSION_KEY = 'ratio.ai.chat.session.v1'
const MAX_STORED_MESSAGES = 32
const MAX_API_HISTORY_MESSAGES = 16
const QUICK_PROMPTS = [
  '我的资产结构健康吗？',
  '近期净资产变化主要看哪里？',
  '负债和现金覆盖有什么风险？',
  '离储蓄目标还差什么？',
]

function ChatMarkdown(props: { children: string }) {
  return (
    <div className="aiMarkdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ children }) => <p className="my-2 first:mt-0 last:mb-0">{children}</p>,
          ul: ({ children }) => <ul className="my-2 pl-5 list-disc space-y-1">{children}</ul>,
          ol: ({ children }) => <ol className="my-2 pl-5 list-decimal space-y-1">{children}</ol>,
          li: ({ children }) => <li className="leading-relaxed">{children}</li>,
          a: ({ href, children }) =>
            href ? (
              <a
                href={href}
                target="_blank"
                rel="noreferrer"
                className="underline decoration-slate-300 hover:decoration-slate-400"
              >
                {children}
              </a>
            ) : (
              <span>{children}</span>
            ),
          blockquote: ({ children }) => (
            <blockquote className="my-2 pl-3 border-l-2 border-slate-300/80 text-slate-700">{children}</blockquote>
          ),
          h1: ({ children }) => <h1 className="my-2 text-[15px] font-extrabold">{children}</h1>,
          h2: ({ children }) => <h2 className="my-2 text-[14px] font-extrabold">{children}</h2>,
          h3: ({ children }) => <h3 className="my-2 text-[13px] font-extrabold">{children}</h3>,
          hr: () => <hr className="my-3 border-white/60" />,
          pre: ({ children }) => <pre className="aiMarkdownPre">{children}</pre>,
          code: ({ children, className }) => {
            const text = String(children).replace(/\n$/, '')
            const cls = className ? `aiMarkdownCode ${className}` : 'aiMarkdownCode'
            return <code className={cls}>{text}</code>
          },
          table: ({ children }) => (
            <div className="my-2 max-w-full overflow-auto rounded-[14px] border border-white/60 bg-white/60">
              <table className="min-w-full text-[12px]">{children}</table>
            </div>
          ),
          th: ({ children }) => (
            <th className="px-2 py-2 text-left font-extrabold text-slate-800 border-b border-white/60">{children}</th>
          ),
          td: ({ children }) => (
            <td className="px-2 py-2 align-top border-b border-white/50 text-slate-700">{children}</td>
          ),
        }}
      >
        {props.children}
      </ReactMarkdown>
    </div>
  )
}

function prettyError(err: unknown) {
  const raw = err instanceof Error ? err.message : typeof err === 'string' ? err : 'Unknown error'
  if (/load failed|failed to fetch|networkerror|cors/i.test(raw)) {
    return '无法连接到云端 AI 代理。请检查云端服务器地址、网络、CORS 或证书配置。'
  }
  return raw
}

function readSessionMessages(): UiMessage[] {
  if (typeof sessionStorage === 'undefined') return []
  try {
    const parsed = JSON.parse(sessionStorage.getItem(AI_CHAT_SESSION_KEY) || '[]') as unknown
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((item): item is UiMessage => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) return false
        const role = Reflect.get(item, 'role')
        const content = Reflect.get(item, 'content')
        return (role === 'user' || role === 'assistant') && typeof content === 'string'
      })
      .slice(-MAX_STORED_MESSAGES)
  } catch {
    return []
  }
}

function writeSessionMessages(messages: UiMessage[]) {
  if (typeof sessionStorage === 'undefined') return
  try {
    sessionStorage.setItem(AI_CHAT_SESSION_KEY, JSON.stringify(messages.slice(-MAX_STORED_MESSAGES)))
  } catch {
    // Session persistence must never block the assistant.
  }
}

function isAbortError(err: unknown) {
  return err instanceof DOMException && err.name === 'AbortError'
}

export function AiAssistant(props: { initialOpen?: boolean } = {}) {
  const { initialOpen = false } = props
  const [open, setOpen] = useState(() => initialOpen)
  const [isOnline, setIsOnline] = useState(() => navigator.onLine)
  const [acceptedServerUrl, setAcceptedServerUrl] = useLocalStorageState<string>('ratio.aiPrivacyAcceptedServerUrl', '')
  const [cloudSync] = useLocalStorageState(CLOUD_SYNC_SETTINGS_KEY, DEFAULT_CLOUD_SYNC_SETTINGS, {
    coerce: coerceCloudSyncSettings,
  })
  const [privacyOpen, setPrivacyOpen] = useState(false)
  const [messages, setMessages] = useState<UiMessage[]>(() => readSessionMessages())
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null)

  const transportIssue = getAiEndpointIssue()
  const aiTransportLabel = getAiTransportLabel()
  const currentServerUrl = cloudSync.serverUrl.trim()
  const privacyAccepted = Boolean(currentServerUrl && acceptedServerUrl === currentServerUrl)

  const inputRef = useRef<HTMLTextAreaElement | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const mountedRef = useRef(true)

  const scrollRef = useRef<HTMLDivElement | null>(null)
  const lastAssistantMessageRef = useRef<HTMLDivElement | null>(null)

  const canAsk = useMemo(() => {
    if (!open) return false
    if (privacyOpen) return false
    if (!privacyAccepted) return false
    if (sending) return false
    if (!isOnline) return false
    if (transportIssue) return false
    return true
  }, [isOnline, open, privacyAccepted, privacyOpen, sending, transportIssue])

  const canSend = canAsk && input.trim().length > 0

  const lastUserIndex = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      if (messages[i]?.role === 'user') return i
    }
    return -1
  }, [messages])
  const canRetry = canAsk && lastUserIndex >= 0

  useEffect(() => {
    writeSessionMessages(messages.filter((message) => message.content.trim().length > 0))
  }, [messages])

  useEffect(() => {
    const update = () => setIsOnline(navigator.onLine)
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    return () => {
      window.removeEventListener('online', update)
      window.removeEventListener('offline', update)
    }
  }, [])

  useEffect(() => {
    if (!open) return
    if (transportIssue) return
    if (!privacyAccepted) setPrivacyOpen(true)
  }, [open, privacyAccepted, transportIssue])

  useEffect(() => {
    return () => {
      mountedRef.current = false
      abortRef.current?.abort()
      abortRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!open) return
    if (privacyOpen) return
    if (!privacyAccepted) return
    const timer = window.setTimeout(() => inputRef.current?.focus(), 0)
    return () => window.clearTimeout(timer)
  }, [open, privacyAccepted, privacyOpen])

  useEffect(() => {
    if (!open) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open])

  useEffect(() => {
    if (open) return
    abortRef.current?.abort()
    abortRef.current = null
    setSending(false)
    setPrivacyOpen(false)
  }, [open])

  useLayoutEffect(() => {
    const container = scrollRef.current
    if (!container) return

    const last = messages[messages.length - 1]
    if (last?.role === 'assistant' && !sending) {
      const bubble = lastAssistantMessageRef.current
      if (bubble && bubble.scrollHeight > container.clientHeight) {
        bubble.scrollIntoView({ block: 'start' })
        return
      }
    }

    container.scrollTop = container.scrollHeight
  }, [messages, sending])

  function buildApiMessages(history: UiMessage[]): AiChatMessage[] {
    return [
      buildAiSystemMessage(),
      ...history.slice(-MAX_API_HISTORY_MESSAGES).map((m) => ({ role: m.role, content: m.content } satisfies AiChatMessage)),
    ]
  }

  function replaceAssistantAt(index: number, content: string) {
    setMessages((prev) => prev.map((m, i) => (i === index && m.role === 'assistant' ? { ...m, content } : m)))
  }

  async function send(text: string, baseMessages = messages) {
    if (!isOnline) {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: '当前离线，AI 分析不可用。请联网后再试。' },
      ])
      return
    }

    if (transportIssue) {
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: `${transportIssue}。请在本地 http 环境使用（如 \`npm run dev\`），或为该端点配置 HTTPS 反向代理/网关后再试。`,
        },
      ])
      return
    }

    if (!privacyAccepted) {
      setPrivacyOpen(true)
      return
    }

    const trimmed = text.trim()
    if (!trimmed) return

    const nextUser: UiMessage = { role: 'user', content: trimmed }
    const history = [...baseMessages, nextUser]
    const assistantIndex = history.length
    setMessages([...history, { role: 'assistant', content: '' }])

    setInput('')
    setSending(true)

    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    let receivedDelta = false

    try {
      const content = await fetchAiChatCompletion({
        messages: buildApiMessages(history),
        signal: controller.signal,
        stream: true,
        onDelta: (delta) => {
          if (!mountedRef.current || abortRef.current !== controller) return
          receivedDelta = true
          setMessages((prev) =>
            prev.map((m, i) => (i === assistantIndex && m.role === 'assistant' ? { ...m, content: m.content + delta } : m)),
          )
        },
      })
      if (!mountedRef.current || abortRef.current !== controller) return
      if (!receivedDelta) replaceAssistantAt(assistantIndex, content)
    } catch (err) {
      if (isAbortError(err)) return
      if (!mountedRef.current || abortRef.current !== controller) return
      replaceAssistantAt(assistantIndex, `请求失败：${prettyError(err)}`)
    } finally {
      if (mountedRef.current && abortRef.current === controller) {
        abortRef.current = null
        setSending(false)
      }
    }
  }

  function stopSending() {
    abortRef.current?.abort()
    abortRef.current = null
    setSending(false)
    setMessages((prev) => {
      const last = prev[prev.length - 1]
      if (last?.role === 'assistant' && last.content.trim().length === 0) {
        return [...prev.slice(0, -1), { role: 'assistant', content: '已停止生成。' }]
      }
      return prev
    })
  }

  function retryLastAnswer() {
    if (!canRetry) return
    const lastUser = messages[lastUserIndex]
    if (!lastUser) return
    void send(lastUser.content, messages.slice(0, lastUserIndex))
  }

  function clearChat() {
    abortRef.current?.abort()
    abortRef.current = null
    setSending(false)
    setMessages([])
    try {
      sessionStorage.removeItem(AI_CHAT_SESSION_KEY)
    } catch {
      // ignore
    }
  }

  async function copyAnswer(content: string, index: number) {
    try {
      await navigator.clipboard.writeText(content)
      setCopiedIndex(index)
      window.setTimeout(() => setCopiedIndex((current) => (current === index ? null : current)), 1200)
    } catch {
      setCopiedIndex(null)
    }
  }

  return (
    <div className="absolute inset-0 z-30 pointer-events-none">
      <AnimatePresence>
        {open ? (
          <motion.div
            key="ai-overlay"
            className="absolute inset-0 pointer-events-auto"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
            onClick={() => setOpen(false)}
          >
            <div className="absolute inset-0 bg-black/10 backdrop-blur-[1px]" />

            <motion.div
              className="absolute right-4 bottom-20 w-[min(390px,calc(100%-32px))] h-[560px] max-h-[calc(100%-112px)] rounded-[28px] bg-white/85 backdrop-blur-md border border-white/70 shadow-[var(--shadow-hover)] overflow-hidden flex flex-col"
              style={{ originX: 1, originY: 1 }}
              initial={{ opacity: 0, y: 18, scale: 0.88 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 18, scale: 0.94 }}
              transition={{
                type: 'spring',
                stiffness: 420,
                damping: 34,
                mass: 0.9,
                opacity: { duration: 0.14, ease: [0.16, 1, 0.3, 1] },
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="px-4 pt-4 pb-2 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[14px] font-extrabold tracking-tight text-slate-900">AI 分析</div>
                  <div className="mt-1 text-[11px] font-semibold text-slate-500/80">
                    本次浏览会话会保留记录
                  </div>
                  {transportIssue ? (
                    <div className="mt-1 text-[11px] font-semibold text-rose-600/90">
                      {transportIssue}
                    </div>
                  ) : null}
                  {!isOnline ? (
                    <div className="mt-1 text-[11px] font-semibold text-amber-700/90">
                      当前离线，AI 暂不可用
                    </div>
                  ) : null}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    className="w-9 h-9 rounded-full flex items-center justify-center text-slate-600 hover:bg-black/5 disabled:opacity-40"
                    aria-label="retry"
                    title="重新生成"
                    disabled={!canRetry}
                    onClick={retryLastAnswer}
                  >
                    <RotateCcw size={16} strokeWidth={2.5} />
                  </button>
                  <button
                    type="button"
                    className="w-9 h-9 rounded-full flex items-center justify-center text-slate-600 hover:bg-black/5 disabled:opacity-40"
                    aria-label="clear chat"
                    title="清空"
                    disabled={messages.length === 0 && !sending}
                    onClick={clearChat}
                  >
                    <Trash2 size={16} strokeWidth={2.5} />
                  </button>
                  <button
                    type="button"
                    className="w-9 h-9 rounded-full flex items-center justify-center text-slate-600 hover:bg-black/5"
                    aria-label="close"
                    onClick={() => setOpen(false)}
                  >
                    <X size={18} strokeWidth={2.5} />
                  </button>
                </div>
              </div>

              <div
                ref={scrollRef}
                className="flex-1 px-4 pb-3 overflow-y-auto scrollbar-hide"
              >
                {messages.length === 0 ? (
                  <div className="mt-6 rounded-[18px] border border-white/70 bg-white/65 px-4 py-3 text-[12px] font-semibold text-slate-600 leading-relaxed">
                    {!isOnline
                      ? '当前离线，AI 分析不可用。请联网后再试。'
                      : transportIssue
                        ? '当前环境无法连接云端 AI 代理。请检查设置中的云端服务器地址，或为后端配置 HTTPS 反向代理。'
                        : '你可以问我：资产结构是否健康、负债压力如何、近期变化原因、下一步优化建议等。'}
                  </div>
                ) : null}

                {messages.length === 0 && !transportIssue && isOnline ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {QUICK_PROMPTS.map((prompt) => (
                      <button
                        key={prompt}
                        type="button"
                        className="rounded-full border border-white/70 bg-white/70 px-3 py-2 text-[12px] font-extrabold text-slate-700 shadow-sm disabled:opacity-50"
                        disabled={!canAsk}
                        onClick={() => void send(prompt)}
                      >
                        {prompt}
                      </button>
                    ))}
                  </div>
                ) : null}

                <div className="mt-3 grid gap-2">
                  {messages.map((m, idx) => (
                    m.role === 'user' ? (
                      <motion.div
                        key={idx}
                        className="ml-auto max-w-[85%] rounded-[18px] bg-[var(--primary)] text-[var(--primary-contrast)] px-3 py-2 text-[13px] font-semibold leading-relaxed shadow-sm whitespace-pre-wrap break-words"
                        initial={{ opacity: 0, y: 10, scale: 0.96 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        transition={{ type: 'spring', stiffness: 520, damping: 34, mass: 0.75 }}
                        style={{ transformOrigin: 'bottom right' }}
                      >
                        {m.content}
                      </motion.div>
                    ) : (
                      <motion.div
                        key={idx}
                        className="mr-auto max-w-[88%]"
                        initial={{ opacity: 0, y: 10, scale: 0.96 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        transition={{ type: 'spring', stiffness: 520, damping: 34, mass: 0.75 }}
                        style={{ transformOrigin: 'bottom left' }}
                      >
                        <div
                          ref={idx === messages.length - 1 ? lastAssistantMessageRef : null}
                          className="rounded-[18px] bg-white/80 text-slate-800 px-3 py-2 text-[13px] font-semibold leading-relaxed border border-white/70 shadow-sm break-words"
                        >
                          {m.content ? (
                            <ChatMarkdown>{m.content}</ChatMarkdown>
                          ) : (
                            <span className="inline-flex items-center gap-1.5">
                              <span>正在思考</span>
                              <span className="inline-flex items-center gap-[3px]" aria-hidden="true">
                                {[0, 1, 2].map((dot) => (
                                  <motion.span
                                    key={dot}
                                    className="inline-block w-[4px] h-[4px] rounded-full bg-slate-400"
                                    animate={{ opacity: [0.25, 1, 0.25] }}
                                    transition={{ duration: 1.1, repeat: Infinity, delay: dot * 0.18, ease: 'easeInOut' }}
                                  />
                                ))}
                              </span>
                            </span>
                          )}
                        </div>
                        {m.content ? (
                          <div className="mt-1 flex gap-1">
                            <button
                              type="button"
                              className="h-7 w-7 rounded-full flex items-center justify-center text-slate-500 hover:bg-white/70"
                              aria-label="copy answer"
                              title={copiedIndex === idx ? '已复制' : '复制'}
                              onClick={() => void copyAnswer(m.content, idx)}
                            >
                              <Copy size={14} strokeWidth={2.4} />
                            </button>
                            {idx === messages.length - 1 && canRetry ? (
                              <button
                                type="button"
                                className="h-7 w-7 rounded-full flex items-center justify-center text-slate-500 hover:bg-white/70"
                                aria-label="regenerate answer"
                                title="重新生成"
                                onClick={retryLastAnswer}
                              >
                                <RotateCcw size={14} strokeWidth={2.4} />
                              </button>
                            ) : null}
                          </div>
                        ) : null}
                      </motion.div>
                    )
                  ))}
                </div>
              </div>

              <div className="px-3 pb-3 pt-2 border-t border-white/60 bg-white/65 backdrop-blur-md">
                <div className="flex items-end gap-2">
                  <textarea
                    ref={inputRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key !== 'Enter') return
                      if (e.shiftKey) return
                      e.preventDefault()
                      if (canSend) void send(input)
                    }}
                    placeholder={
                      transportIssue
                        ? '当前环境无法连接接口'
                        : !isOnline
                          ? '离线：AI 暂不可用'
                          : privacyAccepted
                            ? '输入你的问题...'
                            : '请先阅读隐私提示'
                    }
                    disabled={
                      !privacyAccepted ||
                      privacyOpen ||
                      sending ||
                      Boolean(transportIssue) ||
                      !isOnline
                    }
                    rows={1}
                    className="flex-1 resize-none rounded-[18px] border border-white/70 bg-white/80 px-3 py-2 text-[13px] font-semibold text-slate-900 outline-none focus:border-[var(--primary)] focus:shadow-[0_0_0_4px_rgb(var(--primary-rgb)/0.15)] disabled:opacity-60"
                    style={{ minHeight: 44, maxHeight: 120 }}
                  />
                  <button
                    type="button"
                    className="w-11 h-11 rounded-full bg-[var(--primary)] text-[var(--primary-contrast)] flex items-center justify-center shadow-sm disabled:opacity-50"
                    aria-label={sending ? 'stop' : 'send'}
                    disabled={!sending && !canSend}
                    onClick={() => {
                      if (sending) stopSending()
                      else void send(input)
                    }}
                  >
                    {sending ? <Square size={15} fill="currentColor" strokeWidth={3} /> : <ArrowUp size={18} strokeWidth={3} />}
                  </button>
                </div>
              </div>
            </motion.div>

            <AnimatePresence>
              {privacyOpen ? (
                <motion.div
                  key="privacy"
                  className="absolute inset-0 flex items-center justify-center p-4"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <motion.div
                    className="w-full max-w-[360px] rounded-[28px] bg-white/92 backdrop-blur-md border border-white/70 shadow-[var(--shadow-hover)] overflow-hidden"
                    initial={{ opacity: 0, y: 12, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 12, scale: 0.98 }}
                    transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                  >
                    <div className="px-5 pt-5 pb-3">
                      <div className="text-[15px] font-extrabold tracking-tight text-slate-900">隐私提示</div>
                      <div className="mt-2 text-[12px] font-semibold text-slate-600 leading-relaxed">
                        为了进行 AI 分析，你的财务摘要、最近快照和最近账户操作会发送到你配置的云端后台，再由后台转发到统一 AI 对话服务。
                      </div>
                      {transportIssue ? (
                        <div className="mt-2 text-[12px] font-semibold text-rose-600 leading-relaxed">
                          {transportIssue}，需要 http 环境或 HTTPS 反向代理才能使用。
                        </div>
                      ) : null}
                      <div className="mt-2 text-[11px] font-semibold text-slate-500/80 break-all">
                        服务：{aiTransportLabel}
                      </div>
                    </div>

                    <div className="px-5 pb-5 flex gap-10 justify-end">
                      <button
                        type="button"
                        className="h-11 px-4 rounded-[18px] border border-white/70 bg-white/70 text-slate-700 font-extrabold hover:bg-black/5"
                        onClick={() => {
                          setPrivacyOpen(false)
                          setOpen(false)
                        }}
                      >
                        不同意
                      </button>
                      <button
                        type="button"
                        className="h-11 px-4 rounded-[18px] bg-[var(--primary)] text-[var(--primary-contrast)] font-extrabold shadow-sm"
                        onClick={() => {
                          setAcceptedServerUrl(currentServerUrl)
                          setPrivacyOpen(false)
                        }}
                      >
                        我已了解
                      </button>
                    </div>
                  </motion.div>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <div className="absolute right-4 bottom-4 pointer-events-auto">
        <motion.button
          type="button"
          aria-label="AI analysis"
          className={
            open
              ? 'w-11 h-11 rounded-full bg-[var(--primary)] text-[var(--primary-contrast)] flex items-center justify-center shadow-[0_10px_24px_-6px_rgb(var(--primary-rgb)/0.45)] ring-4 ring-[rgb(var(--primary-rgb)/0.18)]'
              : 'w-11 h-11 rounded-full bg-[var(--primary)] text-[var(--primary-contrast)] flex items-center justify-center shadow-[0_10px_24px_-6px_rgb(var(--primary-rgb)/0.45)]'
          }
          onClick={() => setOpen((v) => !v)}
          animate={open ? { rotate: 8, scale: 1.04 } : { rotate: 0, scale: 1 }}
          whileTap={{ scale: 0.94 }}
          transition={{ type: 'spring', stiffness: 700, damping: 40, mass: 0.6 }}
        >
          <Sparkles size={18} strokeWidth={2.6} />
        </motion.button>
      </div>
    </div>
  )
}
