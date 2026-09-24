import { useId, useState, type MouseEvent as ReactMouseEvent } from 'react'
import { formatMetricValue } from './metrics'
import type { MetricPercentilePoint } from './simulation'

// Validated categorical slot 1 (see dataviz skill's palette.md) — same series
// color SocialSecurityBenefitChart uses, for visual consistency across the
// app's charts.
const SERIES_COLOR = '#2a78d6'
// Status-adjacent muted tone for the mean reference line — a marker, not a
// second data series, so it stays out of the categorical slot sequence.
const REFERENCE_COLOR = '#898781'

const CHART_WIDTH = 260
const CHART_HEIGHT = 130
const MARGIN = { top: 10, right: 6, bottom: 20, left: 6 }
const PLOT_LEFT = MARGIN.left
const PLOT_RIGHT = CHART_WIDTH - MARGIN.right
const PLOT_TOP = MARGIN.top
const PLOT_BOTTOM = CHART_HEIGHT - MARGIN.bottom

function niceRange(min: number, max: number): { min: number; max: number } {
  if (min === max) return { min: min - 1, max: max + 1 }
  const pad = (max - min) * 0.08
  return { min: min - pad, max: max + pad }
}

interface MetricPercentileChartProps {
  mean: number
  points: MetricPercentilePoint[]
}

// A single run's-worth of a Metric collapses to one number (see
// metricAverageInRun) — across a whole simulation, that gives a population of
// per-run averages, worst to best. Rather than list a handful of named
// percentiles as text, this plots every 5th percentile (0 = worst run, 100 =
// best run) as a curve, with the mean as a reference line, so the shape of
// the distribution — how bunched or spread out the outcomes are — reads at a
// glance.
export function MetricPercentileChart({ mean, points }: MetricPercentileChartProps) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null)
  const gradientId = useId()

  // A first_year_when()-based metric can legitimately be Infinity for a run
  // where its condition never holds (e.g. a taxable account that never
  // depletes) — Infinity poisons Math.min/max's usual "widen the range a
  // touch" math (an infinite span, an infinite pad), so the axis range is
  // sized off the finite values only, and any non-finite value/mean is
  // plotted pinned to the top of the chart instead (off the good end of the
  // finite scale) rather than computed from a broken range.
  const values = points.map((p) => p.value)
  const finiteValues = [...values, mean].filter((v) => Number.isFinite(v))
  const { min, max } = finiteValues.length > 0 ? niceRange(Math.min(...finiteValues), Math.max(...finiteValues)) : { min: 0, max: 1 }

  const xForPercentile = (p: number) => PLOT_LEFT + (p / 100) * (PLOT_RIGHT - PLOT_LEFT)
  const yForValue = (value: number) =>
    Number.isFinite(value) ? PLOT_BOTTOM - ((value - min) / (max - min)) * (PLOT_BOTTOM - PLOT_TOP) : PLOT_TOP

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${xForPercentile(p.percentile)} ${yForValue(p.value)}`).join(' ')
  const areaPath = `${linePath} L ${xForPercentile(100)} ${PLOT_BOTTOM} L ${xForPercentile(0)} ${PLOT_BOTTOM} Z`

  function handlePointerMove(e: ReactMouseEvent<SVGRectElement>) {
    const rect = e.currentTarget.getBoundingClientRect()
    const fraction = (e.clientX - rect.left) / rect.width
    const nearestIndex = Math.round(Math.min(1, Math.max(0, fraction)) * (points.length - 1))
    setHoverIndex(nearestIndex)
  }

  const hoverPoint = hoverIndex !== null ? points[hoverIndex] : null

  return (
    <div className="relative max-w-xs">
      <svg
        viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
        className="w-full"
        role="img"
        aria-label="Metric value by simulation percentile, lowest to highest value"
      >
        <defs>
          <linearGradient id={`${gradientId}-fill`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={SERIES_COLOR} stopOpacity={0.2} />
            <stop offset="100%" stopColor={SERIES_COLOR} stopOpacity={0} />
          </linearGradient>
        </defs>

        {/* X-axis */}
        <line x1={PLOT_LEFT} x2={PLOT_RIGHT} y1={PLOT_BOTTOM} y2={PLOT_BOTTOM} stroke="#c3c2b7" strokeWidth={1} />
        {[0, 25, 50, 75, 100].map((p) => (
          <text key={p} x={xForPercentile(p)} y={PLOT_BOTTOM + 14} fontSize={9} fill="#898781" textAnchor="middle">
            {p}
          </text>
        ))}

        {/* Mean reference line */}
        <line
          x1={PLOT_LEFT}
          x2={PLOT_RIGHT}
          y1={yForValue(mean)}
          y2={yForValue(mean)}
          stroke={REFERENCE_COLOR}
          strokeWidth={1}
          strokeDasharray="3 3"
        />
        <text x={PLOT_LEFT} y={yForValue(mean) - 3} fontSize={9} fill="#898781">
          Mean {formatMetricValue(mean)}
        </text>

        {/* Distribution area + line */}
        <path d={areaPath} fill={`url(#${gradientId}-fill)`} />
        <path d={linePath} fill="none" stroke={SERIES_COLOR} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />

        {/* Hover crosshair + marker */}
        {hoverPoint && (
          <>
            <line
              x1={xForPercentile(hoverPoint.percentile)}
              x2={xForPercentile(hoverPoint.percentile)}
              y1={PLOT_TOP}
              y2={PLOT_BOTTOM}
              stroke="#c3c2b7"
              strokeWidth={1}
            />
            <circle
              cx={xForPercentile(hoverPoint.percentile)}
              cy={yForValue(hoverPoint.value)}
              r={3}
              fill={SERIES_COLOR}
              stroke="#fcfcfb"
              strokeWidth={2}
            />
          </>
        )}

        {/* Hover hit area */}
        <rect
          x={PLOT_LEFT}
          y={PLOT_TOP}
          width={PLOT_RIGHT - PLOT_LEFT}
          height={PLOT_BOTTOM - PLOT_TOP}
          fill="transparent"
          onMouseMove={handlePointerMove}
          onMouseLeave={() => setHoverIndex(null)}
        />
      </svg>

      {hoverPoint && (
        <div
          className="pointer-events-none absolute top-0 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs shadow-sm"
          style={{
            left: `${(xForPercentile(hoverPoint.percentile) / CHART_WIDTH) * 100}%`,
            transform:
              hoverPoint.percentile <= 10
                ? 'translateX(0%)'
                : hoverPoint.percentile >= 90
                  ? 'translateX(-100%)'
                  : 'translateX(-50%)',
          }}
        >
          <p className="font-medium text-slate-800">{formatMetricValue(hoverPoint.value)}</p>
          <p className="text-slate-500">{hoverPoint.percentile}th percentile</p>
        </div>
      )}
    </div>
  )
}
