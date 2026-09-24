import { useState, type ReactNode } from 'react'
import type { SpecialYear } from './types'
import type { YearDisplayMode } from './useYearDisplayMode'
import { rangeErrorMessage } from './validation'
import { describeYearBoundary, YearBoundaryField } from './YearBoundaryField'

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
  // Additional per-range validation beyond rangeErrorMessage's own-bounds
  // check — e.g. flagging ranges that overlap a sibling, for domains (unlike
  // most) where that's an error rather than allowed. Checked alongside
  // rangeErrorMessage; either producing a message shows the error styling.
  extraErrorMessage?: (range: T, allRanges: T[]) => string | null
}

// Shared boilerplate for a domain's independent list of year ranges: add /
// remove a range, edit its Start/End (with special-year linking), validate
// overlaps — the domain-specific body (income/spending allocations, or a
// savings/withdrawal lines) is supplied via renderContent.
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
  extraErrorMessage,
}: PlanRangesEditorProps<T>) {
  // Which ranges are showing their full Start/End edit form — condensed text
  // is the default, editing is opt-in per range.
  const [editingIds, setEditingIds] = useState<Set<string>>(new Set())

  function setEditing(id: string, editing: boolean) {
    setEditingIds((prev) => {
      const next = new Set(prev)
      if (editing) next.add(id)
      else next.delete(id)
      return next
    })
  }

  function updateRange(id: string, patch: Partial<T>) {
    onChange(ranges.map((r) => (r.id === id ? { ...r, ...patch } : r)))
  }

  function removeRange(id: string) {
    onChange(ranges.filter((r) => r.id !== id))
    setEditing(id, false)
  }

  function addRange() {
    const last = ranges[ranges.length - 1]
    const start = last ? last.endYear + 1 : new Date().getFullYear()
    const range = createRange(start, start + 9)
    onChange([...ranges, range])
    // A brand-new range's bounds are just a guess — open it straight into
    // edit mode so the user can adjust them right away.
    setEditing(range.id, true)
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
          const error = rangeErrorMessage(range) ?? extraErrorMessage?.(range, ranges) ?? null
          const editing = editingIds.has(range.id)
          return (
            <div
              key={range.id}
              className={`rounded-md border p-4 ${
                error ? 'border-red-300 bg-red-50' : 'border-slate-200'
              }`}
            >
              {editing ? (
                <div className="flex flex-col gap-3">
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
                  <button
                    type="button"
                    onClick={() => setEditing(range.id, false)}
                    className="self-end rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700"
                  >
                    Done
                  </button>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-slate-900">
                    {describeYearBoundary(
                      range.startYear,
                      range.startSpecialYearId ?? null,
                      range.startSpecialYearOffset ?? 0,
                      specialYears,
                      mode,
                      birthYear,
                      deathYear,
                    )}
                    {' – '}
                    {describeYearBoundary(
                      range.endYear,
                      range.endSpecialYearId ?? null,
                      range.endSpecialYearOffset ?? 0,
                      specialYears,
                      mode,
                      birthYear,
                      deathYear,
                    )}
                  </span>
                  <button
                    type="button"
                    onClick={() => setEditing(range.id, true)}
                    className="shrink-0 rounded-md border border-slate-300 px-2 py-1 text-sm text-slate-700 hover:bg-slate-50"
                  >
                    Edit
                  </button>
                </div>
              )}

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
