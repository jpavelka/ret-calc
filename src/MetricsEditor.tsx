import { useState } from 'react'
import { ageFormulaNames } from './age'
import { flatRateHistoryContext } from './formula'
import type { FormulaFunctionsContext, FormulaHistoryContext } from './formula'
import { FormulaField } from './FormulaField'
import { formatMetricValue, metricAverageInRun } from './metrics'
import { MetricPercentileChart } from './MetricPercentileChart'
import { buildFirstWhenPreviewRows, buildGoalProjectionLookups, type YearProjectionRow } from './projection'
import { listSpecialYearNames, specialYearPreviewScope } from './specialYearGraph'
import { summarizeMetricDistribution, type SimulationRun } from './simulation'
import type { Metric, SpecialYear, Variable } from './types'

interface MetricsEditorProps {
  metrics: Metric[]
  onChange: (metrics: Metric[]) => void
  variables: Variable[]
  resolvedVariableAmounts: Map<string, number>
  specialYears?: SpecialYear[]
  deathYear?: number | null
  selfBirthYear?: number | null
  spouseBirthYear?: number | null
  history?: FormulaHistoryContext
  functions?: FormulaFunctionsContext
  // The current (baseline, flat-rate) projection — used for two things: the
  // "Avg" badge next to each metric (real evaluation, every year), and
  // today's netWorth/unfunded as stand-ins for the live preview below, which
  // otherwise has no real per-year projection to read them from. Same idea
  // as GoalsEditor's projectionRows prop.
  projectionRows: YearProjectionRow[]
  // Latest Monte Carlo runs (null if none have been run yet) — drives the
  // "Sim avg" badge and percentile chart, mirroring GoalPanel's per-metric
  // simulation summary so it's reachable on narrow screens where that
  // sidebar is hidden.
  simulationRuns: SimulationRun[] | null
}

