import { useState } from 'react'
import { AmountSourceEditor, AmountSourceFormulaRow, describeAmountSource } from './AmountSourceEditor'
import type { FormulaFunctionsContext, FormulaHistoryContext } from './formula'
import { PlanRangesEditor } from './PlanRangesEditor'
import type { AcaCoveragePlanRange, AmountSource, SpecialYear, Variable } from './types'
import type { YearDisplayMode } from './useYearDisplayMode'
import { findOverlappingRangeIds } from './validation'

interface AcaCoverageRangesEditorProps {
  ranges: AcaCoveragePlanRange[]
  onChange: (ranges: AcaCoveragePlanRange[]) => void
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

export function AcaCoverageRangesEditor({
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
}: AcaCoverageRangesEditorProps) {
  // Which ranges' amounts are showing their full edit form — condensed,
  // human-readable text is the default; editing is opt-in per range.
  const [editingIds, setEditingIds] = useState<Set<string>>(new Set())
  const overlappingIds = findOverlappingRangeIds(ranges)

  function setEditing(id: string, editing: boolean) {
    setEditingIds((prev) => {
      const next = new Set(prev)
      if (editing) next.add(id)
      else next.delete(id)
      return next
    })
  }

  function defaultAmount(): AmountSource {
    return { kind: 'custom', amount: 0, inflationAdjusted: true, frequency: 'yearly' }
  }

  return (
    <PlanRangesEditor
      title={bare ? 'Plan' : 'ACA marketplace coverage'}
      description="Add a range for each period the household is covered by an ACA marketplace health plan. Enter both the actual premium you pay and the SLCSP (second-lowest-cost Silver plan) benchmark premium for your household in your area — the benchmark is what the premium tax credit is sized against, and is usually higher than a cheaper plan you might actually choose. Both are looked up from healthcare.gov or your state exchange; this app can't derive them automatically. Ranges here can't overlap — only one premium/benchmark pair can apply to a given year."
      emptyMessage="No coverage ranges yet — add one for any period the household buys ACA marketplace insurance."
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
        actualPremium: defaultAmount(),
        benchmarkPremium: defaultAmount(),
      })}
      extraErrorMessage={(range) =>
        overlappingIds.has(range.id) ? 'Overlaps another range — only one coverage range can apply per year.' : null
      }
      renderContent={(range, updateRange) => {
        const editing = editingIds.has(range.id)
        return editing ? (
          <div className="flex flex-col gap-2">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1">
                <span className="text-sm font-medium text-slate-700">Actual premium</span>
                <div className="flex flex-wrap items-center gap-2">
                  <AmountSourceEditor
                    source={range.actualPremium}
                    onChange={(actualPremium) => updateRange({ actualPremium })}
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
                <AmountSourceFormulaRow
                  source={range.actualPremium}
                  onChange={(actualPremium) => updateRange({ actualPremium })}
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
              <div className="flex flex-col gap-1">
                <span className="text-sm font-medium text-slate-700">Benchmark premium (SLCSP)</span>
                <div className="flex flex-wrap items-center gap-2">
                  <AmountSourceEditor
                    source={range.benchmarkPremium}
                    onChange={(benchmarkPremium) => updateRange({ benchmarkPremium })}
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
                <AmountSourceFormulaRow
                  source={range.benchmarkPremium}
                  onChange={(benchmarkPremium) => updateRange({ benchmarkPremium })}
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
                Actual:{' '}
                <span className="font-medium text-slate-900">
                  {describeAmountSource(
                    range.actualPremium,
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
              <span className="text-slate-700">
                Benchmark (SLCSP):{' '}
                <span className="font-medium text-slate-900">
                  {describeAmountSource(
                    range.benchmarkPremium,
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
