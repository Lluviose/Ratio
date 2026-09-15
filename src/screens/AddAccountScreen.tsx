import { useId, useState } from 'react'
import { CalendarDays, Check, ChevronDown, ChevronLeft, ChevronRight, PackagePlus } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { accountGroups, accountTypeOptions, defaultAccountName, type AccountTypeId, type AccountGroupId } from '../lib/accounts'
import { formatRatioPercent, normalizeStoredDateKey, summarizeItemValue, todayDateKey } from '../lib/accountCost'
import { formatCny } from '../lib/format'
import { normalizeMoney } from '../lib/money'
import { exitEase, staggerDelay, standardEase } from '../lib/motionPresets'
import { pickForegroundColor, type ThemeColors } from '../lib/themes'

function withAlpha(color: string, alpha: number): string {
  const hex = color.trim()
  if (!hex.startsWith('#')) return color
  const raw = hex.slice(1)

  let r: number
  let g: number
  let b: number

  if (raw.length === 3) {
    r = Number.parseInt(raw[0] + raw[0], 16)
    g = Number.parseInt(raw[1] + raw[1], 16)
    b = Number.parseInt(raw[2] + raw[2], 16)
  } else if (raw.length === 6) {
    r = Number.parseInt(raw.slice(0, 2), 16)
    g = Number.parseInt(raw.slice(2, 4), 16)
    b = Number.parseInt(raw.slice(4, 6), 16)
  } else {
    return color
  }

  if ([r, g, b].some((v) => Number.isNaN(v))) return color

  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

export type NewItemInput = {
  type: AccountTypeId
  name?: string
  cost: number
  net: number
  acquiredAt?: string
}

const amountInputProps = { inputMode: 'decimal', enterKeyHint: 'done', autoComplete: 'off' } as const

function parseAmount(raw: string): number | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  const parsed = Number(trimmed)
  if (!Number.isFinite(parsed) || parsed < 0) return null
  return normalizeMoney(parsed)
}

