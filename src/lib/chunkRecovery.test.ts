import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  notifyChunkLoadFailed,
  recoverFromChunkLoadFailure,
  resetChunkRecoveryHandlers,
  setChunkRecoveryHandlers,
} from './chunkRecovery'

afterEach(() => {
  resetChunkRecoveryHandlers()
})

describe('chunkRecovery', () => {
  it('未注入处理器时恢复退回普通刷新，通知不抛错', () => {
    const reload = vi.fn()
    expect(() => notifyChunkLoadFailed()).not.toThrow()
    recoverFromChunkLoadFailure(reload)
    expect(reload).toHaveBeenCalledOnce()
  })

  it('待应用更新被接管时不再刷新；未接管时刷新兜底', () => {
    const reload = vi.fn()
    const applyPendingUpdate = vi.fn().mockReturnValueOnce(true).mockReturnValueOnce(false)
    setChunkRecoveryHandlers({ applyPendingUpdate, requestUpdateCheck: () => {} })

    recoverFromChunkLoadFailure(reload)
    expect(applyPendingUpdate).toHaveBeenCalledOnce()
    expect(reload).not.toHaveBeenCalled()

    recoverFromChunkLoadFailure(reload)
    expect(reload).toHaveBeenCalledOnce()
  })

  it('应用更新抛错时退回普通刷新（恢复通道自身不抛）', () => {
    const reload = vi.fn()
    setChunkRecoveryHandlers({
      applyPendingUpdate: () => {
        throw new Error('sw broke')
      },
      requestUpdateCheck: () => {
        throw new Error('update broke')
      },
    })

    expect(() => notifyChunkLoadFailed()).not.toThrow()
    expect(() => recoverFromChunkLoadFailure(reload)).not.toThrow()
    expect(reload).toHaveBeenCalledOnce()
  })

  it('分包失败通知触发更新检查', () => {
    const requestUpdateCheck = vi.fn()
    setChunkRecoveryHandlers({ applyPendingUpdate: () => false, requestUpdateCheck })

    notifyChunkLoadFailed()
    expect(requestUpdateCheck).toHaveBeenCalledOnce()
  })
})
