// 跨标签单实例守卫（P0-5）：核心数据都是「整个数组存一个键」+ 键级
// last-write-wins，两个标签并发读-改-写同一个键会静默丢更新。与其正确
// 合并并发写（版本号/rebase 的复杂度远超这个个人应用的多标签使用价值），
// 不如结构性消灭并发：同一时间只允许一个标签持有「写权」。
//
// 机制：首个标签用 Web Locks API 持有一把永不释放的排他锁；后开标签
// 拿不到锁（ifAvailable 返回 null）就停在拦截页，用户点「在此标签页继续」
// 以 steal 抢占——原持有者的 request promise 以 AbortError reject，据此
// 触发 onStolen（落盘 + 冻结页面）。锁随页面关闭自动释放，不会死锁。
//
// 降级：navigator.locks 不存在（老浏览器/jsdom）时返回 'unsupported'，
// 调用方按获得锁处理——行为与本改动之前完全一致，不会更差。

export type InstanceLockResult = 'acquired' | 'occupied' | 'unsupported'

export const INSTANCE_LOCK_NAME = 'ratio.app.instance'

export type AcquireInstanceLockOptions = {
  /** 以 steal 抢占既有持有者（拦截页「在此标签页继续」按钮） */
  steal?: boolean
  /** 已获得的锁被其他标签 steal 时回调（每次获得至多触发一次） */
  onStolen?: () => void
  /** 测试注入；缺省用 navigator.locks */
  locks?: LockManager | null
}

export function acquireInstanceLock(options: AcquireInstanceLockOptions = {}): Promise<InstanceLockResult> {
  const locks = options.locks !== undefined ? options.locks : typeof navigator !== 'undefined' ? navigator.locks : null
  if (!locks || typeof locks.request !== 'function') return Promise.resolve('unsupported')

  return new Promise<InstanceLockResult>((resolve) => {
    let acquired = false
    let stolenNotified = false

    const notifyStolen = () => {
      if (!acquired || stolenNotified) return
      stolenNotified = true
      options.onStolen?.()
    }

    let request: Promise<unknown>
    try {
      request = locks.request(
        INSTANCE_LOCK_NAME,
        options.steal ? { steal: true } : { ifAvailable: true },
        (lock) => {
          if (!lock) {
            resolve('occupied')
            return
          }
          acquired = true
          resolve('acquired')
          // 永不 resolve：锁保持到页面关闭或被 steal
          return new Promise<void>(() => {})
        },
      )
    } catch {
      resolve('unsupported')
      return
    }

    request.catch(() => {
      if (acquired) {
        // 被其他标签 steal 抢占（AbortError）
        notifyStolen()
      } else {
        // 请求本身失败（罕见）：按不支持处理，不阻断启动
        resolve('unsupported')
      }
    })
  })
}
