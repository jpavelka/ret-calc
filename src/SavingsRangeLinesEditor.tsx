import { useState } from 'react'
import { accountHasOwner, ACCOUNT_LABELS, ACCOUNT_TYPES } from './accounts'
import { ageFormulaNames } from './age'
import { AmountSourceEditor, AmountSourceFormulaRow, describeAmountSource } from './AmountSourceEditor'
import { ConditionField } from './ConditionField'
import type { FormulaFunctionsContext, FormulaHistoryContext } from './formula'
import { describeGoalTarget, GoalTargetEditor, GoalTargetFormulaRow } from './GoalTargetEditor'
import { HelpTooltip } from './HelpTooltip'
import { calculateMatchAmount } from './match'
import { NumberField } from './NumberField'
import { resolveAllocation } from './projection'
import { listSpecialYearNames, specialYearPreviewScope } from './specialYearGraph'
import type { AccountType, GoalTarget, MatchTier, Owner, SavingsLine, SpecialYear, Variable } from './types'

interface SavingsRangeLinesEditorProps {
  lines: SavingsLine[]
  onChange: (lines: SavingsLine[]) => void
  variables: Variable[]
  resolvedVariableAmounts: Map<string, number>
  spouseEnabled: boolean
  specialYears: SpecialYear[]
  deathYear: number | null
  selfBirthYear?: number | null
  spouseBirthYear?: number | null
  history?: FormulaHistoryContext
  functions?: FormulaFunctionsContext
}

