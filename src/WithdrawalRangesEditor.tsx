import type { FormulaHistoryContext } from './formula'
import { PlanRangesEditor } from './PlanRangesEditor'
import { syncAllocationsToLineIds } from './prioritySetSync'
import { RangePriorityEditor } from './RangePriorityEditor'
import type {
  SpecialYear,
  WithdrawalLineDef,
  WithdrawalPlanRange,
  WithdrawalPrioritySet,
} from './types'
import type { YearDisplayMode } from './useYearDisplayMode'

interface WithdrawalRangesEditorProps {
  ranges: WithdrawalPlanRange[]
  onChange: (ranges: WithdrawalPlanRange[]) => void
  lineDefs: WithdrawalLineDef[]
  prioritySets: WithdrawalPrioritySet[]
  spouseEnabled: boolean
  birthYear: number | null
  deathYear: number | null
  specialYears: SpecialYear[]
  mode: YearDisplayMode
  bare?: boolean
  history?: FormulaHistoryContext
}

export function WithdrawalRangesEditor({
  ranges,
  onChange,
  lineDefs,
  prioritySets,
  spouseEnabled,
  birthYear,
  deathYear,
  specialYears,
  mode,
  bare = false,
  history,
}: WithdrawalRangesEditorProps) {
  return (
    <PlanRangesEditor
      title={bare ? 'Plan' : 'Withdrawal plan'}
      description="Add a range for each period, pick a withdrawal priority, then set an amount for each of its lines. Ranges can overlap — where they do, all overlapping ranges' withdrawals apply."
      emptyMessage="No withdrawal ranges yet — add one to specify withdrawals for a period."
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
          title="Withdrawal priority"
          help="Pick the named withdrawal priority to use for this range, then set an amount for each of its lines. Enter amounts in today's dollars — this app grows them for inflation."
          noSetsMessage="Define a withdrawal priority above first."
          noSetSelectedMessage="Select a withdrawal priority to enter amounts."
          prioritySetId={range.prioritySetId ?? null}
          onPrioritySetChange={(setId) => {
            const set = prioritySets.find((s) => s.id === setId)
            updateRange({
              prioritySetId: setId,
              allocations: set
                ? syncAllocationsToLineIds(range.allocations, set.lineIds)
                : [],
            })
          }}
          prioritySets={prioritySets}
          lineDefs={lineDefs}
          allocations={range.allocations ?? []}
          onAllocationsChange={(allocations) => updateRange({ allocations })}
          spouseEnabled={spouseEnabled}
          specialYears={specialYears}
          deathYear={deathYear}
          history={history}
        />
      )}
    />
  )
}
