import type { RefObject } from 'react'
import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Trash2 } from 'lucide-react'
import { EmptyState } from '../EmptyState'
import type { Account } from '../../lib/accounts'
import type { AccountOp } from '../../lib/accountOps'
import { addMoney } from '../../lib/money'
import { formatCny, formatSigned, formatTime } from './format'
import { describeOpForAccount } from './opDisplay'

const OP_DELETE_REVEAL_PX = 72
// 初始只渲染最近一段历史：每条都是 layout+drag motion 节点，全量渲染在
// 几百条时是详情页最先卡的部分；余下的经「加载更多」分页补齐。
const OPS_INITIAL_COUNT = 40
const OPS_LOAD_STEP = 60
// 超过此规模后放弃逐项 layout 重排动画（删除时其余条目瞬时补位），
// 换取长列表下不为每条维持布局测量。
const OPS_ITEM_LAYOUT_MAX = 60

// 账户操作历史列表：左滑露出删除、点击进入编辑。
// 回滚/删除的业务决策在父组件（onDeleteOp 里确认并按 opRollback 计划回写）。
export function OpsHistoryList(props: {
  account: Account
  relatedOps: AccountOp[]
  getAccountName: (id: string) => string | undefined
  shouldStaggerOpsIntro: boolean
  swipedOpId: string | null
  setSwipedOpId: (id: string | null) => void
  suppressOpClickRef: RefObject<boolean>
  onEditOp: (op: AccountOp) => void
  onDeleteOp: (op: AccountOp, title: string) => void
}) {
  const {
    account,
    relatedOps,
    getAccountName,
    shouldStaggerOpsIntro,
    swipedOpId,
    setSwipedOpId,
    suppressOpClickRef,
    onEditOp,
    onDeleteOp,
  } = props

  const [visibleCount, setVisibleCount] = useState(OPS_INITIAL_COUNT)
  useEffect(() => {
    setVisibleCount(OPS_INITIAL_COUNT)
  }, [account.id])

  // relatedOps 按时间倒序，runningAfter 从当前余额向过去回推——
  // 只渲染前缀不影响任何已渲染条目的余额展示。
  const visibleOps = relatedOps.slice(0, visibleCount)
  const hiddenCount = relatedOps.length - visibleOps.length
  const enableItemLayout = relatedOps.length <= OPS_ITEM_LAYOUT_MAX

  return (
    <div className="mt-3 rounded-[22px] bg-white/70 border border-white/70 overflow-hidden">
      {relatedOps.length === 0 ? (
        <EmptyState
          variant="ops"
          title="暂无操作"
          hint="用上方「期间增减」或「修改余额」记一笔，这里会保留历史"
        />
      ) : (
        <AnimatePresence initial={false}>
          {(() => {
            let runningAfter = account.balance
            return visibleOps.map((op, i) => {
              const { title, delta } = describeOpForAccount(op, account.id, getAccountName)

              const deltaColor =
                delta == null
                  ? 'text-slate-400'
                  : delta > 0
                    ? 'text-slate-900'
                    : delta < 0
                      ? 'text-rose-600'
                      : 'text-slate-400'

              const displayAfter = runningAfter
              const noteText = op.note?.trim()
              runningAfter = addMoney(runningAfter, -(delta ?? 0))

              const canDeleteOp = op.kind === 'set_balance' || op.kind === 'adjust' || op.kind === 'transfer'
              const canEditOp = canDeleteOp

              const isSwipedOpen = swipedOpId === op.id

              return (
                <motion.div
                  key={op.id}
                  layout={enableItemLayout}
                  initial={shouldStaggerOpsIntro ? { opacity: 0, y: 8 } : false}
                  animate={{
                    opacity: 1,
                    y: 0,
                    transition: {
                      duration: 0.18,
                      delay: shouldStaggerOpsIntro ? Math.min(0.25, i * 0.03) : 0,
                    },
                  }}
                  exit={{ opacity: 0, height: 0, transition: { duration: 0.18 } }}
                  className={i === 0 ? '' : 'border-t border-black/5'}
                  style={{ overflow: 'hidden' }}
                >
                  <div className="relative">
                    {canDeleteOp ? (
                      <div
                        className="absolute inset-y-0 right-0 z-0 flex items-center justify-center bg-rose-50/90"
                        style={{ width: OP_DELETE_REVEAL_PX }}
                      >
                        <motion.button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            onDeleteOp(op, title)
                          }}
                          className="w-11 h-11 rounded-full bg-rose-600 text-[#fff] shadow-sm flex items-center justify-center active:scale-95 transition"
                          aria-label="删除记录"
                          title="删除"
                          initial={false}
                          animate={{
                            scale: canDeleteOp && isSwipedOpen ? 1 : 0.94,
                            opacity: canDeleteOp && isSwipedOpen ? 1 : 0.75,
                          }}
                          transition={{ type: 'spring', stiffness: 520, damping: 38 }}
                        >
                          <Trash2 size={16} strokeWidth={2.6} />
                        </motion.button>
                      </div>
                    ) : null}

                    <motion.div
                      drag={canDeleteOp ? 'x' : false}
                      dragConstraints={{ left: -OP_DELETE_REVEAL_PX - 16, right: 0 }}
                      dragElastic={0.08}
                      dragMomentum={false}
                      onDragStart={() => {
                        if (swipedOpId && swipedOpId !== op.id) setSwipedOpId(null)
                      }}
                      onDragEnd={(_, info) => {
                        const didDrag = Math.abs(info.offset.x) > 6 || Math.abs(info.velocity.x) > 60
                        if (didDrag) {
                          suppressOpClickRef.current = true
                          window.setTimeout(() => {
                            suppressOpClickRef.current = false
                          }, 0)
                        }

                        const threshold = OP_DELETE_REVEAL_PX * 0.33
                        const velocityThreshold = 420

                        if (!isSwipedOpen) {
                          const shouldOpen = info.offset.x < -threshold || info.velocity.x < -velocityThreshold
                          setSwipedOpId(shouldOpen ? op.id : null)
                          return
                        }

                        const shouldClose = info.offset.x > threshold || info.velocity.x > velocityThreshold
                        setSwipedOpId(shouldClose ? null : op.id)
                      }}
                      animate={{ x: canDeleteOp && isSwipedOpen ? -OP_DELETE_REVEAL_PX : 0 }}
                      transition={{ type: 'spring', stiffness: 560, damping: 46 }}
                      onClick={() => {
                        if (suppressOpClickRef.current) return
                        if (swipedOpId && swipedOpId !== op.id) {
                          setSwipedOpId(null)
                          return
                        }
                        if (isSwipedOpen) {
                          setSwipedOpId(null)
                          return
                        }
                        if (canEditOp) onEditOp(op)
                      }}
                      style={{ touchAction: canDeleteOp ? 'pan-y' : 'auto' }}
                      className={`relative z-10 px-4 py-4 flex items-start justify-between gap-4 bg-white ${canEditOp ? 'cursor-pointer active:bg-slate-50' : ''}`}
                    >
                      <div className="min-w-0">
                        <div className="text-[14px] font-semibold text-slate-900 truncate">
                          {title}
                        </div>
                        <div className="mt-1 text-[11px] font-medium text-slate-400">
                          {formatTime(op.at)}
                        </div>
                        {noteText ? (
                          <div className="mt-1 text-[12px] font-medium text-slate-500 break-words">
                            {noteText}
                          </div>
                        ) : null}
                      </div>

                      <div className="text-right shrink-0">
                        <div className={`text-[14px] font-semibold ${deltaColor}`}>
                          {delta == null ? '—' : formatSigned(delta)}
                        </div>
                        <div className="mt-1 text-[11px] font-medium text-slate-400">
                          余额 {formatCny(displayAfter)}
                        </div>
                      </div>
                    </motion.div>
                  </div>
                </motion.div>
              )
            })
          })()}
        </AnimatePresence>
      )}
      {hiddenCount > 0 ? (
        <button
          type="button"
          className="w-full px-4 py-3 border-t border-black/5 bg-white text-[12px] font-extrabold text-slate-500 active:bg-slate-50"
          onClick={() => setVisibleCount((count) => count + OPS_LOAD_STEP)}
        >
          加载更多（还有 {hiddenCount} 条）
        </button>
      ) : null}
    </div>
  )
}
