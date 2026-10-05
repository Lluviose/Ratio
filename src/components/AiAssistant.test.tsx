import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AiAssistant } from './AiAssistant'

const aiMocks = vi.hoisted(() => ({
  fetchAiChatCompletion: vi.fn(),
}))

vi.mock('../lib/ai', () => ({
  buildAiSystemMessage: () => ({ role: 'system', content: 'mock context' }),
  fetchAiChatCompletion: aiMocks.fetchAiChatCompletion,
  getAiEndpointIssue: () => null,
  getAiTransportLabel: () => 'mock cloud',
}))

function seedCloudAiReady() {
  localStorage.setItem('ratio.cloudSync', JSON.stringify({
    serverUrl: 'http://localhost:8787',
    username: 'demo',
    password: 'password',
    autoSync: false,
    telemetryEnabled: false,
    useCloudAi: true,
    registrationInvite: '',
  }))
  localStorage.setItem('ratio.aiPrivacyAcceptedServerUrl', JSON.stringify('http://localhost:8787'))
}

describe('AiAssistant', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
    seedCloudAiReady()
    aiMocks.fetchAiChatCompletion.mockReset()
    aiMocks.fetchAiChatCompletion.mockImplementation(async (args: { onDelta?: (delta: string) => void }) => {
      args.onDelta?.('分析结果')
      return '分析结果'
    })
  })

  it('sends a quick prompt and stores the session message', async () => {
    render(<AiAssistant initialOpen />)

    fireEvent.click(screen.getByRole('button', { name: '我的资产结构健康吗？' }))

    await waitFor(() => expect(screen.getByText('分析结果')).toBeInTheDocument())
    expect(aiMocks.fetchAiChatCompletion).toHaveBeenCalledTimes(1)
    expect(sessionStorage.getItem('ratio.ai.chat.session.v1')).toContain('我的资产结构健康吗？')
  })

  it('accepts the named privacy dialog without sending a request', async () => {
    localStorage.removeItem('ratio.aiPrivacyAcceptedServerUrl')
    render(<AiAssistant initialOpen />)

    expect(screen.getByRole('dialog', { name: '隐私提示' })).toHaveAttribute('aria-modal', 'true')
    expect(screen.queryByRole('button', { name: 'AI analysis' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '我的资产结构健康吗？' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: '我已了解' }))

    await waitFor(() => expect(screen.queryByRole('dialog', { name: '隐私提示' })).not.toBeInTheDocument())
    expect(screen.getByRole('dialog', { name: 'AI 分析' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '我的资产结构健康吗？' })).toBeEnabled()
    expect(localStorage.getItem('ratio.aiPrivacyAcceptedServerUrl')).toBe(JSON.stringify('http://localhost:8787'))
    expect(aiMocks.fetchAiChatCompletion).not.toHaveBeenCalled()
  })

  it('declines privacy without accepting or sending a request', async () => {
    localStorage.removeItem('ratio.aiPrivacyAcceptedServerUrl')
    render(<AiAssistant initialOpen />)

    fireEvent.click(screen.getByRole('button', { name: '不同意' }))

    await waitFor(() => expect(screen.queryAllByRole('dialog')).toHaveLength(0))
    expect(localStorage.getItem('ratio.aiPrivacyAcceptedServerUrl')).toBe(JSON.stringify(''))
    expect(aiMocks.fetchAiChatCompletion).not.toHaveBeenCalled()
  })

  it('restores and clears the session chat', async () => {
    sessionStorage.setItem('ratio.ai.chat.session.v1', JSON.stringify([
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: 'old answer' },
    ]))

    render(<AiAssistant initialOpen />)

    expect(screen.getByText('old answer')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'clear chat' }))

    await waitFor(() => expect(screen.queryByText('old answer')).not.toBeInTheDocument())
    await waitFor(() => expect(sessionStorage.getItem('ratio.ai.chat.session.v1') || '[]').toBe('[]'))
  })
})