export function MetricsEditor({
  metrics,
  onChange,
  variables,
  resolvedVariableAmounts,
  specialYears = [],
  deathYear = null,
  selfBirthYear = null,
  spouseBirthYear = null,
  history,
  functions,
  projectionRows,
  simulationRuns,
}: MetricsEditorProps) {
  // Which metrics are showing their full edit form — condensed,
  // human-readable rows are the default so the section reads clearly at a
  // glance; editing is opt-in per metric, same as GoalsEditor.
  const [editingIds, setEditingIds] = useState<Set<string>>(new Set())

  function setEditing(id: string, editing: boolean) {
    setEditingIds((prev) => {
      const next = new Set(prev)
      if (editing) next.add(id)
      else next.delete(id)
      return next
    })
  }

  function updateMetric(id: string, patch: Partial<Metric>) {
    onChange(metrics.map((m) => (m.id === id ? { ...m, ...patch } : m)))
  }

  function removeMetric(id: string) {
    onChange(metrics.filter((m) => m.id !== id))
    setEditing(id, false)
  }

  function addMetric() {
    const id = crypto.randomUUID()
    onChange([...metrics, { id, name: '', expression: '' }])
    // A brand-new metric has nothing to summarize yet, so open it straight
    // into edit mode instead of showing an empty condensed row.
    setEditing(id, true)
  }

  const specialYearNames = listSpecialYearNames(specialYears)
  const extraNames = [...ageFormulaNames(selfBirthYear, spouseBirthYear), 'netWorth', 'unfunded']

  const scope: Record<string, number> = specialYearPreviewScope(
    specialYears,
    deathYear,
    selfBirthYear,
    spouseBirthYear,
  )
  for (const v of variables) scope[v.name] = resolvedVariableAmounts.get(v.id) ?? 0
  scope['netWorth'] = projectionRows[0]?.netWorth ?? 0
  scope['unfunded'] = projectionRows[0]?.withdrawals.unfunded ?? 0

  // See GoalsEditor's identical previewHistory for why this reuses the real
  // baseline projection rather than history/flatRateHistoryContext alone.
  const previewHistory: FormulaHistoryContext = {
    ...(history ?? flatRateHistoryContext(0, 0)),
    ...buildGoalProjectionLookups(projectionRows),
  }
  // first_year_when()/first_age_when()/first_spouse_age_when()'s
  // whole-projection scan — see buildFirstWhenPreviewRows.
  previewHistory.projectionRows = () => buildFirstWhenPreviewRows(projectionRows, scope, previewHistory)

  return (
    <div className="flex flex-col gap-3">
      {metrics.length === 0 && (
        <p className="text-sm text-slate-400">
          No metrics yet — add one, e.g. "Average annual spending".
        </p>
      )}

      <div className="flex flex-col gap-3">
        {metrics.map((metric) => {
          const average = metric.expression.trim() ? metricAverageInRun(metric.id, projectionRows) : null
          const distribution =
            metric.expression.trim() && simulationRuns
              ? summarizeMetricDistribution(metric.id, simulationRuns)
              : null
          const editing = editingIds.has(metric.id)
          return editing ? (
            <div key={metric.id} className="flex flex-col gap-2 rounded-md border border-slate-200 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="text"
                  placeholder="e.g. Average annual spending"
                  className="min-w-[10rem] flex-1 rounded-md border border-slate-300 px-2 py-1.5 text-sm text-slate-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500"
                  value={metric.name}
                  onChange={(e) => updateMetric(metric.id, { name: e.target.value })}
                />
                {average !== null && (
                  <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                    Avg: {formatMetricValue(average)}
                  </span>
                )}
                {distribution && (
                  <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                    Sim avg: {formatMetricValue(distribution.mean)}
                  </span>
                )}
              </div>

              {distribution && (
                <div>
                  <p className="text-sm text-slate-700">Simulations, lowest to highest value:</p>
                  <MetricPercentileChart mean={distribution.mean} points={distribution.points} />
                </div>
              )}

              <FormulaField
                label="Formula"
                expression={metric.expression}
                onChange={(expression) => updateMetric(metric.id, { expression })}
                variables={variables}
                specialYearNames={specialYearNames}
                extraNames={extraNames}
                scope={scope}
                history={previewHistory}
                functions={functions}
                help={`Evaluated every projected year — the value shown here is a live preview of this year only. The badges above (and the right-hand panel) report the average across every projected year, e.g. "spending" for average annual spending. Use net_worth_at_age(65)/net_worth_in_year(2040) (and per-account versions, e.g. roth_at_age(65), taxable_in_year(2040)) to reference a specific year or age directly, anywhere in the projection. Use first_year_when(condition)/first_age_when(condition)/first_spouse_age_when(condition) to compute the first year/your age/your spouse's age when some condition holds (e.g. "first_year_when(taxable(0) <= 0)" for the first year the taxable account hits zero), or [infinity] if it never does. Use dollar_convert(amount, from_year, to_year) to restate an amount in another year's dollars, using this run's own inflation. netWorth and unfunded are that year's own totals; here they preview against today's.`}
              />

              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => removeMetric(metric.id)}
                  aria-label="Remove metric"
                  className="text-sm text-red-600 hover:underline"
                >
                  Remove
                </button>
                <button
                  type="button"
                  onClick={() => setEditing(metric.id, false)}
                  className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700"
                >
                  Done
                </button>
              </div>
            </div>
          ) : (
            <div key={metric.id} className="flex flex-col gap-2 rounded-md border border-slate-200 px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
                  <span className="font-medium text-slate-900">{metric.name || 'Untitled metric'}</span>
                  <span className="truncate text-sm text-slate-500">
                    {metric.expression.trim() || 'No formula yet'}
                  </span>
                  {average !== null && (
                    <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                      Projected: {formatMetricValue(average)}
                    </span>
                  )}
                  {distribution && (
                    <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                      Sim avg: {formatMetricValue(distribution.mean)}
                    </span>
                  )}
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setEditing(metric.id, true)}
                    className="rounded-md border border-slate-300 px-2 py-1 text-sm text-slate-700 hover:bg-slate-50"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => removeMetric(metric.id)}
                    aria-label="Remove metric"
                    title="Remove metric"
                    className="rounded-md border border-red-300 px-2 py-1 text-red-600 hover:bg-red-50"
                  >
                    ✕
                  </button>
                </div>
              </div>

              {distribution && (
                <div>
                  <p className="text-sm text-slate-700">Simulations, lowest to highest value:</p>
                  <MetricPercentileChart mean={distribution.mean} points={distribution.points} />
                </div>
              )}
            </div>
          )
        })}
      </div>

      <button
        type="button"
        onClick={addMetric}
        className="self-start rounded-md border border-emerald-600 px-4 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-50"
      >
        Add metric
      </button>
    </div>
  )
}
