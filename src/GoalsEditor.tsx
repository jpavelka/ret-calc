import { useState } from 'react'
import { ageFormulaNames } from './age'
import { ConditionField } from './ConditionField'
import { flatRateHistoryContext } from './formula'
import type { FormulaFunctionsContext, FormulaHistoryContext } from './formula'
import { goalMetInRun } from './goals'
import { buildFirstWhenPreviewRows, buildGoalProjectionLookups, type YearProjectionRow } from './projection'
import { listSpecialYearNames, specialYearPreviewScope } from './specialYearGraph'
import { formatSuccessRatePct, type SimulationRun } from './simulation'
import type { Goal, SpecialYear, Variable } from './types'

interface GoalsEditorProps {
  goals: Goal[]
  onChange: (goals: Goal[]) => void
  variables: Variable[]
  resolvedVariableAmounts: Map<string, number>
  specialYears?: SpecialYear[]
  deathYear?: number | null
  selfBirthYear?: number | null
  spouseBirthYear?: number | null
  history?: FormulaHistoryContext
  functions?: FormulaFunctionsContext
  // The current (baseline, flat-rate) projection — used for two things: the
  // Met/Not met badge next to each goal (real evaluation, every year), and
  // today's netWorth/unfunded as stand-ins for the live preview below, which
  // otherwise has no real per-year projection to read them from.
  projectionRows: YearProjectionRow[]
  // Latest Monte Carlo runs (null if none have been run yet) — drives the
  // "Simulations: X%" badge next to the baseline Met/Not met one. Mirrors
  // GoalPanel's per-goal simulation success rate, shown here too so it's
  // reachable on narrow screens where that sidebar is hidden.
  simulationRuns: SimulationRun[] | null
}

