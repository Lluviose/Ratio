import { createElement, lazy, type ComponentType } from 'react'

/** Share preload and render promises; warm components render without suspending. */
export function preloadableComponent<Props extends object>(loader: () => Promise<{ default: ComponentType<Props> }>) {
  let resolved: ComponentType<Props> | undefined
  let pending: ReturnType<typeof loader> | undefined
  const preload = () => {
    pending ??= loader().then((module) => {
      resolved = module.default
      return module
    }).catch((error: unknown) => {
      pending = undefined
      throw error
    })
    return pending
  }
  const LazyComponent = lazy(preload)
  function PreloadableComponent(props: Props) {
    return createElement(resolved ?? LazyComponent, props)
  }
  return { Component: PreloadableComponent, preload }
}
