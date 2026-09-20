import { PlanRangesEditor } from './PlanRangesEditor'
import { syncAllocationsToLineIds } from './prioritySetSync'
import { RangePriorityEditor } from './RangePriorityEditor'
import type {
  IncomeSourceDef,
  SavingsLineDef,
  SavingsPlanRange,
  SavingsPrioritySet,
  SpecialYear,
} from './types'
import type { YearDisplayMode } from './useYearDisplayMode'

interface SavingsRangesEditorProps {
  ranges: SavingsPlanRange[]
  onChange: (ranges: SavingsPlanRange[]) => void
  lineDefs: SavingsLineDef[]
  prioritySets: SavingsPrioritySet[]
  incomeSourceDefs: IncomeSourceDef[]
  spouseEnabled: boolean
  birthYear: number | null
  deathYear: number | null
  specialYears: SpecialYear[]
  mode: YearDisplayMode
  bare?: boolean
}

export function SavingsRangesEditor({
  ranges,
  onChange,
  lineDefs,
  prioritySets,
  incomeSourceDefs,
  spouseEnabled,
  birthYear,
  deathYear,
  specialYears,
  mode,
  bare = false,
}: SavingsRangesEditorProps) {
  return (
    <PlanRangesEditor
      title={bare ? 'Plan' : 'Savings plan'}
      description="Add a range for each period, pick a savings priority, then set an amount for each of its lines. Ranges can overlap — where they do, all overlapping ranges' savings apply. Any income beyond what's allocated to spending and savings is assumed to be saved into a taxable brokerage account."
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
        prioritySetId: null,
        allocations: [],
      })}
      renderContent={(range, updateRange) => (
        <RangePriorityEditor
          title="Savings priority"
          help="Pick the named savings priority to use for this range, then set an amount for each of its lines. Enter amounts in today's dollars — this app grows them for inflation."
          noSetsMessage="Define a savings priority above first."
          noSetSelectedMessage="Select a savings priority to enter amounts."
          prioritySetId={range.prioritySetId ?? null}
          onPrioritySetChange={(setId) => {
            const set = prioritySets.find((s) => s.id === setId)
            updateRange({
              prioritySetId: setId,
              allocations: set
                ? syncAllocationsToLineIds(
                    range.allocations,
                    set.lineIds,
                    new Map(lineDefs.map((d) => [d.id, d.amount])),
                  )
                : [],
            })
          }}
          prioritySets={prioritySets}
          lineDefs={lineDefs}
          allocations={range.allocations ?? []}
          onAllocationsChange={(allocations) => updateRange({ allocations })}
          spouseEnabled={spouseEnabled}
          incomeSourceDefs={incomeSourceDefs}
        />
      )}
    />
  )
}
