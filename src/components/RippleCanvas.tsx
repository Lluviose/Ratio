import { useEffect, useRef, useCallback } from 'react'
import type { MotionValue } from 'framer-motion'
import type { BubbleNode } from './BubbleChartPhysics'

// ============================================================================
// Configuration
// ============================================================================

export const RIPPLE_CONFIG = {
  /** 每个涟漪的波纹环数量 */
  ringsPerRipple: 4,
  /** 波纹环之间的延迟 (ms) */
  ringDelay: 120,
  /** 单个波纹环的动画时长 (ms) */
  ringDuration: 1200,
  /** 最大半径相对于气泡半径的倍数 */
  maxRadiusMultiplier: 3.5,
  /** 初始描边宽度 */
  initialStrokeWidth: 2,
  /** 最终描边宽度 */
  finalStrokeWidth: 0.5,
  /** 初始透明度 */
  initialOpacity: 0.4,
  /** 涟漪颜色 RGB 值 */
  rippleColorRGB: '148, 163, 184',
} as const

// ============================================================================
// Easing Functions
// ============================================================================

/**
 * 水波扩散缓动 - 快速开始，逐渐减速
 * 模拟水波能量随距离衰减的物理特性
 */
export function easeOutQuart(t: number): number {
  return 1 - Math.pow(1 - t, 4)
}

/**
 * 透明度衰减缓动 - 平滑淡出
 */
export function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3)
}

// ============================================================================
// Data Structures
// ============================================================================

export interface RippleRing {
  /** 当前半径 */
  radius: number
  /** 最大半径 */
  maxRadius: number
  /** 当前透明度 (0-1) */
  opacity: number
  /** 当前描边宽度 */
  strokeWidth: number
  /** 延迟启动时间 (ms) */
  delay: number
}

export interface Ripple {
  /** 涟漪中心 X 坐标 */
  x: number
  /** 涟漪中心 Y 坐标 */
  y: number
  /** 基于气泡大小的初始振幅（气泡半径） */
  baseAmplitude: number
  /** 波纹环数组 */
  rings: RippleRing[]
  /** 动画开始时间戳 */
  startTime: number
  /** 是否已完成 */
  completed: boolean
}

// ============================================================================
// RippleManager Class
// ============================================================================

export class RippleManager {
  private ripples: Ripple[] = []
  private animationId: number | null = null
  private ctx: CanvasRenderingContext2D | null = null
  private width = 0
  private height = 0
  private onCompleteCallback: (() => void) | null = null
  private hasTriggered = false

  /** 初始化涟漪管理器 */
  init(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    this.ctx = ctx
    this.width = width
    this.height = height
  }

  /** 设置完成回调 */
  setOnComplete(callback: () => void): void {
    this.onCompleteCallback = callback
  }

  /** 重置触发状态（用于页面重新进入） */
  resetTrigger(): void {
    this.hasTriggered = false
  }

  /** 检查是否已触发 */
  getHasTriggered(): boolean {
    return this.hasTriggered
  }

  /** 获取当前涟漪数组（用于测试） */
  getRipples(): Ripple[] {
    return this.ripples
  }

  /** 根据气泡数据创建涟漪 */
  createRipples(
    nodes: BubbleNode[],
    positions: Map<string, { x: number; y: number }>
  ): void {
    // 单次触发保证
    if (this.hasTriggered) return
    this.hasTriggered = true

    this.ripples = []
    const now = performance.now()

    for (const node of nodes) {
      const pos = positions.get(node.id)
      if (!pos) continue

      // 跳过无效位置
      if (!Number.isFinite(pos.x) || !Number.isFinite(pos.y)) continue
      if (node.radius <= 0) continue

      const maxRadius = node.radius * RIPPLE_CONFIG.maxRadiusMultiplier

      // 创建波纹环
      const rings: RippleRing[] = []
      for (let i = 0; i < RIPPLE_CONFIG.ringsPerRipple; i++) {
        rings.push({
          radius: 0,
          maxRadius,
          opacity: RIPPLE_CONFIG.initialOpacity,
          strokeWidth: RIPPLE_CONFIG.initialStrokeWidth,
          delay: i * RIPPLE_CONFIG.ringDelay,
        })
      }

      this.ripples.push({
        x: pos.x,
        y: pos.y,
        baseAmplitude: node.radius,
        rings,
        startTime: now,
        completed: false,
      })
    }
  }

  /** 启动动画循环 */
  start(): void {
    if (this.animationId !== null) return
    if (this.ripples.length === 0) {
      this.onCompleteCallback?.()
      return
    }

    const animate = (timestamp: number) => {
      try {
        this.update(timestamp)
        this.render()

        if (this.isAllCompleted()) {
          this.cleanup()
          this.onCompleteCallback?.()
        } else {
          this.animationId = requestAnimationFrame(animate)
        }
      } catch {
        this.stop()
      }
    }

    this.animationId = requestAnimationFrame(animate)
  }

