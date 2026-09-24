import { ageFormulaNames } from './age'
import { CurrencyField } from './CurrencyField'
import { FormulaField } from './FormulaField'
import { FrequencyField } from './FrequencyField'
import { tryEvaluateFormula } from './formula'
import type { FormulaFunctionsContext, FormulaHistoryContext } from './formula'
import { listSpecialYearNames, specialYearPreviewScope } from './specialYearGraph'
import type { AmountSource, SpecialYear, Variable } from './types'

interface AmountSourceEditorProps {
  source: AmountSource
  onChange: (source: AmountSource) => void
  variables: Variable[]
  resolvedVariableAmounts: Map<string, number>
  // Offers the "Unlimited" kind — meaningful on a SavingsLine with a goal
  // ("contribute whatever it takes to reach it") and on a WithdrawalLine
  // ("no cap — draw whatever the shortfall needs"); income/spending amounts
  // leave it off.
  allowUnlimited?: boolean
  // What the "Unlimited" kind shows in place of an amount, and its tooltip —
  // defaults to the savings-goal wording.
  unlimitedLabel?: string
  unlimitedTitle?: string
  // Special years and death year for a formula source's "year"/special-year
  // support — optional (defaulting to none) since a caller with no
  // meaningful year context can simply omit them.
  specialYears?: SpecialYear[]
  deathYear?: number | null
  // "age"/"spouseAge" support for a formula source, same optionality as
  // specialYears/deathYear above — a caller with no birth year just doesn't
  // get those names.
  selfBirthYear?: number | null
  spouseBirthYear?: number | null
  // return_rate()/inflation_rate() support for the live preview — typically
  // flatRateHistoryContext(...) here, since a static preview has no real
  // per-year history to look back through. Optional; omitting it just makes
  // those two functions show an error in the preview instead of a value.
  history?: FormulaHistoryContext
  functions?: FormulaFunctionsContext
}

// Not real ids — crypto.randomUUID() never collides with either — so they
// can share the same <select> as the variable options.
const CUSTOM_OPTION = '__custom__'
const FORMULA_OPTION = '__formula__'
const UNLIMITED_OPTION = '__unlimited__'

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

