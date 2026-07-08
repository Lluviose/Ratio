import { useId, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { useReducedMotion } from '../lib/useReducedMotion'
import type { TrendPoint } from './trendGoalLines'
import { buildYTicks, linearPath, monotonePath, type XY } from './trendChartMath'

/**
 * 趋势页专用的自绘 SVG 折线图，替代 recharts（唯一消费者就是趋势页，
 * 整库 ~99KB gzip 换这 ~3KB）。视觉语汇对齐原实现：monotone 曲线、
 * 横向虚线网格、预测参考区/分界线、点按出现虚线 cursor 与高亮点。
 * 曲线插值是 d3 curveMonotoneX 的同款 Fritsch–Carlson 算法，保证单调
 * 区间不过冲（净资产曲线不能画出数据里不存在的鼓包）。
 */

export type TrendChartSeries = {
  key: string
  getValue: (p: TrendPoint) => number | null | undefined
  stroke: string
  strokeWidth: number
  strokeDasharray?: string
  curve: 'monotone' | 'linear'
  connectNulls: boolean
  /** 悬停/点选时该系列数据点上的高亮圆点；false 表示该系列不参与高亮 */
  activeDot: { r: number; fill?: string } | false
}

type TrendChartProps = {
  width: number
  height: number
  data: TrendPoint[]
  series: TrendChartSeries[]
  /** x 轴（dateValue，UTC 天数）域起点；null 用数据最小值 */
  xDomainStart: number | null
  forecastArea: { start: number; end: number } | null
  forecastStartValue: number | null
  formatXTick: (value: number) => string
  formatYTick: (value: number) => string
  selectedPointKey: string | null
  onSelectPoint: (point: TrendPoint) => void
  /** 变化时重播入场描线动画（模式/区间切换） */
  animKey: string
}

const MARGIN = { top: 22, right: 12, bottom: 40, left: 58 }
const FORECAST_AREA_FILL = '#64748b'
const ACTIVE_DOT_RING = 'rgba(255, 255, 255, 0.95)'

export function TrendChart(props: TrendChartProps) {
  const {
    width,
    height,
    data,
    series,
    xDomainStart,
    forecastArea,
    forecastStartValue,
    formatXTick,
    formatYTick,
    selectedPointKey,
    onSelectPoint,
    animKey,
  } = props
  const reducedMotion = useReducedMotion()
  const clipId = useId()
  const svgRef = useRef<SVGSVGElement | null>(null)
  const [hoverKey, setHoverKey] = useState<string | null>(null)

  const plotLeft = MARGIN.left
  const plotRight = Math.max(plotLeft + 1, width - MARGIN.right)
  const plotTop = MARGIN.top
  const plotBottom = height - MARGIN.bottom
  const plotW = plotRight - plotLeft
  const plotH = plotBottom - plotTop

  const layout = useMemo(() => {
    const xs = data
      .map((p) => p.dateValue)
      .filter((v): v is number => typeof v === 'number' && Number.isFinite(v))
    const dataMinX = xs.length > 0 ? Math.min(...xs) : 0
    const dataMaxX = xs.length > 0 ? Math.max(...xs) : 1
    const xMin = xDomainStart ?? dataMinX
    const xMax = Math.max(dataMaxX, xMin + 1)

    let vMin = 0
    let vMax = -Infinity
    for (const s of series) {
      for (const p of data) {
        const v = s.getValue(p)
        if (typeof v === 'number' && Number.isFinite(v)) {
          if (v < vMin) vMin = v
          if (v > vMax) vMax = v
        }
      }
    }
    if (!Number.isFinite(vMax)) vMax = 1
    const { ticks: yTicks, domainMin, domainMax } = buildYTicks(vMin, vMax, 5)

    const xScale = (v: number) => plotLeft + ((v - xMin) / (xMax - xMin)) * plotW
    const yScale = (v: number) => plotBottom - ((v - domainMin) / (domainMax - domainMin || 1)) * plotH

    // 每 ~78px 一个刻度防标签拥挤；首尾标签在渲染时锚点内收避免溢出绘图区
    const xTickCount = Math.min(5, Math.max(2, Math.min(xs.length, Math.floor(plotW / 78))))
    const xTicks: number[] = []
    for (let i = 0; i < xTickCount; i += 1) {
      const v = Math.round(xMin + ((xMax - xMin) * i) / (xTickCount - 1))
      if (!xTicks.includes(v)) xTicks.push(v)
    }

    return { xMin, xMax, xScale, yScale, yTicks, xTicks }
  }, [data, series, xDomainStart, plotLeft, plotBottom, plotW, plotH])

  const paths = useMemo(() => {
    return series.map((s) => {
      const runs: XY[][] = []
      let current: XY[] = []
      for (const p of data) {
        const v = s.getValue(p)
        const x = p.dateValue
        if (typeof v === 'number' && Number.isFinite(v) && typeof x === 'number') {
          current.push({ x: layout.xScale(x), y: layout.yScale(v) })
        } else if (!s.connectNulls && current.length > 0) {
          runs.push(current)
          current = []
        }
      }
      if (current.length > 0) runs.push(current)
      const d = runs
        .filter((run) => run.length > 1)
        .map((run) => (s.curve === 'monotone' ? monotonePath(run) : linearPath(run)))
        .join('')
      return { series: s, d }
    })
  }, [data, series, layout])

  const findNearestPoint = (clientX: number) => {
    const svg = svgRef.current
    if (!svg || data.length === 0) return null
    const rect = svg.getBoundingClientRect()
    const px = clientX - rect.left
    let best: TrendPoint | null = null
    let bestDist = Infinity
    for (const p of data) {
      if (typeof p.dateValue !== 'number') continue
      const dist = Math.abs(layout.xScale(p.dateValue) - px)
      if (dist < bestDist) {
        bestDist = dist
        best = p
      }
    }
    return best
  }

  const activePoint = useMemo(() => {
    const key = hoverKey ?? selectedPointKey
    return key ? data.find((p) => p.dateKey === key) ?? null : null
  }, [hoverKey, selectedPointKey, data])

  const activeX = activePoint && typeof activePoint.dateValue === 'number' ? layout.xScale(activePoint.dateValue) : null

  return (
    <svg
      ref={svgRef}
      className="trendChartSvg"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label="净资产趋势图"
      onPointerMove={(e) => {
        const p = findNearestPoint(e.clientX)
        setHoverKey(p ? p.dateKey : null)
      }}
      onPointerLeave={() => setHoverKey(null)}
      onClick={(e) => {
        const p = findNearestPoint(e.clientX)
        if (p) onSelectPoint(p)
      }}
    >
      <defs>
        <clipPath id={clipId}>
          {reducedMotion ? (
            <rect x={0} y={0} width={width} height={height} />
          ) : (
            <motion.rect
              key={animKey}
              x={0}
              y={0}
              height={height}
              initial={{ width: 0 }}
              animate={{ width }}
              transition={{ duration: 1.1, delay: 0.08, ease: 'easeOut' }}
            />
          )}
        </clipPath>
      </defs>

      {layout.yTicks.map((t) => (
        <line
          key={`grid-${t}`}
          x1={plotLeft}
          x2={plotRight}
          y1={layout.yScale(t)}
          y2={layout.yScale(t)}
          stroke="rgba(100, 116, 139, 0.16)"
          strokeWidth={1}
          strokeDasharray="2 10"
        />
      ))}

      {forecastArea ? (
        <rect
          x={layout.xScale(forecastArea.start)}
          y={plotTop}
          width={Math.max(0, layout.xScale(forecastArea.end) - layout.xScale(forecastArea.start))}
          height={plotH}
          fill={FORECAST_AREA_FILL}
          fillOpacity={0.055}
        />
      ) : null}
      {forecastStartValue != null ? (
        <line
          x1={layout.xScale(forecastStartValue)}
          x2={layout.xScale(forecastStartValue)}
          y1={plotTop}
          y2={plotBottom}
          stroke="rgba(100, 116, 139, 0.34)"
          strokeWidth={1.5}
          strokeDasharray="4 7"
        />
      ) : null}

      {layout.yTicks.map((t) => (
        <text
          key={`ylabel-${t}`}
          x={plotLeft - 6}
          y={layout.yScale(t)}
          dy="0.35em"
          textAnchor="end"
          fontSize={11}
          fontWeight={600}
          fill="var(--muted-text)"
        >
          {formatYTick(t)}
        </text>
      ))}
      {layout.xTicks.map((t, i) => (
        <text
          key={`xlabel-${t}`}
          x={layout.xScale(t)}
          y={plotBottom + 22}
          textAnchor={i === 0 ? 'start' : i === layout.xTicks.length - 1 ? 'end' : 'middle'}
          fontSize={11}
          fontWeight={600}
          fill="var(--muted-text)"
        >
          {formatXTick(t)}
        </text>
      ))}

      {activeX != null ? (
        <line
          x1={activeX}
          x2={activeX}
          y1={plotTop}
          y2={plotBottom}
          stroke="rgb(var(--ink-rgb) / 0.16)"
          strokeWidth={2}
          strokeDasharray="4 6"
        />
      ) : null}

      <g clipPath={`url(#${clipId})`}>
        {paths.map(({ series: s, d }) =>
          d ? (
            <path
              key={s.key}
              d={d}
              fill="none"
              stroke={s.stroke}
              strokeWidth={s.strokeWidth}
              strokeDasharray={s.strokeDasharray}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ) : null,
        )}
      </g>

      {activePoint
        ? series.map((s) => {
            if (!s.activeDot) return null
            const v = s.getValue(activePoint)
            if (typeof v !== 'number' || !Number.isFinite(v) || activeX == null) return null
            return (
              <circle
                key={`dot-${s.key}`}
                cx={activeX}
                cy={layout.yScale(v)}
                r={s.activeDot.r}
                fill={s.activeDot.fill ?? s.stroke}
                stroke={ACTIVE_DOT_RING}
                strokeWidth={4}
              />
            )
          })
        : null}
    </svg>
  )
}