  /** 停止动画循环 */
  stop(): void {
    if (this.animationId !== null) {
      cancelAnimationFrame(this.animationId)
      this.animationId = null
    }
  }

  /** 清理资源 */
  cleanup(): void {
    this.stop()
    this.ripples = []
    if (this.ctx) {
      this.ctx.clearRect(0, 0, this.width, this.height)
    }
  }

  /** 单帧更新（公开用于测试） */
  update(timestamp: number): void {
    for (const ripple of this.ripples) {
      if (ripple.completed) continue

      const elapsed = timestamp - ripple.startTime
      let allRingsComplete = true

      for (const ring of ripple.rings) {
        const ringElapsed = elapsed - ring.delay
        if (ringElapsed < 0) {
          allRingsComplete = false
          continue
        }

        const progress = Math.min(1, ringElapsed / RIPPLE_CONFIG.ringDuration)

        // 使用缓动函数计算当前值
        const radiusProgress = easeOutQuart(progress)
        const opacityProgress = easeOutCubic(progress)

        ring.radius = radiusProgress * ring.maxRadius
        ring.opacity = RIPPLE_CONFIG.initialOpacity * (1 - opacityProgress)
        ring.strokeWidth =
          RIPPLE_CONFIG.initialStrokeWidth -
          (RIPPLE_CONFIG.initialStrokeWidth - RIPPLE_CONFIG.finalStrokeWidth) *
            progress

        if (progress < 1) {
          allRingsComplete = false
        }
      }

      ripple.completed = allRingsComplete
    }
  }

  /** 渲染所有涟漪 */
  private render(): void {
    if (!this.ctx) return

    this.ctx.clearRect(0, 0, this.width, this.height)

    for (const ripple of this.ripples) {
      if (ripple.completed) continue

      for (const ring of ripple.rings) {
        if (ring.radius <= 0 || ring.opacity <= 0) continue

        this.ctx.beginPath()
        this.ctx.arc(ripple.x, ripple.y, ring.radius, 0, Math.PI * 2)
        this.ctx.strokeStyle = `rgba(${RIPPLE_CONFIG.rippleColorRGB}, ${ring.opacity})`
        this.ctx.lineWidth = ring.strokeWidth
        this.ctx.stroke()
      }
    }
  }

  /** 检查是否所有动画完成 */
  private isAllCompleted(): boolean {
    return this.ripples.length > 0 && this.ripples.every((r) => r.completed)
  }

  /** 计算总动画时长 */
  static getTotalDuration(): number {
    return (
      RIPPLE_CONFIG.ringDuration +
      (RIPPLE_CONFIG.ringsPerRipple - 1) * RIPPLE_CONFIG.ringDelay
    )
  }
}

// ============================================================================
// React Component
// ============================================================================

interface RippleCanvasProps {
  /** 气泡节点数据 */
  nodes: BubbleNode[]
  /** 气泡位置的 MotionValue Map */
  positions: Map<string, { x: MotionValue<number>; y: MotionValue<number> }>
  /** Canvas 宽度 */
  width: number
  /** Canvas 高度 */
  height: number
  /** 是否激活 */
  isActive: boolean
  /** 动画完成回调 */
  onComplete?: () => void
}

export function RippleCanvas(props: RippleCanvasProps) {
  const { nodes, positions, width, height, isActive, onComplete } = props

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const managerRef = useRef<RippleManager | null>(null)
  const wasActiveRef = useRef(false)

  // 获取当前位置的快照
  const getPositionSnapshot = useCallback(() => {
    const snapshot = new Map<string, { x: number; y: number }>()
    positions.forEach((mv, id) => {
      snapshot.set(id, { x: mv.x.get(), y: mv.y.get() })
    })
    return snapshot
  }, [positions])

  // 初始化 manager
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !width || !height) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const manager = new RippleManager()
    manager.init(ctx, width, height)
    if (onComplete) {
      manager.setOnComplete(onComplete)
    }
    managerRef.current = manager

    return () => {
      manager.cleanup()
      managerRef.current = null
    }
  }, [width, height, onComplete])

  // 处理激活状态变化
  useEffect(() => {
    const manager = managerRef.current
    if (!manager) return

    // 从非激活变为激活时触发动画
    if (isActive && !wasActiveRef.current) {
      manager.resetTrigger()
      const snapshot = getPositionSnapshot()
      manager.createRipples(nodes, snapshot)
      manager.start()
    }

    // 从激活变为非激活时停止
    if (!isActive && wasActiveRef.current) {
      manager.cleanup()
      manager.resetTrigger()
    }

    wasActiveRef.current = isActive
  }, [isActive, nodes, getPositionSnapshot])

  if (!width || !height) return null

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      className="absolute inset-0 pointer-events-none"
      style={{ zIndex: -1 }}
    />
  )
}
