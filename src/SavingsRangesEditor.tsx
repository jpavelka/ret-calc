import type { FormulaFunctionsContext, FormulaHistoryContext } from './formula'
import { PlanRangesEditor } from './PlanRangesEditor'
import { SavingsRangeLinesEditor } from './SavingsRangeLinesEditor'
import type { SavingsPlanRange, SpecialYear, Variable } from './types'
import type { YearDisplayMode } from './useYearDisplayMode'

interface SavingsRangesEditorProps {
  ranges: SavingsPlanRange[]
  onChange: (ranges: SavingsPlanRange[]) => void
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

export function SavingsRangesEditor({
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
}: SavingsRangesEditorProps) {
  return (
    <PlanRangesEditor
      title={bare ? 'Plan' : 'Savings plan'}
      description="Add a range for each period, then build its savings plan directly inside it: a layered list of lines, each with an account and an amount. Ranges can overlap — where they do, all overlapping ranges' savings apply. Any income beyond what's allocated to spending and savings is assumed to be saved into a taxable brokerage account."
      emptyMessage="No savings ranges yet — add one to specify savings for a period."
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
      renderContent={(range, updateRange) => (
        <SavingsRangeLinesEditor
          lines={range.lines}
          onChange={(lines) => updateRange({ lines })}
          spouseEnabled={spouseEnabled}
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
