import { ageFormulaNames } from './age'
import { CurrencyField } from './CurrencyField'
import { FormulaField } from './FormulaField'
import { tryEvaluateFormula } from './formula'
import type { FormulaFunctionsContext, FormulaHistoryContext } from './formula'
import { listSpecialYearNames, specialYearPreviewScope } from './specialYearGraph'
import type { RothConversionAmount, SpecialYear, Variable } from './types'

interface RothConversionAmountEditorProps {
  amount: RothConversionAmount
  onChange: (amount: RothConversionAmount) => void
  variables: Variable[]
  resolvedVariableAmounts: Map<string, number>
  specialYears?: SpecialYear[]
  deathYear?: number | null
  selfBirthYear?: number | null
  spouseBirthYear?: number | null
  history?: FormulaHistoryContext
  functions?: FormulaFunctionsContext
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
  selfBirthYear: number | null = null,
  spouseBirthYear: number | null = null,
): Record<string, number> {
  const scope: Record<string, number> = specialYearPreviewScope(specialYears, deathYear, selfBirthYear, spouseBirthYear)
  for (const v of variables) scope[v.name] = resolvedVariableAmounts.get(v.id) ?? 0
  return scope
}

// A short, human-readable summary of a RothConversionAmount for condensed
// (non-editing) display — e.g. '$15,000, fixed' or
// '$15,000 (0.1 * salary), inflation-adjusted'.
export function describeRothConversionAmount(
  amount: RothConversionAmount,
  variables: Variable[],
  resolvedVariableAmounts: Map<string, number>,
  specialYears: SpecialYear[] = [],
  deathYear: number | null = null,
  history?: FormulaHistoryContext,
  functions?: FormulaFunctionsContext,
  selfBirthYear: number | null = null,
  spouseBirthYear: number | null = null,
): string {
  const value =
    amount.kind === 'variable'
      ? (resolvedVariableAmounts.get(amount.variableId) ?? 0)
      : amount.kind === 'custom'
        ? amount.amount
        : (() => {
            const result = tryEvaluateFormula(
              amount.expression,
              formulaScope(variables, resolvedVariableAmounts, specialYears, deathYear, selfBirthYear, spouseBirthYear),
              history,
              functions,
            )
            return result?.ok ? result.value : 0
          })()

  const amountText = `$${Math.round(value).toLocaleString('en-US')}`
  const inflationText = amount.inflationAdjusted ? ', inflation-adjusted' : ', fixed'

  if (amount.kind === 'variable') {
    const variable = variables.find((v) => v.id === amount.variableId)
    return `${amountText} from "${variable?.name || 'Untitled'}"${inflationText}`
  }
  if (amount.kind === 'formula') {
    return `${amountText} (${amount.expression || 'no formula yet'})${inflationText}`
  }
  return `${amountText}${inflationText}`
}

// The variable/custom/formula picker for a Roth conversion range's per-owner
// amount — structurally the same as AmountSourceEditor/GoalTargetEditor, but
// with no frequency: the amount is always a single annual figure (see
// RothConversionAmount). Renders the "top row" controls only; pair with
// RothConversionAmountFormulaRow for the formula text input on its own line.
export function RothConversionAmountEditor({
  amount,
  onChange,
  variables,
  resolvedVariableAmounts,
  specialYears = [],
  deathYear = null,
  selfBirthYear = null,
  spouseBirthYear = null,
  history,
  functions,
}: RothConversionAmountEditorProps) {
  const formulaValue =
    amount.kind === 'formula'
      ? tryEvaluateFormula(
          amount.expression,
          formulaScope(variables, resolvedVariableAmounts, specialYears, deathYear, selfBirthYear, spouseBirthYear),
          history,
          functions,
        )
      : null

  return (
    <>
      <select
        className="min-w-[8rem] flex-1 rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500"
        value={amount.kind === 'custom' ? CUSTOM_OPTION : amount.kind === 'formula' ? FORMULA_OPTION : amount.variableId}
        onChange={(e) => {
          const value = e.target.value
          const inflationAdjusted = amount.inflationAdjusted
          if (value === CUSTOM_OPTION) {
            onChange(amount.kind === 'custom' ? amount : { kind: 'custom', amount: 0, inflationAdjusted })
            return
          }
          if (value === FORMULA_OPTION) {
            onChange(amount.kind === 'formula' ? amount : { kind: 'formula', expression: '', inflationAdjusted })
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

      {amount.kind === 'custom' && (
        <div className="w-32">
          <CurrencyField
            label="Amount"
            hideLabel
            min={0}
            value={amount.amount}
            onChange={(v) => onChange({ ...amount, amount: v })}
          />
        </div>
      )}

      {amount.kind === 'variable' && (
        <div
          className="flex w-32 items-center rounded-md border border-slate-200 bg-slate-50"
          title="Set above, in the variable's own amount field"
        >
          <span className="pl-3 text-slate-400 select-none">$</span>
          <span className="w-full min-w-0 px-3 py-2 text-slate-500">
            {(resolvedVariableAmounts.get(amount.variableId) ?? 0).toLocaleString('en-US')}
          </span>
        </div>
      )}

      {amount.kind === 'formula' && (
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
          checked={amount.inflationAdjusted}
          onChange={(e) => onChange({ ...amount, inflationAdjusted: e.target.checked })}
        />
        Adjust for inflation
      </label>
    </>
  )
}

// The formula text input itself, rendered on its own line below the row
// RothConversionAmountEditor produces — same pairing convention as
// AmountSourceFormulaRow/AmountSourceEditor. Renders nothing for a
// non-formula amount.
export function RothConversionAmountFormulaRow({
  amount,
  onChange,
  variables,
  resolvedVariableAmounts,
  specialYears = [],
  deathYear = null,
  selfBirthYear = null,
  spouseBirthYear = null,
  history,
  functions,
}: RothConversionAmountEditorProps) {
  if (amount.kind !== 'formula') return null
  return (
    <FormulaField
      hideLabel
      hideSuccessPreview
      expression={amount.expression}
      onChange={(expression) => onChange({ ...amount, expression })}
      variables={variables}
      specialYearNames={listSpecialYearNames(specialYears)}
      extraNames={ageFormulaNames(selfBirthYear, spouseBirthYear)}
      scope={formulaScope(variables, resolvedVariableAmounts, specialYears, deathYear, selfBirthYear, spouseBirthYear)}
      history={history}
      functions={functions}
    />
  )
}
