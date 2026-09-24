import { goalMetInRun } from './goals'
import { formatMetricValue, metricAverageInRun } from './metrics'
import { MetricPercentileChart } from './MetricPercentileChart'
import type { YearProjectionRow } from './projection'
import {
  formatSuccessRatePct,
  summarizeMetricDistribution,
  type SimulationRun,
  type SimulationSummary,
} from './simulation'
import type { Goal, Metric } from './types'

interface GoalPanelProps {
  activeScenario: string | null
  dirty: boolean
  busy: boolean
  hasErrors: boolean
  onSave: () => void
  onReload: () => void
  ranOutOfMoneyBaseline: boolean
  simulationSummary: SimulationSummary | null
  goals: Goal[]
  metrics: Metric[]
  projectionRows: YearProjectionRow[]
  simulationRuns: SimulationRun[] | null
  simulationRunning: boolean
  onRunSimulation: () => void
}

function GoalStatus({ met, label }: { met: boolean; label: string }) {
  return (
    <p className="flex items-start gap-1.5 text-sm">
      <span
        className={`mt-0.5 shrink-0 ${met ? 'text-emerald-600' : 'text-red-600'}`}
        aria-hidden="true"
      >
        {met ? '✓' : '✗'}
      </span>
      <span className="text-slate-700">{label}</span>
    </p>
  )
}

function GoalNotRunYet() {
  return (
    <p className="flex items-start gap-1.5 text-sm">
      <span className="mt-0.5 shrink-0 text-slate-300" aria-hidden="true">
        ·
      </span>
      <span className="text-slate-400">Simulations: not run yet</span>
    </p>
  )
}

function GoalBlock({
  name,
  baselineMet,
  baselineLabel,
  simulationSuccessRatePct,
}: {
  name: string
  baselineMet: boolean
  baselineLabel: string
  simulationSuccessRatePct: number | null
}) {
  return (
    <div>
      <p className="text-sm font-medium text-slate-700">{name}</p>
      <div className="mt-1.5 flex flex-col gap-1 pl-0.5">
        <GoalStatus met={baselineMet} label={baselineLabel} />
        {simulationSuccessRatePct !== null ? (
          <GoalStatus
            met={simulationSuccessRatePct === 100}
            label={`Simulations: succeeded in ${formatSuccessRatePct(simulationSuccessRatePct)}`}
          />
        ) : (
          <GoalNotRunYet />
        )}
      </div>
    </div>
  )
}

function MetricBlock({ name, baselineAverage, distribution }: {
  name: string
  baselineAverage: number | null
  distribution: ReturnType<typeof summarizeMetricDistribution>
}) {
  return (
    <div>
      <p className="text-sm font-medium text-slate-700">{name}</p>
      <p className="mt-1.5 pl-0.5 text-sm text-slate-700">
        Year-by-year projection:{' '}
        {baselineAverage !== null ? `${formatMetricValue(baselineAverage)}` : 'no value'}
      </p>
      {distribution ? (
        <div className="mt-1.5">
          <p className="pl-0.5 text-sm text-slate-700">Simulations, lowest to highest value:</p>
          <MetricPercentileChart mean={distribution.mean} points={distribution.points} />
        </div>
      ) : (
        <p className="mt-1.5 pl-0.5 text-sm text-slate-400">Simulations: not run yet</p>
      )}
    </div>
  )
}

export function GoalPanel({
  activeScenario,
  dirty,
  busy,
  hasErrors,
  onSave,
  onReload,
  ranOutOfMoneyBaseline,
  simulationSummary,
  goals,
  metrics,
  projectionRows,
  simulationRuns,
  simulationRunning,
  onRunSimulation,
}: GoalPanelProps) {
  const definedGoals = goals.filter((g) => g.expression.trim())
  const definedMetrics = metrics.filter((m) => m.expression.trim())

  return (
    <div className="flex flex-col gap-5 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div>
        <h2 className="text-sm font-semibold text-slate-900">Current scenario</h2>
        <p className="mt-1 text-sm text-slate-600">
          {activeScenario ? (
            <>
              <span className="font-medium text-slate-800">{activeScenario}</span>
              {dirty ? ' — unsaved changes' : ' — saved'}
            </>
          ) : (
            'Not editing a saved scenario'
          )}
        </p>
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={onSave}
            disabled={busy || !activeScenario || !dirty || hasErrors}
            className="flex-1 rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
          >
            Save
          </button>
          <button
            type="button"
            onClick={onReload}
            disabled={busy || !activeScenario}
            className="flex-1 rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            Reload
          </button>
        </div>
        {hasErrors && (
          <p className="mt-2 text-xs text-red-600">
            Fix the highlighted savings ranges before saving.
          </p>
        )}
      </div>

      <div className="border-t border-slate-100 pt-4">
        <button
          type="button"
          onClick={onRunSimulation}
          disabled={simulationRunning}
          className="w-full rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
        >
          {simulationRunning ? 'Running…' : 'Run simulation'}
        </button>
        <h2 className="mt-4 text-sm font-semibold text-slate-900">Goals</h2>
        <div className="mt-2 flex flex-col gap-4">
          <GoalBlock
            name="Don't run out of money before death"
            baselineMet={!ranOutOfMoneyBaseline}
            baselineLabel={
              ranOutOfMoneyBaseline
                ? 'Year-by-year projection: runs out of money'
                : 'Year-by-year projection: never runs out'
            }
            simulationSuccessRatePct={simulationSummary?.successRatePct ?? null}
          />

          {definedGoals.map((goal) => {
            const met = goalMetInRun(goal.id, projectionRows)
            const simulationSuccessRatePct = simulationRuns
              ? (simulationRuns.filter((run) => goalMetInRun(goal.id, run.rows)).length /
                  simulationRuns.length) *
                100
              : null
            return (
              <GoalBlock
                key={goal.id}
                name={goal.name || 'Untitled goal'}
                baselineMet={met}
                baselineLabel={`Year-by-year projection: ${met ? 'met' : 'not met'}`}
                simulationSuccessRatePct={simulationSuccessRatePct}
              />
            )
          })}
        </div>

        {definedMetrics.length > 0 && (
          <>
            <h2 className="mt-5 text-sm font-semibold text-slate-900">Metrics</h2>
            <div className="mt-2 flex flex-col gap-4">
              {definedMetrics.map((metric) => (
                <MetricBlock
                  key={metric.id}
                  name={metric.name || 'Untitled metric'}
                  baselineAverage={metricAverageInRun(metric.id, projectionRows)}
                  distribution={simulationRuns ? summarizeMetricDistribution(metric.id, simulationRuns) : null}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
