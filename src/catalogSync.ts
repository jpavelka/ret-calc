import { freezeIdentifierInExpression, renameIdentifierInExpression } from './formula'
import type {
  AmountSource,
  GoalTarget,
  IncomePlanRange,
  SavingsLine,
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

// Same idea as convertDanglingVariableSource above, for a SavingsLine's
// `goal` — a GoalTarget is AmountSource-shaped (variable/custom/formula) but
// has no `frequency`, so it can't share that generic helper.
function convertDanglingGoalSource(
  lines: SavingsLine[],
  validVariableIds: Set<string>,
  variablesById: Map<string, Variable>,
  resolvedAmounts: Map<string, number>,
): SavingsLine[] {
  return lines.map((line) => {
    const goal = line.goal
    if (!goal || goal.kind !== 'variable' || validVariableIds.has(goal.variableId)) return line
    const v = variablesById.get(goal.variableId)
    const frozenGoal: GoalTarget = {
      kind: 'custom',
      amount: v ? (resolvedAmounts.get(v.id) ?? 0) : 0,
      inflationAdjusted: goal.inflationAdjusted,
    }
    return { ...line, goal: frozenGoal }
  })
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
    lines: convertDanglingGoalSource(
      convertDanglingVariableSource(range.lines ?? [], validVariableIds, variablesById, resolvedAmounts),
      validVariableIds,
      variablesById,
      resolvedAmounts,
    ),
  }))
}

// Same idea, for withdrawal ranges — their PriorityAllocation lines gained a
// full AmountSource (variable/custom/formula) alongside income/spending, so
// a 'variable'-kind range allocation can go dangling too, same as an
// income/spending line always could.
export function convertDanglingWithdrawalRangeVariableRefs(
  ranges: WithdrawalPlanRange[],
  validVariableIds: Set<string>,
  variablesById: Map<string, Variable>,
  resolvedAmounts: Map<string, number>,
): WithdrawalPlanRange[] {
  return ranges.map((range) => ({
    ...range,
    allocations: convertDanglingVariableSource(range.allocations ?? [], validVariableIds, variablesById, resolvedAmounts),
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
// — income/spending/savings/withdrawal ranges all share this shape.
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
// rename/freeze treatment. Scoped to `condition` only: unlike a Variable,
// nothing else (source/goal) references special years today.
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
