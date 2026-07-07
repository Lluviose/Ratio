// AbortError 判定：fetch/AbortController 取消路径的统一守卫。
// 按 name 而非 instanceof DOMException 判定——个别运行时（jsdom、Node 侧
// polyfill）抛出的中止错误不是 DOMException，按 name 是更宽的安全集合。
export function isAbortError(err: unknown): boolean {
  return typeof err === 'object' && err !== null && Reflect.get(err, 'name') === 'AbortError'
}
