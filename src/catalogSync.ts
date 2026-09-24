import { freezeIdentifierInExpression, renameIdentifierInExpression } from './formula'
import type {
  AmountSource,
  CustomFunction,
  Goal,
  GoalTarget,
  IncomePlanRange,
  Metric,
  RothConversionAmount,
  RothConversionPlanRange,
  SavingsPlanRange,
  SpendingPlanRange,
  Variable,
  WithdrawalPlanRange,
} from './types'

// When a variable a line references is deleted, freeze its last known amount
// into a custom source on that line instead of dropping the line — the line
// has its own name independent of any variable, so there's no reason to lose
// it just because its amount source went away. `resolvedAmounts` is the
// variable's resolved value (from resolveVariableAmounts, computed against
// the OLD variables) since a Variable may be formula-derived and so has no
// flat `amount` of its own to read. The source's own inflationAdjusted flag
// carries over unchanged — it belonged to this line's use of the variable,
// not to the variable itself.
function convertDanglingVariableSource<T extends { source: AmountSource }>(
  items: T[],
  validVariableIds: Set<string>,
  variablesById: Map<string, Variable>,
  resolvedAmounts: Map<string, number>,
): T[] {
  return items.map((item) => {
    if (item.source.kind !== 'variable' || validVariableIds.has(item.source.variableId)) return item
    const v = variablesById.get(item.source.variableId)
    return {
      ...item,
      source: {
        kind: 'custom',
        amount: v ? (resolvedAmounts.get(v.id) ?? 0) : 0,
        inflationAdjusted: item.source.inflationAdjusted,
        frequency: item.source.frequency,
      },
    }
  })
}

export function convertDanglingIncomeVariableRefs(
  ranges: IncomePlanRange[],
  validVariableIds: Set<string>,
  variablesById: Map<string, Variable>,
  resolvedAmounts: Map<string, number>,
): IncomePlanRange[] {
  return ranges.map((range) => ({
    ...range,
    allocations: convertDanglingVariableSource(range.allocations ?? [], validVariableIds, variablesById, resolvedAmounts),
  }))
}

export function convertDanglingSpendingVariableRefs(
  ranges: SpendingPlanRange[],
  validVariableIds: Set<string>,
  variablesById: Map<string, Variable>,
  resolvedAmounts: Map<string, number>,
): SpendingPlanRange[] {
  return ranges.map((range) => ({
    ...range,
    allocations: convertDanglingVariableSource(range.allocations ?? [], validVariableIds, variablesById, resolvedAmounts),
  }))
}

// Same idea as convertDanglingVariableSource above, for a GoalTarget — a
// SavingsLine's `goal` or a WithdrawalLine's `floor`. A GoalTarget is
// AmountSource-shaped (variable/custom/formula) but has no `frequency`, so
// it can't share that generic helper.
function convertDanglingGoalTarget(
  goal: GoalTarget | null | undefined,
  validVariableIds: Set<string>,
  variablesById: Map<string, Variable>,
  resolvedAmounts: Map<string, number>,
): GoalTarget | null | undefined {
  if (!goal || goal.kind !== 'variable' || validVariableIds.has(goal.variableId)) return goal
  const v = variablesById.get(goal.variableId)
  return {
    kind: 'custom',
    amount: v ? (resolvedAmounts.get(v.id) ?? 0) : 0,
    inflationAdjusted: goal.inflationAdjusted,
  }
}

// Savings lines are defined directly on their range (no shared catalog — see
// SavingsPlanRange), so a 'variable'-kind line's source (or goal) can go
// dangling the same way an income/spending allocation's can; this walks each
// range's `lines` instead of `allocations`.
export function convertDanglingSavingsRangeVariableRefs(
  ranges: SavingsPlanRange[],
  validVariableIds: Set<string>,
  variablesById: Map<string, Variable>,
  resolvedAmounts: Map<string, number>,
): SavingsPlanRange[] {
  return ranges.map((range) => ({
    ...range,
    lines: convertDanglingVariableSource(range.lines ?? [], validVariableIds, variablesById, resolvedAmounts).map(
      (line) => ({ ...line, goal: convertDanglingGoalTarget(line.goal, validVariableIds, variablesById, resolvedAmounts) }),
    ),
  }))
}

