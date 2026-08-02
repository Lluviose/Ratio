// 懒分包加载失败的恢复通道。
//
// 失败根因几乎总是「部署已更新，旧客户端引用的旧哈希 chunk 已从服务器消失」：
// prompt 模式下旧 SW 继续服务旧版产物，新 SW 装好后停在 waiting 等用户确认；
// 此时单纯 location.reload() 仍由旧 SW 接管，加载同一批已消失的 chunk，死循环。
// 正确的恢复是：有待应用的 SW 更新就立即应用（SKIP_WAITING + 接管后自动刷新，
// 刷新后加载的是新版产物），没有才退回普通刷新。
//
// 本模块不 import `virtual:pwa-register`（vitest 无法解析该虚拟模块），
// 由 pwa.ts 在注册 SW 时把「应用更新」与「触发更新检查」的能力注入进来；
// 未注入（SW 不可用/尚未注册）时各入口安全降级。

// 返回 true 表示已接管恢复流程（正在应用 SW 更新，随后自动刷新）
type UpdateApplier = () => boolean
type UpdateCheckRequester = () => void

let updateApplier: UpdateApplier | null = null
let updateCheckRequester: UpdateCheckRequester | null = null

export function setChunkRecoveryHandlers(handlers: {
  applyPendingUpdate: UpdateApplier
  requestUpdateCheck: UpdateCheckRequester
}) {
  updateApplier = handlers.applyPendingUpdate
  updateCheckRequester = handlers.requestUpdateCheck
}

/** 供测试复位注入状态 */
export function resetChunkRecoveryHandlers() {
  updateApplier = null
  updateCheckRequester = null
}

/**
 * 懒分包加载失败被捕获的当下调用：立即触发一次 SW 更新检查，
 * 让新版本尽快进入 waiting——用户随后点「重试」时就能直接应用。
 */
export function notifyChunkLoadFailed() {
  try {
    updateCheckRequester?.()
  } catch {
    // 恢复通道自身绝不能抛错
  }
}

/**
 * 用户在失败兜底 UI 上点「重试」时调用：
 * 优先应用待生效的 SW 更新（应用后由注册回调自动刷新），否则普通刷新。
 */
export function recoverFromChunkLoadFailure(reload: () => void = () => window.location.reload()) {
  try {
    if (updateApplier?.()) return
  } catch {
    // 应用更新失败退回普通刷新
  }
  reload()
}
