import { ExpressionInput } from './ExpressionInput'
import { tryEvaluateFormula } from './formula'
import type { FormulaHistoryContext } from './formula'
import { HelpTooltip } from './HelpTooltip'
import type { Variable } from './types'

interface FormulaFieldProps {
  expression: string
  onChange: (expression: string) => void
  // Candidate variables for the "insert variable" dropdown.
  variables: Variable[]
  // Special year names (including the built-in "Current year"/"Death year")
  // available to insert, alongside a synthetic "year" entry — same
  // candidates ConditionField offers, since a formula can reference the
  // simulation year and special years exactly like a condition can.
  specialYearNames?: string[]
  // Values to evaluate the live preview against, keyed by variable name.
  scope: Record<string, number>
  // Prior-year inflation/return rate lookback for return_rate()/
  // inflation_rate() in the live preview. Optional — a caller with no real
  // per-year history (e.g. a static preview) can pass flatRateHistoryContext
  // so those functions still resolve to the flat scenario assumption instead
  // of erroring.
  history?: FormulaHistoryContext
  label?: string
  hideLabel?: boolean
  help?: string
  // Overrides the live preview with an error the caller already knows about
  // (e.g. a circular reference caught by resolveVariableAmounts's dependency
  // graph, which a single formula's own evaluation can't detect on its own).
  overrideError?: string
  // Suppresses the "= $X,XXX" success line — for a caller that already shows
  // the computed value elsewhere (e.g. VariablesEditor's own read-only
  // amount box) and would otherwise show it twice. An error still shows
  // here regardless, since nothing else surfaces it in that case.
  hideSuccessPreview?: boolean
}

function formatCurrency(value: number): string {
  return value.toLocaleString('en-US', { maximumFractionDigits: 2 })
}

// Text input for a formula expression, shared by line-level amounts
// (AmountSourceEditor) and variable-level amounts (VariablesEditor): an
// "insert variable" dropdown that inserts a name at the cursor (bracketed if
// it isn't a valid bare identifier), plus a live preview/error line below.
export function FormulaField({
  expression,
  onChange,
  variables,
  specialYearNames = [],
  scope,
  history,
  label = 'Formula',
  hideLabel = false,
  help,
  overrideError,
  hideSuccessPreview = false,
}: FormulaFieldProps) {
  const result = tryEvaluateFormula(expression, scope, history)

  return (
    <div className="flex min-w-[12rem] flex-1 flex-col gap-1">
      <span
        className={hideLabel ? 'sr-only' : 'flex items-center gap-1 text-sm font-medium text-slate-700'}
      >
        {label}
        {help && !hideLabel && <HelpTooltip text={help} />}
      </span>
      <ExpressionInput
        expression={expression}
        onChange={onChange}
        placeholder="e.g. 0.1 * salary"
        variables={variables}
        specialYearNames={specialYearNames}
        insertAriaLabel="Insert variable"
      />
      {overrideError ? (
        <span className="text-xs text-red-600">{overrideError}</span>
      ) : !result.ok ? (
        <span className="text-xs text-red-600">{result.error}</span>
      ) : hideSuccessPreview ? null : (
        <span className="text-xs text-slate-500">= ${formatCurrency(result.value)}</span>
      )}
    </div>
  )
}
