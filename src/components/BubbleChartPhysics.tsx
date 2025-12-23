import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as Matter from 'matter-js'
import { animate, motionValue, type MotionValue } from 'framer-motion'

export type BubbleNode = {
  id: string
  radius: number
  color: string
  label: string
  value: number
}

export type BubblePosition = { x: MotionValue<number>; y: MotionValue<number> }

export type BurstShard = {
  id: string
  radius: number
  x: MotionValue<number>
  y: MotionValue<number>
}

export type BubbleBurst = {
  shards: BurstShard[]
  alpha: MotionValue<number>
}

export type BubblePhysics = {
  positions: Map<string, BubblePosition>
  flick: (id: string, velocity: { x: number; y: number }) => void
  burst: (id: string, point?: { x: number; y: number }) => void
  bursts: Map<string, BubbleBurst>
  burstProgress: Map<string, MotionValue<number>>
}

type ClusterBoost = { startMs: number; durationMs: number; strength: number }
type BurstPhase = 'burst' | 'merge'

type BurstState = {
  parentId: string
  originalBody: Matter.Body
  originalSeed: { a: number; b: number }
  shardBodies: Matter.Body[]
  mergeStartMs: number
  mergeDurationMs: number
  phase: BurstPhase
  alpha: MotionValue<number>
}

type ShardMotion = { x: MotionValue<number>; y: MotionValue<number>; radius: number }

