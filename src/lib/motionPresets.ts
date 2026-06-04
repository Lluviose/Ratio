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

export const cardEntranceTransition = {
  duration: 0.28,
  ease: standardEase,
}

export const progressFillTransition = {
  duration: 0.5,
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

export const fadeUpInitial = {
  opacity: 0,
  y: 10,
}

export const fadeUpAnimate = {
  opacity: 1,
  y: 0,
}

export const cardEntranceInitial = {
  opacity: 0,
  y: 12,
  scale: 0.98,
}

export const cardEntranceAnimate = {
  opacity: 1,
  y: 0,
  scale: 1,
}

export const scaleInInitial = {
  opacity: 0,
  scale: 0.95,
}

export const scaleInAnimate = {
  opacity: 1,
  scale: 1,
}
