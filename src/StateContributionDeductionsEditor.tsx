import { ACCOUNT_LABELS, ACCOUNT_TYPES } from './accounts'
import { CurrencyField } from './CurrencyField'
import { NumberField } from './NumberField'
import type { AccountType, StateContributionDeduction } from './types'

interface StateContributionDeductionsEditorProps {
  deductions: StateContributionDeduction[]
  onChange: (deductions: StateContributionDeduction[]) => void
}

// State income tax deductions sized to contributions into a specific account
// type, e.g. Kansas's 529 deduction (up to $6,000/beneficiary/year for a
// couple, non-carryforward). A list, like every other editable tax input
// here, even though one row is the common case.
export function StateContributionDeductionsEditor({
  deductions,
  onChange,
}: StateContributionDeductionsEditorProps) {
  function updateDeduction(id: string, patch: Partial<StateContributionDeduction>) {
    onChange(deductions.map((d) => (d.id === id ? { ...d, ...patch } : d)))
  }

  function removeDeduction(id: string) {
    onChange(deductions.filter((d) => d.id !== id))
  }

  function addDeduction() {
    onChange([
      ...deductions,
      {
        id: crypto.randomUUID(),
        name: 'Kansas 529 deduction',
        account: 'college529',
        perBeneficiaryCap: 6_000,
        beneficiaryCount: 1,
      },
    ])
  }

  return (
    <div className="flex flex-col gap-2">
      {deductions.length === 0 && (
        <p className="text-sm text-slate-400">
          No state contribution deductions yet — add one, e.g. Kansas's 529 deduction.
        </p>
      )}

      <div className="flex flex-col gap-2">
        {deductions.map((deduction) => (
          <div
            key={deduction.id}
            className="flex flex-wrap items-center gap-2 rounded-md border border-slate-200 p-2"
          >
            <input
              type="text"
              placeholder="e.g. Kansas 529 deduction"
              className="min-w-[10rem] flex-1 rounded-md border border-slate-300 px-2 py-1.5 text-sm text-slate-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500"
              value={deduction.name}
              onChange={(e) => updateDeduction(deduction.id, { name: e.target.value })}
            />
            <div className="w-40">
              <label className="flex flex-col gap-1">
                <span className="text-sm font-medium text-slate-700">Account</span>
                <select
                  className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500"
                  value={deduction.account}
                  onChange={(e) => updateDeduction(deduction.id, { account: e.target.value as AccountType })}
                >
                  {ACCOUNT_TYPES.map((account) => (
                    <option key={account} value={account}>
                      {ACCOUNT_LABELS[account]}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="w-36">
              <CurrencyField
                label="Cap per beneficiary"
                min={0}
                value={deduction.perBeneficiaryCap}
                onChange={(v) => updateDeduction(deduction.id, { perBeneficiaryCap: v })}
              />
            </div>
            <div className="w-28">
              <NumberField
                label="Beneficiaries"
                min={0}
                step={1}
                value={deduction.beneficiaryCount}
                onChange={(v) => updateDeduction(deduction.id, { beneficiaryCount: v })}
              />
            </div>
            <button
              type="button"
              onClick={() => removeDeduction(deduction.id)}
              aria-label="Remove state contribution deduction"
              title="Remove state contribution deduction"
              className="ml-auto rounded-md border border-red-300 px-2 py-1 text-xs text-red-600 hover:bg-red-50"
            >
              ✕
            </button>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={addDeduction}
        className="self-start text-xs font-medium text-emerald-700 hover:underline"
      >
        + Add state contribution deduction
      </button>
    </div>
  )
}
