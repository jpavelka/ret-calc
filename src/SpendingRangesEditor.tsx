import type { FormulaHistoryContext } from './formula'
import { PlanRangesEditor } from './PlanRangesEditor'
import { SpendingAllocationsEditor } from './SpendingAllocationsEditor'
import type { SpecialYear, SpendingPlanRange, Variable } from './types'
import type { YearDisplayMode } from './useYearDisplayMode'

interface SpendingRangesEditorProps {
  ranges: SpendingPlanRange[]
  onChange: (ranges: SpendingPlanRange[]) => void
  variables: Variable[]
  resolvedVariableAmounts: Map<string, number>
  birthYear: number | null
  deathYear: number | null
  specialYears: SpecialYear[]
  mode: YearDisplayMode
  bare?: boolean
  history?: FormulaHistoryContext
}

export function SpendingRangesEditor({
  ranges,
  onChange,
  variables,
  resolvedVariableAmounts,
  birthYear,
  deathYear,
  specialYears,
  mode,
  bare = false,
  history,
}: SpendingRangesEditorProps) {
  return (
    <PlanRangesEditor
      title={bare ? 'Plan' : 'Spending plan'}
      description="Add a range for each period with different spending, then add a named line for each spending item that applies. Ranges can overlap — where they do, all overlapping ranges' spending applies."
      emptyMessage="No spending ranges yet — add one to specify spending for a period."
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
        <SpendingAllocationsEditor
          allocations={range.allocations ?? []}
          onChange={(allocations) => updateRange({ allocations })}
          variables={variables}
          resolvedVariableAmounts={resolvedVariableAmounts}
          specialYears={specialYears}
          deathYear={deathYear}
          history={history}
        />
      )}
    />
  )
}
