import { accountHasOwner, ACCOUNT_LABELS, ACCOUNT_TYPES } from './accounts'
import { CurrencyField } from './CurrencyField'
import { HelpTooltip } from './HelpTooltip'
import { NumberField } from './NumberField'
import type {
  AccountType,
  IncomeSourceDef,
  MatchConfig,
  MatchTier,
  Owner,
  SavingsLineDef,
  SavingsPrioritySet,
} from './types'

interface SavingsPrioritiesEditorProps {
  lineDefs: SavingsLineDef[]
  onLineDefsChange: (defs: SavingsLineDef[]) => void
  prioritySets: SavingsPrioritySet[]
  onPrioritySetsChange: (sets: SavingsPrioritySet[]) => void
  incomeSourceDefs: IncomeSourceDef[]
  spouseEnabled: boolean
  // When true, renders as a plain block (no card/border/top-level heading) so
  // it can be embedded inside another section instead of standing alone.
  bare?: boolean
}

function lineLabel(def: SavingsLineDef | undefined, spouseEnabled: boolean): string {
  if (!def) return 'Unknown line'
  const ownerSuffix =
    spouseEnabled && accountHasOwner(def.account)
      ? `, ${def.owner === 'spouse' ? 'Spouse' : 'You'}`
      : ''
  return `${def.name || 'Untitled'} (${ACCOUNT_LABELS[def.account]}${ownerSuffix})`
}

