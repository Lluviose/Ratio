/**
 * Small shared robust-statistics helpers used by the savings pace engine and
 * the disposable-income estimator. Kept dependency-free so both lib modules
 * (and tests) can import without cycles.
 */

/** Median of an unsorted list; null for empty input. Does not mutate. */
export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}