// 固定资产分组：新增的是「物品」——原值必填、净值缺省等于原值、购入日期缺省今天。
function ItemForm(props: { type: AccountTypeId; tone: string; onCancel: () => void; onSubmit: (input: NewItemInput) => void }) {
  const { type, tone, onCancel, onSubmit } = props
  const [name, setName] = useState('')
  const [cost, setCost] = useState('')
  const [net, setNet] = useState('')
  const [netTouched, setNetTouched] = useState(false)
  const [acquiredAt, setAcquiredAt] = useState(() => todayDateKey())
  const uid = useId()

  const costValue = parseAmount(cost)
  const hasCost = costValue != null && costValue > 0
  const netValue = netTouched && net.trim() !== '' ? parseAmount(net) : costValue
  const netValid = netValue != null
  const dateValid = !acquiredAt || (Boolean(normalizeStoredDateKey(acquiredAt)) && acquiredAt <= todayDateKey())
  const canSubmit = hasCost && netValid && dateValid
  const preview = hasCost && netValid ? summarizeItemValue(costValue, netValue) : null
  const fieldClass =
    'w-full px-4 py-3.5 rounded-2xl bg-[var(--bg)] border border-[var(--hairline)] text-[var(--text)] font-bold text-[16px] focus:outline-none focus:ring-2 focus:ring-[var(--primary)] transition-all'

  const submit = () => {
    if (!canSubmit || costValue == null || netValue == null) return
    onSubmit({ type, name, cost: costValue, net: netValue, acquiredAt: acquiredAt || undefined })
  }

  const rows = [
    <label key="name" htmlFor={`${uid}-name`} className="block">
      <div className="mb-1.5 text-[11px] font-bold text-[var(--muted-text)]">名称</div>
      <input
        id={`${uid}-name`}
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder={`${defaultAccountName(type)}，如：家用车`}
        className={fieldClass}
        autoFocus
      />
    </label>,
    <label key="cost" htmlFor={`${uid}-cost`} className="block">
      <div className="mb-1.5 text-[11px] font-bold text-[var(--muted-text)]">原值（购入价格）</div>
      <div className="relative">
        <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 font-black text-[var(--muted-text)]">¥</span>
        <input
          id={`${uid}-cost`}
          {...amountInputProps}
          value={cost}
          onChange={(e) => setCost(e.target.value)}
          placeholder="0"
          className={`${fieldClass} pl-9`}
          aria-label="item cost"
        />
      </div>
    </label>,
    <label key="net" htmlFor={`${uid}-net`} className="block">
      <div className="mb-1.5 flex items-center justify-between text-[11px] font-bold text-[var(--muted-text)]">
        <span>当前净值</span>
        <span className="font-semibold">{netTouched && net.trim() ? '' : '留空 = 与原值相同'}</span>
      </div>
      <div className="relative">
        <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 font-black text-[var(--muted-text)]">¥</span>
        <input
          id={`${uid}-net`}
          {...amountInputProps}
          value={net}
          onChange={(e) => {
            setNetTouched(true)
            setNet(e.target.value)
          }}
          placeholder={hasCost ? String(costValue) : '与原值相同'}
          className={`${fieldClass} pl-9`}
          aria-label="item net value"
        />
      </div>
    </label>,
    <label key="date" htmlFor={`${uid}-date`} className="block">
      <div className="mb-1.5 text-[11px] font-bold text-[var(--muted-text)]">购入日期</div>
      <div className="relative">
        <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[var(--muted-text)]">
          <CalendarDays size={16} strokeWidth={2.4} />
        </span>
        <input
          id={`${uid}-date`}
          type="date"
          value={acquiredAt}
          max={todayDateKey()}
          onChange={(e) => setAcquiredAt(e.target.value)}
          className={`${fieldClass} pl-11`}
          aria-label="item acquired date"
        />
      </div>
    </label>,
  ]

  return (
    <div>
      <motion.div
        className="mb-5 flex items-center gap-3"
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.26, delay: 0.08, ease: standardEase }}
      >
        <span
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl shadow-sm"
          style={{ background: tone, color: pickForegroundColor(tone) }}
        >
          <PackagePlus size={20} strokeWidth={2.5} />
        </span>
        <div className="min-w-0">
          <div className="text-lg font-bold text-[var(--text)]">添加物品 · {defaultAccountName(type)}</div>
          <div className="mt-0.5 text-[12px] text-[var(--muted-text)]">记下原值，之后每次减值都能看到还剩几成</div>
        </div>
      </motion.div>

      <div className="flex flex-col gap-3.5">
        {rows.map((row, i) => (
          <motion.div
            key={row.key}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.28, delay: staggerDelay(i, 0.05, 0.12), ease: standardEase }}
          >
            {row}
          </motion.div>
        ))}
      </div>

      <div className="mt-3 min-h-[18px] text-[11px] font-semibold text-[var(--muted-text)]">
        <AnimatePresence mode="wait" initial={false}>
          {preview ? (
            <motion.div
              key={`${preview.impairment < 0 ? 'gain' : 'loss'}-${Math.round(preview.impairment)}`}
              initial={{ opacity: 0, y: 3 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, transition: { duration: 0.1, ease: exitEase } }}
              transition={{ duration: 0.16, ease: standardEase }}
            >
              {preview.impairment === 0
                ? `净值 ${formatCny(preview.net)}，暂无减值`
                : `净值 ${formatCny(preview.net)} · ${preview.impairment < 0 ? '增值' : '已减值'} ${formatCny(Math.abs(preview.impairment))}（${formatRatioPercent(preview.impairmentRatio)}）`}
            </motion.div>
          ) : (
            <motion.div key="hint" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              原值只用于计算减值，不影响资产合计；资产合计按净值
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="flex gap-3 mt-5">
        <motion.button
          type="button"
          className="flex-1 py-4 rounded-2xl bg-[var(--bg)] text-[var(--text)] font-bold"
          onClick={onCancel}
          whileTap={{ scale: 0.98 }}
        >
          取消
        </motion.button>
        <motion.button
          type="button"
          className={`flex-1 py-4 rounded-2xl font-bold flex items-center justify-center gap-2 transition-colors ${
            canSubmit ? 'bg-[var(--primary)] text-[var(--primary-contrast)]' : 'bg-slate-200 text-slate-400'
          }`}
          onClick={submit}
          disabled={!canSubmit}
          whileTap={{ scale: canSubmit ? 0.98 : 1 }}
          aria-label="confirm add item"
        >
          <Check size={18} strokeWidth={3} />
          添加物品
        </motion.button>
      </div>
    </div>
  )
}

