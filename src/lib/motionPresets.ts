export const standardEase: [number, number, number, number] = [0.16, 1, 0.3, 1]
export const expressiveEase: [number, number, number, number] = [0.2, 0, 0, 1]

export const quickFade = {
  duration: 0.18,
  ease: standardEase,
}

export const screenTransition = {
  duration: 0.22,
  ease: standardEase,
}

export const softSpring = {
  type: 'spring' as const,
  stiffness: 520,
  damping: 38,
  mass: 0.8,
}

export const navSpring = {
  type: 'spring' as const,
  stiffness: 560,
  damping: 42,
  mass: 0.7,
}
