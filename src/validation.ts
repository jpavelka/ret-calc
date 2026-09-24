interface RangeBoundsLike {
  startYear: number
  endYear: number
}

// Ranges within the same section are allowed to overlap — e.g. two
// overlapping income ranges mean both income sources apply for the
// overlapping years. The only real error is a backwards range.
export function rangeErrorMessage<T extends RangeBoundsLike>(range: T): string | null {
  if (range.startYear > range.endYear) return 'Start must be on or before end.'
  return null
}

export function findInvalidRangeIds<T extends RangeBoundsLike & { id: string }>(
  ranges: T[],
): Set<string> {
  const invalid = new Set<string>()
  for (const range of ranges) {
    if (rangeErrorMessage(range)) invalid.add(range.id)
  }
  return invalid
}

// For range domains where, unlike the ones above, only one range may apply
// to a given year (e.g. dividend reinvest-vs-cash policy) — every range
// involved in an overlap is flagged, not just the later one, so the user can
// see both sides of the conflict.
export function findOverlappingRangeIds<T extends RangeBoundsLike & { id: string }>(
  ranges: T[],
): Set<string> {
  const overlapping = new Set<string>()
  for (let i = 0; i < ranges.length; i++) {
    for (let j = i + 1; j < ranges.length; j++) {
      if (ranges[i].startYear <= ranges[j].endYear && ranges[j].startYear <= ranges[i].endYear) {
        overlapping.add(ranges[i].id)
        overlapping.add(ranges[j].id)
      }
    }
  }
  return overlapping
}