export function AddAccountScreen(props: {
  onBack: () => void
  onPick: (type: AccountTypeId, customName?: string) => void
  // 固定资产分组走「添加物品」；未提供时退回普通命名流程
  onPickItem?: (input: NewItemInput) => void
  colors: ThemeColors
}) {
  const { onBack, onPick, onPickItem, colors } = props
  const [expandedGroup, setExpandedGroup] = useState<AccountGroupId | null>(null)
  const [selectedType, setSelectedType] = useState<AccountTypeId | null>(null)
  const [customName, setCustomName] = useState('')

  const grouped = {
    liquid: accountTypeOptions.filter((t) => t.groupId === 'liquid'),
    invest: accountTypeOptions.filter((t) => t.groupId === 'invest'),
    fixed: accountTypeOptions.filter((t) => t.groupId === 'fixed'),
    receivable: accountTypeOptions.filter((t) => t.groupId === 'receivable'),
    debt: accountTypeOptions.filter((t) => t.groupId === 'debt'),
  } as const

  const selectedIsItem = Boolean(selectedType && onPickItem && accountTypeOptions.find((t) => t.id === selectedType)?.groupId === 'fixed')

  const renderGroup = (groupId: AccountGroupId, index: number) => {
    const group = accountGroups[groupId]
    const items = grouped[groupId]
    const tone = colors[groupId]
    const isExpanded = expandedGroup === groupId
    const cardBg = isExpanded ? withAlpha(tone, 0.18) : 'var(--card)'
    const isItemGroup = groupId === 'fixed' && Boolean(onPickItem)

    return (
      <motion.div
        key={groupId}
        initial={{ opacity: 0, y: 24, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: 'spring', stiffness: 380, damping: 32, mass: 0.9, delay: 0.05 + index * 0.06 }}
      >
        <div
          className="rounded-2xl shadow-sm border border-[var(--hairline)] overflow-hidden"
          style={{ background: cardBg }}
        >
          <button
            type="button"
            className={'w-full px-4 py-4 flex items-center justify-between text-left ' + (isExpanded ? 'border-b border-[var(--hairline)]' : '')}
            onClick={() => setExpandedGroup((prev) => (prev === groupId ? null : groupId))}
            aria-expanded={isExpanded}
          >
            <div className="flex items-center gap-3 min-w-0">
              <motion.span
                className="w-3 h-3 rounded-full"
                style={{ background: tone }}
                animate={{ scale: isExpanded ? 1.25 : 1 }}
                transition={{ type: 'spring', stiffness: 520, damping: 22, mass: 0.7 }}
              />
              <div className="min-w-0">
                <div className="text-[15px] font-bold text-[var(--text)] tracking-tight">
                  {group.name}
                </div>
                <div className="mt-1 text-[11px] font-medium text-[var(--muted-text)]">
                  {isItemGroup ? `按物品记录 · 原值与减值 · ${items.length} 类` : `${items.length} 项`}
                </div>
              </div>
            </div>
            <motion.div
              className="w-9 h-9 rounded-full bg-[var(--bg)] flex items-center justify-center text-[var(--muted-text)]"
              animate={{ rotate: isExpanded ? 180 : 0 }}
              transition={{ type: 'spring', stiffness: 520, damping: 34, mass: 0.7 }}
            >
              <ChevronDown size={16} strokeWidth={3} />
            </motion.div>
          </button>

          <AnimatePresence initial={false}>
            {isExpanded ? (
              <motion.div
                key="types"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0, transition: { duration: 0.2, ease: [0.4, 0, 1, 1] } }}
                transition={{ height: { duration: 0.3, ease: [0.05, 0.7, 0.1, 1] }, opacity: { duration: 0.24, ease: [0.16, 1, 0.3, 1] } }}
                className="overflow-hidden"
              >
                <div className="px-3 pt-2 pb-3 flex flex-col gap-2">
                  {items.map((t, i) => {
                    const Icon = t.icon
                    return (
                      <motion.button
                        key={t.id}
                        type="button"
                        className="flex items-center gap-4 px-4 py-4 bg-[var(--card)] hover:bg-[var(--bg)] transition-colors rounded-2xl shadow-sm border border-[var(--hairline)]"
                        onClick={() => {
                          setSelectedType(t.id)
                          setCustomName('')
                        }}
                        whileTap={{ scale: 0.97 }}
                        initial={{ opacity: 0, x: -14, scale: 0.99 }}
                        animate={{ opacity: 1, x: 0, scale: 1 }}
                        transition={{ type: 'spring', stiffness: 460, damping: 34, mass: 0.75, delay: Math.min(i * 0.035, 0.28) }}
                      >
                        <span
                          className="w-10 h-10 rounded-xl flex items-center justify-center shadow-sm"
                          style={{ background: tone, color: pickForegroundColor(tone) }}
                        >
                          <Icon size={20} strokeWidth={2.5} />
                        </span>
                        <span className="flex-1 text-left font-bold text-[15px] text-[var(--text)]">{t.name}</span>
                        <span className="w-8 h-8 rounded-full bg-[var(--bg)] flex items-center justify-center text-[var(--muted-text)]">
                          <ChevronRight size={16} strokeWidth={3} />
                        </span>
                      </motion.button>
                    )
                  })}
                </div>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
      </motion.div>
    )
  }

  return (
    <div className="h-full overflow-auto bg-[var(--bg)]">
      <div className="sticky top-0 z-10 bg-[var(--bg)]/90 backdrop-blur-md border-b border-[var(--hairline)] px-4 pb-3 pt-[calc(var(--safe-top)+12px)] flex items-center justify-between">
          <motion.button
            type="button"
            className="w-10 h-10 rounded-full bg-[var(--card)] border border-[var(--hairline)] flex items-center justify-center text-[var(--text)] shadow-sm"
            onClick={onBack}
            aria-label="back"
            whileTap={{ scale: 0.9 }}
            whileHover={{ scale: 1.05 }}
          >
            <ChevronLeft size={20} strokeWidth={2.5} />
          </motion.button>
          <div className="text-lg font-bold text-[var(--text)] tracking-tight">
            添加资产
          </div>
          <div style={{ width: 40 }} />
      </div>

      <div className="px-4 py-6 flex flex-col gap-6">
        {renderGroup('liquid', 0)}
        {renderGroup('invest', 1)}
        {renderGroup('fixed', 2)}
        {renderGroup('receivable', 3)}
        {renderGroup('debt', 4)}
      </div>

      <AnimatePresence>
        {selectedType && (
          <motion.div
            className="fixed inset-0 z-50 flex flex-col bg-white"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
              paddingTop: 'var(--safe-top)',
              paddingRight: 'var(--safe-right)',
              paddingBottom: 'var(--safe-bottom)',
              paddingLeft: 'var(--safe-left)',
            }}
            // 命名弹层短，点下方空白关闭；物品表单更长，空白看起来像表单本身，
            // 点一下（尤其是收起键盘）不该退出。
            onClick={selectedIsItem ? undefined : () => setSelectedType(null)}
          >
            <motion.div
              className="w-full max-w-md mx-auto bg-[var(--card)] rounded-b-[28px] p-6 pb-8"
              onClick={(e) => e.stopPropagation()}
              initial={{ y: '-100%' }}
              animate={{ y: 0 }}
              exit={{ y: '-100%', transition: { type: 'tween', duration: 0.22, ease: [0.4, 0, 1, 1] } }}
              transition={{ type: 'spring', stiffness: 420, damping: 40, mass: 0.95 }}
            >
              {selectedIsItem && onPickItem ? (
                <ItemForm
                  type={selectedType}
                  tone={colors.fixed}
                  onCancel={() => setSelectedType(null)}
                  onSubmit={(input) => onPickItem(input)}
                />
              ) : (
                <>
                  <motion.div
                    className="text-center mb-6"
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.26, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
                  >
                    <div className="text-lg font-bold text-[var(--text)]">
                      为"{defaultAccountName(selectedType)}"命名
                    </div>
                    <div className="text-sm text-[var(--muted-text)] mt-1">
                      输入自定义名称，如：交通银行、支付宝等
                    </div>
                  </motion.div>

                  <input
                    type="text"
                    value={customName}
                    onChange={(e) => setCustomName(e.target.value)}
                    placeholder={defaultAccountName(selectedType)}
                    className="w-full px-4 py-4 rounded-2xl bg-[var(--bg)] border border-[var(--hairline)] text-[var(--text)] font-bold text-center text-lg focus:outline-none focus:ring-2 focus:ring-[var(--primary)] transition-all"
                    autoFocus
                  />

                  <div className="flex gap-3 mt-6">
                    <motion.button
                      type="button"
                      className="flex-1 py-4 rounded-2xl bg-[var(--bg)] text-[var(--text)] font-bold"
                      onClick={() => setSelectedType(null)}
                      whileTap={{ scale: 0.98 }}
                    >
                      取消
                    </motion.button>
                    <motion.button
                      type="button"
                      className="flex-1 py-4 rounded-2xl bg-[var(--primary)] text-[var(--primary-contrast)] font-bold flex items-center justify-center gap-2"
                      onClick={() => {
                        onPick(selectedType, customName)
                      }}
                      whileTap={{ scale: 0.98 }}
                    >
                      <Check size={18} strokeWidth={3} />
                      确认
                    </motion.button>
                  </div>
                </>
              )}
            </motion.div>

            <div
              className="flex-1 bg-white"
              data-testid="add-sheet-blank"
              onClick={selectedIsItem ? (e) => e.stopPropagation() : undefined}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