// Same idea, for withdrawal ranges — a line's cap (`source`) and `floor` can
// each reference a variable.
export function convertDanglingWithdrawalRangeVariableRefs(
  ranges: WithdrawalPlanRange[],
  validVariableIds: Set<string>,
  variablesById: Map<string, Variable>,
  resolvedAmounts: Map<string, number>,
): WithdrawalPlanRange[] {
  return ranges.map((range) => ({
    ...range,
    lines: convertDanglingVariableSource(range.lines ?? [], validVariableIds, variablesById, resolvedAmounts).map(
      (line) => ({ ...line, floor: convertDanglingGoalTarget(line.floor, validVariableIds, variablesById, resolvedAmounts) }),
    ),
  }))
}

// Same idea as convertDanglingVariableSource above, but for a
// RothConversionAmount directly (amountSelf/amountSpouse aren't wrapped in a
// `source` field the way an income/spending/savings/withdrawal line's is).
function convertDanglingRothConversionAmount(
  amount: RothConversionAmount,
  validVariableIds: Set<string>,
  variablesById: Map<string, Variable>,
  resolvedAmounts: Map<string, number>,
): RothConversionAmount {
  if (amount.kind !== 'variable' || validVariableIds.has(amount.variableId)) return amount
  const v = variablesById.get(amount.variableId)
  return {
    kind: 'custom',
    amount: v ? (resolvedAmounts.get(v.id) ?? 0) : 0,
    inflationAdjusted: amount.inflationAdjusted,
  }
}

export function convertDanglingRothConversionVariableRefs(
  ranges: RothConversionPlanRange[],
  validVariableIds: Set<string>,
  variablesById: Map<string, Variable>,
  resolvedAmounts: Map<string, number>,
): RothConversionPlanRange[] {
  return ranges.map((range) => ({
    ...range,
    amountSelf: convertDanglingRothConversionAmount(range.amountSelf, validVariableIds, variablesById, resolvedAmounts),
    amountSpouse: convertDanglingRothConversionAmount(range.amountSpouse, validVariableIds, variablesById, resolvedAmounts),
  }))
}

// A deleted variable's wage tag has no "custom" fallback the way a line's
// amount does (there's no such thing as a custom salary base for a match) —
// just unlink it, same as before. Walks each range's own lines now that
// there's no shared catalog to prune once.
export function pruneDanglingMatchSourcesInSavingsRanges(
  ranges: SavingsPlanRange[],
  variables: Variable[],
): SavingsPlanRange[] {
  const variableIds = new Set(variables.map((v) => v.id))
  return ranges.map((range) => ({
    ...range,
    lines: range.lines.map((line) =>
      line.match && line.match.wageVariableId && !variableIds.has(line.match.wageVariableId)
        ? { ...line, match: { ...line.match, wageVariableId: null } }
        : line,
    ),
  }))
}

// --- Formula-kind sources: unlike a 'variable'-kind source (which links by
// id, so it's immune to renames and only needs delete handling above), a
// formula's expression text references a variable BY NAME. So a rename needs
// to patch existing formula text to keep working, and a delete needs to
// freeze the deleted variable's last known value into any formula that
// referenced it (same "don't silently break the line" precedent as
// convertDanglingVariableSource above) rather than leaving an unknown
// identifier that starts failing to resolve.

function renameInSource(source: AmountSource, oldName: string, newName: string): AmountSource {
  if (source.kind !== 'formula') return source
  return { ...source, expression: renameIdentifierInExpression(source.expression, oldName, newName) }
}

function freezeInSource(source: AmountSource, name: string, value: number): AmountSource {
  if (source.kind !== 'formula') return source
  return { ...source, expression: freezeIdentifierInExpression(source.expression, name, value) }
}

// Generic over any flat list of "things with a source".
export function renameFormulaRefsInSources<T extends { source: AmountSource }>(
  items: T[],
  oldName: string,
  newName: string,
): T[] {
  return items.map((item) => ({ ...item, source: renameInSource(item.source, oldName, newName) }))
}

export function freezeFormulaRefsInSources<T extends { source: AmountSource }>(
  items: T[],
  name: string,
  value: number,
): T[] {
  return items.map((item) => ({ ...item, source: freezeInSource(item.source, name, value) }))
}

// Generic over any list of ranges whose lines are nested under `allocations`
// — income and spending ranges share this shape.
export function renameFormulaRefsInRanges<T extends { allocations: { source: AmountSource }[] }>(
  ranges: T[],
  oldName: string,
  newName: string,
): T[] {
  return ranges.map((range) => ({
    ...range,
    allocations: renameFormulaRefsInSources(range.allocations, oldName, newName),
  }))
}

export function freezeFormulaRefsInRanges<T extends { allocations: { source: AmountSource }[] }>(
  ranges: T[],
  name: string,
  value: number,
): T[] {
  return ranges.map((range) => ({
    ...range,
    allocations: freezeFormulaRefsInSources(range.allocations, name, value),
  }))
}

