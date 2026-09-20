import type { SocialSecurityEarningsYear } from './types'

interface SocialSecurityEarningsHistoryEditorProps {
  earningsHistory: SocialSecurityEarningsYear[]
  onChange: (earningsHistory: SocialSecurityEarningsYear[]) => void
}

// One row per calendar year of Social-Security-taxable wages, same table
// SSA's own "my Social Security" statement shows. Dense grid like
// RmdDivisorsEditor rather than TaxBracketsEditor's cards — a career can run
// 40+ rows — wrapped in its own scroll container since that's meaningfully
// larger than the ~50-row RMD table the dense-grid pattern was sized for.
// Amounts are ACTUAL dollars for that year, not today's dollars — unlike
// almost every other amount in this app, they aren't grown for inflation.
export function SocialSecurityEarningsHistoryEditor({
  earningsHistory,
  onChange,
}: SocialSecurityEarningsHistoryEditorProps) {
  function updateRow(id: string, patch: Partial<SocialSecurityEarningsYear>) {
    // SSA's earnings record has exactly one figure per year — reject an edit
    // that would create a second row for a year another row already covers,
    // rather than silently leaving two ambiguous entries for the same year.
    if (patch.year !== undefined && earningsHistory.some((r) => r.id !== id && r.year === patch.year)) {
      return
    }
    onChange(earningsHistory.map((r) => (r.id === id ? { ...r, ...patch } : r)))
  }

  function removeRow(id: string) {
    onChange(earningsHistory.filter((r) => r.id !== id))
  }

  function addRow() {
    // Seeded off the earliest year entered so far, going backward — most
    // people filling this in start from last year and work back through
    // their career, rather than adding years they haven't worked yet.
    const sorted = [...earningsHistory].sort((a, b) => a.year - b.year)
    const earliest = sorted[0]
    onChange([
      ...earningsHistory,
      {
        id: crypto.randomUUID(),
        year: earliest ? earliest.year - 1 : new Date().getFullYear() - 1,
        earnings: 0,
      },
    ])
  }

  const sorted = [...earningsHistory].sort((a, b) => a.year - b.year)
  const yearCounts = new Map<number, number>()
  for (const row of earningsHistory) yearCounts.set(row.year, (yearCounts.get(row.year) ?? 0) + 1)

  return (
    <div className="flex flex-col gap-2">
      {earningsHistory.length === 0 && (
        <p className="text-sm text-slate-400">
          No years entered yet — years left blank count as $0 toward the 35-year average, same as SSA's own
          treatment of a short work history.
        </p>
      )}

      <div className="max-h-[32rem] overflow-auto">
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-4">
          {sorted.map((row) => (
            <div
              key={row.id}
              title={
                yearCounts.get(row.year)! > 1
                  ? `${row.year} appears more than once — only one of these is used, remove the extra.`
                  : undefined
              }
              className={`flex items-center gap-1 rounded-md border p-1.5 text-xs ${
                yearCounts.get(row.year)! > 1 ? 'border-red-300 bg-red-50' : 'border-slate-200'
              }`}
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
                step={100}
                aria-label="Earnings"
                className="w-20 min-w-0 rounded border border-slate-300 px-1 py-0.5 text-right text-slate-900 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                value={row.earnings}
                onChange={(e) => updateRow(row.id, { earnings: e.target.valueAsNumber })}
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
