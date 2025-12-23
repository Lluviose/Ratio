import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as Matter from 'matter-js'
import { motionValue, type MotionValue } from 'framer-motion'

export type BubbleNode = {
  id: string
  radius: number
  color: string
  label: string
  value: number
}

export type BubblePosition = { x: MotionValue<number>; y: MotionValue<number> }

export type BubblePhysics = {
  positions: Map<string, BubblePosition>
  flick: (id: string, velocity: { x: number; y: number }) => void
}

type ClusterBoost = { startMs: number; durationMs: number; strength: number }

export function useBubblePhysics(
  nodes: BubbleNode[],
  width: number,
  height: number,
  isActive: boolean
): BubblePhysics {
  const [positions] = useState(() => new Map<string, BubblePosition>())

  nodes.forEach((node) => {
    if (positions.has(node.id)) return
    positions.set(node.id, {
      x: motionValue(width / 2),
      y: motionValue(height / 2),
    })
  })

  const engineRef = useRef<Matter.Engine | null>(null)
  const runnerRef = useRef<Matter.Runner | null>(null)
  const bodiesRef = useRef(new Map<string, Matter.Body>())
  const knownIdsRef = useRef(new Set<string>())
  const clusterBoostRef = useRef<ClusterBoost | null>(null)

  useEffect(() => {
    if (!width || !height || nodes.length === 0) return

    const engine = Matter.Engine.create()
    const world = engine.world
    engine.gravity.y = 0
    engine.gravity.x = 0

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
    clusterBoostRef.current = null

    const t0 = performance.now()
    const driftSeeds = new Map<string, { a: number; b: number }>()
    bodies.forEach((body) => {
      driftSeeds.set(body.label, { a: Math.random() * Math.PI * 2, b: Math.random() * Math.PI * 2 })
    })

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

      bodies.forEach((body) => {
        const dx = cx - body.position.x
        const dy = cy - body.position.y

        Matter.Body.applyForce(body, body.position, {
          x: dx * centerK + -dy * swirlK,
          y: dy * centerK + dx * swirlK,
        })

        const seed = driftSeeds.get(body.label)
        if (!seed) return

        const drift = 0.00012
        Matter.Body.applyForce(body, body.position, {
          x: Math.sin(t * 0.9 + seed.a) * drift,
          y: Math.cos(t * 1.1 + seed.b) * drift,
        })
      })
    }

    Matter.Events.on(engine, 'beforeUpdate', onBeforeUpdate)

    const runner = Matter.Runner.create()
    runnerRef.current = runner

    const onAfterUpdate = () => {
      bodies.forEach((body) => {
        const m = positions.get(body.label)
        if (m) {
          m.x.set(body.position.x)
          m.y.set(body.position.y)
        }
      })
    }

    Matter.Events.on(engine, 'afterUpdate', onAfterUpdate)

    bodies.forEach((body) => {
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
      clusterBoostRef.current = null
    }
  }, [height, nodes, positions, width])

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
  }, [height, isActive, nodes, width])

  useEffect(() => {
    if (!isActive) return
    if (!engineRef.current) return
    engineRef.current.gravity.x = 0
    engineRef.current.gravity.y = 0
  }, [isActive])

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

  return useMemo(() => ({ positions, flick }), [flick, positions])
}
