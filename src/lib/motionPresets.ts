// 全局动效词汇表：所有屏幕与组件共享同一套缓动、弹簧与编排预设，
// 保证节奏一致。仅动画 transform/opacity 等合成器友好属性。

// ─── 缓动曲线 ───────────────────────────────────────────────────────────────

// 快出长收，丝滑收尾：入场与淡入的默认曲线
export const standardEase: [number, number, number, number] = [0.16, 1, 0.3, 1]
// 强调减速：大面积/主角元素
export const expressiveEase: [number, number, number, number] = [0.2, 0, 0, 1]
// 屏幕级编排的强调曲线（M3 emphasized decelerate）
export const emphasizedEase: [number, number, number, number] = [0.05, 0.7, 0.1, 1]
// 轻柔三次曲线：微淡入、颜色/透明度小变化
export const silkEase: [number, number, number, number] = [0.33, 1, 0.68, 1]
// 加速离场：退场应快于入场
export const exitEase: [number, number, number, number] = [0.4, 0, 1, 1]
// 轻微回弹：徽章、对勾等趣味强调
export const overshootEase: [number, number, number, number] = [0.34, 1.56, 0.64, 1]

// ─── 时长型过渡 ─────────────────────────────────────────────────────────────

export const microTransition = {
  duration: 0.14,
  ease: silkEase,
}

export const quickFade = {
  duration: 0.18,
  ease: standardEase,
}

export const screenTransition = {
  duration: 0.3,
  ease: emphasizedEase,
}

export const cardEntranceTransition = {
  duration: 0.38,
  ease: emphasizedEase,
}

export const smoothTransition = {
  duration: 0.34,
  ease: standardEase,
}

export const progressFillTransition = {
  duration: 0.7,
  ease: emphasizedEase,
}

export const exitTransition = {
  duration: 0.16,
  ease: exitEase,
}

// ─── 弹簧 ───────────────────────────────────────────────────────────────────

// 通用界面弹簧：卡片、面板等中等表面
export const softSpring = {
  type: 'spring' as const,
  stiffness: 460,
  damping: 36,
  mass: 0.9,
}

// 底部导航指示器
export const navSpring = {
  type: 'spring' as const,
  stiffness: 520,
  damping: 40,
  mass: 0.72,
}

// 小控件（开关、分段指示器）：快而稳
export const snappySpring = {
  type: 'spring' as const,
  stiffness: 720,
  damping: 42,
  mass: 0.55,
}

// 大表面缓动弹簧：抽屉、整页位移
export const gentleSpring = {
  type: 'spring' as const,
  stiffness: 300,
  damping: 33,
  mass: 1,
}

// 带一点弹性的趣味弹簧：庆祝、图标弹跳
export const bouncySpring = {
  type: 'spring' as const,
  stiffness: 430,
  damping: 24,
  mass: 0.9,
}

// 底部抽屉滑入：接近临界阻尼，自然减速且几乎不过冲
export const sheetSpring = {
  type: 'spring' as const,
  stiffness: 480,
  damping: 46,
  mass: 1,
}

// ─── 入场/退场原语 ──────────────────────────────────────────────────────────

export const fadeUpInitial = {
  opacity: 0,
  y: 10,
}

export const fadeUpAnimate = {
  opacity: 1,
  y: 0,
}

export const cardEntranceInitial = {
  opacity: 0,
  y: 14,
  scale: 0.98,
}

export const cardEntranceAnimate = {
  opacity: 1,
  y: 0,
  scale: 1,
}

export const scaleInInitial = {
  opacity: 0,
  scale: 0.94,
}

export const scaleInAnimate = {
  opacity: 1,
  scale: 1,
}

export const subtleLift = {
  y: -2,
  scale: 1.01,
}

export const tooltipExit = {
  opacity: 0,
  y: -4,
}

export const fadeCollapseExit = {
  opacity: 0,
  y: 6,
  scale: 0.99,
}

// ─── 触感交互 ───────────────────────────────────────────────────────────────

export const tapPress = { scale: 0.97 }
export const tapPressSoft = { scale: 0.985 }
export const tapPressIcon = { scale: 0.9 }
export const hoverLift = { y: -2, scale: 1.008 }

// ─── 编排（stagger）────────────────────────────────────────────────────────

// 列表/卡片组容器：子项按序入场
export const staggerContainer = {
  hidden: {},
  show: {
    transition: {
      staggerChildren: 0.05,
      delayChildren: 0.04,
    },
  },
}

// 与 staggerContainer 配对的子项
export const staggerItem = {
  hidden: cardEntranceInitial,
  show: {
    ...cardEntranceAnimate,
    transition: cardEntranceTransition,
  },
}

// 按索引计算入场延迟；封顶避免长列表拖尾
export function staggerDelay(index: number, step = 0.045, base = 0.03, max = 0.5): number {
  return Math.min(base + Math.max(0, index) * step, max)
}

// 常见组合：带索引延迟的卡片入场 transition
export function cardEntranceAt(index: number, step = 0.05, base = 0.04) {
  return {
    ...cardEntranceTransition,
    delay: staggerDelay(index, step, base),
  }
}
