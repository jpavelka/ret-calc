import { useId, useState, type MouseEvent as ReactMouseEvent } from 'react'
import { birthYear } from './age'
import { HelpTooltip } from './HelpTooltip'
import { realDollarFactor } from './ProjectionTable'
import { computeOwnerBenefitSummary, monthlyBenefitForClaimAgeMonths } from './socialSecurity'
import type { Owner, RetirementInputs } from './types'

type DollarMode = 'nominal' | 'real'

// Validated categorical slot 1 (see dataviz skill's palette.md). One chart,
// one owner, one series — no legend needed (the surrounding "You"/"Spouse"
// heading already says what's plotted), so there's no second slot to pick.
const SERIES_COLOR = '#2a78d6'
// Status-adjacent muted tone for the FRA reference line — a marker, not a
// second data series, so it stays out of the categorical slot sequence.
const REFERENCE_COLOR = '#898781'

// SSA's actual claiming window — 62 is the statutory earliest age, and
// delayed retirement credits (see claimingAdjustmentFactor) stop accruing at
// 70 regardless of the rates configured, so the curve is flat past it. The
// claiming-age input only allows whole years in this range, so the chart
// matches it one point per year rather than interpolating by month.
const MIN_CLAIM_AGE = 62
const MAX_CLAIM_AGE = 70

const CHART_WIDTH = 560
const CHART_HEIGHT = 200
const MARGIN = { top: 16, right: 56, bottom: 28, left: 8 }
const PLOT_LEFT = MARGIN.left
const PLOT_RIGHT = CHART_WIDTH - MARGIN.right
const PLOT_TOP = MARGIN.top
const PLOT_BOTTOM = CHART_HEIGHT - MARGIN.bottom

function niceMax(value: number): number {
  if (value <= 0) return 100
  const magnitude = Math.pow(10, Math.floor(Math.log10(value)))
  const normalized = value / magnitude
  const niceNormalized = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10
  return niceNormalized * magnitude
}

function formatDollars(value: number): string {
  return `$${Math.round(value).toLocaleString('en-US')}`
}

