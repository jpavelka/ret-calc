import type { ReactNode } from 'react'
import type { SpecialYear } from './types'
import type { YearDisplayMode } from './useYearDisplayMode'
import { rangeErrorMessage } from './validation'
import { YearBoundaryField } from './YearBoundaryField'

interface PlanRangeBoundsLike {
  id: string
  startYear: number
  endYear: number
  startSpecialYearId: string | null
  startSpecialYearOffset: number
  endSpecialYearId: string | null
  endSpecialYearOffset: number
}

interface PlanRangesEditorProps<T extends PlanRangeBoundsLike> {
  title: string
  description: string
  emptyMessage: string
  addLabel: string
  ranges: T[]
  onChange: (ranges: T[]) => void
  birthYear: number | null
  deathYear: number | null
  specialYears: SpecialYear[]
  mode: YearDisplayMode
  createRange: (startYear: number, endYear: number) => T
  renderContent: (range: T, updateRange: (patch: Partial<T>) => void) => ReactNode
  // When true, renders as a plain block (no card/border/top-level heading) so
  // it can be embedded inside another section instead of standing alone.
  bare?: boolean
}

// Shared boilerplate for a domain's independent list of year ranges: add /
// remove a range, edit its Start/End (with special-year linking), validate
// overlaps — the domain-specific body (income/spending allocations, or a
// savings/withdrawal priority) is supplied via renderContent.
export function PlanRangesEditor<T extends PlanRangeBoundsLike>({
  title,
  description,
  emptyMessage,
  addLabel,
  ranges,
  onChange,
  birthYear,
  deathYear,
  specialYears,
  mode,
  createRange,
  renderContent,
  bare = false,
}: PlanRangesEditorProps<T>) {
  function updateRange(id: string, patch: Partial<T>) {
    onChange(ranges.map((r) => (r.id === id ? { ...r, ...patch } : r)))
  }

  function removeRange(id: string) {
    onChange(ranges.filter((r) => r.id !== id))
  }

  function addRange() {
    const last = ranges[ranges.length - 1]
    const start = last ? last.endYear + 1 : new Date().getFullYear()
    onChange([...ranges, createRange(start, start + 9)])
  }

  const unitLabel = mode === 'age' && birthYear !== null ? 'age' : 'year'

  const Wrapper = bare ? 'div' : 'section'
  const Heading = bare ? 'h3' : 'h2'

  return (
    <Wrapper className={bare ? '' : 'rounded-lg border border-slate-200 bg-white p-5 shadow-sm'}>
      <Heading className={bare ? 'text-sm font-semibold text-slate-600' : 'text-lg font-semibold text-slate-900'}>
        {title}
      </Heading>
      <p className="mt-1 text-sm text-slate-500">{description}</p>

      <div className="mt-4 flex flex-col gap-4">
        {ranges.length === 0 && (
          <p className="text-sm text-slate-400">{emptyMessage}</p>
        )}
        {ranges.map((range) => {
          const error = rangeErrorMessage(range)
          return (
            <div
              key={range.id}
              className={`rounded-md border p-4 ${
                error ? 'border-red-300 bg-red-50' : 'border-slate-200'
              }`}
            >
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-2">
                <YearBoundaryField
                  label="Start"
                  year={range.startYear}
                  specialYearId={range.startSpecialYearId ?? null}
                  specialYearOffset={range.startSpecialYearOffset ?? 0}
                  specialYears={specialYears}
                  mode={mode}
                  birthYear={birthYear}
                  deathYear={deathYear}
                  help={`The first ${unitLabel} this range applies to, inclusive.`}
                  onChange={(patch) =>
                    updateRange(range.id, {
                      ...(patch.year !== undefined ? { startYear: patch.year } : {}),
                      ...(patch.specialYearId !== undefined
                        ? { startSpecialYearId: patch.specialYearId }
                        : {}),
                      ...(patch.specialYearOffset !== undefined
                        ? { startSpecialYearOffset: patch.specialYearOffset }
                        : {}),
                    } as Partial<T>)
                  }
                />
                <YearBoundaryField
                  label="End"
                  year={range.endYear}
                  specialYearId={range.endSpecialYearId ?? null}
                  specialYearOffset={range.endSpecialYearOffset ?? 0}
                  specialYears={specialYears}
                  mode={mode}
                  birthYear={birthYear}
                  deathYear={deathYear}
                  help={`The last ${unitLabel} this range applies to, inclusive.`}
                  onChange={(patch) =>
                    updateRange(range.id, {
                      ...(patch.year !== undefined ? { endYear: patch.year } : {}),
                      ...(patch.specialYearId !== undefined
                        ? { endSpecialYearId: patch.specialYearId }
                        : {}),
                      ...(patch.specialYearOffset !== undefined
                        ? { endSpecialYearOffset: patch.specialYearOffset }
                        : {}),
                    } as Partial<T>)
                  }
                />
              </div>

              <div className="mt-3">
                {renderContent(range, (patch) => updateRange(range.id, patch))}
              </div>

              {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
              <button
                type="button"
                onClick={() => removeRange(range.id)}
                className="mt-3 text-sm text-red-600 hover:underline"
              >
                Remove range
              </button>
            </div>
          )
        })}
      </div>

      <button
        type="button"
        onClick={addRange}
        className="mt-4 rounded-md border border-emerald-600 px-4 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-50"
      >
        {addLabel}
      </button>
    </Wrapper>
  )
}
