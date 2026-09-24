import type { FormulaFunctionsContext, FormulaHistoryContext } from './formula'
import { PlanRangesEditor } from './PlanRangesEditor'
import type { SpecialYear, Variable, WithdrawalPlanRange } from './types'
import type { YearDisplayMode } from './useYearDisplayMode'
import { findOverlappingRangeIds } from './validation'
import { WithdrawalRangeLinesEditor } from './WithdrawalRangeLinesEditor'

interface WithdrawalRangesEditorProps {
  ranges: WithdrawalPlanRange[]
  onChange: (ranges: WithdrawalPlanRange[]) => void
  variables: Variable[]
  resolvedVariableAmounts: Map<string, number>
  spouseEnabled: boolean
  birthYear: number | null
  spouseBirthYear?: number | null
  deathYear: number | null
  specialYears: SpecialYear[]
  mode: YearDisplayMode
  bare?: boolean
  history?: FormulaHistoryContext
  functions?: FormulaFunctionsContext
}

export function WithdrawalRangesEditor({
  ranges,
  onChange,
  variables,
  resolvedVariableAmounts,
  spouseEnabled,
  birthYear,
  spouseBirthYear = null,
  deathYear,
  specialYears,
  mode,
  bare = false,
  history,
  functions,
}: WithdrawalRangesEditorProps) {
  const overlappingIds = findOverlappingRangeIds(ranges)

  return (
    <PlanRangesEditor
      title={bare ? 'Plan' : 'Withdrawal plan'}
      description="Add a range for each period, then list the accounts to draw from, in order, when income falls short. Ranges here can't overlap — only one withdrawal order can apply to a given year. A year not covered by any range uses the default order."
      emptyMessage="No withdrawal ranges yet — every year uses the default order."
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
        lines: [],
      })}
      extraErrorMessage={(range) =>
        overlappingIds.has(range.id) ? 'Overlaps another range — only one withdrawal order can apply per year.' : null
      }
      renderContent={(range, updateRange) => (
        <WithdrawalRangeLinesEditor
          lines={range.lines}
          onChange={(lines) => updateRange({ lines })}
          variables={variables}
          resolvedVariableAmounts={resolvedVariableAmounts}
          spouseEnabled={spouseEnabled}
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