export function useBubblePhysics(
  nodes: BubbleNode[],
  width: number,
  height: number,
  isActive: boolean
): BubblePhysics {
  const [positions] = useState(() => new Map<string, BubblePosition>())
  const [bursts] = useState(() => new Map<string, BubbleBurst>())
  const [burstProgress] = useState(() => new Map<string, MotionValue<number>>())
  const [, bump] = useState(0)

  nodes.forEach((node) => {
    if (!positions.has(node.id)) {
      positions.set(node.id, { x: motionValue(width / 2), y: motionValue(height / 2) })
    }
    if (!burstProgress.has(node.id)) {
      burstProgress.set(node.id, motionValue(0))
    }
  })

  const engineRef = useRef<Matter.Engine | null>(null)
  const runnerRef = useRef<Matter.Runner | null>(null)
  const bodiesRef = useRef(new Map<string, Matter.Body>())
  const driftSeedsRef = useRef(new Map<string, { a: number; b: number }>())
  const shardMotionsRef = useRef(new Map<string, ShardMotion>())
  const burstStatesRef = useRef(new Map<string, BurstState>())
  const burstCounterRef = useRef(0)
  const knownIdsRef = useRef(new Set<string>())
  const clusterBoostRef = useRef<ClusterBoost | null>(null)

  useEffect(() => {
    if (!width || !height || nodes.length === 0) return

    const engine = Matter.Engine.create()
    const world = engine.world
    engine.gravity.x = 0
    engine.gravity.y = 0

    bursts.clear()
    driftSeedsRef.current = new Map()
    shardMotionsRef.current = new Map()
    burstStatesRef.current = new Map()
    clusterBoostRef.current = null
    burstProgress.forEach((p) => p.set(0))
    bump((v) => v + 1)

    const bodies = nodes.map((node) => {
      const isKnown = knownIdsRef.current.has(node.id)
      const mv = positions.get(node.id)
      const prevX = mv?.x.get()
      const prevY = mv?.y.get()
      const hasPrev =
        isKnown &&
        typeof prevX === 'number' &&
        Number.isFinite(prevX) &&
        typeof prevY === 'number' &&
        Number.isFinite(prevY)

      const radius = Number.isFinite(node.radius) && node.radius > 0 ? node.radius : 1

      const x0 = hasPrev ? (prevX as number) : Math.random() * (width - 100) + 50
      const y0 = hasPrev ? (prevY as number) : Math.random() * (height - 100) + 50

      const minX = radius
      const maxX = width - radius
      const minY = radius
      const maxY = height - radius

      const x = maxX >= minX ? Math.min(Math.max(x0, minX), maxX) : width / 2
      const y = maxY >= minY ? Math.min(Math.max(y0, minY), maxY) : height / 2

      return Matter.Bodies.circle(x, y, radius, {
        label: node.id,
        frictionAir: 0.018,
        restitution: 0.88,
        density: 0.0012,
        render: { fillStyle: node.color },
      })
    })

    const wallOptions = { isStatic: true, render: { visible: false } }
    const walls = [
      Matter.Bodies.rectangle(width / 2, -500, width * 2, 1000, wallOptions),
      Matter.Bodies.rectangle(width / 2, height + 500, width * 2, 1000, wallOptions),
      Matter.Bodies.rectangle(-500, height / 2, 1000, height * 2, wallOptions),
      Matter.Bodies.rectangle(width + 500, height / 2, 1000, height * 2, wallOptions),
    ]

    Matter.World.add(world, [...bodies, ...walls])
    engineRef.current = engine
    runnerRef.current = null
    bodiesRef.current = new Map(bodies.map((b) => [b.label, b]))
    knownIdsRef.current = new Set(nodes.map((n) => n.id))

    const t0 = performance.now()
    bodiesRef.current.forEach((body) => {
      driftSeedsRef.current.set(body.label, { a: Math.random() * Math.PI * 2, b: Math.random() * Math.PI * 2 })
    })

    const finalizeBurst = (parentId: string, state: BurstState, cx: number, cy: number) => {
      state.shardBodies.forEach((shard) => {
        Matter.World.remove(world, shard)
        bodiesRef.current.delete(shard.label)
        driftSeedsRef.current.delete(shard.label)
        shardMotionsRef.current.delete(shard.label)
      })

      Matter.Body.setPosition(state.originalBody, { x: cx, y: cy })
      Matter.Body.setVelocity(state.originalBody, { x: 0, y: 0 })
      Matter.Body.setAngularVelocity(state.originalBody, 0)
      Matter.World.add(world, state.originalBody)
      bodiesRef.current.set(parentId, state.originalBody)
      driftSeedsRef.current.set(parentId, state.originalSeed)

      bursts.delete(parentId)
      burstStatesRef.current.delete(parentId)
      burstProgress.get(parentId)?.set(0)
      clusterBoostRef.current = { startMs: performance.now(), durationMs: 700, strength: 0.7 }
      bump((v) => v + 1)
    }

    const onBeforeUpdate = () => {
      const t = (performance.now() - t0) / 1000

      const wander = Math.min(width, height) * 0.06
      const cx = width / 2 + Math.sin(t * 0.17) * wander
      const cy = height / 2 + Math.cos(t * 0.13) * wander

      const pulse = Math.sin(t * 0.35)
      const baseCenterK = 0.000015 + 0.000005 * pulse
      const swirlK = 0.000001 * Math.cos(t * 0.25)

      let centerBoostMul = 1
      const boost = clusterBoostRef.current
      if (boost) {
        const nowMs = performance.now()
        const p = (nowMs - boost.startMs) / Math.max(1, boost.durationMs)
        if (p >= 1) {
          clusterBoostRef.current = null
        } else {
          const easeOut = 1 - Math.pow(p, 2)
          centerBoostMul = 1 + boost.strength * 1.1 * easeOut
        }
      }
      const centerK = baseCenterK * centerBoostMul

      bodiesRef.current.forEach((body) => {
        const dx = cx - body.position.x
        const dy = cy - body.position.y

        Matter.Body.applyForce(body, body.position, {
          x: dx * centerK + -dy * swirlK,
          y: dy * centerK + dx * swirlK,
        })

        const seed = driftSeedsRef.current.get(body.label)
        if (!seed) return

        const drift = 0.00012
        Matter.Body.applyForce(body, body.position, {
          x: Math.sin(t * 0.9 + seed.a) * drift,
          y: Math.cos(t * 1.1 + seed.b) * drift,
        })
      })

      const nowMs = performance.now()
      burstStatesRef.current.forEach((state, parentId) => {
        if (nowMs < state.mergeStartMs) return

        if (state.phase === 'burst') {
          state.phase = 'merge'
          animate(state.alpha, 0, { duration: 0.45, ease: [0.2, 0, 0, 1] })
          const p = burstProgress.get(parentId)
          if (p) animate(p, 0, { duration: 0.42, ease: [0.2, 0, 0, 1] })
        }

        const shards = state.shardBodies
        if (shards.length === 0) {
          finalizeBurst(parentId, state, width / 2, height / 2)
          return
        }

        let sx = 0
        let sy = 0
        for (const shard of shards) {
          sx += shard.position.x
          sy += shard.position.y
        }
        const mx = sx / shards.length
        const my = sy / shards.length

        const mergeP = Math.min(1, Math.max(0, (nowMs - state.mergeStartMs) / Math.max(1, state.mergeDurationMs)))
        const easeIn = mergeP * mergeP
        const mergeK = 0.00006 + 0.00028 * easeIn

        for (const shard of shards) {
          const dx = mx - shard.position.x
          const dy = my - shard.position.y
          Matter.Body.applyForce(shard, shard.position, { x: dx * mergeK, y: dy * mergeK })
        }

        if (mergeP >= 1) {
          finalizeBurst(parentId, state, mx, my)
        }
      })
    }

    Matter.Events.on(engine, 'beforeUpdate', onBeforeUpdate)

    const runner = Matter.Runner.create()
    runnerRef.current = runner

    const onAfterUpdate = () => {
      bodiesRef.current.forEach((body) => {
        const m = positions.get(body.label)
        if (m) {
          m.x.set(body.position.x)
          m.y.set(body.position.y)
          return
        }

        const shard = shardMotionsRef.current.get(body.label)
        if (!shard) return
        shard.x.set(body.position.x - shard.radius)
        shard.y.set(body.position.y - shard.radius)
      })

      burstStatesRef.current.forEach((state, parentId) => {
        const m = positions.get(parentId)
        if (!m) return

        const shards = state.shardBodies
        if (shards.length === 0) return
        let sx = 0
        let sy = 0
        for (const shard of shards) {
          sx += shard.position.x
          sy += shard.position.y
        }
        m.x.set(sx / shards.length)
        m.y.set(sy / shards.length)
      })
    }

    Matter.Events.on(engine, 'afterUpdate', onAfterUpdate)

    bodiesRef.current.forEach((body) => {
      const m = positions.get(body.label)
      if (m) {
        m.x.set(body.position.x)
        m.y.set(body.position.y)
      }
    })

    return () => {
      Matter.Events.off(engine, 'beforeUpdate', onBeforeUpdate)
      Matter.Events.off(engine, 'afterUpdate', onAfterUpdate)
      Matter.Runner.stop(runner)
      Matter.World.clear(world, false)
      Matter.Engine.clear(engine)
      engineRef.current = null
      runnerRef.current = null
      bodiesRef.current = new Map()
      bursts.clear()
      driftSeedsRef.current = new Map()
      shardMotionsRef.current = new Map()
      burstStatesRef.current = new Map()
      clusterBoostRef.current = null
    }
  }, [bursts, burstProgress, height, nodes, positions, width])

  useEffect(() => {
    if (!width || !height || nodes.length === 0) return

    const engine = engineRef.current
    const runner = runnerRef.current
    if (!engine || !runner) return

    if (isActive) {
      Matter.Runner.run(runner, engine)
    } else {
      Matter.Runner.stop(runner)
    }
  }, [height, isActive, nodes.length, width])

  useEffect(() => {
    if (!isActive) return
    if (!engineRef.current) return
    engineRef.current.gravity.x = 0
    engineRef.current.gravity.y = 0
  }, [isActive])

  useEffect(() => {
    if (isActive) return

    const engine = engineRef.current
    if (!engine) {
      bursts.clear()
      burstStatesRef.current = new Map()
      shardMotionsRef.current = new Map()
      burstProgress.forEach((p) => p.set(0))
      bump((v) => v + 1)
      return
    }

    const world = engine.world
    burstStatesRef.current.forEach((state, parentId) => {
      state.shardBodies.forEach((shard) => {
        Matter.World.remove(world, shard)
        bodiesRef.current.delete(shard.label)
        driftSeedsRef.current.delete(shard.label)
        shardMotionsRef.current.delete(shard.label)
      })

      Matter.World.add(world, state.originalBody)
      bodiesRef.current.set(parentId, state.originalBody)
      driftSeedsRef.current.set(parentId, state.originalSeed)
      burstProgress.get(parentId)?.set(0)
    })

    bursts.clear()
    burstStatesRef.current = new Map()
    bump((v) => v + 1)
  }, [bursts, burstProgress, isActive])

  const flick = useCallback((id: string, velocity: { x: number; y: number }) => {
    const body = bodiesRef.current.get(id)
    if (!body) return

    const vx0 = Number.isFinite(velocity.x) ? velocity.x : 0
    const vy0 = Number.isFinite(velocity.y) ? velocity.y : 0
    const speed0 = Math.hypot(vx0, vy0)
    if (speed0 <= 0) return

    const maxSpeed = 2200
    const clampMul = speed0 > maxSpeed ? maxSpeed / speed0 : 1
    const vx = vx0 * clampMul
    const vy = vy0 * clampMul

    const dvScale = 0.012
    let dvx = vx * dvScale
    let dvy = vy * dvScale

    const dvMag = Math.hypot(dvx, dvy)
    const maxDv = 18
    if (dvMag > maxDv) {
      const mul = maxDv / dvMag
      dvx *= mul
      dvy *= mul
    }

    Matter.Body.setVelocity(body, {
      x: body.velocity.x + dvx,
      y: body.velocity.y + dvy,
    })

    const spin = (dvx * 0.03 + dvy * -0.02) * (Math.random() < 0.5 ? -1 : 1)
    Matter.Body.setAngularVelocity(body, body.angularVelocity + spin)

    const origin = body.position
    const influence = Math.max(220, Math.min(520, (body.circleRadius ?? 60) * 9))
    const shockMax = Math.min(5.2, 1.4 + speed0 / 900)

    bodiesRef.current.forEach((other) => {
      if (other === body) return
      const dx = other.position.x - origin.x
      const dy = other.position.y - origin.y
      const dist = Math.hypot(dx, dy)
      if (dist <= 1 || dist > influence) return

      const falloff = 1 - dist / influence
      const kick = shockMax * falloff
      const nx = dx / dist
      const ny = dy / dist

      Matter.Body.setVelocity(other, {
        x: other.velocity.x + nx * kick,
        y: other.velocity.y + ny * kick,
      })
    })

    clusterBoostRef.current = {
      startMs: performance.now(),
      durationMs: 900,
      strength: Math.min(1, speed0 / 1200),
    }
  }, [])

  const burst = useCallback(
    (id: string, point?: { x: number; y: number }) => {
      const engine = engineRef.current
      if (!engine) return

      const world = engine.world
      const nowMs = performance.now()

      const existing = burstStatesRef.current.get(id)
      if (existing) {
        existing.mergeStartMs = nowMs + 2300
        existing.mergeDurationMs = 850
        existing.phase = 'burst'
        animate(existing.alpha, 1, { duration: 0.2, ease: [0.2, 0, 0, 1] })
        burstProgress.get(id)?.set(1)

        const shards = existing.shardBodies
        let sx = 0
        let sy = 0
        for (const s of shards) {
          sx += s.position.x
          sy += s.position.y
        }
        const cx = shards.length ? sx / shards.length : width / 2
        const cy = shards.length ? sy / shards.length : height / 2

        const biasAngle = point ? Math.atan2(cy - point.y, cx - point.x) : null
        shards.forEach((shard) => {
          const a = biasAngle === null ? Math.random() * Math.PI * 2 : biasAngle + (Math.random() - 0.5) * 1.6
          const speed = 3.5 + Math.random() * 4.5
          Matter.Body.setVelocity(shard, {
            x: shard.velocity.x + Math.cos(a) * speed,
            y: shard.velocity.y + Math.sin(a) * speed,
          })
        })
        return
      }

      const body = bodiesRef.current.get(id)
      if (!body) return

      const p = burstProgress.get(id)
      if (p) animate(p, 1, { duration: 0.16, ease: [0.2, 0, 0, 1] })

      const originalSeed = driftSeedsRef.current.get(id) ?? { a: Math.random() * Math.PI * 2, b: Math.random() * Math.PI * 2 }
      driftSeedsRef.current.delete(id)

      const alpha = motionValue(1)
      const burstId = burstCounterRef.current++

      const r0 = body.circleRadius ?? 60
      const count = Math.max(14, Math.min(26, Math.round(r0 / 5)))
      const baseR = (r0 / Math.sqrt(count)) * 0.92

      const shardBodies: Matter.Body[] = []
      const shards: BurstShard[] = []
      for (let i = 0; i < count; i += 1) {
        const jitter = 0.72 + Math.random() * 0.58
        const r = Math.max(7, baseR * jitter)
        const label = `${id}__shard_${burstId}_${i}`

        const a0 = Math.random() * Math.PI * 2
        const j = Math.random() * r0 * 0.12
        const x = body.position.x + Math.cos(a0) * j
        const y = body.position.y + Math.sin(a0) * j

        const shard = Matter.Bodies.circle(x, y, r, {
          label,
          frictionAir: 0.02,
          restitution: 0.86,
          density: 0.00095,
        })

        const biasAngle = point ? Math.atan2(body.position.y - point.y, body.position.x - point.x) : null
        const a = biasAngle === null ? Math.random() * Math.PI * 2 : biasAngle + (Math.random() - 0.5) * 1.8
        const speed = 4.2 + Math.random() * 6.2 + r0 / 36
        Matter.Body.setVelocity(shard, {
          x: body.velocity.x + Math.cos(a) * speed,
          y: body.velocity.y + Math.sin(a) * speed,
        })
        Matter.Body.setAngularVelocity(shard, (Math.random() - 0.5) * 0.35)

        shardBodies.push(shard)
        bodiesRef.current.set(label, shard)
        driftSeedsRef.current.set(label, { a: Math.random() * Math.PI * 2, b: Math.random() * Math.PI * 2 })

        const mvx = motionValue(body.position.x - r)
        const mvy = motionValue(body.position.y - r)
        shardMotionsRef.current.set(label, { x: mvx, y: mvy, radius: r })
        shards.push({ id: label, radius: r, x: mvx, y: mvy })
      }

      Matter.World.remove(world, body)
      bodiesRef.current.delete(id)
      Matter.World.add(world, shardBodies)

      bursts.set(id, { shards, alpha })
      burstStatesRef.current.set(id, {
        parentId: id,
        originalBody: body,
        originalSeed,
        shardBodies,
        mergeStartMs: nowMs + 2300,
        mergeDurationMs: 850,
        phase: 'burst',
        alpha,
      })

      bump((v) => v + 1)
    },
    [burstProgress, bursts, height, width]
  )

  return useMemo(
    () => ({ positions, flick, burst, bursts, burstProgress }),
    [burst, burstProgress, bursts, flick, positions]
  )
}
