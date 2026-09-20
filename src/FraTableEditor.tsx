import type { FraRow } from './types'

interface FraTableEditorProps {
  fullRetirementAgeTable: FraRow[]
  onChange: (fullRetirementAgeTable: FraRow[]) => void
}

// SSA's Full Retirement Age by birth year, stored as total months (e.g. 792
// = 66 years) so claimingAdjustmentFactor can work in months throughout.
// Only ~13 rows even at full fidelity, so the dense grid here is mostly for
// visual consistency with the other Social Security tables.
export function FraTableEditor({ fullRetirementAgeTable, onChange }: FraTableEditorProps) {
  function updateRow(id: string, patch: Partial<FraRow>) {
    onChange(fullRetirementAgeTable.map((r) => (r.id === id ? { ...r, ...patch } : r)))
  }

  function removeRow(id: string) {
    onChange(fullRetirementAgeTable.filter((r) => r.id !== id))
  }

  function addRow() {
    const sorted = [...fullRetirementAgeTable].sort((a, b) => a.birthYear - b.birthYear)
    const last = sorted[sorted.length - 1]
    onChange([
      ...fullRetirementAgeTable,
      {
        id: crypto.randomUUID(),
        birthYear: last ? last.birthYear + 1 : 1960,
        fraMonths: last ? last.fraMonths : 804,
      },
    ])
  }

  const sorted = [...fullRetirementAgeTable].sort((a, b) => a.birthYear - b.birthYear)

  return (
    <div className="flex flex-col gap-2">
      {fullRetirementAgeTable.length === 0 && (
        <p className="text-sm text-slate-400">
          No table set — Full Retirement Age will default to 66 years for everyone.
        </p>
      )}

      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-4">
        {sorted.map((row) => (
          <div
            key={row.id}
            className="flex items-center gap-1 rounded-md border border-slate-200 p-1.5 text-xs"
          >
            <span className="text-slate-400">Born</span>
            <input
              type="number"
              aria-label="Birth year"
              className="w-16 min-w-0 rounded border border-slate-300 px-1 py-0.5 text-right text-slate-900 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
              value={row.birthYear}
              onChange={(e) => updateRow(row.id, { birthYear: e.target.valueAsNumber })}
            />
            <span className="text-slate-400">FRA</span>
            <input
              type="number"
              aria-label="Full Retirement Age, in months"
              className="w-14 min-w-0 rounded border border-slate-300 px-1 py-0.5 text-right text-slate-900 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
              value={row.fraMonths}
              onChange={(e) => updateRow(row.id, { fraMonths: e.target.valueAsNumber })}
            />
            <span className="text-slate-400">mo</span>
            <button
              type="button"
              onClick={() => removeRow(row.id)}
              aria-label="Remove row"
              title="Remove row"
              className="ml-auto shrink-0 text-red-500 hover:text-red-700"
            >
              ✕
            </button>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={addRow}
        className="self-start text-xs font-medium text-emerald-700 hover:underline"
      >
        + Add birth year
      </button>
    </div>
  )
}
