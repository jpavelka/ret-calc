import { CurrencyField } from './CurrencyField'
import { PlanRangesEditor } from './PlanRangesEditor'
import type { RothConversionPlanRange, SpecialYear } from './types'
import type { YearDisplayMode } from './useYearDisplayMode'

interface RothConversionRangesEditorProps {
  ranges: RothConversionPlanRange[]
  onChange: (ranges: RothConversionPlanRange[]) => void
  spouseEnabled: boolean
  birthYear: number | null
  deathYear: number | null
  specialYears: SpecialYear[]
  mode: YearDisplayMode
  bare?: boolean
}

export function RothConversionRangesEditor({
  ranges,
  onChange,
  spouseEnabled,
  birthYear,
  deathYear,
  specialYears,
  mode,
  bare = false,
}: RothConversionRangesEditorProps) {
  return (
    <PlanRangesEditor
      title={bare ? 'Plan' : 'Roth conversions'}
      description="Add a range for each period you want to convert pre-tax money to Roth — e.g. to fill up a low tax bracket before Social Security or RMDs start. Enter amounts in today's dollars, held flat rather than grown for inflation. Ranges can overlap — where they do, all overlapping ranges' amounts apply. Each year's conversion is capped at whatever's actually in the pre-tax account (after that year's contributions and required minimum distribution), and is taxed as ordinary income like a pre-tax withdrawal, but never triggers the 10% early-withdrawal penalty."
      emptyMessage="No conversion ranges yet — add one to convert pre-tax money to Roth for a period."
      addLabel="Add range"
      ranges={ranges}
      onChange={onChange}
      birthYear={birthYear}
      deathYear={deathYear}
      specialYears={specialYears}
      mode={mode}
      bare={bare}
      createRange={(startYear, endYear) => ({
        id: crypto.randomUUID(),
        startYear,
        endYear,
        startSpecialYearId: null,
        startSpecialYearOffset: 0,
        endSpecialYearId: null,
        endSpecialYearOffset: 0,
        amountSelf: 0,
        amountSpouse: 0,
      })}
      renderContent={(range, updateRange) => (
        <div className={`grid grid-cols-1 gap-4 ${spouseEnabled ? 'sm:grid-cols-2' : ''}`}>
          <CurrencyField
            label={spouseEnabled ? 'Amount (You)' : 'Amount to convert'}
            min={0}
            value={range.amountSelf}
            onChange={(v) => updateRange({ amountSelf: v })}
          />
          {spouseEnabled && (
            <CurrencyField
              label="Amount (Spouse)"
              min={0}
              value={range.amountSpouse}
              onChange={(v) => updateRange({ amountSpouse: v })}
            />
          )}
        </div>
      )}
    />
  )
}
