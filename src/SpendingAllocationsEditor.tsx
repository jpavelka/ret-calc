import { useState } from 'react'
import { AmountSourceEditor, AmountSourceFormulaRow, describeAmountSource } from './AmountSourceEditor'
import type { FormulaFunctionsContext, FormulaHistoryContext } from './formula'
import { HelpTooltip } from './HelpTooltip'
import type { SpecialYear, SpendingAllocation, Variable } from './types'

interface SpendingAllocationsEditorProps {
  allocations: SpendingAllocation[]
  onChange: (allocations: SpendingAllocation[]) => void
  variables: Variable[]
  resolvedVariableAmounts: Map<string, number>
  specialYears?: SpecialYear[]
  deathYear?: number | null
  selfBirthYear?: number | null
  spouseBirthYear?: number | null
  history?: FormulaHistoryContext
  functions?: FormulaFunctionsContext
}

export function SpendingAllocationsEditor({
  allocations,
  onChange,
  variables,
  resolvedVariableAmounts,
  specialYears = [],
  deathYear = null,
  selfBirthYear = null,
  spouseBirthYear = null,
  history,
  functions,
}: SpendingAllocationsEditorProps) {
  // Which allocations are showing their full edit form — condensed,
  // human-readable rows are the default so the section reads clearly at a
  // glance; editing is opt-in per line.
  const [editingIds, setEditingIds] = useState<Set<string>>(new Set())

  function setEditing(id: string, editing: boolean) {
    setEditingIds((prev) => {
      const next = new Set(prev)
      if (editing) next.add(id)
      else next.delete(id)
      return next
    })
  }

  function updateAllocation(id: string, patch: Partial<SpendingAllocation>) {
    onChange(allocations.map((a) => (a.id === id ? { ...a, ...patch } : a)))
  }

  function removeAllocation(id: string) {
    onChange(allocations.filter((a) => a.id !== id))
    setEditing(id, false)
  }

  function addAllocation() {
    const defaultVariable = variables[0]
    const id = crypto.randomUUID()
    onChange([
      ...allocations,
      {
        id,
        name: '',
        source: defaultVariable
          ? { kind: 'variable', variableId: defaultVariable.id, inflationAdjusted: true, frequency: 'yearly' }
          : { kind: 'custom', amount: 0, inflationAdjusted: true, frequency: 'yearly' },
      },
    ])
    // A brand-new line has nothing to summarize yet, so open it straight
    // into edit mode instead of showing an empty condensed row.
    setEditing(id, true)
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1 text-sm font-medium text-slate-700">
          Spending
          <HelpTooltip text="Name this line, then pick a variable, a custom one-off amount, or a formula over the variables above (e.g. '0.1 * salary'). Either way, pick whether the amount is a monthly or yearly figure." />
        </span>
        <button
          type="button"
          onClick={addAllocation}
          className="text-sm font-medium text-emerald-700 hover:underline"
        >
          + Add spending
        </button>
      </div>

      {allocations.length === 0 ? (
        <p className="mt-2 text-sm text-slate-400">No spending in this range yet.</p>
      ) : (
        <div className="mt-2 flex flex-col gap-2">
          {allocations.map((allocation) =>
            editingIds.has(allocation.id) ? (
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
                    selfBirthYear={selfBirthYear}
                    spouseBirthYear={spouseBirthYear}
                    history={history}
                    functions={functions}
                  />

                  <label className="flex items-center gap-1.5 text-sm text-slate-600">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                      checked={allocation.educationRelated ?? false}
                      onChange={(e) => updateAllocation(allocation.id, { educationRelated: e.target.checked })}
                    />
                    Education related
                  </label>

                  <label className="flex items-center gap-1.5 text-sm text-slate-600">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                      checked={allocation.medicalRelated ?? false}
                      onChange={(e) => updateAllocation(allocation.id, { medicalRelated: e.target.checked })}
                    />
                    Medical related
                  </label>
                </div>

                <AmountSourceFormulaRow
                  source={allocation.source}
                  onChange={(source) => updateAllocation(allocation.id, { source })}
                  variables={variables}
                  resolvedVariableAmounts={resolvedVariableAmounts}
                  specialYears={specialYears}
                  deathYear={deathYear}
                  selfBirthYear={selfBirthYear}
                  spouseBirthYear={spouseBirthYear}
                  history={history}
                  functions={functions}
                />

                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => removeAllocation(allocation.id)}
                    aria-label="Remove spending allocation"
                    className="text-sm text-red-600 hover:underline"
                  >
                    Remove
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditing(allocation.id, false)}
                    className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700"
                  >
                    Done
                  </button>
                </div>
              </div>
            ) : (
              <div
                key={allocation.id}
                className="flex items-center justify-between gap-2 rounded-md border border-slate-200 px-3 py-2"
              >
                <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
                  <span className="font-medium text-slate-900">{allocation.name || 'Untitled'}</span>
                  <span className="text-sm text-slate-500">
                    {describeAmountSource(
                      allocation.source,
                      variables,
                      resolvedVariableAmounts,
                      specialYears,
                      deathYear,
                      history,
                      functions,
                      selfBirthYear,
                      spouseBirthYear,
                    )}
                  </span>
                  {allocation.educationRelated && (
                    <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                      Education
                    </span>
                  )}
                  {allocation.medicalRelated && (
                    <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                      Medical
                    </span>
                  )}
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setEditing(allocation.id, true)}
                    className="rounded-md border border-slate-300 px-2 py-1 text-sm text-slate-700 hover:bg-slate-50"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => removeAllocation(allocation.id)}
                    aria-label="Remove spending allocation"
                    title="Remove spending allocation"
                    className="rounded-md border border-red-300 px-2 py-1 text-red-600 hover:bg-red-50"
                  >
                    ✕
                  </button>
                </div>
              </div>
            ),
          )}
        </div>
      )}
    </div>
  )
}
