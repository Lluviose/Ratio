type MatterModule = typeof import('matter-js')
let pending: Promise<MatterModule> | undefined

/** Native startup and the bubble view share one import of the physics engine. */
export function loadMatter(): Promise<MatterModule> {
  pending ??= import('matter-js').catch((error: unknown) => {
    pending = undefined
    throw error
  })
  return pending
}