function renameInRothConversionAmount(amount: RothConversionAmount, oldName: string, newName: string): RothConversionAmount {
  if (amount.kind !== 'formula') return amount
  return { ...amount, expression: renameIdentifierInExpression(amount.expression, oldName, newName) }
}

function freezeInRothConversionAmount(amount: RothConversionAmount, name: string, value: number): RothConversionAmount {
  if (amount.kind !== 'formula') return amount
  return { ...amount, expression: freezeIdentifierInExpression(amount.expression, name, value) }
}

// Roth conversion ranges aren't shaped like the other range types (no
// `allocations`/`lines` array — just a direct amountSelf/amountSpouse pair
// per range), so they need their own rename/freeze pair rather than reusing
// renameFormulaRefsInRanges. A conversion amount's formula can reference a
// Variable, custom Function, or special year by name, same as any other
// formula field, so this same pair covers all three rename cascades.
export function renameFormulaRefsInRothConversionRanges(
  ranges: RothConversionPlanRange[],
  oldName: string,
  newName: string,
): RothConversionPlanRange[] {
  return ranges.map((range) => ({
    ...range,
    amountSelf: renameInRothConversionAmount(range.amountSelf, oldName, newName),
    amountSpouse: renameInRothConversionAmount(range.amountSpouse, oldName, newName),
  }))
}

export function freezeFormulaRefsInRothConversionRanges(
  ranges: RothConversionPlanRange[],
  name: string,
  value: number,
): RothConversionPlanRange[] {
  return ranges.map((range) => ({
    ...range,
    amountSelf: freezeInRothConversionAmount(range.amountSelf, name, value),
    amountSpouse: freezeInRothConversionAmount(range.amountSpouse, name, value),
  }))
}

function renameInGoal(goal: GoalTarget | null | undefined, oldName: string, newName: string): GoalTarget | null | undefined {
  if (!goal || goal.kind !== 'formula') return goal
  return { ...goal, expression: renameIdentifierInExpression(goal.expression, oldName, newName) }
}

function freezeInGoal(goal: GoalTarget | null | undefined, name: string, value: number): GoalTarget | null | undefined {
  if (!goal || goal.kind !== 'formula') return goal
  return { ...goal, expression: freezeIdentifierInExpression(goal.expression, name, value) }
}

// Same idea as renameFormulaRefsInRanges/freezeFormulaRefsInRanges above, for
// savings ranges specifically — their lines are nested under `lines` rather
// than `allocations`, since each one is a full SavingsLine (name/account/
// owner/match/source/goal/condition), not just an AmountSource wrapper. A
// line's `goal` (when formula-kind) and `condition` (a bare boolean-formula
// string, not wrapped in an AmountSource) both need the same treatment as
// `source`.
export function renameFormulaRefsInSavingsRanges(
  ranges: SavingsPlanRange[],
  oldName: string,
  newName: string,
): SavingsPlanRange[] {
  return ranges.map((range) => ({
    ...range,
    lines: renameFormulaRefsInSources(range.lines, oldName, newName).map((line) => ({
      ...line,
      goal: renameInGoal(line.goal, oldName, newName),
      condition: line.condition ? renameIdentifierInExpression(line.condition, oldName, newName) : line.condition,
    })),
  }))
}

export function freezeFormulaRefsInSavingsRanges(
  ranges: SavingsPlanRange[],
  name: string,
  value: number,
): SavingsPlanRange[] {
  return ranges.map((range) => ({
    ...range,
    lines: freezeFormulaRefsInSources(range.lines, name, value).map((line) => ({
      ...line,
      goal: freezeInGoal(line.goal, name, value),
      condition: line.condition ? freezeIdentifierInExpression(line.condition, name, value) : line.condition,
    })),
  }))
}

// A savings line's `condition` can reference a special year by name (e.g.
// "year < [College]"), the same way a formula references a Variable by
// name — so a special year rename/delete needs the identical text-level
// rename/freeze treatment. A Goal's formula can too, but reuses
// renameFormulaRefsInGoals/freezeFormulaRefsInGoals above directly since
// nothing about that cascade is savings-specific.
export function renameSpecialYearRefsInSavingsRanges(
  ranges: SavingsPlanRange[],
  oldName: string,
  newName: string,
): SavingsPlanRange[] {
  return ranges.map((range) => ({
    ...range,
    lines: range.lines.map((line) =>
      line.condition
        ? { ...line, condition: renameIdentifierInExpression(line.condition, oldName, newName) }
        : line,
    ),
  }))
}

