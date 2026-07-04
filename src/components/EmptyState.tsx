import { motion } from 'framer-motion'
import { quickFade } from '../lib/motionPresets'

// 空状态插画：主题色点缀的线稿，替代裸文案。插画纯装饰（aria-hidden），
// 标题沿用原有字符串，避免影响依赖可见文本的测试与习惯认知。

function TrendArt() {
  return (
    <svg width="108" height="64" viewBox="0 0 108 64" fill="none" aria-hidden="true">
      <rect x="1.5" y="1.5" width="105" height="61" rx="12" stroke="currentColor" strokeOpacity="0.16" strokeWidth="1.5" />
      <path d="M14 46 L38 36 L60 40 L92 20" stroke="currentColor" strokeOpacity="0.28" strokeWidth="2" strokeLinecap="round" strokeDasharray="1 7" />
      <circle cx="38" cy="36" r="3" fill="currentColor" fillOpacity="0.22" />
      <circle cx="60" cy="40" r="3" fill="currentColor" fillOpacity="0.22" />
      <circle cx="92" cy="20" r="4" fill="var(--primary)" />
      <circle cx="92" cy="20" r="8" stroke="var(--primary)" strokeOpacity="0.25" strokeWidth="2" />
      <path d="M14 52 H94" stroke="currentColor" strokeOpacity="0.12" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

function OpsArt() {
  return (
    <svg width="108" height="64" viewBox="0 0 108 64" fill="none" aria-hidden="true">
      <rect x="18.5" y="8.5" width="71" height="47" rx="10" stroke="currentColor" strokeOpacity="0.16" strokeWidth="1.5" />
      <path d="M30 22 H62" stroke="currentColor" strokeOpacity="0.24" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M30 32 H78" stroke="currentColor" strokeOpacity="0.16" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M30 42 H70" stroke="currentColor" strokeOpacity="0.16" strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="84" cy="46" r="10" fill="var(--primary)" fillOpacity="0.14" />
      <path d="M84 41.5 V50.5 M79.5 46 H88.5" stroke="var(--primary)" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

export function EmptyState(props: {
  variant: 'trend' | 'ops'
  title: string
  hint?: string
  paddingTop?: number
  paddingBottom?: number
}) {
  const { variant, title, hint, paddingTop = 28, paddingBottom = 28 } = props

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={quickFade}
      style={{
        display: 'grid',
        justifyItems: 'center',
        gap: 4,
        paddingTop,
        paddingBottom,
        color: 'var(--muted-text)',
      }}
    >
      {variant === 'trend' ? <TrendArt /> : <OpsArt />}
      <div style={{ marginTop: 8, fontSize: 13, fontWeight: 650, color: 'var(--muted-text)' }}>{title}</div>
      {hint ? (
        <div style={{ fontSize: 11, fontWeight: 550, color: 'var(--muted-text)', opacity: 0.75, textAlign: 'center', maxWidth: 240, lineHeight: 1.5 }}>
          {hint}
        </div>
      ) : null}
    </motion.div>
  )
}