function SimulationBadge({ successRatePct }: { successRatePct: number }) {
  return (
    <span
      className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
        successRatePct === 100 ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
      }`}
    >
      Simulations: {formatSuccessRatePct(successRatePct)}
    </span>
  )
}

export function GoalsEditor({
  goals,
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
}: GoalsEditorProps) {
  // Which goals are showing their full edit form — condensed, human-readable
  // rows are the default so the section reads clearly at a glance; editing
  // is opt-in per goal, same as the allocation/range editors elsewhere.
  const [editingIds, setEditingIds] = useState<Set<string>>(new Set())

  function setEditing(id: string, editing: boolean) {
    setEditingIds((prev) => {
      const next = new Set(prev)
      if (editing) next.add(id)
      else next.delete(id)
      return next
    })
  }

  function updateGoal(id: string, patch: Partial<Goal>) {
    onChange(goals.map((g) => (g.id === id ? { ...g, ...patch } : g)))
  }

  function removeGoal(id: string) {
    onChange(goals.filter((g) => g.id !== id))
    setEditing(id, false)
  }

  function addGoal() {
    const id = crypto.randomUUID()
    onChange([...goals, { id, name: '', expression: '' }])
    // A brand-new goal has nothing to summarize yet, so open it straight
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

  // net_worth_in_year()/_at_age()/_at_spouse_age(), their per-account
  // equivalents, and dollar_convert() need nothing but a finished projection
  // to answer (see buildGoalProjectionLookups), so — unlike return_rate()/net_worth()/etc.,
  // which fall back to a flat/"today's snapshot" guess in `history` below
  // since there's no real per-year loop here to read — this preview can use
  // the real baseline projection directly, same as the Met/Not met badge.
  const previewHistory: FormulaHistoryContext = {
    ...(history ?? flatRateHistoryContext(0, 0)),
    ...buildGoalProjectionLookups(projectionRows),
  }
  // first_year_when()/first_age_when()/first_spouse_age_when()'s
  // whole-projection scan — see buildFirstWhenPreviewRows.
  previewHistory.projectionRows = () => buildFirstWhenPreviewRows(projectionRows, scope, previewHistory)

  // Built in for every user, not stored in `goals` and not editable — the
  // same check GoalPanel's baseline "ran out of money" badge uses.
  const ranOutOfMoneyBaseline = projectionRows.some((row) => row.withdrawals.unfunded > 0)
  const builtInSimulationSuccessRatePct = simulationRuns
    ? (simulationRuns.filter((run) => !run.ranOutOfMoney).length / simulationRuns.length) * 100
    : null

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className="font-medium text-slate-900">Don't run out of money before death</span>
          <span className="text-sm text-slate-400">Built-in</span>
          <span
            className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
              !ranOutOfMoneyBaseline ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
            }`}
          >
            Projection: {!ranOutOfMoneyBaseline ? 'Met' : 'Not met'}
          </span>
          {builtInSimulationSuccessRatePct !== null && (
            <SimulationBadge successRatePct={builtInSimulationSuccessRatePct} />
          )}
        </div>
      </div>

      {goals.length === 0 && (
        <p className="text-sm text-slate-400">
          No goals yet — add one, e.g. "Leave an inheritance".
        </p>
      )}

      <div className="flex flex-col gap-3">
        {goals.map((goal) => {
          const met = goal.expression.trim() ? goalMetInRun(goal.id, projectionRows) : null
          const simulationSuccessRatePct =
            goal.expression.trim() && simulationRuns
              ? (simulationRuns.filter((run) => goalMetInRun(goal.id, run.rows)).length / simulationRuns.length) *
                100
              : null
          const editing = editingIds.has(goal.id)
          return editing ? (
            <div key={goal.id} className="flex flex-col gap-2 rounded-md border border-slate-200 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="text"
                  placeholder="e.g. Leave an inheritance"
                  className="min-w-[10rem] flex-1 rounded-md border border-slate-300 px-2 py-1.5 text-sm text-slate-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500"
                  value={goal.name}
                  onChange={(e) => updateGoal(goal.id, { name: e.target.value })}
                />
                {met !== null && (
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                      met ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
                    }`}
                  >
                    Projection: {met ? 'Met' : 'Not met'}
                  </span>
                )}
                {simulationSuccessRatePct !== null && (
                  <SimulationBadge successRatePct={simulationSuccessRatePct} />
                )}
              </div>

              <ConditionField
                label="Formula"
                expression={goal.expression}
                onChange={(expression) => updateGoal(goal.id, { expression })}
                variables={variables}
                specialYearNames={specialYearNames}
                extraNames={extraNames}
                scope={scope}
                history={previewHistory}
                functions={functions}
                help={`Must hold true in every projected year to count as met, the same way "don't run out of money" is checked — e.g. "netWorth > 0". For a one-time milestone, write it as an implication, e.g. "age < 65 || netWorth > 500000" — or use net_worth_at_age(65)/net_worth_at_spouse_age(65)/net_worth_in_year(2040) (and per-account versions, e.g. roth_at_age(65), taxable_in_year(2040)) to check a specific year or age directly, anywhere in the projection. Use first_year_when(condition)/first_age_when(condition)/first_spouse_age_when(condition) to find the first year/your age/your spouse's age when some condition holds (e.g. "first_year_when(taxable(0) <= 0)"), or [infinity] if it never does. Use dollar_convert(amount, from_year, to_year) to restate an amount in another year's dollars, using this run's own inflation. netWorth and unfunded are that year's own totals; here they preview against today's.`}
              />

              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => removeGoal(goal.id)}
                  aria-label="Remove goal"
                  className="text-sm text-red-600 hover:underline"
                >
                  Remove
                </button>
                <button
                  type="button"
                  onClick={() => setEditing(goal.id, false)}
                  className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700"
                >
                  Done
                </button>
              </div>
            </div>
          ) : (
            <div
              key={goal.id}
              className="flex items-center justify-between gap-2 rounded-md border border-slate-200 px-3 py-2"
            >
              <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <span className="font-medium text-slate-900">{goal.name || 'Untitled goal'}</span>
                <span className="truncate text-sm text-slate-500">
                  {goal.expression.trim() || 'No formula yet'}
                </span>
                {met !== null && (
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                      met ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
                    }`}
                  >
                    Projection: {met ? 'Met' : 'Not met'}
                  </span>
                )}
                {simulationSuccessRatePct !== null && (
                  <SimulationBadge successRatePct={simulationSuccessRatePct} />
                )}
              </div>

              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  onClick={() => setEditing(goal.id, true)}
                  className="rounded-md border border-slate-300 px-2 py-1 text-sm text-slate-700 hover:bg-slate-50"
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => removeGoal(goal.id)}
                  aria-label="Remove goal"
                  title="Remove goal"
                  className="rounded-md border border-red-300 px-2 py-1 text-red-600 hover:bg-red-50"
                >
                  ✕
                </button>
              </div>
            </div>
          )
        })}
      </div>

      <button
        type="button"
        onClick={addGoal}
        className="self-start rounded-md border border-emerald-600 px-4 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-50"
      >
        Add goal
      </button>
    </div>
  )
}
