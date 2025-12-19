import { useState, useEffect } from 'react'

/**
 * Hook to detect if the user prefers reduced motion.
 * Uses the `prefers-reduced-motion` media query.
 * 
 * @returns true if the user prefers reduced motion, false otherwise
 * 
 * **Validates: Requirements 3.1, 3.2**
 */
export function useReducedMotion(): boolean {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(() => {
    // Check if window is available (SSR safety)
    if (typeof window === 'undefined') return false
    if (typeof window.matchMedia !== 'function') return false
    
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    return mediaQuery.matches
  })

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return

    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    
    const handleChange = (event: MediaQueryListEvent) => {
      setPrefersReducedMotion(event.matches)
    }

    // Add listener for changes
    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', handleChange)

      return () => {
        mediaQuery.removeEventListener('change', handleChange)
      }
    }

    mediaQuery.addListener(handleChange)

    return () => {
      mediaQuery.removeListener(handleChange)
    }
  }, [])

  return prefersReducedMotion
}

/**
 * Get animation configuration based on reduced motion preference.
 * 
 * @param prefersReducedMotion - Whether the user prefers reduced motion
 * @param normalDuration - Normal animation duration in ms
 * @param normalDelay - Normal animation delay in ms
 * @returns Animation config with duration and delay
 */
export function getAnimationConfig(
  prefersReducedMotion: boolean,
  normalDuration: number = 500,
  normalDelay: number = 0
): { duration: number; delay: number } {
  if (prefersReducedMotion) {
    return { duration: 0, delay: 0 }
  }
  return { duration: normalDuration, delay: normalDelay }
}
