import type { RmdDivisor } from './types'

interface RmdDivisorsEditorProps {
  divisors: RmdDivisor[]
  onChange: (divisors: RmdDivisor[]) => void
}

// The IRS Uniform Lifetime Table: age -> distribution period. Dense grid
// rather than TaxBracketsEditor's one-row-per-entry cards — there are ~50
// rows here, versus a handful of tax brackets, so a bordered card per row
// would make this section unusably tall.
export function RmdDivisorsEditor({ divisors, onChange }: RmdDivisorsEditorProps) {
  function updateDivisor(id: string, patch: Partial<RmdDivisor>) {
    onChange(divisors.map((d) => (d.id === id ? { ...d, ...patch } : d)))
  }

  function removeDivisor(id: string) {
    onChange(divisors.filter((d) => d.id !== id))
  }

  function addDivisor() {
    const last = divisors[divisors.length - 1]
    onChange([
      ...divisors,
      {
        id: crypto.randomUUID(),
        age: last ? last.age + 1 : 72,
        divisor: last ? Math.max(1, last.divisor - 0.5) : 27.4,
      },
    ])
  }

  return (
    <div className="flex flex-col gap-2">
      {divisors.length === 0 && (
        <p className="text-sm text-slate-400">
          No divisors set — required minimum distributions won't be applied.
        </p>
      )}

      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-4">
        {divisors.map((row) => (
          <div
            key={row.id}
            className="flex items-center gap-1 rounded-md border border-slate-200 p-1.5 text-xs"
          >
            <span className="text-slate-400">Age</span>
            <input
              type="number"
              aria-label="Age"
              className="w-12 min-w-0 rounded border border-slate-300 px-1 py-0.5 text-right text-slate-900 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
              value={row.age}
              onChange={(e) => updateDivisor(row.id, { age: e.target.valueAsNumber })}
            />
            <span className="text-slate-400">÷</span>
            <input
              type="number"
              step={0.1}
              aria-label="Divisor"
              className="w-14 min-w-0 rounded border border-slate-300 px-1 py-0.5 text-right text-slate-900 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
              value={row.divisor}
              onChange={(e) => updateDivisor(row.id, { divisor: e.target.valueAsNumber })}
            />
            <button
              type="button"
              onClick={() => removeDivisor(row.id)}
              aria-label="Remove divisor"
              title="Remove divisor"
              className="ml-auto shrink-0 text-red-500 hover:text-red-700"
            >
              ✕
            </button>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={addDivisor}
        className="self-start text-xs font-medium text-emerald-700 hover:underline"
      >
        + Add age
      </button>
    </div>
  )
}
