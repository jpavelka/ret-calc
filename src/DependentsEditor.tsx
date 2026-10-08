import { calculateAge, defaultBirthDate } from './age'
import { DateField } from './DateField'
import { NumberField } from './NumberField'
import { DEFAULT_TAX_DEPENDENT_UNTIL_AGE } from './types'
import type { Dependent } from './types'

interface DependentsEditorProps {
  dependents: Dependent[]
  onChange: (dependents: Dependent[]) => void
}

// ACA's own rule: an adult child can stay on a parent's health plan until
// their 26th birthday.
const DEFAULT_AGES_OFF_COVERAGE_AT = 26

// A dependent's age matters for household-size and age-based tax
// calculations (ACA premium tax credit sizing, and the Child Tax Credit /
// Credit for Other Dependents), so each one gets a real birth date rather
// than just a count. Card-row list, same pattern as
// StateContributionDeductionsEditor, since each row needs more than one or
// two fields.
export function DependentsEditor({ dependents, onChange }: DependentsEditorProps) {
  function updateDependent(id: string, patch: Partial<Dependent>) {
    onChange(dependents.map((d) => (d.id === id ? { ...d, ...patch } : d)))
  }

  function removeDependent(id: string) {
    onChange(dependents.filter((d) => d.id !== id))
  }

  function addDependent() {
    onChange([
      ...dependents,
      {
        id: crypto.randomUUID(),
        name: '',
        birthDate: defaultBirthDate(10),
        agesOffCoverageAt: DEFAULT_AGES_OFF_COVERAGE_AT,
        taxDependentUntilAge: DEFAULT_TAX_DEPENDENT_UNTIL_AGE,
      },
    ])
  }

  return (
    <div className="flex flex-col gap-2">
      {dependents.length === 0 && (
        <p className="text-sm text-slate-400">
          No dependents yet — add one to count them toward household size for tax and premium-credit calculations.
        </p>
      )}

      <div className="flex flex-col gap-2">
        {dependents.map((dependent) => {
          const age = calculateAge(dependent.birthDate)
          return (
            <div
              key={dependent.id}
              className="flex flex-wrap items-end gap-2 rounded-md border border-slate-200 p-2"
            >
              <div className="min-w-[10rem] flex-1">
                <label className="flex flex-col gap-1">
                  <span className="text-sm font-medium text-slate-700">Name</span>
                  <input
                    type="text"
                    placeholder="e.g. Sam"
                    className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm text-slate-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500"
                    value={dependent.name}
                    onChange={(e) => updateDependent(dependent.id, { name: e.target.value })}
                  />
                </label>
              </div>
              <div className="w-40">
                <DateField
                  label="Birth date"
                  value={dependent.birthDate}
                  onChange={(birthDate) => updateDependent(dependent.id, { birthDate })}
                  hint={age !== null ? `Current age: ${age}` : undefined}
                />
              </div>
              <div className="w-44">
                <NumberField
                  label="Ages off insurance at"
                  min={0}
                  step={1}
                  value={dependent.agesOffCoverageAt}
                  onChange={(v) => updateDependent(dependent.id, { agesOffCoverageAt: v })}
                  help="Age at which this dependent stops counting toward household size for ACA premium tax credit purposes — the ACA's own rule allows staying on a parent's plan until 26."
                />
              </div>
              <div className="w-44">
                <NumberField
                  label="Tax dependent until age"
                  min={0}
                  step={1}
                  value={dependent.taxDependentUntilAge ?? DEFAULT_TAX_DEPENDENT_UNTIL_AGE}
                  onChange={(v) => updateDependent(dependent.id, { taxDependentUntilAge: v })}
                  help="Age at which this dependent stops qualifying for the Child Tax Credit or Credit for Other Dependents. Real IRS dependency rules are more nuanced than a single age (a support test, student status, etc.) — defaults to 19 (the general 'qualifying child' cutoff); raise it for a full-time student (up to 24) or a permanently disabled or other dependent with no age limit."
                />
              </div>
              <button
                type="button"
                onClick={() => removeDependent(dependent.id)}
                aria-label="Remove dependent"
                title="Remove dependent"
                className="ml-auto rounded-md border border-red-300 px-2 py-1 text-xs text-red-600 hover:bg-red-50"
              >
                ✕
              </button>
            </div>
          )
        })}
      </div>

      <button
        type="button"
        onClick={addDependent}
        className="self-start text-xs font-medium text-emerald-700 hover:underline"
      >
        + Add dependent
      </button>
    </div>
  )
}
