import { useEffect, useRef, useState } from 'react'
import * as Matter from 'matter-js'
import { motionValue, type MotionValue } from 'framer-motion'

export type BubbleNode = {
  id: string
  radius: number
  color: string
  label: string
  value: number
}

export function useBubblePhysics(
  nodes: BubbleNode[],
  width: number,
  height: number,
  isActive: boolean
) {
  // MotionValues for each node's position [x, y]
  // Use useState lazy init for stable map reference without ref-access-during-render lint issues
  const [positions] = useState(() => new Map<string, { x: MotionValue<number>; y: MotionValue<number> }>())

  // Ensure all nodes have MotionValues
  // We do this in render to ensure they exist before children need them
  nodes.forEach(node => {
      if (!positions.has(node.id)) {
        positions.set(node.id, {
          x: motionValue(width / 2),
          y: motionValue(height / 2)
        })
      }
  })

  const engineRef = useRef<Matter.Engine | null>(null)
  const runnerRef = useRef<Matter.Runner | null>(null)
  const knownIdsRef = useRef(new Set<string>())

  useEffect(() => {
    if (!width || !height || nodes.length === 0) return

    const engine = Matter.Engine.create()
    const world = engine.world
    engine.gravity.y = 0 // No default gravity, we'll control it
    engine.gravity.x = 0

    // Create bodies
    const bodies = nodes.map(node => {
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
      
      const body = Matter.Bodies.circle(x, y, radius, {
        label: node.id,
        frictionAir: 0.02,
        restitution: 0.9,
        density: 0.001,
        render: { fillStyle: node.color }
      })
      return body
    })

    // Add boundaries
    const wallOptions = { isStatic: true, render: { visible: false } }
    const walls = [
      Matter.Bodies.rectangle(width / 2, -500, width * 2, 1000, wallOptions),
      Matter.Bodies.rectangle(width / 2, height + 500, width * 2, 1000, wallOptions),
      Matter.Bodies.rectangle(-500, height / 2, 1000, height * 2, wallOptions),
      Matter.Bodies.rectangle(width + 500, height / 2, 1000, height * 2, wallOptions)
    ]

    Matter.World.add(world, [...bodies, ...walls])
    engineRef.current = engine

    knownIdsRef.current = new Set(nodes.map((n) => n.id))

    // Attractor
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
      const centerK = 0.000015 + 0.000005 * pulse // Adjusted for higher friction
      const swirlK = 0.000001 * Math.cos(t * 0.25)

      bodies.forEach((body) => {
        const dx = cx - body.position.x
        const dy = cy - body.position.y

        Matter.Body.applyForce(body, body.position, {
          x: dx * centerK + (-dy) * swirlK,
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
    
    // Sync Matter.js positions to MotionValues
    const onAfterUpdate = () => {
       bodies.forEach(body => {
         const m = positions.get(body.label)
         if (m) {
           m.x.set(body.position.x)
           m.y.set(body.position.y)
         }
       })
    }

    Matter.Events.on(engine, 'afterUpdate', onAfterUpdate)

    bodies.forEach(body => {
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
    }
  }, [width, height, nodes, positions]) // Added nodes to deps

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
  }, [isActive, width, height, nodes])

  // Gyroscope / DeviceOrientation
  useEffect(() => {
    if (!isActive) return
    if (!engineRef.current) return
    engineRef.current.gravity.x = 0
    engineRef.current.gravity.y = 0
  }, [isActive])

  return positions
}