export function SavingsPrioritiesEditor({
  lineDefs,
  onLineDefsChange,
  prioritySets,
  onPrioritySetsChange,
  incomeSourceDefs,
  spouseEnabled,
  bare = false,
}: SavingsPrioritiesEditorProps) {
  function updateLineDef(id: string, patch: Partial<SavingsLineDef>) {
    onLineDefsChange(lineDefs.map((d) => (d.id === id ? { ...d, ...patch } : d)))
  }

  function removeLineDef(id: string) {
    onLineDefsChange(lineDefs.filter((d) => d.id !== id))
  }

  function addLineDef() {
    onLineDefsChange([
      ...lineDefs,
      {
        id: crypto.randomUUID(),
        name: '',
        account: 'preTax',
        owner: 'self',
        match: null,
        amount: 0,
      },
    ])
  }

  function setMatch(def: SavingsLineDef, match: MatchConfig | null) {
    updateLineDef(def.id, { match })
  }

  function addMatch(def: SavingsLineDef) {
    setMatch(def, {
      incomeSourceId: null,
      tiers: [{ id: crypto.randomUUID(), salaryPercent: 0, matchPercent: 100 }],
    })
  }

  function removeMatch(def: SavingsLineDef) {
    setMatch(def, null)
  }

  function updateIncomeSourceId(def: SavingsLineDef, incomeSourceId: string | null) {
    if (!def.match) return
    setMatch(def, { ...def.match, incomeSourceId })
  }

  function addMatchTier(def: SavingsLineDef) {
    if (!def.match) return
    setMatch(def, {
      ...def.match,
      tiers: [
        ...def.match.tiers,
        { id: crypto.randomUUID(), salaryPercent: 0, matchPercent: 100 },
      ],
    })
  }

  function updateMatchTier(def: SavingsLineDef, tierId: string, patch: Partial<MatchTier>) {
    if (!def.match) return
    setMatch(def, {
      ...def.match,
      tiers: def.match.tiers.map((t) => (t.id === tierId ? { ...t, ...patch } : t)),
    })
  }

  function removeMatchTier(def: SavingsLineDef, tierId: string) {
    if (!def.match) return
    setMatch(def, {
      ...def.match,
      tiers: def.match.tiers.filter((t) => t.id !== tierId),
    })
  }

  function updateSet(id: string, patch: Partial<SavingsPrioritySet>) {
    onPrioritySetsChange(prioritySets.map((s) => (s.id === id ? { ...s, ...patch } : s)))
  }

  function removeSet(id: string) {
    onPrioritySetsChange(prioritySets.filter((s) => s.id !== id))
  }

  function addSet() {
    onPrioritySetsChange([...prioritySets, { id: crypto.randomUUID(), name: '', lineIds: [] }])
  }

  function addLineToSet(set: SavingsPrioritySet, lineId: string) {
    if (set.lineIds.includes(lineId)) return
    updateSet(set.id, { lineIds: [...set.lineIds, lineId] })
  }

  function removeLineFromSet(set: SavingsPrioritySet, lineId: string) {
    updateSet(set.id, { lineIds: set.lineIds.filter((id) => id !== lineId) })
  }

  function moveLineInSet(set: SavingsPrioritySet, index: number, direction: -1 | 1) {
    const target = index + direction
    if (target < 0 || target >= set.lineIds.length) return
    const next = [...set.lineIds]
    const [moved] = next.splice(index, 1)
    next.splice(target, 0, moved)
    updateSet(set.id, { lineIds: next })
  }

  const Wrapper = bare ? 'div' : 'section'

  return (
    <Wrapper className={bare ? '' : 'rounded-lg border border-slate-200 bg-white p-5 shadow-sm'}>
      {!bare && (
        <h2 className="flex items-center gap-1 text-lg font-semibold text-slate-900">
          Savings priorities
          <HelpTooltip text="Define the accounts you contribute to, along with a default amount to save into each (in today's dollars), then group them into named, ordered priorities, e.g. '401k up to match, then Roth IRA, then taxable'. Reference a whole priority by name in year ranges below, where each line starts at its default amount but can be overridden for that specific range." />
        </h2>
      )}

      <div className={bare ? '' : 'mt-4'}>
        <h3 className="text-sm font-semibold text-slate-600">Lines</h3>

        {lineDefs.length === 0 && (
          <p className="mt-2 text-sm text-slate-400">
            No savings lines yet — add one, e.g. "401k Traditional".
          </p>
        )}

        <div className="mt-2 flex flex-col gap-2">
          {lineDefs.map((def) => (
            <div key={def.id} className="rounded-md border border-slate-200 p-2">
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="text"
                  placeholder="e.g. 401k Traditional"
                  className="min-w-[8rem] flex-1 rounded-md border border-slate-300 px-2 py-1.5 text-sm text-slate-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500"
                  value={def.name}
                  onChange={(e) => updateLineDef(def.id, { name: e.target.value })}
                />
                <select
                  className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500"
                  value={def.account}
                  onChange={(e) => {
                    const account = e.target.value as AccountType
                    updateLineDef(def.id, {
                      account,
                      owner: accountHasOwner(account) ? def.owner : 'self',
                    })
                  }}
                >
                  {ACCOUNT_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {ACCOUNT_LABELS[type]}
                    </option>
                  ))}
                </select>
                <div className="w-32">
                  <CurrencyField
                    label="Amount to save"
                    hideLabel
                    min={0}
                    value={def.amount}
                    onChange={(v) => updateLineDef(def.id, { amount: v })}
                  />
                </div>
                {spouseEnabled && accountHasOwner(def.account) && (
                  <select
                    aria-label="Account owner"
                    className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500"
                    value={def.owner}
                    onChange={(e) => updateLineDef(def.id, { owner: e.target.value as Owner })}
                  >
                    <option value="self">You</option>
                    <option value="spouse">Spouse</option>
                  </select>
                )}
                <button
                  type="button"
                  onClick={() => removeLineDef(def.id)}
                  aria-label="Remove savings line"
                  title="Remove savings line"
                  className="ml-auto rounded-md border border-red-300 px-2 py-1 text-red-600 hover:bg-red-50"
                >
                  ✕
                </button>
              </div>

              <div className="mt-2 pl-2">
                {!def.match ? (
                  <button
                    type="button"
                    onClick={() => addMatch(def)}
                    className="text-xs font-medium text-emerald-700 hover:underline"
                  >
                    + Add employer match
                  </button>
                ) : (
                  <div className="flex flex-col gap-2 rounded-md border border-slate-100 bg-slate-50 p-2">
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-1 text-xs font-medium text-slate-600">
                        Employer match
                        <HelpTooltip text="Tiered match calculated against an income source: the first tier's percent of that salary is matched at its rate, then the next tier's percent at its rate, and so on. E.g. 100% match on your contributions up to the first 3% of salary, then 50% on the next 2%. In each year range below, the estimated match is capped by however much you actually contribute to this line that range." />
                      </span>
                      <button
                        type="button"
                        onClick={() => removeMatch(def)}
                        className="text-xs text-red-600 hover:underline"
                      >
                        Remove match
                      </button>
                    </div>

                    {incomeSourceDefs.length === 0 ? (
                      <p className="text-xs text-slate-400">
                        Add an income source above to link a salary for this match.
                      </p>
                    ) : (
                      <label className="flex flex-col gap-1">
                        <span className="text-xs text-slate-500">Based on salary</span>
                        <select
                          className="w-full max-w-xs rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500"
                          value={def.match.incomeSourceId ?? ''}
                          onChange={(e) => updateIncomeSourceId(def, e.target.value || null)}
                        >
                          <option value="" disabled>
                            Select an income source…
                          </option>
                          {incomeSourceDefs.map((source) => (
                            <option key={source.id} value={source.id}>
                              {source.name || 'Untitled'} ($
                              {source.amount.toLocaleString('en-US')})
                            </option>
                          ))}
                        </select>
                      </label>
                    )}

                    {def.match.tiers.map((tier, tierIndex) => (
                      <div key={tier.id} className="flex flex-wrap items-center gap-2">
                        <span className="text-xs text-slate-500">
                          {tierIndex === 0 ? 'First' : 'Next'}
                        </span>
                        <div className="w-16">
                          <NumberField
                            label="Salary percent"
                            hideLabel
                            suffix="%"
                            min={0}
                            step={1}
                            value={tier.salaryPercent}
                            onChange={(v) =>
                              updateMatchTier(def, tier.id, { salaryPercent: v })
                            }
                          />
                        </div>
                        <span className="text-xs text-slate-500">of salary matched at</span>
                        <div className="w-20">
                          <NumberField
                            label="Match percent"
                            hideLabel
                            suffix="%"
                            min={0}
                            step={5}
                            value={tier.matchPercent}
                            onChange={(v) =>
                              updateMatchTier(def, tier.id, { matchPercent: v })
                            }
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => removeMatchTier(def, tier.id)}
                          aria-label="Remove match tier"
                          title="Remove match tier"
                          className="text-xs text-red-600 hover:underline"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => addMatchTier(def)}
                      className="self-start text-xs font-medium text-emerald-700 hover:underline"
                    >
                      + Add tier
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={addLineDef}
          className="mt-2 rounded-md border border-emerald-600 px-4 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-50"
        >
          Add savings line
        </button>
      </div>

      <div className="mt-5 border-t border-slate-100 pt-4">
        <h3 className="text-sm font-semibold text-slate-600">Priority orders</h3>

        {lineDefs.length === 0 ? (
          <p className="mt-2 text-sm text-slate-400">Define a savings line above first.</p>
        ) : (
          <>
            {prioritySets.length === 0 && (
              <p className="mt-2 text-sm text-slate-400">
                No savings priorities yet — add one, e.g. "Standard priority".
              </p>
            )}

            <div className="mt-2 flex flex-col gap-3">
              {prioritySets.map((set) => {
                const availableLines = lineDefs.filter((d) => !set.lineIds.includes(d.id))
                return (
                  <div key={set.id} className="rounded-md border border-slate-200 p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        type="text"
                        placeholder="e.g. Standard priority"
                        className="min-w-[8rem] flex-1 rounded-md border border-slate-300 px-2 py-1.5 text-sm text-slate-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500"
                        value={set.name}
                        onChange={(e) => updateSet(set.id, { name: e.target.value })}
                      />
                      <button
                        type="button"
                        onClick={() => removeSet(set.id)}
                        aria-label="Remove savings priority"
                        title="Remove savings priority"
                        className="rounded-md border border-red-300 px-2 py-1 text-red-600 hover:bg-red-50"
                      >
                        ✕
                      </button>
                    </div>

                    <div className="mt-2 flex flex-col gap-1.5">
                      {set.lineIds.length === 0 && (
                        <p className="text-xs text-slate-400">No lines yet — add one below.</p>
                      )}
                      {set.lineIds.map((lineId, index) => (
                        <div
                          key={lineId}
                          className="flex items-center gap-2 rounded-md border border-slate-100 bg-slate-50 p-1.5"
                        >
                          <span className="w-4 shrink-0 text-xs text-slate-400">
                            {index + 1}.
                          </span>
                          <span className="flex-1 text-sm text-slate-700">
                            {lineLabel(
                              lineDefs.find((d) => d.id === lineId),
                              spouseEnabled,
                            )}
                          </span>
                          <div className="flex gap-1">
                            <button
                              type="button"
                              onClick={() => moveLineInSet(set, index, -1)}
                              disabled={index === 0}
                              aria-label="Move up"
                              title="Move up"
                              className="rounded-md border border-slate-300 px-2 py-0.5 text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-30"
                            >
                              ↑
                            </button>
                            <button
                              type="button"
                              onClick={() => moveLineInSet(set, index, 1)}
                              disabled={index === set.lineIds.length - 1}
                              aria-label="Move down"
                              title="Move down"
                              className="rounded-md border border-slate-300 px-2 py-0.5 text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-30"
                            >
                              ↓
                            </button>
                            <button
                              type="button"
                              onClick={() => removeLineFromSet(set, lineId)}
                              aria-label="Remove from priority"
                              title="Remove from priority"
                              className="rounded-md border border-red-300 px-2 py-0.5 text-red-600 hover:bg-red-50"
                            >
                              ✕
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>

                    {availableLines.length > 0 && (
                      <select
                        className="mt-2 w-full max-w-xs rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500"
                        value=""
                        onChange={(e) => {
                          if (e.target.value) addLineToSet(set, e.target.value)
                        }}
                      >
                        <option value="">+ Add a line…</option>
                        {availableLines.map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.name || 'Untitled'}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                )
              })}
            </div>

            <button
              type="button"
              onClick={addSet}
              className="mt-2 rounded-md border border-emerald-600 px-4 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-50"
            >
              Add savings priority
            </button>
          </>
        )}
      </div>
    </Wrapper>
  )
}
