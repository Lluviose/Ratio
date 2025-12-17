import { type MotionValue } from 'framer-motion'
import { useEffect, useRef } from 'react'
import type { BubbleNode } from './BubbleChartPhysics'

export function CanvasRipples({ 
    isActive, 
    nodes, 
    positions 
}: { 
    isActive: boolean
    nodes: BubbleNode[]
    positions: Map<string, { x: MotionValue<number>; y: MotionValue<number> }>
}) {
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const requestRef = useRef<number | null>(null)
    const ripplesRef = useRef<Array<{
        x: number
        y: number
        initialR: number // Bubble radius
        currentR: number // Current wave radius
        opacity: number
        speed: number
        width: number
    }>>([])

    // Initialize ripples on entry
    useEffect(() => {
        if (isActive) {
            // Short delay to let physics settle slightly
            const timer = setTimeout(() => {
                const newRipples: typeof ripplesRef.current = []
                
                nodes.forEach(node => {
                    const pos = positions.get(node.id)
                    if (!pos) return
                    const x = pos.x.get()
                    const y = pos.y.get()
                    // Filter out uninitialized positions
                    if (x === 0 && y === 0) return

                    // Primary Wave
                    newRipples.push({
                        x,
                        y,
                        initialR: node.radius,
                        currentR: node.radius, // Start exactly at edge
                        opacity: 0.8, 
                        speed: 1.2 + Math.random() * 0.8, // Slightly varying speed
                        width: 40 + node.radius * 0.2 // Base width related to bubble size
                    })
                })

                ripplesRef.current = newRipples
                startAnimation()
            }, 100)

            return () => clearTimeout(timer)
        } else {
            // Reset when inactive
            ripplesRef.current = []
            if (requestRef.current !== null) {
                cancelAnimationFrame(requestRef.current)
                requestRef.current = null
            }
            const canvas = canvasRef.current
            if (canvas) {
                const ctx = canvas.getContext('2d')
                ctx?.clearRect(0, 0, canvas.width, canvas.height)
            }
        }
    }, [isActive, nodes, positions])

    const startAnimation = () => {
        if (requestRef.current !== null) cancelAnimationFrame(requestRef.current)
        
        const animate = () => {
            const canvas = canvasRef.current
            if (!canvas) return

            const ctx = canvas.getContext('2d')
            if (!ctx) return

            // Handle DPI
            const dpr = window.devicePixelRatio || 1
            const rect = canvas.getBoundingClientRect()
            
            // Check if resize needed
            if (canvas.width !== rect.width * dpr || canvas.height !== rect.height * dpr) {
                canvas.width = rect.width * dpr
                canvas.height = rect.height * dpr
                ctx.scale(dpr, dpr)
            } else {
                ctx.clearRect(0, 0, rect.width, rect.height)
            }

            // Update and draw ripples
            let activeCount = 0
            
            ripplesRef.current.forEach(ripple => {
                ripple.currentR += ripple.speed
                // Gentle friction
                ripple.speed *= 0.99
                
                // Dispersion: Wave gets wider as it travels out
                // Grows significantly to simulate volume displacement
                ripple.width += 0.5 
                
                // Fade out logic
                // Max spread is relative to bubble size but large
                const maxSpread = ripple.initialR * 4 + 400
                const progress = (ripple.currentR - ripple.initialR) / maxSpread
                
                // Opacity curve: 
                // 0.0 -> 0.1: Fade in
                // 0.1 -> 0.5: Sustain
                // 0.5 -> 1.0: Fade out
                if (progress < 0.1) {
                    ripple.opacity = progress * 10
                } else if (progress > 0.5) {
                    ripple.opacity = 1 - ((progress - 0.5) / 0.5)
                }
                
                if (ripple.opacity <= 0.01) return
                
                activeCount++

                const x = ripple.x
                const y = ripple.y
                const r = ripple.currentR
                const w = ripple.width

                ctx.save()
                
                // Create a "Water Ridge" gradient
                // We draw a ring from innerR to outerR
                // STRICT MASKING: Ensure innerR is never less than initialR (bubble edge)
                // This ensures the ripple appears to emerge from the bubble, not underneath it
                const innerR = Math.max(ripple.initialR, r)
                const outerR = innerR + w

                const grad = ctx.createRadialGradient(x, y, innerR, x, y, outerR)
                
                const alpha = Math.max(0, Math.min(1, ripple.opacity))
                
                // Water surface gradient model:
                // 0% (Inner Edge): Transparent (starts at bubble edge)
                // 20% : Deep Shadow (The trough right next to the displacement)
                // 50% : Neutral
                // 80% : Highlight (The crest)
                // 100% (Outer Edge): Transparent
                
                // Subtle, organic colors
                grad.addColorStop(0, `rgba(255,255,255,0)`)
                grad.addColorStop(0.2, `rgba(0,10,30,${alpha * 0.08})`) // Soft shadow
                grad.addColorStop(0.6, `rgba(255,255,255,${alpha * 0.25})`) // Soft highlight
                grad.addColorStop(1, `rgba(255,255,255,0)`)

                ctx.fillStyle = grad
                
                // Draw annulus
                ctx.beginPath()
                ctx.arc(x, y, outerR, 0, Math.PI * 2)
                ctx.arc(x, y, innerR, Math.PI * 2, 0, true) // Counter-clockwise to cut hole
                ctx.fill()
                
                ctx.restore()
            })

            if (activeCount > 0) {
                requestRef.current = requestAnimationFrame(animate)
            }
        }
        
        requestRef.current = requestAnimationFrame(animate)
    }

    return (
        <canvas 
            ref={canvasRef}
            className="absolute inset-0 pointer-events-none z-0"
            style={{ width: '100%', height: '100%' }}
        />
    )
}
