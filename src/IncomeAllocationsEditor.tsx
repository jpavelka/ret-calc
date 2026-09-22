import { AmountSourceEditor, AmountSourceFormulaRow } from './AmountSourceEditor'
import type { FormulaHistoryContext } from './formula'
import { HelpTooltip } from './HelpTooltip'
import type { IncomeAllocation, SpecialYear, Variable } from './types'

interface IncomeAllocationsEditorProps {
  allocations: IncomeAllocation[]
  onChange: (allocations: IncomeAllocation[]) => void
  variables: Variable[]
  resolvedVariableAmounts: Map<string, number>
  specialYears?: SpecialYear[]
  deathYear?: number | null
  history?: FormulaHistoryContext
}

export function IncomeAllocationsEditor({
  allocations,
  onChange,
  variables,
  resolvedVariableAmounts,
  specialYears = [],
  deathYear = null,
  history,
}: IncomeAllocationsEditorProps) {
  function updateAllocation(id: string, patch: Partial<IncomeAllocation>) {
    onChange(allocations.map((a) => (a.id === id ? { ...a, ...patch } : a)))
  }

  function removeAllocation(id: string) {
    onChange(allocations.filter((a) => a.id !== id))
  }

  function addAllocation() {
    const defaultVariable = variables[0]
    onChange([
      ...allocations,
      {
        id: crypto.randomUUID(),
        name: '',
        source: defaultVariable
          ? { kind: 'variable', variableId: defaultVariable.id, inflationAdjusted: true, frequency: 'yearly' }
          : { kind: 'custom', amount: 0, inflationAdjusted: true, frequency: 'yearly' },
      },
    ])
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1 text-sm font-medium text-slate-700">
          Income
          <HelpTooltip text="Name this line, then pick a variable, a custom one-off amount, or a formula over the variables above (e.g. '0.1 * salary'). Either way, pick whether the amount is a monthly or yearly figure." />
        </span>
        <button
          type="button"
          onClick={addAllocation}
          className="text-sm font-medium text-emerald-700 hover:underline"
        >
          + Add income
        </button>
      </div>

      {allocations.length === 0 ? (
        <p className="mt-2 text-sm text-slate-400">No income in this range yet.</p>
      ) : (
        <div className="mt-2 flex flex-col gap-2">
          {allocations.map((allocation) => (
            <div
              key={allocation.id}
              className="flex flex-col gap-2 rounded-md border border-slate-200 p-2"
            >
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="text"
                  placeholder="Name"
                  className="min-w-[8rem] flex-1 rounded-md border border-slate-300 px-2 py-1.5 text-sm text-slate-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500"
                  value={allocation.name}
                  onChange={(e) => updateAllocation(allocation.id, { name: e.target.value })}
                />

                <AmountSourceEditor
                  source={allocation.source}
                  onChange={(source) => updateAllocation(allocation.id, { source })}
                  variables={variables}
                  resolvedVariableAmounts={resolvedVariableAmounts}
                  specialYears={specialYears}
                  deathYear={deathYear}
                  history={history}
                />

                <button
                  type="button"
                  onClick={() => removeAllocation(allocation.id)}
                  aria-label="Remove income allocation"
                  title="Remove income allocation"
                  className="ml-auto rounded-md border border-red-300 px-2 py-1 text-red-600 hover:bg-red-50"
                >
                  ✕
                </button>
              </div>

              <AmountSourceFormulaRow
                source={allocation.source}
                onChange={(source) => updateAllocation(allocation.id, { source })}
                variables={variables}
                resolvedVariableAmounts={resolvedVariableAmounts}
                specialYears={specialYears}
                deathYear={deathYear}
                history={history}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