// A savings range's own layered lines — the funding order (first line funded
// first, then the next) plus each line's account/owner/amount/employer
// match, all defined and edited directly inside this range. Replaces the
// old global line catalog + named priority set: there's nothing to draw
// from here, every range assembles its own lines from scratch.
export function SavingsRangeLinesEditor({
  lines,
  onChange,
  variables,
  resolvedVariableAmounts,
  spouseEnabled,
  specialYears,
  deathYear,
  selfBirthYear = null,
  spouseBirthYear = null,
  history,
  functions,
}: SavingsRangeLinesEditorProps) {
  // Which lines are showing their full edit form — condensed, human-readable
  // rows are the default so the section reads clearly at a glance; editing
  // is opt-in per line.
  const [editingIds, setEditingIds] = useState<Set<string>>(new Set())

  function setEditing(id: string, editing: boolean) {
    setEditingIds((prev) => {
      const next = new Set(prev)
      if (editing) next.add(id)
      else next.delete(id)
      return next
    })
  }

  const variablesById = new Map(variables.map((v) => [v.id, v]))
  // The condition/formula preview evaluates against today's calendar year —
  // the same "preview today's resolved value" convention every other live
  // preview in this app already uses (e.g. a variable's shown value), rather
  // than letting the preview scrub across years. Layered lowest to highest
  // precedence: special years, then variables (can shadow a same-named
  // special year), then "year" itself last — same order as runProjection.
  const specialYearNames = listSpecialYearNames(specialYears)
  const extraNames = ageFormulaNames(selfBirthYear, spouseBirthYear)
  const conditionScope: Record<string, number> = specialYearPreviewScope(specialYears, deathYear, selfBirthYear, spouseBirthYear)
  for (const v of variables) conditionScope[v.name] = resolvedVariableAmounts.get(v.id) ?? 0
  conditionScope['year'] = new Date().getFullYear()
  if (selfBirthYear !== null) conditionScope['age'] = conditionScope['year'] - selfBirthYear
  if (spouseBirthYear !== null) conditionScope['spouseAge'] = conditionScope['year'] - spouseBirthYear

  function updateLine(id: string, patch: Partial<SavingsLine>) {
    onChange(lines.map((line) => (line.id === id ? { ...line, ...patch } : line)))
  }

  function removeLine(id: string) {
    onChange(lines.filter((line) => line.id !== id))
    setEditing(id, false)
  }

  function moveLine(index: number, direction: -1 | 1) {
    const target = index + direction
    if (target < 0 || target >= lines.length) return
    const next = [...lines]
    const [moved] = next.splice(index, 1)
    next.splice(target, 0, moved)
    onChange(next)
  }

  function addLine() {
    const id = crypto.randomUUID()
    onChange([
      ...lines,
      {
        id,
        name: '',
        account: 'preTax',
        owner: 'self',
        match: null,
        source: { kind: 'custom', amount: 0, inflationAdjusted: true, frequency: 'yearly' },
        goal: null,
        condition: null,
      },
    ])
    // A brand-new line has nothing to summarize yet, so open it straight
    // into edit mode instead of showing an empty condensed row.
    setEditing(id, true)
  }

  function setMatch(line: SavingsLine, match: SavingsLine['match']) {
    updateLine(line.id, { match })
  }

  function setGoal(line: SavingsLine, goal: GoalTarget | null) {
    updateLine(line.id, { goal })
  }

  function addGoal(line: SavingsLine) {
    setGoal(line, { kind: 'custom', amount: 0, inflationAdjusted: true })
  }

  function removeGoal(line: SavingsLine) {
    setGoal(line, null)
  }

  function setCondition(line: SavingsLine, condition: string | null) {
    updateLine(line.id, { condition })
  }

  function addCondition(line: SavingsLine) {
    setCondition(line, '')
  }

  function removeCondition(line: SavingsLine) {
    setCondition(line, null)
  }

  function addMatch(line: SavingsLine) {
    setMatch(line, {
      wageVariableId: null,
      tiers: [{ id: crypto.randomUUID(), salaryPercent: 0, matchPercent: 100 }],
      account: null,
    })
  }

  function removeMatch(line: SavingsLine) {
    setMatch(line, null)
  }

  function updateWageVariableId(line: SavingsLine, wageVariableId: string | null) {
    if (!line.match) return
    setMatch(line, { ...line.match, wageVariableId })
  }

  function updateMatchAccount(line: SavingsLine, account: AccountType | null) {
    if (!line.match) return
    setMatch(line, { ...line.match, account })
  }

  function addMatchTier(line: SavingsLine) {
    if (!line.match) return
    setMatch(line, {
      ...line.match,
      tiers: [...line.match.tiers, { id: crypto.randomUUID(), salaryPercent: 0, matchPercent: 100 }],
    })
  }

  function updateMatchTier(line: SavingsLine, tierId: string, patch: Partial<MatchTier>) {
    if (!line.match) return
    setMatch(line, {
      ...line.match,
      tiers: line.match.tiers.map((t) => (t.id === tierId ? { ...t, ...patch } : t)),
    })
  }

  function removeMatchTier(line: SavingsLine, tierId: string) {
    if (!line.match) return
    setMatch(line, { ...line.match, tiers: line.match.tiers.filter((t) => t.id !== tierId) })
  }

  return (
    <div>
      <span className="flex items-center gap-1 text-sm font-medium text-slate-700">
        Savings lines
        <HelpTooltip text="The accounts this range funds, in the order they're funded (first line first, then the next). Each line has its own account, amount, and optional employer match." />
      </span>

      {lines.length === 0 && (
        <p className="mt-2 text-sm text-slate-400">No lines yet — add one, e.g. "401k Traditional".</p>
      )}

      <div className="mt-2 flex flex-col gap-2">
        {lines.map((line, index) => {
          const matchSource = line.match ? variables.find((v) => v.id === line.match?.wageVariableId) : undefined
          const salary = matchSource ? resolvedVariableAmounts.get(matchSource.id) ?? 0 : 0
          const resolvedAmount =
            resolveAllocation(line, variablesById, resolvedVariableAmounts, conditionScope, history, functions)
              ?.amount ?? 0

          const editing = editingIds.has(line.id)
          const ownerSuffix =
            spouseEnabled && accountHasOwner(line.account) ? `, ${line.owner === 'spouse' ? 'Spouse' : 'You'}` : ''

          return (
            <div key={line.id} className="rounded-md border border-slate-200 p-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="w-4 shrink-0 text-xs text-slate-400">{index + 1}.</span>
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => moveLine(index, -1)}
                    disabled={index === 0}
                    aria-label="Move up"
                    title="Move up"
                    className="rounded-md border border-slate-300 px-2 py-0.5 text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    onClick={() => moveLine(index, 1)}
                    disabled={index === lines.length - 1}
                    aria-label="Move down"
                    title="Move down"
                    className="rounded-md border border-slate-300 px-2 py-0.5 text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    ↓
                  </button>
                </div>

                {editing ? (
                  <>
                    <input
                      type="text"
                      placeholder="e.g. 401k Traditional"
                      className="min-w-[8rem] flex-1 rounded-md border border-slate-300 px-2 py-1.5 text-sm text-slate-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500"
                      value={line.name}
                      onChange={(e) => updateLine(line.id, { name: e.target.value })}
                    />
                    <select
                      className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500"
                      value={line.account}
                      onChange={(e) => {
                        const account = e.target.value as AccountType
                        updateLine(line.id, {
                          account,
                          owner: accountHasOwner(account) ? line.owner : 'self',
                        })
                      }}
                    >
                      {ACCOUNT_TYPES.map((type) => (
                        <option key={type} value={type}>
                          {ACCOUNT_LABELS[type]}
                        </option>
                      ))}
                    </select>
                    <AmountSourceEditor
                      source={line.source}
                      onChange={(source) => updateLine(line.id, { source })}
                      variables={variables}
                      resolvedVariableAmounts={resolvedVariableAmounts}
                      allowUnlimited
                      specialYears={specialYears}
                      deathYear={deathYear}
                      selfBirthYear={selfBirthYear}
                      spouseBirthYear={spouseBirthYear}
                      history={history}
                      functions={functions}
                    />
                    {spouseEnabled && accountHasOwner(line.account) && (
                      <select
                        aria-label="Account owner"
                        className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500"
                        value={line.owner}
                        onChange={(e) => updateLine(line.id, { owner: e.target.value as Owner })}
                      >
                        <option value="self">You</option>
                        <option value="spouse">Spouse</option>
                      </select>
                    )}
                    <button
                      type="button"
                      onClick={() => removeLine(line.id)}
                      aria-label="Remove savings line"
                      title="Remove savings line"
                      className="ml-auto rounded-md border border-red-300 px-2 py-1 text-red-600 hover:bg-red-50"
                    >
                      ✕
                    </button>
                  </>
                ) : (
                  <>
                    <div className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2 gap-y-0.5">
                      <span className="font-medium text-slate-900">{line.name || 'Untitled'}</span>
                      <span className="text-sm text-slate-500">
                        {ACCOUNT_LABELS[line.account]}
                        {ownerSuffix} ·{' '}
                        {describeAmountSource(
                          line.source,
                          variables,
                          resolvedVariableAmounts,
                          specialYears,
                          deathYear,
                          history,
                          functions,
                          selfBirthYear,
                          spouseBirthYear,
                        )}
                      </span>
                      {line.match && (
                        <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                          Match: ${calculateMatchAmount(resolvedAmount, salary, line.match.tiers).toLocaleString('en-US')}
                          {line.match.account && line.match.account !== line.account
                            ? ` → ${ACCOUNT_LABELS[line.match.account]}`
                            : ''}
                        </span>
                      )}
                      {line.goal && (
                        <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                          Goal:{' '}
                          {describeGoalTarget(
                            line.goal,
                            variables,
                            resolvedVariableAmounts,
                            specialYears,
                            deathYear,
                            history,
                            functions,
                            selfBirthYear,
                            spouseBirthYear,
                          )}
                        </span>
                      )}
                      {line.condition != null && (
                        <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                          Condition: {line.condition || '(empty)'}
                        </span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => setEditing(line.id, true)}
                      className="shrink-0 rounded-md border border-slate-300 px-2 py-1 text-sm text-slate-700 hover:bg-slate-50"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => removeLine(line.id)}
                      aria-label="Remove savings line"
                      title="Remove savings line"
                      className="shrink-0 rounded-md border border-red-300 px-2 py-1 text-red-600 hover:bg-red-50"
                    >
                      ✕
                    </button>
                  </>
                )}
              </div>

              {!editing ? null : (
              <>
              <AmountSourceFormulaRow
                source={line.source}
                onChange={(source) => updateLine(line.id, { source })}
                variables={variables}
                resolvedVariableAmounts={resolvedVariableAmounts}
                specialYears={specialYears}
                deathYear={deathYear}
                selfBirthYear={selfBirthYear}
                spouseBirthYear={spouseBirthYear}
                history={history}
                functions={functions}
              />

              <div className="mt-2 pl-6">
                {!line.match ? (
                  <button
                    type="button"
                    onClick={() => addMatch(line)}
                    className="text-xs font-medium text-emerald-700 hover:underline"
                  >
                    + Add employer match
                  </button>
                ) : (
                  <div className="flex flex-col gap-2 rounded-md border border-slate-100 bg-slate-50 p-2">
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-1 text-xs font-medium text-slate-600">
                        Employer match
                        <HelpTooltip text="Tiered match calculated against an income source: the first tier's percent of that salary is matched at its rate, then the next tier's percent at its rate, and so on. E.g. 100% match on your contributions up to the first 3% of salary, then 50% on the next 2%. The estimated match is capped by however much you actually contribute to this line." />
                      </span>
                      <button
                        type="button"
                        onClick={() => removeMatch(line)}
                        className="text-xs text-red-600 hover:underline"
                      >
                        Remove match
                      </button>
                    </div>

                    {variables.length === 0 ? (
                      <p className="text-xs text-slate-400">Add a variable above to link a salary for this match.</p>
                    ) : (
                      <label className="flex flex-col gap-1">
                        <span className="text-xs text-slate-500">Based on salary</span>
                        <select
                          className="w-full max-w-xs rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500"
                          value={line.match.wageVariableId ?? ''}
                          onChange={(e) => updateWageVariableId(line, e.target.value || null)}
                        >
                          <option value="" disabled>
                            Select a variable…
                          </option>
                          {variables.map((v) => (
                            <option key={v.id} value={v.id}>
                              {v.name || 'Untitled'} (${(resolvedVariableAmounts.get(v.id) ?? 0).toLocaleString('en-US')})
                            </option>
                          ))}
                        </select>
                      </label>
                    )}

                    <label className="flex flex-col gap-1">
                      <span className="flex items-center gap-1 text-xs text-slate-500">
                        Match goes to
                        <HelpTooltip text="Which account the employer match itself lands in. Leave as 'Same as contribution' unless your plan puts the match somewhere different — e.g. many 401k plans deposit the match pre-tax even when you elect Roth for your own contribution." />
                      </span>
                      <select
                        className="w-full max-w-xs rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500"
                        value={line.match.account ?? ''}
                        onChange={(e) => updateMatchAccount(line, (e.target.value || null) as AccountType | null)}
                      >
                        <option value="">Same as contribution ({ACCOUNT_LABELS[line.account]})</option>
                        {ACCOUNT_TYPES.map((type) => (
                          <option key={type} value={type}>
                            {ACCOUNT_LABELS[type]}
                          </option>
                        ))}
                      </select>
                    </label>

                    {line.match.tiers.map((tier, tierIndex) => (
                      <div key={tier.id} className="flex flex-wrap items-center gap-2">
                        <span className="text-xs text-slate-500">{tierIndex === 0 ? 'First' : 'Next'}</span>
                        <div className="w-16">
                          <NumberField
                            label="Salary percent"
                            hideLabel
                            suffix="%"
                            min={0}
                            step={1}
                            value={tier.salaryPercent}
                            onChange={(v) => updateMatchTier(line, tier.id, { salaryPercent: v })}
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
                            onChange={(v) => updateMatchTier(line, tier.id, { matchPercent: v })}
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => removeMatchTier(line, tier.id)}
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
                      onClick={() => addMatchTier(line)}
                      className="self-start text-xs font-medium text-emerald-700 hover:underline"
                    >
                      + Add tier
                    </button>

                    <p className="text-xs text-slate-400">
                      Est. employer match: ${calculateMatchAmount(resolvedAmount, salary, line.match.tiers).toLocaleString('en-US')}
                      {matchSource ? ` (against ${matchSource.name || 'Untitled'})` : ''}
                      {line.match.account && line.match.account !== line.account
                        ? ` — deposited to ${ACCOUNT_LABELS[line.match.account]}`
                        : ''}
                    </p>
                  </div>
                )}
              </div>

              <div className="mt-2 pl-6">
                {!line.goal ? (
                  <button
                    type="button"
                    onClick={() => addGoal(line)}
                    className="text-xs font-medium text-emerald-700 hover:underline"
                  >
                    + Add savings goal
                  </button>
                ) : (
                  <div className="flex flex-col gap-2 rounded-md border border-slate-100 bg-slate-50 p-2">
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-1 text-xs font-medium text-slate-600">
                        Savings goal
                        <HelpTooltip text="Contributions to this line stop once the account reaches this balance. Any amount that would have exceeded it goes to fund the next line(s) in this range instead." />
                      </span>
                      <button
                        type="button"
                        onClick={() => removeGoal(line)}
                        className="text-xs text-red-600 hover:underline"
                      >
                        Remove goal
                      </button>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <GoalTargetEditor
                        goal={line.goal}
                        onChange={(goal) => setGoal(line, goal)}
                        variables={variables}
                        resolvedVariableAmounts={resolvedVariableAmounts}
                        specialYears={specialYears}
                        deathYear={deathYear}
                        selfBirthYear={selfBirthYear}
                        spouseBirthYear={spouseBirthYear}
                        history={history}
                        functions={functions}
                      />
                    </div>
                    <GoalTargetFormulaRow
                      goal={line.goal}
                      onChange={(goal) => setGoal(line, goal)}
                      variables={variables}
                      resolvedVariableAmounts={resolvedVariableAmounts}
                      specialYears={specialYears}
                      deathYear={deathYear}
                      selfBirthYear={selfBirthYear}
                      spouseBirthYear={spouseBirthYear}
                      history={history}
                      functions={functions}
                    />
                  </div>
                )}
              </div>

              <div className="mt-2 pl-6">
                {line.condition === null || line.condition === undefined ? (
                  <button
                    type="button"
                    onClick={() => addCondition(line)}
                    className="text-xs font-medium text-emerald-700 hover:underline"
                  >
                    + Add condition
                  </button>
                ) : (
                  <div className="flex flex-col gap-2 rounded-md border border-slate-100 bg-slate-50 p-2">
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-1 text-xs font-medium text-slate-600">
                        Condition
                        <HelpTooltip text={`This line only applies in years matching this expression, e.g. "year < 2040". Combine with && (and), || (or), ! (not). Applies on top of this range's own year range.`} />
                      </span>
                      <button
                        type="button"
                        onClick={() => removeCondition(line)}
                        className="text-xs text-red-600 hover:underline"
                      >
                        Remove condition
                      </button>
                    </div>
                    <ConditionField
                      hideLabel
                      expression={line.condition}
                      onChange={(condition) => setCondition(line, condition)}
                      variables={variables}
                      specialYearNames={specialYearNames}
                      extraNames={extraNames}
                      scope={conditionScope}
                      history={history}
                      functions={functions}
                    />
                  </div>
                )}
              </div>

              <div className="mt-2 flex justify-end">
                <button
                  type="button"
                  onClick={() => setEditing(line.id, false)}
                  className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700"
                >
                  Done
                </button>
              </div>
              </>
              )}
            </div>
          )
        })}
      </div>

      <button
        type="button"
        onClick={addLine}
        className="mt-2 rounded-md border border-emerald-600 px-4 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-50"
      >
        + Add savings line
      </button>
    </div>
  )
}
