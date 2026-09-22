import { FormulaField } from './FormulaField'
import type { FormulaHistoryContext } from './formula'
import { HelpTooltip } from './HelpTooltip'
import { NumberField } from './NumberField'
import type { ResolvedVariables } from './variables'
import type { Variable } from './types'

interface VariablesEditorProps {
  variables: Variable[]
  onChange: (variables: Variable[]) => void
  resolvedVariables: ResolvedVariables
  bare?: boolean
  // return_rate()/inflation_rate() support for the live preview — a
  // Variable's own resolution is year-independent (see resolveVariableAmounts),
  // so this is typically flatRateHistoryContext(...) rather than real history.
  history?: FormulaHistoryContext
}

const CUSTOM_OPTION = 'custom'
const FORMULA_OPTION = 'formula'

// Replaces the generic NamedAmountCatalogEditor for Variables specifically:
// a Variable's amount can now be a formula over other variables (see
// variables.ts's resolveVariableAmounts), which the generic editor's flat
// `{ amount: number }` shape can't express. No 'variable'-kind option here —
// a variable referencing another variable is just a formula whose
// expression is that variable's name — and no frequency, since that's a
// per-line concept (chosen when a variable is used from an income/spending/
// savings line), not a per-variable one.
export function VariablesEditor({
  variables,
  onChange,
  resolvedVariables,
  bare = false,
  history,
}: VariablesEditorProps) {
  function updateVariable(id: string, patch: Partial<Variable>) {
    onChange(variables.map((v) => (v.id === id ? { ...v, ...patch } : v)))
  }

  function removeVariable(id: string) {
    onChange(variables.filter((v) => v.id !== id))
  }

  function addVariable() {
    onChange([
      ...variables,
      { id: crypto.randomUUID(), name: '', source: { kind: 'custom', amount: 0 } },
    ])
  }

  const scope: Record<string, number> = {}
  for (const v of variables) scope[v.name] = resolvedVariables.amounts.get(v.id) ?? 0

  const Wrapper = bare ? 'div' : 'section'
  const Heading = bare ? 'h3' : 'h2'

  return (
    <Wrapper className={bare ? '' : 'rounded-lg border border-slate-200 bg-white p-5 shadow-sm'}>
      <Heading
        className={
          bare
            ? 'flex items-center gap-1 text-sm font-semibold text-slate-600'
            : 'flex items-center gap-1 text-lg font-semibold text-slate-900'
        }
      >
        Named amounts
        <HelpTooltip text='Reference these by name from any income, spending, or savings line below, or from another formula-based variable — pick monthly or yearly per use. A formula can reference other variables by name, e.g. "0.1 * salary".' />
      </Heading>

      {variables.length === 0 && (
        <p className="mt-2 text-sm text-slate-400">No variables yet — add one, e.g. "Base salary".</p>
      )}

      <div className="mt-3 flex flex-col gap-2">
        {variables.map((v) => (
          <div
            key={v.id}
            className="flex flex-col gap-2 rounded-md border border-slate-200 p-2"
          >
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="text"
                placeholder="e.g. Base salary"
                className="min-w-[8rem] flex-1 rounded-md border border-slate-300 px-2 py-1.5 text-sm text-slate-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500"
                value={v.name}
                onChange={(e) => updateVariable(v.id, { name: e.target.value })}
              />

              <select
                className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500"
                value={v.source.kind}
                onChange={(e) => {
                  if (e.target.value === CUSTOM_OPTION) {
                    if (v.source.kind !== 'custom') updateVariable(v.id, { source: { kind: 'custom', amount: 0 } })
                  } else if (v.source.kind !== 'formula') {
                    updateVariable(v.id, { source: { kind: 'formula', expression: '' } })
                  }
                }}
              >
                <option value={CUSTOM_OPTION}>Custom amount</option>
                <option value={FORMULA_OPTION}>Formula</option>
              </select>

              {v.source.kind === 'custom' ? (
                <div className="w-32">
                  <NumberField
                    label="Amount"
                    hideLabel
                    step={0.01}
                    value={v.source.amount}
                    onChange={(amount) => updateVariable(v.id, { source: { kind: 'custom', amount } })}
                  />
                </div>
              ) : (
                <div
                  className="flex w-32 items-center rounded-md border border-slate-200 bg-slate-50"
                  title="Computed from the formula below"
                >
                  <span className="w-full min-w-0 px-3 py-2 text-slate-500">
                    {(resolvedVariables.amounts.get(v.id) ?? 0).toLocaleString('en-US', { maximumFractionDigits: 2 })}
                  </span>
                </div>
              )}

              <button
                type="button"
                onClick={() => removeVariable(v.id)}
                aria-label="Remove variable"
                title="Remove variable"
                className="ml-auto rounded-md border border-red-300 px-2 py-1 text-red-600 hover:bg-red-50"
              >
                ✕
              </button>
            </div>

            {v.source.kind === 'formula' && (
              <FormulaField
                hideLabel
                hideSuccessPreview
                expression={v.source.expression}
                onChange={(expression) => updateVariable(v.id, { source: { kind: 'formula', expression } })}
                variables={variables.filter((other) => other.id !== v.id)}
                scope={scope}
                history={history}
                overrideError={resolvedVariables.errors.get(v.id)}
              />
            )}
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={addVariable}
        className="mt-3 rounded-md border border-emerald-600 px-4 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-50"
      >
        Add variable
      </button>
    </Wrapper>
  )
}