export function freezeSpecialYearRefsInSavingsRanges(
  ranges: SavingsPlanRange[],
  name: string,
  value: number,
): SavingsPlanRange[] {
  return ranges.map((range) => ({
    ...range,
    lines: range.lines.map((line) =>
      line.condition ? { ...line, condition: freezeIdentifierInExpression(line.condition, name, value) } : line,
    ),
  }))
}

// Withdrawal-range siblings of the savings helpers above: a line's cap
// (`source`), `floor`, and `condition` can all reference a Variable, custom
// Function, or special year by name.
export function renameFormulaRefsInWithdrawalRanges(
  ranges: WithdrawalPlanRange[],
  oldName: string,
  newName: string,
): WithdrawalPlanRange[] {
  return ranges.map((range) => ({
    ...range,
    lines: renameFormulaRefsInSources(range.lines, oldName, newName).map((line) => ({
      ...line,
      floor: renameInGoal(line.floor, oldName, newName),
      condition: line.condition ? renameIdentifierInExpression(line.condition, oldName, newName) : line.condition,
    })),
  }))
}

export function freezeFormulaRefsInWithdrawalRanges(
  ranges: WithdrawalPlanRange[],
  name: string,
  value: number,
): WithdrawalPlanRange[] {
  return ranges.map((range) => ({
    ...range,
    lines: freezeFormulaRefsInSources(range.lines, name, value).map((line) => ({
      ...line,
      floor: freezeInGoal(line.floor, name, value),
      condition: line.condition ? freezeIdentifierInExpression(line.condition, name, value) : line.condition,
    })),
  }))
}

// Variables can themselves be formula-derived and reference OTHER variables
// by name (see variables.ts) — a rename/delete needs the same treatment
// applied to every other variable's own source, not just to lines.
export function renameFormulaRefsInVariables(variables: Variable[], oldName: string, newName: string): Variable[] {
  return variables.map((v) =>
    v.source.kind === 'formula'
      ? { ...v, source: { kind: 'formula', expression: renameIdentifierInExpression(v.source.expression, oldName, newName) } }
      : v,
  )
}

export function freezeFormulaRefsInVariables(variables: Variable[], name: string, value: number): Variable[] {
  return variables.map((v) =>
    v.source.kind === 'formula'
      ? { ...v, source: { kind: 'formula', expression: freezeIdentifierInExpression(v.source.expression, name, value) } }
      : v,
  )
}

// A CustomFunction's own body can call OTHER custom functions by name (see
// formula.ts), so renaming one needs the same text-level cascade applied to
// every other function's expression too — same idea as
// renameFormulaRefsInVariables above. There's no freeze counterpart here: a
// deleted function's call sites are deliberately left erroring rather than
// frozen (see CustomFunction's doc comment) since a function's result
// depends on its call site's own argument expressions, not a single
// resolved value the way a Variable's does.
export function renameFormulaRefsInFunctions(functions: CustomFunction[], oldName: string, newName: string): CustomFunction[] {
  return functions.map((f) => ({ ...f, expression: renameIdentifierInExpression(f.expression, oldName, newName) }))
}

// A Goal's formula references a Variable/Function/special year by name, same
// as a SavingsLine's condition — same text-level rename/freeze cascade. No
// dangling-ref conversion needed (a Goal has no id-linked 'variable'-kind
// source, only a formula), so this pair is all a Goal needs.
export function renameFormulaRefsInGoals(goals: Goal[], oldName: string, newName: string): Goal[] {
  return goals.map((g) => ({ ...g, expression: renameIdentifierInExpression(g.expression, oldName, newName) }))
}

export function freezeFormulaRefsInGoals(goals: Goal[], name: string, value: number): Goal[] {
  return goals.map((g) => ({ ...g, expression: freezeIdentifierInExpression(g.expression, name, value) }))
}

// A Metric's formula references a Variable/Function/special year by name,
// exactly like a Goal's — same text-level rename/freeze cascade.
export function renameFormulaRefsInMetrics(metrics: Metric[], oldName: string, newName: string): Metric[] {
  return metrics.map((m) => ({ ...m, expression: renameIdentifierInExpression(m.expression, oldName, newName) }))
}

export function freezeFormulaRefsInMetrics(metrics: Metric[], name: string, value: number): Metric[] {
  return metrics.map((m) => ({ ...m, expression: freezeIdentifierInExpression(m.expression, name, value) }))
}
