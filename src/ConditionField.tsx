import { ExpressionInput } from './ExpressionInput'
import { tryEvaluateCondition } from './formula'
import type { FormulaHistoryContext } from './formula'
import { HelpTooltip } from './HelpTooltip'
import type { Variable } from './types'

interface ConditionFieldProps {
  expression: string
  onChange: (expression: string) => void
  // Candidate variables for the "insert variable" dropdown — alongside a
  // synthetic "year" entry, since every condition can reference the
  // simulation year even though it's never a real Variable.
  variables: Variable[]
  // Special year names (including the built-in "Current year"/"Death year")
  // available to insert, e.g. "year < [College]". Optional since not every
  // caller has special years to offer.
  specialYearNames?: string[]
  // Values to evaluate the live preview against, keyed by variable/special
  // year name, plus a "year" entry — see SavingsRangeLinesEditor for how
  // this is built.
  scope: Record<string, number>
  // Prior-year inflation/return rate lookback for return_rate()/
  // inflation_rate() in the live preview — see FormulaField's history prop.
  history?: FormulaHistoryContext
  label?: string
  hideLabel?: boolean
  help?: string
}

// Text input for a boolean condition expression (e.g. "year < 2040 &&
// income > 50000"), modeled on FormulaField but built on the boolean
// evaluator — a Yes/No preview instead of a dollar figure, and "year" always
// available to insert alongside the variable catalog.
export function ConditionField({
  expression,
  onChange,
  variables,
  specialYearNames = [],
  scope,
  history,
  label = 'Condition',
  hideLabel = false,
  help,
}: ConditionFieldProps) {
  const result = expression.trim() ? tryEvaluateCondition(expression, scope, history) : null

  return (
    <div className="flex min-w-[12rem] flex-1 flex-col gap-1">
      <span className={hideLabel ? 'sr-only' : 'flex items-center gap-1 text-sm font-medium text-slate-700'}>
        {label}
        {help && !hideLabel && <HelpTooltip text={help} />}
      </span>
      <ExpressionInput
        expression={expression}
        onChange={onChange}
        placeholder="e.g. year < 2040"
        variables={variables}
        specialYearNames={specialYearNames}
        insertAriaLabel="Insert into condition"
      />
      {result && !result.ok ? (
        <span className="text-xs text-red-600">{result.error}</span>
      ) : result ? (
        <span className="text-xs text-slate-500">Applies this year: {result.value ? 'Yes' : 'No'}</span>
      ) : (
        <span className="text-xs text-slate-400">Leave blank to always apply</span>
      )}
    </div>
  )
}
