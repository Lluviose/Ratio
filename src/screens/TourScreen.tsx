import clsx from 'clsx'
import { X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

type Slide = {
  id: string
  bg: string
  titleLines: [string, string, string]
  subtitle?: string
  accent: string
}

function PhoneMock(props: { kind: 'ratio' | 'trend' | 'stats' | 'theme'; accent: string }) {
  const { kind, accent } = props

  return (
    <motion.div
      style={{
        width: 'min(320px, 92%)',
        margin: '0 auto',
        borderRadius: 30,
        border: '10px solid #111827',
        background: '#111827',
        boxShadow: '0 20px 50px rgba(11, 15, 26, 0.25)',
      }}
      initial={{ y: 50, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ type: 'spring', damping: 25, stiffness: 120, delay: 0.2 }}
    >
      <div
        style={{
          borderRadius: 22,
          overflow: 'hidden',
          background: '#f5f6f8',
          minHeight: 360,
        }}
      >
        <div
          style={{
            height: 34,
            background: '#0b0f1a',
            opacity: 0.12,
          }}
        />

        {kind === 'ratio' ? (
          <div style={{ padding: 14 }}>
            <div style={{ fontWeight: 950, fontSize: 12, opacity: 0.7 }}>我的净资产 (CNY)</div>
            <div style={{ fontWeight: 950, fontSize: 26, marginTop: 6 }}>1,472,200</div>
            <div style={{ display: 'grid', gap: 10, marginTop: 14 }}>
              {[{ label: '流动资金', value: '574,000', color: '#47d16a' }, { label: '投资', value: '338,200', color: accent }, { label: '固定资产', value: '1,520,000', color: '#6b86ff' }, { label: '应收款', value: '120,000', color: '#a4b5ff' }, { label: '负债', value: '1,080,000', color: '#cbd5e1' }].map((r, i) => (
                <motion.div
                  key={r.label}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.4 + i * 0.05 }}
                  style={{
                    borderRadius: 16,
                    border: '1px solid rgba(11, 15, 26, 0.06)',
                    background: 'rgba(255,255,255,0.9)',
                    padding: '10px 12px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 10,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ width: 10, height: 10, borderRadius: 999, background: r.color }} />
                    <span style={{ fontWeight: 900, fontSize: 12 }}>{r.label}</span>
                  </div>
                  <span style={{ fontWeight: 950, fontSize: 12 }}>{r.value}</span>
                </motion.div>
              ))}
            </div>
          </div>
        ) : null}

        {kind === 'trend' ? (
          <div style={{ padding: 14 }}>
            <div style={{ textAlign: 'center', fontWeight: 950, fontSize: 13 }}>趋势图</div>
            <div
              style={{
                marginTop: 10,
                borderRadius: 16,
                border: '1px solid rgba(11, 15, 26, 0.08)',
                background: 'white',
                padding: 12,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'center' }}>
                <div
                  style={{
                    background: 'rgba(11, 15, 26, 0.06)',
                    padding: 4,
                    borderRadius: 999,
                    display: 'inline-flex',
                    gap: 4,
                  }}
                >
                  <div
                    style={{
                      background: 'white',
                      borderRadius: 999,
                      padding: '6px 10px',
                      fontWeight: 900,
                      fontSize: 11,
                      boxShadow: '0 6px 18px rgba(11, 15, 26, 0.10)',
                    }}
                  >
                    净资产与负债
                  </div>
                  <div style={{ borderRadius: 999, padding: '6px 10px', fontWeight: 900, fontSize: 11, opacity: 0.6 }}>
                    流动资金与投资
                  </div>
                </div>
              </div>

              <div style={{ marginTop: 12, height: 150, position: 'relative' }}>
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    background:
                      'linear-gradient(180deg, rgba(11,15,26,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(11,15,26,0.05) 1px, transparent 1px)',
                    backgroundSize: '24px 24px',
                    borderRadius: 14,
                  }}
                />
                <svg width="100%" height="100%" viewBox="0 0 320 150" style={{ position: 'relative' }}>
                  <motion.path
                    d="M10 120 L60 90 L120 95 L170 70 L220 60 L280 30 L310 34"
                    fill="none"
                    stroke={accent}
                    strokeWidth="3"
                    initial={{ pathLength: 0 }}
                    animate={{ pathLength: 1 }}
                    transition={{ duration: 1.5, ease: "easeInOut", delay: 0.5 }}
                  />
                  <path
                    d="M10 110 L60 102 L120 98 L170 96 L220 90 L280 88 L310 86"
                    fill="none"
                    stroke="rgba(11,15,26,0.35)"
                    strokeWidth="2.5"
                    strokeDasharray="5 6"
                  />
                  <line x1="220" y1="20" x2="220" y2="140" stroke="rgba(239,68,68,0.6)" strokeWidth="2" />
                </svg>
              </div>

              <div style={{ display: 'flex', justifyContent: 'center', marginTop: 10 }}>
                <div
                  style={{
                    background: 'rgba(11, 15, 26, 0.04)',
                    padding: 4,
                    borderRadius: 999,
                    display: 'inline-flex',
                    gap: 6,
                  }}
                >
                  {['30天', '6月', '1年', '自定义'].map((t, i) => (
                    <div
                      key={t}
                      style={
                        i === 2
                          ? {
                              background: 'white',
                              borderRadius: 999,
                              padding: '6px 10px',
                              fontWeight: 900,
                              fontSize: 11,
                              boxShadow: '0 6px 18px rgba(11, 15, 26, 0.10)',
                            }
                          : { borderRadius: 999, padding: '6px 10px', fontWeight: 900, fontSize: 11, opacity: 0.55 }
                      }
                    >
                      {t}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {kind === 'stats' ? (
          <div style={{ padding: 14 }}>
            <div style={{ textAlign: 'center', fontWeight: 950, fontSize: 13 }}>收支统计</div>
            <div
              style={{
                marginTop: 10,
                borderRadius: 16,
                border: '1px solid rgba(11, 15, 26, 0.08)',
                background: 'white',
                padding: 12,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'center' }}>
                <div
                  style={{
                    background: 'rgba(11, 15, 26, 0.06)',
                    padding: 4,
                    borderRadius: 999,
                    display: 'inline-flex',
                    gap: 4,
                  }}
                >
                  <div
                    style={{
                      background: accent,
                      color: 'white',
                      borderRadius: 999,
                      padding: '6px 10px',
                      fontWeight: 900,
                      fontSize: 11,
                    }}
                  >
                    投资变动
                  </div>
                  <div style={{ borderRadius: 999, padding: '6px 10px', fontWeight: 900, fontSize: 11, opacity: 0.6 }}>
                    流动资金
                  </div>
                </div>
              </div>

              <div style={{ marginTop: 12, height: 150, display: 'flex', alignItems: 'flex-end', gap: 10, padding: '0 8px' }}>
                {[70, 28, 82, 42, 8, 18].map((h, idx) => (
                  <div key={idx} style={{ display: 'grid', gap: 8, justifyItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6 }}>
                      <div
                        style={{
                          width: 20,
                          height: h,
                          borderRadius: 10,
                          background: idx === 2 ? accent : 'rgba(91,107,255,0.6)',
                        }}
                      />
                      <div style={{ width: 12, height: Math.max(10, Math.round(h * 0.45)), borderRadius: 10, background: 'rgba(11, 15, 26, 0.18)' }} />
                    </div>
                    <div style={{ fontSize: 10, fontWeight: 900, opacity: 0.6 }}>{['4月', '5月', '6月', '7月', '8月', '9月'][idx]}</div>
                  </div>
                ))}
              </div>

              <div style={{ display: 'flex', justifyContent: 'center', marginTop: 10 }}>
                <div
                  style={{
                    background: 'rgba(11, 15, 26, 0.04)',
                    padding: 4,
                    borderRadius: 999,
                    display: 'inline-flex',
                    gap: 6,
                  }}
                >
                  {['5周', '6月', '1年', '4年'].map((t, i) => (
                    <div
                      key={t}
                      style={
                        i === 1
                          ? {
                              background: 'white',
                              borderRadius: 999,
                              padding: '6px 10px',
                              fontWeight: 900,
                              fontSize: 11,
                              boxShadow: '0 6px 18px rgba(11, 15, 26, 0.10)',
                            }
                          : { borderRadius: 999, padding: '6px 10px', fontWeight: 900, fontSize: 11, opacity: 0.55 }
                      }
                    >
                      {t}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {kind === 'theme' ? (
          <div style={{ padding: 14 }}>
            <div style={{ display: 'grid', gap: 12 }}>
              {['Matisse', 'Matisse 2', 'Macke', 'Mondrian', 'Kandinsky', 'Miro'].map((t, idx) => (
                <motion.div
                  key={t}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.4 + idx * 0.05 }}
                  style={{
                    borderRadius: 16,
                    border: '1px solid rgba(11, 15, 26, 0.06)',
                    background: 'rgba(255,255,255,0.9)',
                    padding: '10px 12px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 10,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ display: 'flex' }}>
                      {[0, 1, 2].map((n) => (
                        <span
                          key={n}
                          style={{
                            width: 22,
                            height: 22,
                            borderRadius: 999,
                            border: '2px solid rgba(255,255,255,0.9)',
                            marginLeft: n === 0 ? 0 : -8,
                            background:
                              idx === 1
                                ? ['#a4b5ff', accent, '#47d16a'][n]
                                : ['#c7b5ff', '#ff8b73', '#26c6da'][n],
                          }}
                        />
                      ))}
                    </div>
                    <div style={{ fontWeight: 950, fontSize: 12, opacity: 0.85 }}>{t}</div>
                  </div>
                  <div
                    style={
                      idx === 1
                        ? {
                            width: 18,
                            height: 18,
                            borderRadius: 999,
                            border: `2px solid ${accent}`,
                            background: 'rgba(91,107,255,0.10)',
                          }
                        : {
                            width: 18,
                            height: 18,
                            borderRadius: 999,
                            border: '2px solid rgba(11, 15, 26, 0.2)',
                          }
                    }
                  />
                </motion.div>
              ))}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 14 }}>
              <div
                style={{
                  width: 42,
                  height: 42,
                  borderRadius: 12,
                  background: accent,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'white',
                  fontWeight: 950,
                }}
              >
                %
              </div>
              <div style={{ fontWeight: 900, fontSize: 12, opacity: 0.7 }}>图标匹配主题色</div>
            </div>
          </div>
        ) : null}
      </div>
    </motion.div>
  )
}

export function TourScreen(props: { onClose: () => void }) {
  const { onClose } = props
  const [index, setIndex] = useState(0)

  const slides: Slide[] = useMemo(
    () => [
      {
        id: 'ratio',
        bg: '#f5f6f8',
        titleLines: ['关注重要资产', '关注分配比', '专属私人财务报表'],
        accent: 'var(--primary)',
      },
      {
        id: 'trend',
        bg: '#a4b5ff',
        titleLines: ['观察趋势', '关注积累', '见证资产增长'],
        accent: 'var(--primary)',
      },
      {
        id: 'assets',
        bg: '#a4b5ff',
        titleLines: ['会计经验', '财报理念', '专业分类不疏漏'],
        accent: 'var(--primary)',
      },
      {
        id: 'stats',
        bg: '#5b6bff',
        titleLines: ['投资损益', '科学打理', '随时调整投资策略'],
        accent: 'white',
      },
      {
        id: 'theme',
        bg: '#a4b5ff',
        titleLines: ['个性主题', '数据隐私安全', '私人账户跨平台同步'],
        accent: 'var(--primary)',
      },
    ],
    [],
  )

  const slide = slides[index]

  const phoneKind = ((): 'ratio' | 'trend' | 'stats' | 'theme' => {
    if (slide.id === 'trend') return 'trend'
    if (slide.id === 'stats') return 'stats'
    if (slide.id === 'theme') return 'theme'
    return 'ratio'
  })()

  return (
    <div style={{ height: '100%', background: slide.bg, position: 'relative', transition: 'background 0.5s ease' }}>
      <div style={{ padding: '18px 16px 12px', display: 'flex', justifyContent: 'flex-end' }}>
        <motion.button
          type="button"
          className="iconBtn"
          aria-label="close"
          onClick={onClose}
          style={{ background: 'rgba(255,255,255,0.5)', backdropFilter: 'blur(10px)', border: 'none' }}
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.95 }}
        >
          <X size={20} strokeWidth={2.5} />
        </motion.button>
      </div>

      <div style={{ padding: '10px 24px 0' }}>
        <div style={{ fontSize: 32, fontWeight: 950, letterSpacing: '-0.02em', lineHeight: 1.15, color: '#0b0f1a' }}>
          <AnimatePresence mode="wait">
            <motion.div
              key={slide.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.4 }}
            >
              <div className="animate-[fadeIn_0.6s_ease-out_0.1s_backwards]">{slide.titleLines[0]}</div>
              <div className="animate-[fadeIn_0.6s_ease-out_0.2s_backwards]">{slide.titleLines[1]}</div>
              <div className="animate-[fadeIn_0.6s_ease-out_0.3s_backwards]">{slide.titleLines[2]}</div>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      <div style={{ marginTop: 32 }}>
        <AnimatePresence mode="wait">
          <motion.div
            key={slide.id}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.1 }}
            transition={{ duration: 0.4 }}
          >
            <PhoneMock kind={phoneKind} accent={slide.accent === 'white' ? '#ffffff' : 'var(--primary)'} />
          </motion.div>
        </AnimatePresence>
      </div>

      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          padding: '20px 24px 32px',
          display: 'grid',
          gap: 20,
          background: 'linear-gradient(to top, rgba(245,246,248,0.95), rgba(245,246,248,0))',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8 }}>
          {slides.map((s, i) => (
            <motion.button
              key={s.id}
              type="button"
              aria-label={`dot-${i}`}
              onClick={() => setIndex(i)}
              animate={{
                width: i === index ? 24 : 8,
                backgroundColor: i === index ? '#0b0f1a' : 'rgba(11,15,26,0.2)',
              }}
              style={{
                height: 8,
                borderRadius: 999,
                border: 'none',
                cursor: 'pointer',
              }}
            />
          ))}
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
          <motion.button
            type="button"
            className={clsx('ghostBtn', index === 0 && 'opacity-0 pointer-events-none')}
            onClick={() => setIndex((v) => Math.max(0, v - 1))}
            disabled={index === 0}
            style={{ width: 'auto', padding: '12px 20px', background: 'white', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}
            whileTap={{ scale: 0.95 }}
          >
            上一页
          </motion.button>

          <motion.button
            type="button"
            className="primaryBtn flex-1 shadow-lg"
            onClick={() => {
              if (index === slides.length - 1) onClose()
              else setIndex((v) => Math.min(slides.length - 1, v + 1))
            }}
            style={{ height: 48, fontSize: 15 }}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            {index === slides.length - 1 ? '开始使用' : '下一页'}
          </motion.button>
        </div>
      </div>
    </div>
  )
}
