import type { YearProjectionRow } from './projection'

// A goal counts as met by a run only if every year that evaluated it (see
// YearProjectionRow.goalResults) came back true — an error in any year, or
// no years evaluating it at all (e.g. the projection is empty), both count
// as not met. Mirrors how the built-in "don't run out of money" goal treats
// any unfunded year as failing the whole run.
export function goalMetInRun(goalId: string, rows: YearProjectionRow[]): boolean {
  let evaluated = false
  for (const row of rows) {
    const result = row.goalResults[goalId]
    if (result === undefined) continue
    evaluated = true
    if (result !== true) return false
  }
  return evaluated
}
