import { AnimatePresence, motion } from 'framer-motion'
import { ArrowUp, Sparkles, X } from 'lucide-react'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { AI_BASE_URL, buildAiFinancialContext, fetchAiChatCompletion, getAiEndpointIssue, type AiChatMessage } from '../lib/ai'
import { useLocalStorageState } from '../lib/useLocalStorageState'

type UiMessage = {
  role: 'user' | 'assistant'
  content: string
}

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
    return `无法连接到 AI 端点（${AI_BASE_URL}）。请检查网络/端点可用性，以及是否存在 CORS 或证书问题。`
  }
  return raw
}

export function AiAssistant() {
  const [open, setOpen] = useState(false)
  const [isOnline, setIsOnline] = useState(() => navigator.onLine)
  const [privacyAccepted, setPrivacyAccepted] = useLocalStorageState<boolean>('ratio.aiPrivacyAccepted', false)
  const [privacyOpen, setPrivacyOpen] = useState(false)
  const [messages, setMessages] = useState<UiMessage[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)

  const transportIssue = useMemo(() => getAiEndpointIssue(), [])

  const inputRef = useRef<HTMLTextAreaElement | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const scrollRef = useRef<HTMLDivElement | null>(null)
  const lastAssistantMessageRef = useRef<HTMLDivElement | null>(null)

  const canSend = useMemo(() => {
    if (!open) return false
    if (privacyOpen) return false
    if (!privacyAccepted) return false
    if (sending) return false
    if (!isOnline) return false
    if (transportIssue) return false
    return input.trim().length > 0
  }, [input, isOnline, open, privacyAccepted, privacyOpen, sending, transportIssue])

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
    if (!privacyAccepted) setPrivacyOpen(true)
  }, [open, privacyAccepted])

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
  }, [messages.length, sending])

  function getFinancialContextMessage(): AiChatMessage {
    const ctx = buildAiFinancialContext()
    const json = JSON.stringify(ctx, null, 2)
    return {
      role: 'system',
      content:
        '你是一个严谨的个人财务分析助手。\n' +
        '下面是用户在本地记录的财务数据 JSON，请把它当作本次对话的唯一事实来源。\n' +
        '\n' +
        '重要语义（请严格遵守）：\n' +
        '- 本项目不是逐笔记账：用户通常不会记录每一笔交易。\n' +
        '- accountOps.kind="adjust" 表示“期间净流量/净变动”的汇总记录，不是单笔交易；delta>0=净流入，delta<0=净流出。\n' +
        '- accountOps.kind="set_balance" 是余额校准/覆盖；差额可能同时包含流量与估值变动。\n' +
        '- accountOps.kind="transfer" 是账户间内部转移，不改变净资产；不要把它当作收入/支出。\n' +
        '- snapshots 是不同日期的余额快照；相邻快照的差值代表期间总变化（可能包含流量+估值波动），不能拆成逐笔明细。\n' +
        '- ledger（如果存在）可能是可选/不完整的明细，不要假设覆盖全部。\n' +
        '\n' +
        '回答要求：基于 JSON 推理；缺信息先提问；不要编造不存在的交易/分类。\n\n' +
        json,
    }
  }

  async function send(text: string) {
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
    const history = [...messages, nextUser]
    setMessages(history)

    setInput('')
    setSending(true)

    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    try {
      const apiMessages: AiChatMessage[] = [getFinancialContextMessage()]

      for (const m of history) apiMessages.push({ role: m.role, content: m.content })

      const content = await fetchAiChatCompletion({ messages: apiMessages, signal: controller.signal })
      setMessages((prev) => [...prev, { role: 'assistant', content }])
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: `请求失败：${prettyError(err)}` },
      ])
    } finally {
      setSending(false)
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
              className="absolute right-4 bottom-20 w-[min(360px,calc(100%-32px))] h-[520px] max-h-[calc(100%-112px)] rounded-[28px] bg-white/85 backdrop-blur-md border border-white/70 shadow-[var(--shadow-hover)] overflow-hidden flex flex-col"
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
                    提示：刷新页面将清空聊天记录
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
                <button
                  type="button"
                  className="w-9 h-9 rounded-full flex items-center justify-center text-slate-600 hover:bg-black/5"
                  aria-label="close"
                  onClick={() => setOpen(false)}
                >
                  <X size={18} strokeWidth={2.5} />
                </button>
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
                      ? '当前环境无法直接连接 AI 端点。建议在本地 http 环境使用（例如运行 `npm run dev`），或为端点配置 HTTPS 反向代理。'
                      : '你可以问我：资产结构是否健康、负债压力如何、近期变化原因、下一步优化建议等。'}
                  </div>
                ) : null}

                <div className="mt-3 grid gap-2">
                  {messages.map((m, idx) => (
                    m.role === 'user' ? (
                      <div
                        key={idx}
                        className="ml-auto max-w-[85%] rounded-[18px] bg-[var(--primary)] text-[var(--primary-contrast)] px-3 py-2 text-[13px] font-semibold leading-relaxed shadow-sm whitespace-pre-wrap break-words"
                      >
                        {m.content}
                      </div>
                    ) : (
                      <div
                        key={idx}
                        ref={idx === messages.length - 1 ? lastAssistantMessageRef : null}
                        className="mr-auto max-w-[85%] rounded-[18px] bg-white/80 text-slate-800 px-3 py-2 text-[13px] font-semibold leading-relaxed border border-white/70 shadow-sm break-words"
                      >
                        <ChatMarkdown>{m.content}</ChatMarkdown>
                      </div>
                    )
                  ))}

                  {sending ? (
                    <div className="mr-auto max-w-[85%] rounded-[18px] bg-white/80 text-slate-800 px-3 py-2 text-[13px] font-semibold leading-relaxed border border-white/70 shadow-sm">
                      正在思考…
                    </div>
                  ) : null}
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
                          ? '输入你的问题…'
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
                    aria-label="send"
                    disabled={!canSend}
                    onClick={() => void send(input)}
                  >
                    <ArrowUp size={18} strokeWidth={3} />
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
                        为了进行 AI 分析，你的财务数据将以 JSON 形式发送到第三方模型端点（包含账户、快照、期间变动记录等）。请确认你理解并同意后继续使用。
                      </div>
                      {transportIssue ? (
                        <div className="mt-2 text-[12px] font-semibold text-rose-600 leading-relaxed">
                          {transportIssue}，需要 http 环境或 HTTPS 反向代理才能使用。
                        </div>
                      ) : null}
                      <div className="mt-2 text-[11px] font-semibold text-slate-500/80 break-all">
                        端点：{AI_BASE_URL}
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
                          setPrivacyAccepted(true)
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
