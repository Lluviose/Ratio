import { motion } from 'framer-motion'
import { MAX_MONTH_START_DAY, MIN_MONTH_START_DAY } from '../../lib/monthStart'
import { standardEase } from '../../lib/motionPresets'

export function MonthStartCard(props: { monthStartDay: number; onChange: (day: number) => void }) {
  const { monthStartDay, onChange } = props
  return (
    <motion.div
      className="card"
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.09, duration: 0.26, ease: standardEase }}
    >
      <div className="cardInner">
        <div style={{ fontWeight: 800, fontSize: 16 }}>月度开始日</div>
        <div className="muted" style={{ marginTop: 4, fontSize: 13, fontWeight: 550 }}>
          用于按月聚合的统计口径（例如趋势页的 6月/1年）
        </div>

        <div style={{ marginTop: 16 }}>
          <label className="field">
            <div className="fieldLabel">每月从哪一天开始</div>
            <select
              className="select"
              value={String(monthStartDay)}
              onChange={(e) => onChange(Number(e.target.value))}
            >
              {Array.from({ length: MAX_MONTH_START_DAY - MIN_MONTH_START_DAY + 1 }, (_, idx) => {
                const d = MIN_MONTH_START_DAY + idx
                return (
                  <option key={d} value={String(d)}>
                    {d}号
                  </option>
                )
              })}
            </select>
          </label>
        </div>
      </div>
    </motion.div>
  )
}
