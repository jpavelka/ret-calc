import type {
  IncomePlanRange,
  IncomeSourceDef,
  SavingsLineDef,
  SpendingBucketDef,
  SpendingPlanRange,
} from './types'

// When an income source is removed, drop any income range's allocation that
// referenced it — there's no sensible fallback value the way a special year
// has a last-known year. A custom allocation isn't tied to any source, so
// it's never dangling and always survives.
export function pruneDanglingIncomeAllocations(
  ranges: IncomePlanRange[],
  incomeSourceDefs: IncomeSourceDef[],
): IncomePlanRange[] {
  const incomeIds = new Set(incomeSourceDefs.map((d) => d.id))
  return ranges.map((range) => ({
    ...range,
    allocations: (range.allocations ?? []).filter(
      (a) => a.custom || (a.sourceId && incomeIds.has(a.sourceId)),
    ),
  }))
}

// Same idea, for spending buckets and spending ranges.
export function pruneDanglingSpendingAllocations(
  ranges: SpendingPlanRange[],
  spendingBucketDefs: SpendingBucketDef[],
): SpendingPlanRange[] {
  const bucketIds = new Set(spendingBucketDefs.map((d) => d.id))
  return ranges.map((range) => ({
    ...range,
    allocations: (range.allocations ?? []).filter(
      (a) => a.custom || (a.bucketId && bucketIds.has(a.bucketId)),
    ),
  }))
}

// When an income source is removed, unlink any savings line's employer match
// that was calculated against it, rather than leaving a dangling reference.
export function pruneDanglingMatchSources(
  savingsLineDefs: SavingsLineDef[],
  incomeSourceDefs: IncomeSourceDef[],
): SavingsLineDef[] {
  const incomeIds = new Set(incomeSourceDefs.map((d) => d.id))
  return savingsLineDefs.map((def) =>
    def.match && def.match.incomeSourceId && !incomeIds.has(def.match.incomeSourceId)
      ? { ...def, match: { ...def.match, incomeSourceId: null } }
      : def,
  )
}
