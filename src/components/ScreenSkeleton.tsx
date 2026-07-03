import { motion } from 'framer-motion'
import type { CSSProperties } from 'react'
import { quickFade, standardEase } from '../lib/motionPresets'

type ScreenSkeletonKind = 'trend' | 'stats' | 'settings'

const skeletonBlockVariants = {
  hidden: { opacity: 0, scale: 0.97, y: 6 },
  show: { opacity: 1, scale: 1, y: 0, transition: { duration: 0.24, ease: standardEase } },
}

function SkeletonBlock(props: { className?: string; style?: CSSProperties }) {
  const { className, style } = props
  return (
    <motion.div
      className={className ? `skeletonBlock ${className}` : 'skeletonBlock'}
      style={style}
      variants={skeletonBlockVariants}
    />
  )
}

function TrendSkeleton() {
  return (
    <>
      <div className="skeletonSegment">
        <SkeletonBlock />
        <SkeletonBlock />
      </div>
      <div className="skeletonChart">
        <SkeletonBlock className="skeletonLine skeletonLineA" />
        <SkeletonBlock className="skeletonLine skeletonLineB" />
        <div className="skeletonAxis">
          <SkeletonBlock />
          <SkeletonBlock />
          <SkeletonBlock />
        </div>
      </div>
      <div className="skeletonPills">
        <SkeletonBlock />
        <SkeletonBlock />
        <SkeletonBlock />
        <SkeletonBlock />
      </div>
    </>
  )
}

function StatsSkeleton() {
  return (
    <>
      <SkeletonBlock className="skeletonTextLine" style={{ width: '64%', marginInline: 'auto' }} />
      <div className="skeletonPills">
        <SkeletonBlock />
        <SkeletonBlock />
        <SkeletonBlock />
        <SkeletonBlock />
      </div>
      <div className="skeletonStatsGrid">
        {Array.from({ length: 8 }, (_, index) => (
          <SkeletonBlock key={index} />
        ))}
      </div>
    </>
  )
}

function SettingsSkeleton() {
  return (
    <div className="stack">
      {Array.from({ length: 4 }, (_, index) => (
        <div key={index} className="skeletonCard">
          <SkeletonBlock className="skeletonTextLine" style={{ width: index === 0 ? '42%' : '54%' }} />
          <SkeletonBlock className="skeletonTextLine" style={{ width: '72%', opacity: 0.72 }} />
          <div className="skeletonRows">
            <SkeletonBlock />
            <SkeletonBlock />
          </div>
        </div>
      ))}
    </div>
  )
}

export function ScreenSkeleton(props: { screen: ScreenSkeletonKind }) {
  const { screen } = props

  return (
    <motion.div
      className="screenSkeleton"
      aria-hidden="true"
      initial="hidden"
      animate="show"
      variants={{
        hidden: { opacity: 0, y: 8 },
        show: {
          opacity: 1,
          y: 0,
          transition: { ...quickFade, staggerChildren: 0.035, delayChildren: 0.02 },
        },
      }}
    >
      {screen === 'trend' ? <TrendSkeleton /> : screen === 'stats' ? <StatsSkeleton /> : <SettingsSkeleton />}
    </motion.div>
  )
}
