import { CurrencyField } from './CurrencyField'
import { HelpTooltip } from './HelpTooltip'
import type { SpendingAllocation, SpendingBucketDef } from './types'

interface SpendingAllocationsEditorProps {
  allocations: SpendingAllocation[]
  onChange: (allocations: SpendingAllocation[]) => void
  spendingBucketDefs: SpendingBucketDef[]
}

// Not a real bucket id — crypto.randomUUID() never collides with it — so it
// can share the same <select> as the catalog buckets.
const CUSTOM_OPTION = '__custom__'

export function SpendingAllocationsEditor({
  allocations,
  onChange,
  spendingBucketDefs,
}: SpendingAllocationsEditorProps) {
  function updateAllocation(id: string, patch: Partial<SpendingAllocation>) {
    onChange(allocations.map((a) => (a.id === id ? { ...a, ...patch } : a)))
  }

  function removeAllocation(id: string) {
    onChange(allocations.filter((a) => a.id !== id))
  }

  function addAllocation() {
    const defaultBucket = spendingBucketDefs[0]
    onChange([
      ...allocations,
      defaultBucket
        ? { id: crypto.randomUUID(), bucketId: defaultBucket.id, custom: null }
        : {
            id: crypto.randomUUID(),
            bucketId: null,
            custom: { name: '', amount: 0, inflationAdjusted: true },
          },
    ])
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1 text-sm font-medium text-slate-700">
          Spending
          <HelpTooltip text="Pick a spending bucket — its amount always matches what's set above, and can't be overridden here — or choose 'Custom amount' for a one-off line just for this range, with its own name and amount." />
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
          {allocations.map((allocation) => (
            <div
              key={allocation.id}
              className="flex flex-wrap items-center gap-2 rounded-md border border-slate-200 p-2"
            >
              <select
                className="min-w-[8rem] flex-1 rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500"
                value={allocation.custom ? CUSTOM_OPTION : allocation.bucketId ?? ''}
                onChange={(e) => {
                  const value = e.target.value
                  if (value === CUSTOM_OPTION) {
                    updateAllocation(allocation.id, {
                      bucketId: null,
                      custom: allocation.custom ?? { name: '', amount: 0, inflationAdjusted: true },
                    })
                    return
                  }
                  updateAllocation(allocation.id, { bucketId: value || null, custom: null })
                }}
              >
                <option value="" disabled>
                  Select a spending bucket…
                </option>
                <option value={CUSTOM_OPTION}>Custom amount…</option>
                {spendingBucketDefs.map((bucket) => (
                  <option key={bucket.id} value={bucket.id}>
                    {bucket.name || 'Untitled'} (${bucket.amount.toLocaleString('en-US')})
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
                  title="Set above, in the bucket's own amount field"
                >
                  ${(spendingBucketDefs.find((b) => b.id === allocation.bucketId)?.amount ?? 0).toLocaleString(
                    'en-US',
                  )}
                </div>
              )}

              <button
                type="button"
                onClick={() => removeAllocation(allocation.id)}
                aria-label="Remove spending allocation"
                title="Remove spending allocation"
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
