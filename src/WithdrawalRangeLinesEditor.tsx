import { useState } from 'react'
import { accountHasOwner, ACCOUNT_LABELS, ACCOUNT_TYPES } from './accounts'
import { ageFormulaNames } from './age'
import { AmountSourceEditor, AmountSourceFormulaRow, describeAmountSource } from './AmountSourceEditor'
import { ConditionField } from './ConditionField'
import type { FormulaFunctionsContext, FormulaHistoryContext } from './formula'
import { describeGoalTarget, GoalTargetEditor, GoalTargetFormulaRow } from './GoalTargetEditor'
import { HelpTooltip } from './HelpTooltip'
import { listSpecialYearNames, specialYearPreviewScope } from './specialYearGraph'
import type { AccountType, GoalTarget, Owner, SpecialYear, Variable, WithdrawalLine } from './types'
import { DEFAULT_WITHDRAWAL_ORDER } from './withdrawals'

interface WithdrawalRangeLinesEditorProps {
  lines: WithdrawalLine[]
  onChange: (lines: WithdrawalLine[]) => void
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

// Only HSA and 529 have "qualified" spending (medical/education) a draw can
// be capped at.
function supportsQualifiedOnly(account: AccountType): boolean {
  return account === 'hsa' || account === 'college529'
}

// A withdrawal range's own ordered waterfall — the withdrawal counterpart of
// SavingsRangeLinesEditor: each line's account/owner/cap/floor/condition is
// defined and edited directly inside this range.
export function WithdrawalRangeLinesEditor({
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
}: WithdrawalRangeLinesEditorProps) {
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

  // Same today's-year preview scope as SavingsRangeLinesEditor's conditions.
  const specialYearNames = listSpecialYearNames(specialYears)
  const extraNames = ageFormulaNames(selfBirthYear, spouseBirthYear)
  const conditionScope: Record<string, number> = specialYearPreviewScope(specialYears, deathYear, selfBirthYear, spouseBirthYear)
  for (const v of variables) conditionScope[v.name] = resolvedVariableAmounts.get(v.id) ?? 0
  conditionScope['year'] = new Date().getFullYear()
  if (selfBirthYear !== null) conditionScope['age'] = conditionScope['year'] - selfBirthYear
  if (spouseBirthYear !== null) conditionScope['spouseAge'] = conditionScope['year'] - spouseBirthYear

  function updateLine(id: string, patch: Partial<WithdrawalLine>) {
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
        account: 'taxable',
        owner: 'self',
        source: { kind: 'unlimited' },
        qualifiedOnly: false,
        floor: null,
        condition: null,
      },
    ])
    // A brand-new line has nothing to summarize yet, so open it straight
    // into edit mode instead of showing an empty condensed row.
    setEditing(id, true)
  }

  function startFromDefaultOrder() {
    onChange(
      DEFAULT_WITHDRAWAL_ORDER
        // Spouse-owned lines only mean something in spouse mode.
        .filter((line) => spouseEnabled || line.owner === 'self')
        .map((line) => ({
          id: crypto.randomUUID(),
          name: spouseEnabled ? line.name : line.name.replace(' (You)', ''),
          account: line.account,
          owner: line.owner,
          source: { kind: 'unlimited' },
          qualifiedOnly: line.qualifiedOnly,
          floor: null,
          condition: null,
        })),
    )
  }

  function setFloor(line: WithdrawalLine, floor: GoalTarget | null) {
    updateLine(line.id, { floor })
  }

  function setCondition(line: WithdrawalLine, condition: string | null) {
    updateLine(line.id, { condition })
  }

  return (
    <div>
      <span className="flex items-center gap-1 text-sm font-medium text-slate-700">
        Withdrawal lines
        <HelpTooltip text="The accounts this range draws from when income falls short, in order (first line first, then the next). Each line draws as much of the remaining shortfall as it can, up to its optional yearly maximum and without taking the account below its optional minimum balance. If every line runs out before the shortfall is covered, the rest is left unfunded. Required minimum distributions are always taken before any of these." />
      </span>

      {lines.length === 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <p className="text-sm text-slate-400">
            No lines yet — any shortfall in these years will be left unfunded.
          </p>
          <button
            type="button"
            onClick={startFromDefaultOrder}
            className="text-sm font-medium text-emerald-700 hover:underline"
          >
            Start from default order
          </button>
        </div>
      )}

      <div className="mt-2 flex flex-col gap-2">
        {lines.map((line, index) => {
          const editing = editingIds.has(line.id)
          const ownerSuffix =
            spouseEnabled && accountHasOwner(line.account) ? `, ${line.owner === 'spouse' ? 'Spouse' : 'You'}` : ''
          const qualifiedOnly = supportsQualifiedOnly(line.account) && (line.qualifiedOnly ?? false)

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
                      placeholder="e.g. Taxable brokerage"
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
                          qualifiedOnly: supportsQualifiedOnly(account) ? line.qualifiedOnly : false,
                        })
                      }}
                    >
                      {ACCOUNT_TYPES.map((type) => (
                        <option key={type} value={type}>
                          {ACCOUNT_LABELS[type]}
                        </option>
                      ))}
                    </select>
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
                      aria-label="Remove withdrawal line"
                      title="Remove withdrawal line"
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
                        {ownerSuffix}
                        {line.source.kind !== 'unlimited' &&
                          ` · up to ${describeAmountSource(
                            line.source,
                            variables,
                            resolvedVariableAmounts,
                            specialYears,
                            deathYear,
                            history,
                            functions,
                            selfBirthYear,
                            spouseBirthYear,
                          )}`}
                      </span>
                      {qualifiedOnly && (
                        <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                          Qualified {line.account === 'hsa' ? 'medical' : 'education'} only
                        </span>
                      )}
                      {line.floor && (
                        <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                          Keep at least:{' '}
                          {describeGoalTarget(
                            line.floor,
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
                      aria-label="Remove withdrawal line"
                      title="Remove withdrawal line"
                      className="shrink-0 rounded-md border border-red-300 px-2 py-1 text-red-600 hover:bg-red-50"
                    >
                      ✕
                    </button>
                  </>
                )}
              </div>

              {!editing ? null : (
                <>
                  <div className="mt-2 flex flex-wrap items-center gap-2 pl-6">
                    <span className="flex items-center gap-1 text-xs font-medium text-slate-600">
                      Max per year
                      <HelpTooltip text="The most this line draws in a year. Unlimited draws whatever the remaining shortfall needs." />
                    </span>
                    <AmountSourceEditor
                      source={line.source}
                      onChange={(source) => updateLine(line.id, { source })}
                      variables={variables}
                      resolvedVariableAmounts={resolvedVariableAmounts}
                      allowUnlimited
                      unlimitedLabel="No limit — draws whatever's needed"
                      unlimitedTitle="Draws as much of the remaining shortfall as the account can cover"
                      specialYears={specialYears}
                      deathYear={deathYear}
                      selfBirthYear={selfBirthYear}
                      spouseBirthYear={spouseBirthYear}
                      history={history}
                      functions={functions}
                    />
                  </div>
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

                  {supportsQualifiedOnly(line.account) && (
                    <label className="mt-2 flex items-center gap-1.5 pl-6 text-sm text-slate-600">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                        checked={line.qualifiedOnly ?? false}
                        onChange={(e) => updateLine(line.id, { qualifiedOnly: e.target.checked })}
                      />
                      Only for this year's qualified {line.account === 'hsa' ? 'medical' : 'education'} spending
                      <HelpTooltip
                        text={
                          line.account === 'hsa'
                            ? 'Caps this draw at what is left of this year\'s medical-related spending, so it is entirely tax- and penalty-free. Leave unchecked to also draw beyond that, which is taxed as ordinary income (plus a 20% penalty before 65).'
                            : 'Caps this draw at what is left of this year\'s education-related spending, so it is entirely tax- and penalty-free. Leave unchecked to also draw beyond that, whose earnings share is taxed as ordinary income plus a 10% penalty.'
                        }
                      />
                    </label>
                  )}

                  <div className="mt-2 pl-6">
                    {!line.floor ? (
                      <button
                        type="button"
                        onClick={() => setFloor(line, { kind: 'custom', amount: 0, inflationAdjusted: true })}
                        className="text-xs font-medium text-emerald-700 hover:underline"
                      >
                        + Add minimum balance
                      </button>
                    ) : (
                      <div className="flex flex-col gap-2 rounded-md border border-slate-100 bg-slate-50 p-2">
                        <div className="flex items-center justify-between">
                          <span className="flex items-center gap-1 text-xs font-medium text-slate-600">
                            Keep at least
                            <HelpTooltip text="This line never draws the account below this balance, e.g. to keep an emergency reserve. Required minimum distributions aren't affected." />
                          </span>
                          <button
                            type="button"
                            onClick={() => setFloor(line, null)}
                            className="text-xs text-red-600 hover:underline"
                          >
                            Remove minimum
                          </button>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <GoalTargetEditor
                            goal={line.floor}
                            onChange={(floor) => setFloor(line, floor)}
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
                          goal={line.floor}
                          onChange={(floor) => setFloor(line, floor)}
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
                        onClick={() => setCondition(line, '')}
                        className="text-xs font-medium text-emerald-700 hover:underline"
                      >
                        + Add condition
                      </button>
                    ) : (
                      <div className="flex flex-col gap-2 rounded-md border border-slate-100 bg-slate-50 p-2">
                        <div className="flex items-center justify-between">
                          <span className="flex items-center gap-1 text-xs font-medium text-slate-600">
                            Condition
                            <HelpTooltip text={`This line only applies in years matching this expression, e.g. "age >= 60". Combine with && (and), || (or), ! (not). Applies on top of this range's own year range.`} />
                          </span>
                          <button
                            type="button"
                            onClick={() => setCondition(line, null)}
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
        + Add withdrawal line
      </button>
    </div>
  )
}
