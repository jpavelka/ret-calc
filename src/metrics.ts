import type { YearProjectionRow } from './projection'

// A metric's summary value for one run: the average of its per-year values,
// over every year that evaluated it (see YearProjectionRow.metricResults) —
// an error in a given year just skips that year rather than poisoning the
// average. Null if no year evaluated it at all (e.g. the projection is
// empty, or every year errored), the numeric analogue of goalMetInRun's
// "not met" for an unevaluated goal.
export function metricAverageInRun(metricId: string, rows: YearProjectionRow[]): number | null {
  let sum = 0
  let count = 0
  for (const row of rows) {
    const result = row.metricResults[metricId]
    if (result === undefined || result === null) continue
    sum += result
    count++
  }
  return count > 0 ? sum / count : null
}

// Shared display formatting for a metric's value — a Metric isn't
// necessarily a dollar figure (could be an age, a ratio, a count), so unlike
// FormulaField's "= $X,XXX" this has no currency prefix.
export function formatMetricValue(value: number): string {
  return value.toLocaleString('en-US', { maximumFractionDigits: 2 })
}
