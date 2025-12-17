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
  const [isReady, setIsReady] = useState(false)

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

      const x0 = hasPrev ? (prevX as number) : Math.random() * (width - 100) + 50
      const y0 = hasPrev ? (prevY as number) : Math.random() * (height - 100) + 50

      const x = Math.min(Math.max(x0, node.radius), width - node.radius)
      const y = Math.min(Math.max(y0, node.radius), height - node.radius)
      
      const body = Matter.Bodies.circle(x, y, node.radius, {
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
    Matter.Events.on(engine, 'beforeUpdate', () => {
       bodies.forEach(body => {
         // Gentle force towards center
         const dx = (width / 2) - body.position.x
         const dy = (height / 2) - body.position.y
         
         Matter.Body.applyForce(body, body.position, {
           x: dx * 0.00001,
           y: dy * 0.00001
         })
       })
    })

    const runner = Matter.Runner.create()
    runnerRef.current = runner
    
    // Sync Matter.js positions to MotionValues
    Matter.Events.on(engine, 'afterUpdate', () => {
       bodies.forEach(body => {
         const m = positions.get(body.label)
         if (m) {
           m.x.set(body.position.x)
           m.y.set(body.position.y)
         }
       })
    })

    bodies.forEach(body => {
      const m = positions.get(body.label)
      if (m) {
        m.x.set(body.position.x)
        m.y.set(body.position.y)
      }
    })

    setIsReady(true)

    return () => {
      setIsReady(false)
      Matter.Runner.stop(runner)
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

    const handleOrientation = (event: DeviceOrientationEvent) => {
        if (!engineRef.current) return
        
        // beta: front-back (-180 to 180)
        // gamma: left-right (-90 to 90)
        const { beta, gamma } = event
        if (beta === null || gamma === null) return

        // Map tilt to gravity/force
        // Clamp values to reasonable tilt range
        const x = Math.min(Math.max(gamma, -45), 45) / 45 // -1 to 1
        const y = Math.min(Math.max(beta, -45), 45) / 45 // -1 to 1

        engineRef.current.gravity.x = x * 0.5
        engineRef.current.gravity.y = y * 0.5
    }

    window.addEventListener('deviceorientation', handleOrientation)
    return () => window.removeEventListener('deviceorientation', handleOrientation)
  }, [isActive])

  return { positions, isReady }
}

