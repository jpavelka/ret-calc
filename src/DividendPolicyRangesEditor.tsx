import { PlanRangesEditor } from './PlanRangesEditor'
import type { DividendPolicy, DividendPolicyPlanRange, SpecialYear } from './types'
import type { YearDisplayMode } from './useYearDisplayMode'
import { findOverlappingRangeIds } from './validation'

interface DividendPolicyRangesEditorProps {
  ranges: DividendPolicyPlanRange[]
  onChange: (ranges: DividendPolicyPlanRange[]) => void
  birthYear: number | null
  deathYear: number | null
  specialYears: SpecialYear[]
  mode: YearDisplayMode
  bare?: boolean
}

export function DividendPolicyRangesEditor({
  ranges,
  onChange,
  birthYear,
  deathYear,
  specialYears,
  mode,
  bare = false,
}: DividendPolicyRangesEditorProps) {
  const overlappingIds = findOverlappingRangeIds(ranges)

  return (
    <PlanRangesEditor
      title={bare ? 'Plan' : 'Dividend policy'}
      description="Choose, for each range of years, whether the taxable brokerage's dividends are reinvested (added back to the account, increasing its cost basis) or paid out as cash. A year not covered by any range below defaults to reinvested. Ranges here can't overlap — only one policy can apply to a given year."
      emptyMessage="No ranges yet — dividends reinvest by default. Add a range to pay them out as cash for a period instead."
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
        policy: 'reinvest',
      })}
      extraErrorMessage={(range) =>
        overlappingIds.has(range.id) ? 'Overlaps another range — only one policy can apply per year.' : null
      }
      renderContent={(range, updateRange) => (
        <div className="flex items-center gap-4">
          {(
            [
              { value: 'reinvest', label: 'Reinvest' },
              { value: 'cash', label: 'Pay out as cash' },
            ] as { value: DividendPolicy; label: string }[]
          ).map((option) => (
            <label key={option.value} className="flex items-center gap-1.5 text-sm text-slate-700">
              <input
                type="radio"
                name={`dividend-policy-${range.id}`}
                checked={range.policy === option.value}
                onChange={() => updateRange({ policy: option.value })}
              />
              {option.label}
            </label>
          ))}
        </div>
      )}
    />
  )
}
