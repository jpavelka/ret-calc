import { IncomeAllocationsEditor } from './IncomeAllocationsEditor'
import { PlanRangesEditor } from './PlanRangesEditor'
import type { IncomePlanRange, IncomeSourceDef, SpecialYear } from './types'
import type { YearDisplayMode } from './useYearDisplayMode'

interface IncomeRangesEditorProps {
  ranges: IncomePlanRange[]
  onChange: (ranges: IncomePlanRange[]) => void
  incomeSourceDefs: IncomeSourceDef[]
  birthYear: number | null
  deathYear: number | null
  specialYears: SpecialYear[]
  mode: YearDisplayMode
  bare?: boolean
}

export function IncomeRangesEditor({
  ranges,
  onChange,
  incomeSourceDefs,
  birthYear,
  deathYear,
  specialYears,
  mode,
  bare = false,
}: IncomeRangesEditorProps) {
  return (
    <PlanRangesEditor
      title={bare ? 'Plan' : 'Income plan'}
      description="Add a range for each period with different income, then set an amount for each income source that applies. Ranges can overlap — where they do, all overlapping ranges' income applies."
      emptyMessage="No income ranges yet — add one to specify income for a period."
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
        allocations: [],
      })}
      renderContent={(range, updateRange) => (
        <IncomeAllocationsEditor
          allocations={range.allocations ?? []}
          onChange={(allocations) => updateRange({ allocations })}
          incomeSourceDefs={incomeSourceDefs}
        />
      )}
    />
  )
}
