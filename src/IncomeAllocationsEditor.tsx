import { CurrencyField } from './CurrencyField'
import { HelpTooltip } from './HelpTooltip'
import type { IncomeAllocation, IncomeSourceDef } from './types'

interface IncomeAllocationsEditorProps {
  allocations: IncomeAllocation[]
  onChange: (allocations: IncomeAllocation[]) => void
  incomeSourceDefs: IncomeSourceDef[]
}

// Not a real source id — crypto.randomUUID() never collides with it — so it
// can share the same <select> as the catalog sources.
const CUSTOM_OPTION = '__custom__'

export function IncomeAllocationsEditor({
  allocations,
  onChange,
  incomeSourceDefs,
}: IncomeAllocationsEditorProps) {
  function updateAllocation(id: string, patch: Partial<IncomeAllocation>) {
    onChange(allocations.map((a) => (a.id === id ? { ...a, ...patch } : a)))
  }

  function removeAllocation(id: string) {
    onChange(allocations.filter((a) => a.id !== id))
  }

  function addAllocation() {
    const defaultSource = incomeSourceDefs[0]
    onChange([
      ...allocations,
      defaultSource
        ? { id: crypto.randomUUID(), sourceId: defaultSource.id, custom: null }
        : {
            id: crypto.randomUUID(),
            sourceId: null,
            custom: { name: '', amount: 0, inflationAdjusted: true },
          },
    ])
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1 text-sm font-medium text-slate-700">
          Income
          <HelpTooltip text="Pick an income source — its amount always matches what's set above, and can't be overridden here — or choose 'Custom amount' for a one-off line just for this range, with its own name and amount." />
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
              className="flex flex-wrap items-center gap-2 rounded-md border border-slate-200 p-2"
            >
              <select
                className="min-w-[8rem] flex-1 rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500"
                value={allocation.custom ? CUSTOM_OPTION : allocation.sourceId ?? ''}
                onChange={(e) => {
                  const value = e.target.value
                  if (value === CUSTOM_OPTION) {
                    updateAllocation(allocation.id, {
                      sourceId: null,
                      custom: allocation.custom ?? { name: '', amount: 0, inflationAdjusted: true },
                    })
                    return
                  }
                  updateAllocation(allocation.id, { sourceId: value || null, custom: null })
                }}
              >
                <option value="" disabled>
                  Select an income source…
                </option>
                <option value={CUSTOM_OPTION}>Custom amount…</option>
                {incomeSourceDefs.map((source) => (
                  <option key={source.id} value={source.id}>
                    {source.name || 'Untitled'} (${source.amount.toLocaleString('en-US')})
                  </option>
                ))}
              </select>

              {allocation.custom ? (
                <>
                  <input
                    type="text"
                    placeholder="Name"
                    className="min-w-[8rem] flex-1 rounded-md border border-slate-300 px-2 py-1.5 text-sm text-slate-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500"
                    value={allocation.custom.name}
                    onChange={(e) =>
                      updateAllocation(allocation.id, {
                        custom: { ...allocation.custom!, name: e.target.value },
                      })
                    }
                  />
                  <div className="w-32">
                    <CurrencyField
                      label="Amount"
                      hideLabel
                      min={0}
                      value={allocation.custom.amount}
                      onChange={(v) =>
                        updateAllocation(allocation.id, {
                          custom: { ...allocation.custom!, amount: v },
                        })
                      }
                    />
                  </div>
                  <label className="flex items-center gap-1.5 text-sm text-slate-600">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                      checked={allocation.custom.inflationAdjusted}
                      onChange={(e) =>
                        updateAllocation(allocation.id, {
                          custom: { ...allocation.custom!, inflationAdjusted: e.target.checked },
                        })
                      }
                    />
                    Adjust for inflation
                  </label>
                </>
              ) : (
                <div
                  className="w-32 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-right text-sm text-slate-500"
                  title="Set above, in the source's own amount field"
                >
                  ${(incomeSourceDefs.find((s) => s.id === allocation.sourceId)?.amount ?? 0).toLocaleString(
                    'en-US',
                  )}
                </div>
              )}

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
          ))}
        </div>
      )}
    </div>
  )
}
