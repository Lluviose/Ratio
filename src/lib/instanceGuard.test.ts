import { describe, expect, it, vi } from 'vitest'
import { acquireInstanceLock } from './instanceGuard'

// 模拟 Web Locks 的最小语义：ifAvailable 占用时回调收 null；
// steal 抢占时原持有者的 request promise 以 AbortError reject。
function makeFakeLockManager() {
  let holder: { rejectRequest: (error: unknown) => void } | null = null

  const request = (_name: string, options: LockOptions, callback: (lock: Lock | null) => unknown): Promise<unknown> => {
    if (holder && !options.steal) {
      if (options.ifAvailable) return Promise.resolve(callback(null))
      return new Promise(() => {})
    }
    if (holder && options.steal) {
      holder.rejectRequest(new DOMException('The lock was stolen.', 'AbortError'))
      holder = null
    }
    return new Promise((resolve, reject) => {
      holder = { rejectRequest: reject }
      void Promise.resolve(callback({ name: _name, mode: 'exclusive' } as Lock)).then(
        (value) => resolve(value),
        (error: unknown) => reject(error),
      )
    })
  }

  return { request } as unknown as LockManager
}

describe('acquireInstanceLock', () => {
  it('空闲时获得锁', async () => {
    const locks = makeFakeLockManager()
    await expect(acquireInstanceLock({ locks })).resolves.toBe('acquired')
  })

  it('已被占用时返回 occupied，不排队等待', async () => {
    const locks = makeFakeLockManager()
    await acquireInstanceLock({ locks })
    await expect(acquireInstanceLock({ locks })).resolves.toBe('occupied')
  })

  it('steal 抢占成功，原持有者收到 onStolen（至多一次）', async () => {
    const locks = makeFakeLockManager()
    const onStolen = vi.fn()
    await acquireInstanceLock({ locks, onStolen })

    await expect(acquireInstanceLock({ locks, steal: true })).resolves.toBe('acquired')
    // AbortError rejection 经微任务传播
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(onStolen).toHaveBeenCalledTimes(1)
  })

  it('接管后的新持有者同样可以被再次抢占', async () => {
    const locks = makeFakeLockManager()
    const firstStolen = vi.fn()
    const secondStolen = vi.fn()
    await acquireInstanceLock({ locks, onStolen: firstStolen })
    await acquireInstanceLock({ locks, steal: true, onStolen: secondStolen })
    await acquireInstanceLock({ locks, steal: true })
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(firstStolen).toHaveBeenCalledTimes(1)
    expect(secondStolen).toHaveBeenCalledTimes(1)
  })

  it('无 locks API（老浏览器/jsdom）返回 unsupported', async () => {
    await expect(acquireInstanceLock({ locks: null })).resolves.toBe('unsupported')
  })

  it('request 同步抛错按 unsupported 处理，不阻断启动', async () => {
    const locks = {
      request: () => {
        throw new Error('boom')
      },
    } as unknown as LockManager
    await expect(acquireInstanceLock({ locks })).resolves.toBe('unsupported')
  })

  it('request promise 异步失败（未获得锁）按 unsupported 处理', async () => {
    const locks = {
      request: () => Promise.reject(new Error('boom')),
    } as unknown as LockManager
    await expect(acquireInstanceLock({ locks })).resolves.toBe('unsupported')
  })
})
