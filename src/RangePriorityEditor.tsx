import { accountHasOwner, ACCOUNT_LABELS } from './accounts'
import { AmountSourceEditor, AmountSourceFormulaRow } from './AmountSourceEditor'
import type { FormulaHistoryContext } from './formula'
import { HelpTooltip } from './HelpTooltip'
import { calculateMatchAmount } from './match'
import { resolveAllocation } from './projection'
import { specialYearPreviewScope } from './specialYearGraph'
import type { AccountType, MatchConfig, Owner, PriorityAllocation, SpecialYear, Variable } from './types'

interface AllocationLineDef {
  id: string
  name: string
  account: AccountType
  owner: Owner
  match?: MatchConfig | null
}

interface PrioritySetOption {
  id: string
  name: string
  lineIds: string[]
}

interface RangePriorityEditorProps {
  title: string
  help: string
  noSetsMessage: string
  noSetSelectedMessage: string
  prioritySetId: string | null
  onPrioritySetChange: (id: string | null) => void
  prioritySets: PrioritySetOption[]
  lineDefs: AllocationLineDef[]
  allocations: PriorityAllocation[]
  onAllocationsChange: (allocations: PriorityAllocation[]) => void
  spouseEnabled: boolean
  variables?: Variable[]
  resolvedVariableAmounts?: Map<string, number>
  specialYears?: SpecialYear[]
  deathYear?: number | null
  history?: FormulaHistoryContext
}

export function RangePriorityEditor({
  title,
  help,
  noSetsMessage,
  noSetSelectedMessage,
  prioritySetId,
  onPrioritySetChange,
  prioritySets,
  lineDefs,
  allocations,
  onAllocationsChange,
  spouseEnabled,
  variables = [],
  resolvedVariableAmounts = new Map(),
  specialYears = [],
  deathYear = null,
  history,
}: RangePriorityEditorProps) {
  const variablesById = new Map(variables.map((v) => [v.id, v]))

  function updateAllocation(id: string, patch: Partial<PriorityAllocation>) {
    onAllocationsChange(allocations.map((a) => (a.id === id ? { ...a, ...patch } : a)))
  }

  return (
    <div>
      <span className="flex items-center gap-1 text-sm font-medium text-slate-700">
        {title}
        <HelpTooltip text={help} />
      </span>

      {prioritySets.length === 0 ? (
        <p className="mt-2 text-sm text-slate-400">{noSetsMessage}</p>
      ) : (
        <select
          className="mt-2 w-full max-w-xs rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500"
          value={prioritySetId ?? ''}
          onChange={(e) => onPrioritySetChange(e.target.value || null)}
        >
          <option value="">None</option>
          {prioritySets.map((set) => (
            <option key={set.id} value={set.id}>
              {set.name || 'Untitled'}
            </option>
          ))}
        </select>
      )}

      {prioritySetId && prioritySets.some((s) => s.id === prioritySetId) && (
        <div className="mt-2 flex flex-col gap-2">
          {allocations.length === 0 && (
            <p className="text-sm text-slate-400">
              This priority has no lines yet — add some above.
            </p>
          )}
          {allocations.map((allocation, index) => {
            const def = lineDefs.find((d) => d.id === allocation.lineId)
            const matchSource = def?.match
              ? variables.find((v) => v.id === def.match?.wageVariableId)
              : undefined
            const salary = matchSource ? resolvedVariableAmounts.get(matchSource.id) ?? 0 : 0
            const resolvedAmount =
              resolveAllocation(
                allocation,
                variablesById,
                resolvedVariableAmounts,
                specialYearPreviewScope(specialYears, deathYear),
                history,
              )?.amount ?? 0

            return (
              <div key={allocation.id} className="rounded-md border border-slate-200 p-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="w-4 shrink-0 text-sm text-slate-400">{index + 1}.</span>
                  <span className="flex-1 text-sm text-slate-700">
                    {def
                      ? `${def.name || 'Untitled'} (${ACCOUNT_LABELS[def.account]}${
                          spouseEnabled && accountHasOwner(def.account)
                            ? `, ${def.owner === 'spouse' ? 'Spouse' : 'You'}`
                            : ''
                        })`
                      : 'Unknown line'}
                  </span>
                  <AmountSourceEditor
                    source={allocation.source}
                    onChange={(source) => updateAllocation(allocation.id, { source })}
                    variables={variables}
                    resolvedVariableAmounts={resolvedVariableAmounts}
                    specialYears={specialYears}
                    deathYear={deathYear}
                    history={history}
                  />
                </div>
                <AmountSourceFormulaRow
                  source={allocation.source}
                  onChange={(source) => updateAllocation(allocation.id, { source })}
                  variables={variables}
                  resolvedVariableAmounts={resolvedVariableAmounts}
                  specialYears={specialYears}
                  deathYear={deathYear}
                  history={history}
                />
                {def?.match && (
                  <p className="mt-1 pl-6 text-xs text-slate-400">
                    Est. employer match: $
                    {calculateMatchAmount(resolvedAmount, salary, def.match.tiers).toLocaleString('en-US')}
                    {matchSource ? ` (against ${matchSource.name || 'Untitled'})` : ''}
                  </p>
                )}
              </div>
            )
          })}
        </div>
      )}

      {prioritySets.length > 0 && !prioritySetId && (
        <p className="mt-2 text-sm text-slate-400">{noSetSelectedMessage}</p>
      )}
    </div>
  )
}
