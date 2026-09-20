import { accountHasOwner, ACCOUNT_LABELS } from './accounts'
import { CurrencyField } from './CurrencyField'
import { HelpTooltip } from './HelpTooltip'
import { calculateMatchAmount } from './match'
import type { AccountType, IncomeSourceDef, MatchConfig, Owner, PriorityAllocation } from './types'

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
  incomeSourceDefs?: IncomeSourceDef[]
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
  incomeSourceDefs = [],
}: RangePriorityEditorProps) {
  function updateAmount(id: string, amount: number) {
    onAllocationsChange(allocations.map((a) => (a.id === id ? { ...a, amount } : a)))
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
              ? incomeSourceDefs.find((s) => s.id === def.match?.incomeSourceId)
              : undefined
            const salary = matchSource?.amount ?? 0

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
                  <div className="w-32">
                    <CurrencyField
                      label="Amount"
                      hideLabel
                      min={0}
                      value={allocation.amount}
                      onChange={(v) => updateAmount(allocation.id, v)}
                    />
                  </div>
                </div>
                {def?.match && (
                  <p className="mt-1 pl-6 text-xs text-slate-400">
                    Est. employer match: $
                    {calculateMatchAmount(
                      allocation.amount,
                      salary,
                      def.match.tiers,
                    ).toLocaleString('en-US')}
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