export function SocialSecurityBenefitChart({ inputs, owner }: { inputs: RetirementInputs; owner: Owner }) {
  const [dollarMode, setDollarMode] = useState<DollarMode>('nominal')
  const [showTable, setShowTable] = useState(false)
  const [hoverAge, setHoverAge] = useState<number | null>(null)
  const gradientId = useId()

  const summary = computeOwnerBenefitSummary(inputs, owner)
  if (summary === null) {
    return <p className="text-sm text-slate-400">Nothing to chart yet — enter a birth date above.</p>
  }

  const currentClaimAge = Math.round(inputs.socialSecurity[owner].claimingAge)
  const birthYr = birthYear(owner === 'self' ? inputs.birthDate : inputs.spouseBirthDate)

  // One point per whole year of claiming age — the only values the
  // claiming-age input allows. Each age's value is already grown to that
  // age's actual claim-year nominal dollars (monthlyBenefitForClaimAgeMonths
  // — same growth-to-claim-year logic benefitScheduleForOwner uses), so
  // "Nominal $" shows real growing figures and "Today's $" correctly
  // deflates them back down using that specific year's factor, rather than
  // deflating an already-today's-dollars PIA a second time.
  const points: { age: number; value: number }[] = []
  for (let age = MIN_CLAIM_AGE; age <= MAX_CLAIM_AGE; age++) {
    const nominal = monthlyBenefitForClaimAgeMonths(inputs, owner, age * 12)
    const dollarFactor =
      dollarMode === 'real' && birthYr !== null ? realDollarFactor(inputs, birthYr + age) : 1
    points.push({ age, value: nominal * dollarFactor })
  }

  const maxValue = niceMax(Math.max(...points.map((p) => p.value), 1))
  const yTicks = [0, maxValue / 4, maxValue / 2, (maxValue * 3) / 4, maxValue]

  const xForAge = (age: number) =>
    PLOT_LEFT + ((age - MIN_CLAIM_AGE) / (MAX_CLAIM_AGE - MIN_CLAIM_AGE)) * (PLOT_RIGHT - PLOT_LEFT)
  const yForValue = (value: number) => PLOT_BOTTOM - (value / maxValue) * (PLOT_BOTTOM - PLOT_TOP)

  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${xForAge(p.age)} ${yForValue(p.value)}`).join(' ')

  function handlePointerMove(e: ReactMouseEvent<SVGRectElement>) {
    const rect = e.currentTarget.getBoundingClientRect()
    const fraction = (e.clientX - rect.left) / rect.width
    const nearestAge = Math.round(MIN_CLAIM_AGE + fraction * (MAX_CLAIM_AGE - MIN_CLAIM_AGE))
    setHoverAge(Math.min(MAX_CLAIM_AGE, Math.max(MIN_CLAIM_AGE, nearestAge)))
  }

  const currentClaimValue = points.find((p) => p.age === currentClaimAge)?.value ?? summary.monthlyBenefitAtClaim
  const hoverValue = hoverAge === null ? null : points.find((p) => p.age === hoverAge)?.value ?? null
  const fraAge = summary.fraMonths / 12
  const fraInRange = fraAge >= MIN_CLAIM_AGE && fraAge <= MAX_CLAIM_AGE
  // The claiming-age field's own bounds already keep this in range for any
  // new edit, but a scenario saved before that constraint existed could
  // still carry an out-of-range value — skip the marker rather than draw it
  // off-chart or misleadingly clamped onto the axis.
  const currentClaimInRange = currentClaimAge >= MIN_CLAIM_AGE && currentClaimAge <= MAX_CLAIM_AGE

  return (
    <div>
      <div className="flex items-center justify-end gap-1">
        <div className="flex items-center gap-1">
          {(
            [
              { id: 'nominal', label: 'Nominal $' },
              { id: 'real', label: "Today's $" },
            ] as const
          ).map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setDollarMode(m.id)}
              className={`rounded-md px-2.5 py-1 text-xs font-medium ${
                m.id === dollarMode
                  ? 'bg-emerald-600 text-white'
                  : 'border border-slate-300 text-slate-600 hover:bg-slate-50'
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
        <HelpTooltip text="Nominal $ shows each claiming age's benefit in the actual dollars of the year you'd turn that age. Today's $ divides back out cumulative inflation up to that year, so every age is comparable to a dollar right now." />
      </div>

      <div className="relative mt-2">
        <svg
          viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
          className="w-full"
          role="img"
          aria-label="Monthly Social Security benefit by claiming age"
        >
          <defs>
            <clipPath id={`${gradientId}-plot`}>
              <rect x={PLOT_LEFT} y={PLOT_TOP} width={PLOT_RIGHT - PLOT_LEFT} height={PLOT_BOTTOM - PLOT_TOP} />
            </clipPath>
          </defs>

          {/* Gridlines + Y ticks */}
          {yTicks.map((t) => (
            <g key={t}>
              <line
                x1={PLOT_LEFT}
                x2={PLOT_RIGHT}
                y1={yForValue(t)}
                y2={yForValue(t)}
                stroke="#e1e0d9"
                strokeWidth={1}
              />
              <text x={PLOT_RIGHT + 6} y={yForValue(t)} dy="0.32em" fontSize={10} fill="#898781">
                {formatDollars(t)}
              </text>
            </g>
          ))}

          {/* X-axis */}
          <line x1={PLOT_LEFT} x2={PLOT_RIGHT} y1={PLOT_BOTTOM} y2={PLOT_BOTTOM} stroke="#c3c2b7" strokeWidth={1} />
          {points.map((p) => (
            <text key={p.age} x={xForAge(p.age)} y={PLOT_BOTTOM + 16} fontSize={10} fill="#898781" textAnchor="middle">
              {p.age}
            </text>
          ))}

          {/* Full Retirement Age reference line */}
          {fraInRange && (
            <line
              x1={xForAge(fraAge)}
              x2={xForAge(fraAge)}
              y1={PLOT_TOP}
              y2={PLOT_BOTTOM}
              stroke={REFERENCE_COLOR}
              strokeWidth={1}
              strokeDasharray="3 3"
            />
          )}
          {fraInRange && (
            <text x={xForAge(fraAge)} y={PLOT_TOP - 4} fontSize={9} fill="#898781" textAnchor="middle">
              FRA
            </text>
          )}

          {/* Series line */}
          <g clipPath={`url(#${gradientId}-plot)`}>
            <path d={path} fill="none" stroke={SERIES_COLOR} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
          </g>

          {/* Data markers */}
          {points.map((p) => (
            <circle key={p.age} cx={xForAge(p.age)} cy={yForValue(p.value)} r={3} fill={SERIES_COLOR} stroke="#fcfcfb" strokeWidth={2} />
          ))}

          {/* Current claiming-age marker + direct label */}
          {currentClaimInRange && (
            <>
              <circle
                cx={xForAge(currentClaimAge)}
                cy={yForValue(currentClaimValue)}
                r={4}
                fill={SERIES_COLOR}
                stroke="#fcfcfb"
                strokeWidth={2}
              />
              <text
                x={xForAge(currentClaimAge) + 8}
                y={yForValue(currentClaimValue)}
                dy="0.32em"
                fontSize={11}
                fontWeight={600}
                fill="#0b0b0b"
              >
                {formatDollars(currentClaimValue)}
              </text>
            </>
          )}

          {/* Hover crosshair */}
          {hoverAge !== null && (
            <line
              x1={xForAge(hoverAge)}
              x2={xForAge(hoverAge)}
              y1={PLOT_TOP}
              y2={PLOT_BOTTOM}
              stroke="#c3c2b7"
              strokeWidth={1}
            />
          )}

          {/* Hover hit layer */}
          <rect
            x={PLOT_LEFT}
            y={PLOT_TOP}
            width={PLOT_RIGHT - PLOT_LEFT}
            height={PLOT_BOTTOM - PLOT_TOP}
            fill="transparent"
            onMouseMove={handlePointerMove}
            onMouseLeave={() => setHoverAge(null)}
          />
        </svg>

        {hoverAge !== null && hoverValue !== null && (
          <div
            className="pointer-events-none absolute top-2 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs shadow-md"
            style={{
              left: `${(xForAge(hoverAge) / CHART_WIDTH) * 100}%`,
              transform: xForAge(hoverAge) > CHART_WIDTH * 0.7 ? 'translateX(-100%)' : undefined,
            }}
          >
            <div className="font-medium text-slate-900">Age {hoverAge}</div>
            <div className="mt-0.5 flex items-center gap-1.5">
              <span className="inline-block h-0.5 w-2.5" style={{ backgroundColor: SERIES_COLOR }} />
              <span className="ml-auto font-medium text-slate-900">{formatDollars(hoverValue)}/mo</span>
            </div>
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={() => setShowTable((v) => !v)}
        className="mt-2 text-xs font-medium text-emerald-700 hover:underline"
      >
        {showTable ? 'Hide table' : 'View as table'}
      </button>

      {showTable && (
        <div className="mt-2 max-h-64 overflow-auto rounded-md border border-slate-200">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="px-2 py-1 font-medium">Claiming age</th>
                <th className="px-2 py-1 text-right font-medium">Monthly benefit</th>
              </tr>
            </thead>
            <tbody>
              {points.map((p) => (
                <tr key={p.age} className="border-t border-slate-100">
                  <td className="px-2 py-1 text-slate-700">
                    {p.age}
                    {p.age === Math.round(fraAge) && Math.abs(fraAge - Math.round(fraAge)) < 1e-6 ? ' (FRA)' : ''}
                  </td>
                  <td className="px-2 py-1 text-right text-slate-700">{formatDollars(p.value)}/mo</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
