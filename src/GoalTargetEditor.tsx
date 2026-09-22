import { CurrencyField } from './CurrencyField'
import { FormulaField } from './FormulaField'
import { tryEvaluateFormula } from './formula'
import type { FormulaHistoryContext } from './formula'
import { listSpecialYearNames, specialYearPreviewScope } from './specialYearGraph'
import type { GoalTarget, SpecialYear, Variable } from './types'

interface GoalTargetEditorProps {
  goal: GoalTarget
  onChange: (goal: GoalTarget) => void
  variables: Variable[]
  resolvedVariableAmounts: Map<string, number>
  specialYears?: SpecialYear[]
  deathYear?: number | null
  // See AmountSourceEditor's history prop.
  history?: FormulaHistoryContext
}

// Not real ids — crypto.randomUUID() never collides with either — so they
// can share the same <select> as the variable options.
const CUSTOM_OPTION = '__custom__'
const FORMULA_OPTION = '__formula__'

function formulaScope(
  variables: Variable[],
  resolvedVariableAmounts: Map<string, number>,
  specialYears: SpecialYear[],
  deathYear: number | null,
): Record<string, number> {
  const scope: Record<string, number> = specialYearPreviewScope(specialYears, deathYear)
  for (const v of variables) scope[v.name] = resolvedVariableAmounts.get(v.id) ?? 0
  return scope
}

// The variable/custom/formula target-balance picker for a SavingsLine's
// goal — structurally the same kind/value/inflation controls as
// AmountSourceEditor, but with no frequency: a goal is a point-in-time
// balance ("reach $X"), not a periodic amount, so there's nothing to
// annualize. Kept as its own small component rather than sharing
// AmountSourceEditor's implementation, since the two onChange shapes
// (with/without frequency) don't unify without either a generic type
// parameter or scattering `as` casts through both callers — not worth it
// for one field's difference. Renders the "top row" controls only; pair
// with GoalTargetFormulaRow for the formula text input on its own line.
export function GoalTargetEditor({
  goal,
  onChange,
  variables,
  resolvedVariableAmounts,
  specialYears = [],
  deathYear = null,
  history,
}: GoalTargetEditorProps) {
  const formulaValue =
    goal.kind === 'formula'
      ? tryEvaluateFormula(
          goal.expression,
          formulaScope(variables, resolvedVariableAmounts, specialYears, deathYear),
          history,
        )
      : null

  return (
    <>
      <select
        className="min-w-[8rem] flex-1 rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500"
        value={goal.kind === 'custom' ? CUSTOM_OPTION : goal.kind === 'formula' ? FORMULA_OPTION : goal.variableId}
        onChange={(e) => {
          const value = e.target.value
          const inflationAdjusted = goal.inflationAdjusted
          if (value === CUSTOM_OPTION) {
            onChange(goal.kind === 'custom' ? goal : { kind: 'custom', amount: 0, inflationAdjusted })
            return
          }
          if (value === FORMULA_OPTION) {
            onChange(goal.kind === 'formula' ? goal : { kind: 'formula', expression: '', inflationAdjusted })
            return
          }
          onChange({ kind: 'variable', variableId: value, inflationAdjusted })
        }}
      >
        <option value={CUSTOM_OPTION}>Custom amount…</option>
        <option value={FORMULA_OPTION}>Formula…</option>
        {variables.map((v) => (
          <option key={v.id} value={v.id}>
            {v.name || 'Untitled'} (${(resolvedVariableAmounts.get(v.id) ?? 0).toLocaleString('en-US')})
          </option>
        ))}
      </select>

      {goal.kind === 'custom' && (
        <div className="w-32">
          <CurrencyField
            label="Target"
            hideLabel
            min={0}
            value={goal.amount}
            onChange={(v) => onChange({ ...goal, amount: v })}
          />
        </div>
      )}

      {goal.kind === 'variable' && (
        <div
          className="flex w-32 items-center rounded-md border border-slate-200 bg-slate-50"
          title="Set above, in the variable's own amount field"
        >
          <span className="pl-3 text-slate-400 select-none">$</span>
          <span className="w-full min-w-0 px-3 py-2 text-slate-500">
            {(resolvedVariableAmounts.get(goal.variableId) ?? 0).toLocaleString('en-US')}
          </span>
        </div>
      )}

      {goal.kind === 'formula' && (
        <div
          className="flex w-32 items-center rounded-md border border-slate-200 bg-slate-50"
          title="Computed from the formula below"
        >
          <span className="pl-3 text-slate-400 select-none">$</span>
          <span className="w-full min-w-0 px-3 py-2 text-slate-500">
            {(formulaValue?.ok ? formulaValue.value : 0).toLocaleString('en-US')}
          </span>
        </div>
      )}

      <label className="flex items-center gap-1.5 text-sm text-slate-600">
        <input
          type="checkbox"
          className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
          checked={goal.inflationAdjusted}
          onChange={(e) => onChange({ ...goal, inflationAdjusted: e.target.checked })}
        />
        Adjust for inflation
      </label>
    </>
  )
}

// The formula text input itself, rendered on its own line below the row
// GoalTargetEditor produces — same pairing convention as
// AmountSourceFormulaRow/AmountSourceEditor. Renders nothing for a
// non-formula goal.
export function GoalTargetFormulaRow({
  goal,
  onChange,
  variables,
  resolvedVariableAmounts,
  specialYears = [],
  deathYear = null,
  history,
}: GoalTargetEditorProps) {
  if (goal.kind !== 'formula') return null
  return (
    <FormulaField
      hideLabel
      hideSuccessPreview
      expression={goal.expression}
      onChange={(expression) => onChange({ ...goal, expression })}
      variables={variables}
      specialYearNames={listSpecialYearNames(specialYears)}
      scope={formulaScope(variables, resolvedVariableAmounts, specialYears, deathYear)}
      history={history}
    />
  )
}
