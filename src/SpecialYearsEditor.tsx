import { CollapsibleSection } from './CollapsibleSection'
import { HelpTooltip } from './HelpTooltip'
import { NumberField } from './NumberField'
import { OffsetField } from './OffsetField'
import {
  CURRENT_YEAR_SPECIAL_ID,
  CURRENT_YEAR_SPECIAL_NAME,
  DEATH_YEAR_SPECIAL_ID,
  DEATH_YEAR_SPECIAL_NAME,
  getValidBaseOptions,
  isReservedSpecialYearName,
  resolveSpecialYearRef,
} from './specialYearGraph'
import type { SpecialYear } from './types'
import type { YearDisplayMode } from './useYearDisplayMode'

interface SpecialYearsEditorProps {
  specialYears: SpecialYear[]
  onChange: (specialYears: SpecialYear[]) => void
  birthYear: number | null
  deathYear: number | null
  mode: YearDisplayMode
  onModeChange: (mode: YearDisplayMode) => void
}

export function SpecialYearsEditor({
  specialYears,
  onChange,
  birthYear,
  deathYear,
  mode,
  onModeChange,
}: SpecialYearsEditorProps) {
  const ageMode = mode === 'age' && birthYear !== null
  const unitLabel = ageMode ? 'age' : 'year'
  const toDisplay = (y: number) => (ageMode ? y - (birthYear as number) : y)
  const fromDisplay = (v: number) => (ageMode ? (birthYear as number) + v : v)

  function updateSpecialYear(id: string, patch: Partial<SpecialYear>) {
    onChange(specialYears.map((s) => (s.id === id ? { ...s, ...patch } : s)))
  }

  function removeSpecialYear(id: string) {
    onChange(specialYears.filter((s) => s.id !== id))
  }

  function addSpecialYear() {
    onChange([
      ...specialYears,
      {
        id: crypto.randomUUID(),
        name: '',
        year: new Date().getFullYear(),
        baseSpecialYearId: null,
        baseSpecialYearOffset: 0,
      },
    ])
  }

  return (
    <CollapsibleSection
      title={
        <>
          Special years
          <HelpTooltip text="Name specific years (e.g. Retirement, Kids' college) so you can reference them when setting a range's start or end below, instead of typing a raw year. A special year can also be based on another, including the built-in 'Current year' or 'Death year' (birth year + life expectancy) (e.g. 'Kids' college' = Current year + 20), but not in a circular way. Changing a special year's value updates everything linked to it." />
        </>
      }
      subtitle="Optional — only useful once you start defining year ranges below."
      headerRight={
        <div className="flex shrink-0 overflow-hidden rounded-md border border-slate-300 text-sm">
          <button
            type="button"
            onClick={() => onModeChange('year')}
            className={`px-3 py-1.5 ${
              mode === 'year'
                ? 'bg-emerald-600 text-white'
                : 'bg-white text-slate-600 hover:bg-slate-50'
            }`}
          >
            Calendar years
          </button>
          <button
            type="button"
            onClick={() => onModeChange('age')}
            disabled={birthYear === null}
            title={
              birthYear === null
                ? 'Enter a birth date above to switch to age-relative years'
                : undefined
            }
            className={`border-l border-slate-300 px-3 py-1.5 ${
              mode === 'age'
                ? 'bg-emerald-600 text-white'
                : 'bg-white text-slate-600 hover:bg-slate-50'
            } disabled:cursor-not-allowed disabled:opacity-50`}
          >
            Age
          </button>
        </div>
      }
    >
      {specialYears.length === 0 && (
        <p className="text-sm text-slate-400">
          No special years yet — add one, e.g. "Retirement", to reference later.
        </p>
      )}

      <div className="mt-4 flex flex-col gap-2 first:mt-0">
        {specialYears.map((special) => {
          const validBases = getValidBaseOptions(specialYears, special.id)
          const linked = special.baseSpecialYearId !== null
          const base = special.baseSpecialYearId
            ? resolveSpecialYearRef(special.baseSpecialYearId, specialYears, deathYear)
            : null
          const offset = special.baseSpecialYearOffset ?? 0
          const nameReserved = isReservedSpecialYearName(special.name)

          return (
            <div
              key={special.id}
              className={`rounded-md border p-2 ${
                nameReserved ? 'border-red-300 bg-red-50' : 'border-slate-200'
              }`}
            >
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="text"
                  placeholder="e.g. Retirement"
                  className="min-w-[8rem] flex-1 rounded-md border border-slate-300 px-2 py-1.5 text-sm text-slate-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500"
                  value={special.name}
                  onChange={(e) => updateSpecialYear(special.id, { name: e.target.value })}
                />
                <div className="flex w-56 shrink-0 items-center gap-1">
                  <select
                    aria-label="Based on"
                    className="min-w-0 flex-1 truncate rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500"
                    value={special.baseSpecialYearId ?? ''}
                    onChange={(e) => {
                      const id = e.target.value || null
                      if (!id) {
                        updateSpecialYear(special.id, {
                          baseSpecialYearId: null,
                          baseSpecialYearOffset: 0,
                        })
                        return
                      }
                      const ref = resolveSpecialYearRef(id, specialYears, deathYear)
                      updateSpecialYear(special.id, {
                        baseSpecialYearId: id,
                        baseSpecialYearOffset: 0,
                        year: ref?.year ?? special.year,
                      })
                    }}
                  >
                    <option value="">Custom {unitLabel}</option>
                    <option value={CURRENT_YEAR_SPECIAL_ID}>{CURRENT_YEAR_SPECIAL_NAME}</option>
                    <option value={DEATH_YEAR_SPECIAL_ID}>{DEATH_YEAR_SPECIAL_NAME}</option>
                    {validBases.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name || 'Untitled'}
                      </option>
                    ))}
                  </select>
                  {linked && (
                    <div className="w-24 shrink-0">
                      <OffsetField
                        label="Offset"
                        hideLabel
                        value={offset}
                        onChange={(v) => {
                          updateSpecialYear(special.id, {
                            baseSpecialYearOffset: v,
                            year: base ? base.year + v : special.year,
                          })
                        }}
                      />
                    </div>
                  )}
                </div>
                <div className="w-16 shrink-0">
                  
                  <NumberField
                    label={unitLabel}
                    hideLabel
                    value={toDisplay(special.year)}
                    onChange={(v) => updateSpecialYear(special.id, { year: fromDisplay(v) })}
                    disabled={linked}
                  />
                  {/* {linked ? (
                    <NumberField
                      label={unitLabel}
                      hideLabel
                      value={toDisplay(special.year)}
                      onChange={(v) => updateSpecialYear(special.id, { year: fromDisplay(v) })}
                      disabled={true}
                    />
                  ) : (
                    <NumberField
                      label={unitLabel}
                      hideLabel
                      value={toDisplay(special.year)}
                      onChange={(v) => updateSpecialYear(special.id, { year: fromDisplay(v) })}
                    />
                  )} */}
                </div>
                <button
                  type="button"
                  onClick={() => removeSpecialYear(special.id)}
                  aria-label="Remove special year"
                  title="Remove special year"
                  className="ml-auto rounded-md border border-red-300 px-2 py-1 text-red-600 hover:bg-red-50"
                >
                  ✕
                </button>
              </div>

              {nameReserved && (
                <p className="mt-1 text-xs text-red-600">
                  "{CURRENT_YEAR_SPECIAL_NAME}" and "{DEATH_YEAR_SPECIAL_NAME}" are reserved for
                  the built-in options — pick a different name.
                </p>
              )}
              {linked && !base && (
                <p className="mt-1 text-xs text-red-600">Linked special year was removed</p>
              )}
            </div>
          )
        })}
      </div>

      <button
        type="button"
        onClick={addSpecialYear}
        className="mt-4 rounded-md border border-emerald-600 px-4 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-50"
      >
        Add special year
      </button>
    </CollapsibleSection>
  )
}
