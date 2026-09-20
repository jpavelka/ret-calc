import { NumberField } from './NumberField'
import { OffsetField } from './OffsetField'
import {
  CURRENT_YEAR_SPECIAL_ID,
  CURRENT_YEAR_SPECIAL_NAME,
  DEATH_YEAR_SPECIAL_ID,
  DEATH_YEAR_SPECIAL_NAME,
  resolveSpecialYearRef,
} from './specialYearGraph'
import type { SpecialYear } from './types'
import type { YearDisplayMode } from './useYearDisplayMode'

interface YearBoundaryFieldProps {
  label: string
  year: number
  specialYearId: string | null
  specialYearOffset: number
  specialYears: SpecialYear[]
  mode: YearDisplayMode
  birthYear: number | null
  deathYear: number | null
  help?: string
  onChange: (patch: {
    year?: number
    specialYearId?: string | null
    specialYearOffset?: number
  }) => void
}

export function YearBoundaryField({
  label,
  year,
  specialYearId,
  specialYearOffset,
  specialYears,
  mode,
  birthYear,
  deathYear,
  help,
  onChange,
}: YearBoundaryFieldProps) {
  const ageMode = mode === 'age' && birthYear !== null
  const unitLabel = ageMode ? 'age' : 'year'
  const toDisplay = (y: number) => (ageMode ? y - (birthYear as number) : y)
  const fromDisplay = (v: number) => (ageMode ? (birthYear as number) + v : v)

  const linked = specialYearId !== null
  const linkedRef = specialYearId
    ? resolveSpecialYearRef(specialYearId, specialYears, deathYear)
    : null
  const offset = specialYearOffset ?? 0

  return (
    <div className="flex flex-col gap-1">
      <NumberField
        label={`${label} ${unitLabel}`}
        value={toDisplay(year)}
        onChange={(v) => onChange({ year: fromDisplay(v) })}
        help={help}
        disabled={linked}
      />
      <div className="flex items-center gap-2">
        <select
          aria-label={`${label} year source`}
          className="min-w-0 flex-1 rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-500 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500"
          value={specialYearId ?? ''}
          onChange={(e) => {
            const id = e.target.value || null
            if (!id) {
              onChange({ specialYearId: null, specialYearOffset: 0 })
              return
            }
            const ref = resolveSpecialYearRef(id, specialYears, deathYear)
            onChange({
              specialYearId: id,
              specialYearOffset: 0,
              year: ref?.year ?? year,
            })
          }}
        >
          <option value="">Custom {unitLabel}</option>
          <option value={CURRENT_YEAR_SPECIAL_ID}>{CURRENT_YEAR_SPECIAL_NAME}</option>
          <option value={DEATH_YEAR_SPECIAL_ID}>{DEATH_YEAR_SPECIAL_NAME}</option>
          {specialYears.map((special) => (
            <option key={special.id} value={special.id}>
              {special.name}
            </option>
          ))}
        </select>
        {linked && linkedRef && (
          <div className="w-24 shrink-0">
            <OffsetField
              label="Offset"
              hideLabel
              value={offset}
              onChange={(v) =>
                onChange({
                  specialYearOffset: v,
                  year: linkedRef.year + v,
                })
              }
            />
          </div>
        )}
      </div>
      {linked && !linkedRef && (
        <span className="text-xs text-red-600">Linked special year was removed</span>
      )}
    </div>
  )
}
