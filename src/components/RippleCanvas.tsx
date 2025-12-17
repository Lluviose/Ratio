import { useEffect, useRef } from 'react'
import type { BubbleNode } from './BubbleChartPhysics'
import type { MotionValue } from 'framer-motion'

interface RippleCanvasProps {
  isActive: boolean
  nodes: BubbleNode[]
  positions: Map<string, { x: MotionValue<number>; y: MotionValue<number> }>
  width: number
  height: number
}

export function RippleCanvas({ isActive, nodes, positions, width, height }: RippleCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const requestRef = useRef<number | null>(null)
  const hasTriggeredRef = useRef(false)
  
  // Simulation buffers
  // We use a lower resolution grid for physics to keep it fast
  // and scale it up during rendering or just render at lower res and let CSS scale it (smoother look)
  const meshRes = 128 // Grid resolution
  const buffersRef = useRef<{
    current: Float32Array
    prev: Float32Array
    damp: number
  }>({
    current: new Float32Array(meshRes * meshRes),
    prev: new Float32Array(meshRes * meshRes),
    damp: 0.985 // Damping factor (0.9 - 0.99)
  })

  // Initialize buffers
  useEffect(() => {
    buffersRef.current.current.fill(0)
  }, [])

  // Trigger Logic
  useEffect(() => {
    if (isActive && width > 0 && height > 0 && nodes.length > 0) {
      if (!hasTriggeredRef.current) {
        triggerSplashes()
        hasTriggeredRef.current = true
      }
      startLoop()
    } else if (!isActive) {
      hasTriggeredRef.current = false
      stopLoop()
      // Clear buffers to reset water state
      buffersRef.current.current.fill(0)
      buffersRef.current.prev.fill(0)
    }
    // Note: we don't stop loop if just width/height/nodes change while active, 
    // but usually they settle quickly.
    
    return () => {
        // Only stop loop on unmount. 
        // If deps change, we want to keep running if active.
        // But the else if (!isActive) handles the stop case for toggle.
        if (!isActive) stopLoop() 
    }
  }, [isActive, width, height, nodes.length])

  const triggerSplashes = () => {
    if (width === 0 || height === 0) return

    // Add splashes based on nodes
    nodes.forEach(node => {
      const pos = positions.get(node.id)
      if (!pos) return
      
      const bx = pos.x.get()
      const by = pos.y.get()
      
      // Map to grid coordinates
      const gx = Math.floor((bx / width) * meshRes)
      const gy = Math.floor((by / height) * meshRes)
      
      // Impact radius proportional to node radius
      // Scale down a bit for the grid
      const radius = Math.max(2, (node.radius / width) * meshRes)
      
      // Dynamic strength based on size
      // Larger bubbles make deeper splashes
      const baseStrength = -500
      const sizeFactor = node.radius / 50 // Normalize around a standard size
      const randomVar = 0.8 + Math.random() * 0.4 // 0.8 - 1.2
      const strength = baseStrength * sizeFactor * randomVar
      
      addDrop(gx, gy, radius, strength)
    })
  }

  const addDrop = (x: number, y: number, radius: number, strength: number) => {
    const { current } = buffersRef.current
    const r2 = radius * radius
    
    const minX = Math.max(0, Math.floor(x - radius))
    const maxX = Math.min(meshRes - 1, Math.ceil(x + radius))
    const minY = Math.max(0, Math.floor(y - radius))
    const maxY = Math.min(meshRes - 1, Math.ceil(y + radius))

    for (let j = minY; j <= maxY; j++) {
      for (let i = minX; i <= maxX; i++) {
        const dx = x - i
        const dy = y - j
        const d2 = dx * dx + dy * dy
        
        if (d2 <= r2) {
            // Smooth falloff (cosine or gaussian)
            const falloff = Math.pow((1 - d2 / r2), 2)
            current[j * meshRes + i] -= strength * falloff
        }
      }
    }
  }

  const startLoop = () => {
    if (!requestRef.current) {
      requestRef.current = requestAnimationFrame(animate)
    }
  }

  const stopLoop = () => {
    if (requestRef.current) {
      cancelAnimationFrame(requestRef.current)
      requestRef.current = null
    }
  }

  const animate = () => {
    updatePhysics()
    draw()
    requestRef.current = requestAnimationFrame(animate)
  }

  const updatePhysics = () => {
    const { current, prev, damp } = buffersRef.current
    
    // Standard ripple algorithm
    // New[i][j] = (Prev[i-1][j] + Prev[i+1][j] + Prev[i][j-1] + Prev[i][j+1]) / 2 - New[i][j]
    // optimized with 1D array
    
    for (let y = 1; y < meshRes - 1; y++) {
      for (let x = 1; x < meshRes - 1; x++) {
        const idx = y * meshRes + x
        const val = (
          prev[idx - 1] + 
          prev[idx + 1] + 
          prev[idx - meshRes] + 
          prev[idx + meshRes]
        ) / 2 - current[idx]
        
        current[idx] = val * damp
      }
    }

    // Swap buffers
    // Instead of allocating new arrays, we just swap the references in our wrapper
    // But since we destructured, we need to actually copy or swap. 
    // Float32Array sets are fast. Or just swap pointers in the ref.
    
    const temp = buffersRef.current.prev
    buffersRef.current.prev = buffersRef.current.current
    buffersRef.current.current = temp
  }

  const imageBufferRef = useRef<ImageData | null>(null)

  const draw = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Create or reuse ImageData
    if (!imageBufferRef.current) {
        imageBufferRef.current = ctx.createImageData(meshRes, meshRes)
    }
    const imgData = imageBufferRef.current
    const data = imgData.data
    const { current } = buffersRef.current

    // Lighting config
    // Light coming from top-left
    const lx = -1
    const ly = -1
    const lz = 2 
    // Normalize light
    const lLen = Math.sqrt(lx*lx + ly*ly + lz*lz)
    const nlx = lx / lLen
    const nly = ly / lLen
    const nlz = lz / lLen

    for (let y = 0; y < meshRes; y++) {
      for (let x = 0; x < meshRes; x++) {
        const idx = y * meshRes + x
        const val = current[idx]
        
        // Calculate normal
        // x-gradient
        const x1 = x > 0 ? current[idx - 1] : val
        const x2 = x < meshRes - 1 ? current[idx + 1] : val
        const dx = x1 - x2 // reversed because ... slope

        // y-gradient
        const y1 = y > 0 ? current[idx - meshRes] : val
        const y2 = y < meshRes - 1 ? current[idx + meshRes] : val
        const dy = y1 - y2

        // Normal vector (dx, dy, 1) - actually scaling needed?
        // Let's assume height is significant
        const nx = dx
        const ny = dy
        const nz = 16 // Tunable 'smoothness' factor. Higher = flatter surface
        
        const nLen = Math.sqrt(nx*nx + ny*ny + nz*nz)
        const nnx = nx / nLen
        const nny = ny / nLen
        const nnz = nz / nLen

        // Dot product with light
        let intensity = nnx * nlx + nny * nly + nnz * nlz
        
        // Specular (reflection) - simple Blinn-Phong approx or just intensity power
        // Water is specular.
        // If intensity is high, it's a highlight.
        // If it's low, it's shadow.
        
        // Base alpha
        let alpha = 0
        let r = 255
        let g = 255
        let b = 255
        
        // Highlight
        if (intensity > 0.8) {
             alpha = (intensity - 0.8) * 5 * 255 // Scale 0-1 to alpha
             r = 255; g = 255; b = 255; // White highlight
        } else if (intensity < 0.5) {
             // Shadow
             alpha = (0.5 - intensity) * 2 * 100
             r = 0; g = 0; b = 20; // Dark blue shadow
        }

        const pxIdx = idx * 4
        data[pxIdx] = r
        data[pxIdx + 1] = g
        data[pxIdx + 2] = b
        data[pxIdx + 3] = Math.min(255, Math.max(0, alpha))
      }
    }
    
    ctx.putImageData(imgData, 0, 0)
  }

  return (
    <canvas
      ref={canvasRef}
      width={meshRes}
      height={meshRes}
      className="absolute inset-0 w-full h-full pointer-events-none opacity-90"
      style={{ 
        imageRendering: 'auto', // Linear interpolation by CSS will smooth the low-res mesh
        filter: 'blur(0.5px)' // Slight blur for smoothness
      }} 
    />
  )
}
