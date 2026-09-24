import { useState } from 'react'
import type { FormulaFunctionsContext, FormulaHistoryContext } from './formula'
import { PlanRangesEditor } from './PlanRangesEditor'
import {
  describeRothConversionAmount,
  RothConversionAmountEditor,
  RothConversionAmountFormulaRow,
} from './RothConversionAmountEditor'
import type { RothConversionAmount, RothConversionPlanRange, SpecialYear, Variable } from './types'
import type { YearDisplayMode } from './useYearDisplayMode'

interface RothConversionRangesEditorProps {
  ranges: RothConversionPlanRange[]
  onChange: (ranges: RothConversionPlanRange[]) => void
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

export function RothConversionRangesEditor({
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
}: RothConversionRangesEditorProps) {
  // Which ranges' amounts are showing their full edit form — condensed,
  // human-readable text is the default; editing is opt-in per range.
  const [editingIds, setEditingIds] = useState<Set<string>>(new Set())

  function setEditing(id: string, editing: boolean) {
    setEditingIds((prev) => {
      const next = new Set(prev)
      if (editing) next.add(id)
      else next.delete(id)
      return next
    })
  }

  function defaultAmount(): RothConversionAmount {
    return { kind: 'custom', amount: 0, inflationAdjusted: false }
  }

  return (
    <PlanRangesEditor
      title={bare ? 'Plan' : 'Roth conversions'}
      description="Add a range for each period you want to convert pre-tax money to Roth — e.g. to fill up a low tax bracket before Social Security or RMDs start. Enter amounts in today's dollars — check the inflation box to have an amount grow with inflation each year, or leave it unchecked to hold flat. Ranges can overlap — where they do, all overlapping ranges' amounts apply. Each year's conversion is capped at whatever's actually in the pre-tax account (after that year's contributions and required minimum distribution), and is taxed as ordinary income like a pre-tax withdrawal, but never triggers the 10% early-withdrawal penalty."
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
        amountSelf: defaultAmount(),
        amountSpouse: defaultAmount(),
      })}
      renderContent={(range, updateRange) => {
        const editing = editingIds.has(range.id)
        return editing ? (
          <div className="flex flex-col gap-2">
            <div className={`grid grid-cols-1 gap-4 ${spouseEnabled ? 'sm:grid-cols-2' : ''}`}>
              <div className="flex flex-col gap-1">
                <span className="text-sm font-medium text-slate-700">
                  {spouseEnabled ? 'Amount (You)' : 'Amount to convert'}
                </span>
                <div className="flex flex-wrap items-center gap-2">
                  <RothConversionAmountEditor
                    amount={range.amountSelf}
                    onChange={(amountSelf) => updateRange({ amountSelf })}
                    variables={variables}
                    resolvedVariableAmounts={resolvedVariableAmounts}
                    specialYears={specialYears}
                    deathYear={deathYear}
                    selfBirthYear={birthYear}
                    spouseBirthYear={spouseBirthYear}
                    history={history}
                    functions={functions}
                  />
                </div>
                <RothConversionAmountFormulaRow
                  amount={range.amountSelf}
                  onChange={(amountSelf) => updateRange({ amountSelf })}
                  variables={variables}
                  resolvedVariableAmounts={resolvedVariableAmounts}
                  specialYears={specialYears}
                  deathYear={deathYear}
                  selfBirthYear={birthYear}
                  spouseBirthYear={spouseBirthYear}
                  history={history}
                  functions={functions}
                />
              </div>
              {spouseEnabled && (
                <div className="flex flex-col gap-1">
                  <span className="text-sm font-medium text-slate-700">Amount (Spouse)</span>
                  <div className="flex flex-wrap items-center gap-2">
                    <RothConversionAmountEditor
                      amount={range.amountSpouse}
                      onChange={(amountSpouse) => updateRange({ amountSpouse })}
                      variables={variables}
                      resolvedVariableAmounts={resolvedVariableAmounts}
                      specialYears={specialYears}
                      deathYear={deathYear}
                      selfBirthYear={birthYear}
                      spouseBirthYear={spouseBirthYear}
                      history={history}
                      functions={functions}
                    />
                  </div>
                  <RothConversionAmountFormulaRow
                    amount={range.amountSpouse}
                    onChange={(amountSpouse) => updateRange({ amountSpouse })}
                    variables={variables}
                    resolvedVariableAmounts={resolvedVariableAmounts}
                    specialYears={specialYears}
                    deathYear={deathYear}
                    selfBirthYear={birthYear}
                    spouseBirthYear={spouseBirthYear}
                    history={history}
                    functions={functions}
                  />
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => setEditing(range.id, false)}
              className="self-end rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700"
            >
              Done
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-2 rounded-md border border-slate-200 px-3 py-2">
            <div className="flex min-w-0 flex-wrap items-baseline gap-x-4 gap-y-0.5 text-sm">
              <span className="text-slate-700">
                {spouseEnabled ? 'You: ' : ''}
                <span className="font-medium text-slate-900">
                  {describeRothConversionAmount(
                    range.amountSelf,
                    variables,
                    resolvedVariableAmounts,
                    specialYears,
                    deathYear,
                    history,
                    functions,
                    birthYear,
                    spouseBirthYear,
                  )}
                </span>
              </span>
              {spouseEnabled && (
                <span className="text-slate-700">
                  Spouse:{' '}
                  <span className="font-medium text-slate-900">
                    {describeRothConversionAmount(
                      range.amountSpouse,
                      variables,
                      resolvedVariableAmounts,
                      specialYears,
                      deathYear,
                      history,
                      functions,
                      birthYear,
                      spouseBirthYear,
                    )}
                  </span>
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={() => setEditing(range.id, true)}
              className="shrink-0 rounded-md border border-slate-300 px-2 py-1 text-sm text-slate-700 hover:bg-slate-50"
            >
              Edit
            </button>
          </div>
        )
      }}
    />
  )
}
