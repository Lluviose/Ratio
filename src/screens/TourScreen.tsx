import clsx from 'clsx'
import { X } from 'lucide-react'
import { useMemo, useState } from 'react'

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
    <div
      style={{
        width: 'min(320px, 92%)',
        margin: '0 auto',
        borderRadius: 30,
        border: '10px solid #111827',
        background: '#111827',
        boxShadow: '0 20px 50px rgba(11, 15, 26, 0.25)',
      }}
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
              {[
                { label: '流动资金', value: '574,000', color: '#47d16a' },
                { label: '投资', value: '338,200', color: accent },
                { label: '固定资产', value: '1,520,000', color: '#6b86ff' },
                { label: '应收款', value: '120,000', color: '#a4b5ff' },
                { label: '负债', value: '1,080,000', color: '#cbd5e1' },
              ].map((r) => (
                <div
                  key={r.label}
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
                </div>
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
                  <path
                    d="M10 120 L60 90 L120 95 L170 70 L220 60 L280 30 L310 34"
                    fill="none"
                    stroke={accent}
                    strokeWidth="3"
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
                <div
                  key={t}
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
                </div>
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
    </div>
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
    <div style={{ height: '100%', background: slide.bg, position: 'relative' }}>
      <div style={{ padding: '18px 16px 12px', display: 'flex', justifyContent: 'flex-end' }}>
        <button type="button" className="iconBtn" aria-label="close" onClick={onClose}>
          <X size={18} />
        </button>
      </div>

      <div style={{ padding: '2px 20px 0' }}>
        <div style={{ fontSize: 34, fontWeight: 950, letterSpacing: '-0.03em', lineHeight: 1.12, color: '#0b0f1a' }}>
          <div>{slide.titleLines[0]}</div>
          <div>{slide.titleLines[1]}</div>
          <div>{slide.titleLines[2]}</div>
        </div>
      </div>

      <div style={{ marginTop: 18 }}>
        <PhoneMock kind={phoneKind} accent={slide.accent === 'white' ? '#ffffff' : 'var(--primary)'} />
      </div>

      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          padding: 16,
          display: 'grid',
          gap: 12,
          background: 'linear-gradient(to top, rgba(245,246,248,0.92), rgba(245,246,248,0))',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8 }}>
          {slides.map((s, i) => (
            <button
              key={s.id}
              type="button"
              aria-label={`dot-${i}`}
              onClick={() => setIndex(i)}
              style={{
                width: i === index ? 20 : 8,
                height: 8,
                borderRadius: 999,
                border: 'none',
                background: i === index ? 'rgba(11,15,26,0.65)' : 'rgba(11,15,26,0.25)',
                cursor: 'pointer',
                transition: 'all 160ms ease',
              }}
            />
          ))}
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
          <button
            type="button"
            className={clsx('iconBtn', index === 0 && 'muted')}
            onClick={() => setIndex((v) => Math.max(0, v - 1))}
            disabled={index === 0}
          >
            上一页
          </button>

          <button
            type="button"
            className="iconBtn iconBtnPrimary"
            onClick={() => {
              if (index === slides.length - 1) onClose()
              else setIndex((v) => Math.min(slides.length - 1, v + 1))
            }}
          >
            {index === slides.length - 1 ? '开始使用' : '下一页'}
          </button>
        </div>
      </div>
    </div>
  )
}
