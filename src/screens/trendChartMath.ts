/** 趋势图 SVG 的纯几何计算：monotone 曲线插值与 y 轴整刻度。与组件分离以便单测与 fast refresh。 */

export type XY = { x: number; y: number }

function sign(x: number) {
  return x < 0 ? -1 : 1
}

/** d3 curveMonotoneX 的内点切线（Fritsch–Carlson） */
function slope3(p0: XY, p1: XY, p2: XY) {
  const h0 = p1.x - p0.x
  const h1 = p2.x - p1.x
  const s0 = (p1.y - p0.y) / (h0 || (h1 < 0 ? -0 : 0))
  const s1 = (p2.y - p1.y) / (h1 || (h0 < 0 ? -0 : 0))
  const p = (s0 * h1 + s1 * h0) / (h0 + h1)
  const m = (sign(s0) + sign(s1)) * Math.min(Math.abs(s0), Math.abs(s1), 0.5 * Math.abs(p))
  return Number.isFinite(m) ? m : 0
}

/** 端点切线 */
function slope2(p0: XY, p1: XY, t: number) {
  const h = p1.x - p0.x
  return h ? ((3 * (p1.y - p0.y)) / h - t) / 2 : t
}

export function monotonePath(points: XY[]) {
  if (points.length === 1) return `M${points[0].x},${points[0].y}`
  let d = `M${points[0].x},${points[0].y}`
  let t0 = 0
  for (let i = 1; i < points.length; i += 1) {
    const p0 = points[i - 1]
    const p1 = points[i]
    const t1 = i < points.length - 1 ? slope3(p0, p1, points[i + 1]) : slope2(p0, p1, t0)
    if (i === 1) t0 = slope2(p0, p1, t1)
    const dx = (p1.x - p0.x) / 3
    d += `C${p0.x + dx},${p0.y + dx * t0},${p1.x - dx},${p1.y - dx * t1},${p1.x},${p1.y}`
    t0 = t1
  }
  return d
}

export function linearPath(points: XY[]) {
  return points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join('')
}

/** 1/2/2.5/5 × 10^k 的整刻度步长 */
function niceStep(rough: number) {
  const pow = 10 ** Math.floor(Math.log10(rough))
  const unit = rough / pow
  const factor = unit <= 1 ? 1 : unit <= 2 ? 2 : unit <= 2.5 ? 2.5 : unit <= 5 ? 5 : 10
  return factor * pow
}

export function buildYTicks(min: number, max: number, count: number) {
  if (!(max > min)) {
    const base = Number.isFinite(min) ? min : 0
    return { ticks: [base, base + 1], domainMin: base, domainMax: base + 1 }
  }
  const step = niceStep((max - min) / (count - 1))
  const domainMin = Math.floor(min / step) * step
  const domainMax = Math.ceil(max / step) * step
  const ticks: number[] = []
  for (let v = domainMin; v <= domainMax + step / 2; v += step) ticks.push(v)
  return { ticks, domainMin, domainMax }
}
