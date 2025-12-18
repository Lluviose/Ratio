
import { type CSSProperties, useEffect, useRef } from 'react'

export type RippleImpact = {
  x: number
  y: number
  radius: number
  strength: number
  delayMs?: number
}

type ImpactRuntime = {
  x: number
  y: number
  radius: number
  strength: number
  delayMs: number
  phase1: number
  phase2: number
  freq1: number
  freq2: number
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n))

export function WaterImpactRipples(props: {
  active: boolean
  impacts: RippleImpact[]
  replayToken: number
  className?: string
  style?: CSSProperties
}) {
  const { active, impacts, replayToken, className, style } = props

  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const rafRef = useRef<number | null>(null)
  const startTimeRef = useRef<number>(0)
  const runtimeRef = useRef<ImpactRuntime[]>([])
  const sizeRef = useRef<{ w: number; h: number; dpr: number }>({ w: 0, h: 0, dpr: 1 })

  const hasWork = active && impacts.length > 0

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const stop = () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
    }

    if (!hasWork) {
      stop()
      const { w, h } = sizeRef.current
      if (w && h) ctx.clearRect(0, 0, w, h)
      return
    }

    runtimeRef.current = impacts.map((imp) => ({
      x: imp.x,
      y: imp.y,
      radius: imp.radius,
      strength: imp.strength,
      delayMs: imp.delayMs ?? 0,
      phase1: Math.random() * Math.PI * 2,
      phase2: Math.random() * Math.PI * 2,
      freq1: 2.2 + Math.random() * 2.8,
      freq2: 5.5 + Math.random() * 6,
    }))

    startTimeRef.current = performance.now()

    const tick = (now: number) => {
      const host = canvas.parentElement
      const rect = host ? host.getBoundingClientRect() : canvas.getBoundingClientRect()
      const w = rect.width
      const h = rect.height
      const dpr = window.devicePixelRatio || 1

      const prev = sizeRef.current
      if (w !== prev.w || h !== prev.h || dpr !== prev.dpr) {
        sizeRef.current = { w, h, dpr }
        canvas.width = Math.max(1, Math.round(w * dpr))
        canvas.height = Math.max(1, Math.round(h * dpr))
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      }

      ctx.clearRect(0, 0, w, h)

      const t = (now - startTimeRef.current) / 1000

      const speed = 250
      const ringCount = 7
      const ringSpacing = 0.33
      const life = 5.8
      const maxR = Math.hypot(w, h) + 120

      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.globalCompositeOperation = 'source-over'
      ctx.shadowBlur = 10
      ctx.shadowColor = 'rgba(255,255,255,0.22)'

      let anyAlive = false

      for (const imp of runtimeRef.current) {
        const age = t - imp.delayMs / 1000
        if (age < -0.2) continue

        for (let i = 0; i < ringCount; i += 1) {
          const ringAge = age - i * ringSpacing
          if (ringAge < 0) continue
          if (ringAge > life) continue

          const r = imp.radius + ringAge * speed
          if (r > maxR) continue

          const fade = clamp01(1 - ringAge / life)
          const env = fade * fade
          const amp = (0.013 + 0.012 * imp.strength) * env
          const wobble = (angle: number) => {
            const p = ringAge * 2.1
            const s1 = Math.sin(angle * imp.freq1 + imp.phase1 + p)
            const s2 = Math.sin(angle * imp.freq2 + imp.phase2 - p * 1.4)
            return (s1 * 0.65 + s2 * 0.35) * amp
          }

          const alphaBase = 0.11 * imp.strength
          const alpha = alphaBase * env * (1 - i * 0.085)

          if (alpha <= 0.001) continue

          ctx.globalAlpha = alpha
          ctx.strokeStyle = 'rgba(255,255,255,1)'
          ctx.lineWidth = 1.1 + 1.6 * env * imp.strength

          const steps = 72
          ctx.beginPath()
          for (let s = 0; s <= steps; s += 1) {
            const a = (s / steps) * Math.PI * 2
            const rr = r * (1 + wobble(a))
            const x = imp.x + Math.cos(a) * rr
            const y = imp.y + Math.sin(a) * rr
            if (s === 0) ctx.moveTo(x, y)
            else ctx.lineTo(x, y)
          }
          ctx.closePath()
          ctx.stroke()

          anyAlive = true
        }
      }

      ctx.globalAlpha = 1

      if (anyAlive) {
        rafRef.current = requestAnimationFrame(tick)
      } else {
        stop()
        ctx.clearRect(0, 0, w, h)
      }
    }

    stop()
    rafRef.current = requestAnimationFrame(tick)
    return () => stop()
  }, [hasWork, impacts, replayToken])

  return (
    <div className={className} style={{ ...style, pointerEvents: 'none' }}>
      <canvas ref={canvasRef} className="w-full h-full" style={{ width: '100%', height: '100%' }} />
    </div>
  )
}
