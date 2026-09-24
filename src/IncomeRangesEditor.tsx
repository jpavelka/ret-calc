import type { FormulaFunctionsContext, FormulaHistoryContext } from './formula'
import { IncomeAllocationsEditor } from './IncomeAllocationsEditor'
import { PlanRangesEditor } from './PlanRangesEditor'
import type { IncomePlanRange, SpecialYear, Variable } from './types'
import type { YearDisplayMode } from './useYearDisplayMode'

interface IncomeRangesEditorProps {
  ranges: IncomePlanRange[]
  onChange: (ranges: IncomePlanRange[]) => void
  variables: Variable[]
  resolvedVariableAmounts: Map<string, number>
  birthYear: number | null
  spouseBirthYear?: number | null
  deathYear: number | null
  specialYears: SpecialYear[]
  mode: YearDisplayMode
  bare?: boolean
  history?: FormulaHistoryContext
  functions?: FormulaFunctionsContext
}

export function IncomeRangesEditor({
  ranges,
  onChange,
  variables,
  resolvedVariableAmounts,
  birthYear,
  spouseBirthYear = null,
  deathYear,
  specialYears,
  mode,
  bare = false,
  history,
  functions,
}: IncomeRangesEditorProps) {
  return (
    <PlanRangesEditor
      title={bare ? 'Plan' : 'Income plan'}
      description="Add a range for each period with different income, then add a named line for each income source that applies. Ranges can overlap — where they do, all overlapping ranges' income applies."
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
          variables={variables}
          resolvedVariableAmounts={resolvedVariableAmounts}
          specialYears={specialYears}
          deathYear={deathYear}
          selfBirthYear={birthYear}
          spouseBirthYear={spouseBirthYear}
          history={history}
          functions={functions}
        />
      )}
    />
  )
}
