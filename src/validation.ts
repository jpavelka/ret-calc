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