// The variable/custom/formula amount picker shared by every line that has an
// AmountSource: income/spending allocations, savings lines, and withdrawal
// range allocations. Renders the "top row" controls only (kind select, value
// box, inflation checkbox, frequency) —
// for a formula source, pair this with AmountSourceFormulaRow rendered on
// its own line below, so the formula text doesn't crowd the row alongside a
// name field, remove button, etc.
export function AmountSourceEditor({
  source,
  onChange,
  variables,
  resolvedVariableAmounts,
  allowUnlimited = false,
  unlimitedLabel = 'Fills the savings goal below',
  unlimitedTitle = "Contributes whatever it takes to reach this line's savings goal, with no per-period amount of its own",
  specialYears = [],
  deathYear = null,
  selfBirthYear = null,
  spouseBirthYear = null,
  history,
  functions,
}: AmountSourceEditorProps) {
  const formulaValue =
    source.kind === 'formula'
      ? tryEvaluateFormula(
          source.expression,
          formulaScope(variables, resolvedVariableAmounts, specialYears, deathYear, selfBirthYear, spouseBirthYear),
          history,
          functions,
        )
      : null

  return (
    <>
      <select
        className="min-w-[8rem] flex-1 rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500"
        value={
          source.kind === 'custom'
            ? CUSTOM_OPTION
            : source.kind === 'formula'
              ? FORMULA_OPTION
              : source.kind === 'unlimited'
                ? UNLIMITED_OPTION
                : source.variableId
        }
        onChange={(e) => {
          const value = e.target.value
          // 'unlimited' carries neither field, so switching away from it (or
          // to it) can't preserve a prior frequency/inflation choice — fall
          // back to sensible defaults in that case.
          const frequency = source.kind === 'unlimited' ? 'yearly' : source.frequency
          const inflationAdjusted = source.kind === 'unlimited' ? true : source.inflationAdjusted
          if (value === CUSTOM_OPTION) {
            onChange(source.kind === 'custom' ? source : { kind: 'custom', amount: 0, inflationAdjusted, frequency })
            return
          }
          if (value === FORMULA_OPTION) {
            onChange(
              source.kind === 'formula' ? source : { kind: 'formula', expression: '', inflationAdjusted, frequency },
            )
            return
          }
          if (value === UNLIMITED_OPTION) {
            onChange(source.kind === 'unlimited' ? source : { kind: 'unlimited' })
            return
          }
          onChange({ kind: 'variable', variableId: value, inflationAdjusted, frequency })
        }}
      >
        <option value={CUSTOM_OPTION}>Custom amount…</option>
        <option value={FORMULA_OPTION}>Formula…</option>
        {allowUnlimited && <option value={UNLIMITED_OPTION}>Unlimited</option>}
        {variables.map((v) => (
          <option key={v.id} value={v.id}>
            {v.name || 'Untitled'} (${(resolvedVariableAmounts.get(v.id) ?? 0).toLocaleString('en-US')})
          </option>
        ))}
      </select>

      {source.kind === 'custom' && (
        <div className="w-32">
          <CurrencyField
            label="Amount"
            hideLabel
            min={0}
            value={source.amount}
            onChange={(v) => onChange({ ...source, amount: v })}
          />
        </div>
      )}

      {source.kind === 'variable' && (
        <div
          className="flex w-32 items-center rounded-md border border-slate-200 bg-slate-50"
          title="Set above, in the variable's own amount field"
        >
          <span className="pl-3 text-slate-400 select-none">$</span>
          <span className="w-full min-w-0 px-3 py-2 text-slate-500">
            {(resolvedVariableAmounts.get(source.variableId) ?? 0).toLocaleString('en-US')}
          </span>
        </div>
      )}

      {source.kind === 'formula' && (
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

      {source.kind === 'unlimited' && (
        <div
          className="flex min-w-[10rem] flex-1 items-center rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-slate-500"
          title={unlimitedTitle}
        >
          {unlimitedLabel}
        </div>
      )}

      {source.kind !== 'unlimited' && (
        <>
          <label className="flex items-center gap-1.5 text-sm text-slate-600">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
              checked={source.inflationAdjusted}
              onChange={(e) => onChange({ ...source, inflationAdjusted: e.target.checked })}
            />
            Adjust for inflation
          </label>

          <FrequencyField
            label="Frequency"
            hideLabel
            value={source.frequency}
            onChange={(frequency) => onChange({ ...source, frequency })}
          />
        </>
      )}
    </>
  )
}

// A short, human-readable summary of an AmountSource for condensed
// (non-editing) display — e.g. '$2,000/mo from "Salary", inflation-adjusted'.
// Mirrors the same amount resolution AmountSourceEditor uses for its live $
// preview, so the summary always matches what editing would show.
export function describeAmountSource(
  source: AmountSource,
  variables: Variable[],
  resolvedVariableAmounts: Map<string, number>,
  specialYears: SpecialYear[] = [],
  deathYear: number | null = null,
  history?: FormulaHistoryContext,
  functions?: FormulaFunctionsContext,
  selfBirthYear: number | null = null,
  spouseBirthYear: number | null = null,
): string {
  if (source.kind === 'unlimited') return 'Unlimited — fills the savings goal'

  const amount =
    source.kind === 'variable'
      ? (resolvedVariableAmounts.get(source.variableId) ?? 0)
      : source.kind === 'custom'
        ? source.amount
        : (() => {
            const result = tryEvaluateFormula(
              source.expression,
              formulaScope(variables, resolvedVariableAmounts, specialYears, deathYear, selfBirthYear, spouseBirthYear),
              history,
              functions,
            )
            return result?.ok ? result.value : 0
          })()

  const amountText = `$${Math.round(amount).toLocaleString('en-US')}/${source.frequency === 'monthly' ? 'mo' : 'yr'}`
  const inflationText = source.inflationAdjusted ? ', inflation-adjusted' : ', fixed'

  if (source.kind === 'variable') {
    const variable = variables.find((v) => v.id === source.variableId)
    return `${amountText} from "${variable?.name || 'Untitled'}"${inflationText}`
  }
  if (source.kind === 'formula') {
    return `${amountText} (${source.expression || 'no formula yet'})${inflationText}`
  }
  return `${amountText}${inflationText}`
}

// The formula text input itself (insert-variable dropdown + error-only
// line, no redundant success preview since AmountSourceEditor's row already
// shows the computed value) — rendered on its own line below the row
// AmountSourceEditor produces. Renders nothing for a non-formula source.
export function AmountSourceFormulaRow({
  source,
  onChange,
  variables,
  resolvedVariableAmounts,
  specialYears = [],
  deathYear = null,
  selfBirthYear = null,
  spouseBirthYear = null,
  history,
  functions,
}: AmountSourceEditorProps) {
  if (source.kind !== 'formula') return null
  return (
    <FormulaField
      hideLabel
      hideSuccessPreview
      expression={source.expression}
      onChange={(expression) => onChange({ ...source, expression })}
      variables={variables}
      specialYearNames={listSpecialYearNames(specialYears)}
      extraNames={ageFormulaNames(selfBirthYear, spouseBirthYear)}
      scope={formulaScope(variables, resolvedVariableAmounts, specialYears, deathYear, selfBirthYear, spouseBirthYear)}
      history={history}
      functions={functions}
    />
  )
}
