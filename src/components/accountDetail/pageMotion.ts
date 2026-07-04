import type { Transition, Variants } from 'framer-motion'

// 详情页各动作页共用的滑动切换动效（custom = pageDir，-1 返回 / 1 前进 / 0 无向）
export const pageTransition: Transition = { duration: 0.26, ease: [0.05, 0.7, 0.1, 1] }

export const pageVariants: Variants = {
  initial: (dir: number) => ({
    opacity: 0,
    x: dir === 0 ? 0 : dir * 22,
    y: 10,
    scale: 0.99,
  }),
  animate: { opacity: 1, x: 0, y: 0, scale: 1 },
  exit: (dir: number) => ({
    opacity: 0,
    x: dir === 0 ? 0 : -dir * 22,
    y: -10,
    scale: 0.99,
    transition: { duration: 0.15, ease: [0.4, 0, 1, 1] },
  }),
}
