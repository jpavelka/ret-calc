import type { PriorityAllocation } from './types'

// Regenerate an allocations array to exactly match a priority set's lineIds
// and order, preserving each line's existing amount where it was already
// present and defaulting new lines to that line's default amount (or 0 if
// none is given, e.g. for domains without a per-line default).
export function syncAllocationsToLineIds(
  allocations: PriorityAllocation[],
  lineIds: string[],
  defaultAmounts: Map<string, number> = new Map(),
): PriorityAllocation[] {
  const existingByLineId = new Map(
    allocations.filter((a) => a.lineId).map((a) => [a.lineId as string, a]),
  )
  return lineIds.map(
    (lineId) =>
      existingByLineId.get(lineId) ?? {
        id: crypto.randomUUID(),
        lineId,
        amount: defaultAmounts.get(lineId) ?? 0,
      },
  )
}

// When a savings/withdrawal line is removed from the catalog, it's also
// removed from any priority set's lineIds — this drops it from those sets too.
export function pruneDanglingLineIds<T extends { lineIds: string[] }>(
  sets: T[],
  validIds: Set<string>,
): T[] {
  return sets.map((set) => ({
    ...set,
    lineIds: set.lineIds.filter((id) => validIds.has(id)),
  }))
}

interface HasPrioritySelection {
  prioritySetId: string | null
  allocations: PriorityAllocation[]
}

// Whenever a domain's priority sets change (edited, reordered, or removed),
// keep every range that references one in sync — or, if its set was removed,
// unlink it back to no priority selected. Generic so it serves both the
// savings and withdrawal plan-range lists.
export function syncRangesToPrioritySets<T extends HasPrioritySelection>(
  ranges: T[],
  sets: { id: string; lineIds: string[] }[],
  defaultAmounts: Map<string, number> = new Map(),
): T[] {
  const byId = new Map(sets.map((s) => [s.id, s]))
  return ranges.map((range) => {
    if (!range.prioritySetId) return range
    const set = byId.get(range.prioritySetId)
    if (!set) return { ...range, prioritySetId: null, allocations: [] }
    return {
      ...range,
      allocations: syncAllocationsToLineIds(range.allocations, set.lineIds, defaultAmounts),
    }
  })
}
