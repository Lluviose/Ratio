import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import {
  easeOutQuart,
  easeOutCubic,
  RippleManager,
  RIPPLE_CONFIG,
} from '../RippleCanvas'
import type { BubbleNode } from '../BubbleChartPhysics'

// ============================================================================
// Property Tests for Easing Functions
// **Feature: bubble-ripple-effect, Property: Easing function boundary values**
// **Validates: Requirements 3.2**
// ============================================================================

describe('Easing Functions', () => {
  describe('easeOutQuart', () => {
    it('should return 0 when t = 0', () => {
      expect(easeOutQuart(0)).toBe(0)
    })

    it('should return 1 when t = 1', () => {
      expect(easeOutQuart(1)).toBe(1)
    })

    it('should be monotonically increasing for t in [0, 1]', () => {
      fc.assert(
        fc.property(
          fc.tuple(
            fc.float({ min: 0, max: 1, noNaN: true }),
            fc.float({ min: 0, max: 1, noNaN: true })
          ),
          ([t1, t2]) => {
            if (t1 <= t2) {
              return easeOutQuart(t1) <= easeOutQuart(t2)
            }
            return easeOutQuart(t1) >= easeOutQuart(t2)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('should return values in [0, 1] for inputs in [0, 1]', () => {
      fc.assert(
        fc.property(fc.float({ min: 0, max: 1, noNaN: true }), (t) => {
          const result = easeOutQuart(t)
          return result >= 0 && result <= 1
        }),
        { numRuns: 100 }
      )
    })
  })

  describe('easeOutCubic', () => {
    it('should return 0 when t = 0', () => {
      expect(easeOutCubic(0)).toBe(0)
    })

    it('should return 1 when t = 1', () => {
      expect(easeOutCubic(1)).toBe(1)
    })

    it('should be monotonically increasing for t in [0, 1]', () => {
      fc.assert(
        fc.property(
          fc.tuple(
            fc.float({ min: 0, max: 1, noNaN: true }),
            fc.float({ min: 0, max: 1, noNaN: true })
          ),
          ([t1, t2]) => {
            if (t1 <= t2) {
              return easeOutCubic(t1) <= easeOutCubic(t2)
            }
            return easeOutCubic(t1) >= easeOutCubic(t2)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('should return values in [0, 1] for inputs in [0, 1]', () => {
      fc.assert(
        fc.property(fc.float({ min: 0, max: 1, noNaN: true }), (t) => {
          const result = easeOutCubic(t)
          return result >= 0 && result <= 1
        }),
        { numRuns: 100 }
      )
    })
  })
})

// ============================================================================
// Property Tests for Ripple Creation
// **Feature: bubble-ripple-effect, Property 2: Ripple Count Matches Bubble Count**
// **Validates: Requirements 2.3**
// ============================================================================

describe('RippleManager - Ripple Creation', () => {
  // Helper to create a mock canvas context
  const createMockContext = () =>
    ({
      clearRect: () => {},
      beginPath: () => {},
      arc: () => {},
      stroke: () => {},
      strokeStyle: '',
      lineWidth: 0,
    }) as unknown as CanvasRenderingContext2D

  // Generator for valid bubble nodes
  const bubbleNodeArb = fc.record({
    id: fc.string({ minLength: 1, maxLength: 10 }),
    radius: fc.float({ min: 10, max: 200, noNaN: true }),
    color: fc.constantFrom('#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff'),
    label: fc.string({ minLength: 1, maxLength: 20 }),
    value: fc.float({ min: 0, max: 1000000, noNaN: true }),
  })

  // Generator for bubble node arrays with unique IDs
  const bubbleNodesArb = fc
    .array(bubbleNodeArb, { minLength: 1, maxLength: 10 })
    .map((nodes) => {
      // Ensure unique IDs
      const seen = new Set<string>()
      return nodes.filter((n) => {
        if (seen.has(n.id)) return false
        seen.add(n.id)
        return true
      })
    })
    .filter((nodes) => nodes.length > 0)

  it('should create exactly N ripples for N bubbles with valid positions', () => {
    fc.assert(
      fc.property(bubbleNodesArb, (nodes) => {
        const manager = new RippleManager()
        manager.init(createMockContext(), 800, 600)

        // Create positions map
        const positions = new Map<string, { x: number; y: number }>()
        nodes.forEach((node) => {
          positions.set(node.id, { x: 100, y: 100 })
        })

        manager.createRipples(nodes as BubbleNode[], positions)
        const ripples = manager.getRipples()

        return ripples.length === nodes.length
      }),
      { numRuns: 100 }
    )
  })

  // **Feature: bubble-ripple-effect, Property 3: Ripple Position Matches Bubble Position**
  // **Validates: Requirements 2.2**
  it('should center ripples at bubble positions', () => {
    fc.assert(
      fc.property(
        bubbleNodesArb,
        fc.array(
          fc.record({
            x: fc.float({ min: 0, max: 800, noNaN: true }),
            y: fc.float({ min: 0, max: 600, noNaN: true }),
          }),
          { minLength: 10, maxLength: 10 }
        ),
        (nodes, posArray) => {
          const manager = new RippleManager()
          manager.init(createMockContext(), 800, 600)

          // Create positions map
          const positions = new Map<string, { x: number; y: number }>()
          nodes.forEach((node, i) => {
            const pos = posArray[i % posArray.length]
            positions.set(node.id, pos)
          })

          manager.createRipples(nodes as BubbleNode[], positions)
          const ripples = manager.getRipples()

          // Verify each ripple position matches its bubble position
          return ripples.every((ripple, i) => {
            const node = nodes[i]
            const expectedPos = positions.get(node.id)
            if (!expectedPos) return false
            return ripple.x === expectedPos.x && ripple.y === expectedPos.y
          })
        }
      ),
      { numRuns: 100 }
    )
  })

  // **Feature: bubble-ripple-effect, Property 4: Ripple Amplitude Proportional to Bubble Size**
  // **Validates: Requirements 2.1**
  it('should create larger maxRadius for larger bubbles', () => {
    fc.assert(
      fc.property(
        fc.float({ min: 20, max: 100, noNaN: true }),
        fc.float({ min: 101, max: 200, noNaN: true }),
        (smallRadius, largeRadius) => {
          const manager = new RippleManager()
          manager.init(createMockContext(), 800, 600)

          const nodes: BubbleNode[] = [
            {
              id: 'small',
              radius: smallRadius,
              color: '#ff0000',
              label: 'Small',
              value: 100,
            },
            {
              id: 'large',
              radius: largeRadius,
              color: '#00ff00',
              label: 'Large',
              value: 200,
            },
          ]

          const positions = new Map<string, { x: number; y: number }>()
          positions.set('small', { x: 100, y: 100 })
          positions.set('large', { x: 200, y: 200 })

          manager.createRipples(nodes, positions)
          const ripples = manager.getRipples()

          const smallRipple = ripples.find((r) => r.baseAmplitude === smallRadius)
          const largeRipple = ripples.find((r) => r.baseAmplitude === largeRadius)

          if (!smallRipple || !largeRipple) return false

          // Larger bubble should have larger maxRadius
          const smallMaxRadius = smallRipple.rings[0].maxRadius
          const largeMaxRadius = largeRipple.rings[0].maxRadius

          return largeMaxRadius > smallMaxRadius
        }
      ),
      { numRuns: 100 }
    )
  })

  // **Feature: bubble-ripple-effect, Property 1: Single Trigger Per Entry**
  // **Validates: Requirements 1.2**
  it('should only create ripples once per activation', () => {
    const manager = new RippleManager()
    manager.init(createMockContext(), 800, 600)

    const nodes: BubbleNode[] = [
      { id: 'test', radius: 50, color: '#ff0000', label: 'Test', value: 100 },
    ]
    const positions = new Map<string, { x: number; y: number }>()
    positions.set('test', { x: 100, y: 100 })

    // First call should create ripples
    manager.createRipples(nodes, positions)
    expect(manager.getRipples().length).toBe(1)

    // Second call should not create more ripples
    manager.createRipples(nodes, positions)
    expect(manager.getRipples().length).toBe(1)

    // After reset, should create ripples again
    manager.resetTrigger()
    manager.createRipples(nodes, positions)
    expect(manager.getRipples().length).toBe(1)
  })

  // **Feature: bubble-ripple-effect, Property 7: Complete Cleanup After Animation**
  // **Validates: Requirements 3.4, 4.3**
  it('should have no ripples after cleanup', () => {
    const manager = new RippleManager()
    manager.init(createMockContext(), 800, 600)

    const nodes: BubbleNode[] = [
      { id: 'test', radius: 50, color: '#ff0000', label: 'Test', value: 100 },
    ]
    const positions = new Map<string, { x: number; y: number }>()
    positions.set('test', { x: 100, y: 100 })

    manager.createRipples(nodes, positions)
    expect(manager.getRipples().length).toBe(1)

    manager.cleanup()
    expect(manager.getRipples().length).toBe(0)
  })

  // **Feature: bubble-ripple-effect, Property 8: Animation Duration Bound**
  // **Validates: Requirements 5.3**
  it('should have total duration <= 2000ms', () => {
    const totalDuration = RippleManager.getTotalDuration()
    expect(totalDuration).toBeLessThanOrEqual(2000)
  })

  it('should skip bubbles with invalid positions', () => {
    const manager = new RippleManager()
    manager.init(createMockContext(), 800, 600)

    const nodes: BubbleNode[] = [
      { id: 'valid', radius: 50, color: '#ff0000', label: 'Valid', value: 100 },
      {
        id: 'invalid',
        radius: 50,
        color: '#00ff00',
        label: 'Invalid',
        value: 100,
      },
    ]
    const positions = new Map<string, { x: number; y: number }>()
    positions.set('valid', { x: 100, y: 100 })
    positions.set('invalid', { x: NaN, y: 100 })

    manager.createRipples(nodes, positions)
    expect(manager.getRipples().length).toBe(1)
  })

  it('should skip bubbles with zero or negative radius', () => {
    const manager = new RippleManager()
    manager.init(createMockContext(), 800, 600)

    const nodes: BubbleNode[] = [
      { id: 'valid', radius: 50, color: '#ff0000', label: 'Valid', value: 100 },
      { id: 'zero', radius: 0, color: '#00ff00', label: 'Zero', value: 100 },
      {
        id: 'negative',
        radius: -10,
        color: '#0000ff',
        label: 'Negative',
        value: 100,
      },
    ]
    const positions = new Map<string, { x: number; y: number }>()
    positions.set('valid', { x: 100, y: 100 })
    positions.set('zero', { x: 200, y: 200 })
    positions.set('negative', { x: 300, y: 300 })

    manager.createRipples(nodes, positions)
    expect(manager.getRipples().length).toBe(1)
  })

  it('should create correct number of rings per ripple', () => {
    const manager = new RippleManager()
    manager.init(createMockContext(), 800, 600)

    const nodes: BubbleNode[] = [
      { id: 'test', radius: 50, color: '#ff0000', label: 'Test', value: 100 },
    ]
    const positions = new Map<string, { x: number; y: number }>()
    positions.set('test', { x: 100, y: 100 })

    manager.createRipples(nodes, positions)
    const ripples = manager.getRipples()

    expect(ripples[0].rings.length).toBe(RIPPLE_CONFIG.ringsPerRipple)
  })
})


// ============================================================================
// Property Tests for Animation Monotonicity
// ============================================================================

describe('RippleManager - Animation Monotonicity', () => {
  const createMockContext = () =>
    ({
      clearRect: () => {},
      beginPath: () => {},
      arc: () => {},
      stroke: () => {},
      strokeStyle: '',
      lineWidth: 0,
    }) as unknown as CanvasRenderingContext2D

  // **Feature: bubble-ripple-effect, Property 5: Monotonic Radius Expansion**
  // **Validates: Requirements 3.2**
  it('should have monotonically increasing radius over time', () => {
    fc.assert(
      fc.property(
        fc.float({ min: 30, max: 150, noNaN: true }),
        fc.array(fc.float({ min: 0, max: 1, noNaN: true }), {
          minLength: 5,
          maxLength: 20,
        }),
        (bubbleRadius, progressValues) => {
          const manager = new RippleManager()
          manager.init(createMockContext(), 800, 600)

          const nodes: BubbleNode[] = [
            {
              id: 'test',
              radius: bubbleRadius,
              color: '#ff0000',
              label: 'Test',
              value: 100,
            },
          ]
          const positions = new Map<string, { x: number; y: number }>()
          positions.set('test', { x: 400, y: 300 })

          manager.createRipples(nodes, positions)

          // Sort progress values to simulate time progression
          const sortedProgress = [...progressValues].sort((a, b) => a - b)

          // Track radius values for the first ring
          const radiusValues: number[] = []
          const baseTime = performance.now()

          for (const progress of sortedProgress) {
            const timestamp =
              baseTime + progress * RIPPLE_CONFIG.ringDuration
            manager.update(timestamp)
            const ripples = manager.getRipples()
            if (ripples.length > 0 && ripples[0].rings.length > 0) {
              radiusValues.push(ripples[0].rings[0].radius)
            }
          }

          // Verify monotonic increase
          for (let i = 1; i < radiusValues.length; i++) {
            if (radiusValues[i] < radiusValues[i - 1]) {
              return false
            }
          }
          return true
        }
      ),
      { numRuns: 100 }
    )
  })

  // **Feature: bubble-ripple-effect, Property 6: Monotonic Opacity Decay**
  // **Validates: Requirements 3.3**
  it('should have monotonically decreasing opacity over time', () => {
    fc.assert(
      fc.property(
        fc.float({ min: 30, max: 150, noNaN: true }),
        fc.array(fc.float({ min: 0, max: 1, noNaN: true }), {
          minLength: 5,
          maxLength: 20,
        }),
        (bubbleRadius, progressValues) => {
          const manager = new RippleManager()
          manager.init(createMockContext(), 800, 600)

          const nodes: BubbleNode[] = [
            {
              id: 'test',
              radius: bubbleRadius,
              color: '#ff0000',
              label: 'Test',
              value: 100,
            },
          ]
          const positions = new Map<string, { x: number; y: number }>()
          positions.set('test', { x: 400, y: 300 })

          manager.createRipples(nodes, positions)

          // Sort progress values to simulate time progression
          const sortedProgress = [...progressValues].sort((a, b) => a - b)

          // Track opacity values for the first ring
          const opacityValues: number[] = []
          const baseTime = performance.now()

          for (const progress of sortedProgress) {
            const timestamp =
              baseTime + progress * RIPPLE_CONFIG.ringDuration
            manager.update(timestamp)
            const ripples = manager.getRipples()
            if (ripples.length > 0 && ripples[0].rings.length > 0) {
              opacityValues.push(ripples[0].rings[0].opacity)
            }
          }

          // Verify monotonic decrease (opacity should never increase)
          for (let i = 1; i < opacityValues.length; i++) {
            if (opacityValues[i] > opacityValues[i - 1]) {
              return false
            }
          }
          return true
        }
      ),
      { numRuns: 100 }
    )
  })
})
