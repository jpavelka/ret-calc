import type { AwiYear } from './types'

interface AwiTableEditorProps {
  awiTable: AwiYear[]
  onChange: (awiTable: AwiYear[]) => void
}

// SSA's National Average Wage Index by year — used to wage-index earnings
// history and derive PIA bend points (see socialSecurity.ts). ~75 rows in
// the shipped default, so the same dense-grid, scroll-wrapped pattern as
// SocialSecurityEarningsHistoryEditor.
export function AwiTableEditor({ awiTable, onChange }: AwiTableEditorProps) {
  function updateRow(id: string, patch: Partial<AwiYear>) {
    onChange(awiTable.map((r) => (r.id === id ? { ...r, ...patch } : r)))
  }

  function removeRow(id: string) {
    onChange(awiTable.filter((r) => r.id !== id))
  }

  function addRow() {
    const sorted = [...awiTable].sort((a, b) => a.year - b.year)
    const last = sorted[sorted.length - 1]
    onChange([
      ...awiTable,
      {
        id: crypto.randomUUID(),
        year: last ? last.year + 1 : new Date().getFullYear() - 1,
        index: last ? last.index : 0,
      },
    ])
  }

  const sorted = [...awiTable].sort((a, b) => a.year - b.year)

  return (
    <div className="flex flex-col gap-2">
      {awiTable.length === 0 && (
        <p className="text-sm text-slate-400">
          No AWI table set — earnings history won't be wage-indexed, and bend points can't be computed.
        </p>
      )}

      <div className="max-h-[32rem] overflow-auto">
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-4">
          {sorted.map((row) => (
            <div
              key={row.id}
              className="flex items-center gap-1 rounded-md border border-slate-200 p-1.5 text-xs"
            >
              <input
                type="number"
                aria-label="Year"
                className="w-16 min-w-0 rounded border border-slate-300 px-1 py-0.5 text-right text-slate-900 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                value={row.year}
                onChange={(e) => updateRow(row.id, { year: e.target.valueAsNumber })}
              />
              <span className="text-slate-400">$</span>
              <input
                type="number"
                step={1}
                aria-label="AWI"
                className="w-20 min-w-0 rounded border border-slate-300 px-1 py-0.5 text-right text-slate-900 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                value={row.index}
                onChange={(e) => updateRow(row.id, { index: e.target.valueAsNumber })}
              />
              <button
                type="button"
                onClick={() => removeRow(row.id)}
                aria-label="Remove year"
                title="Remove year"
                className="ml-auto shrink-0 text-red-500 hover:text-red-700"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      </div>

      <button
        type="button"
        onClick={addRow}
        className="self-start text-xs font-medium text-emerald-700 hover:underline"
      >
        + Add year
      </button>
    </div>
  )
}
