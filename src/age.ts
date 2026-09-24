export function calculateAge(birthDate: string, asOf: Date = new Date()): number | null {
  const parsed = new Date(birthDate)
  if (Number.isNaN(parsed.getTime())) return null

  let age = asOf.getFullYear() - parsed.getFullYear()
  const hasHadBirthdayThisYear =
    asOf.getMonth() > parsed.getMonth() ||
    (asOf.getMonth() === parsed.getMonth() && asOf.getDate() >= parsed.getDate())
  if (!hasHadBirthdayThisYear) age -= 1

  return age
}

// True when someone born on birthDate reaches `years` of age at any point
// during `year` or earlier. Fractional ages are supported, since the
// early-withdrawal cutoff is 59½ rather than a whole number of years.
//
// A milestone reached mid-year counts for the whole year. The projection
// models a year's entire activity as happening at one instant, so there's no
// meaningful way to place a withdrawal before or after a birthday — and
// pro-rating a penalty across the milestone year would be false precision.
export function hasReachedAgeDuringYear(
  birthDate: string,
  years: number,
  year: number,
): boolean {
  const parsed = new Date(birthDate)
  if (Number.isNaN(parsed.getTime())) return false

  const wholeYears = Math.floor(years)
  const milestone = new Date(parsed)
  milestone.setFullYear(milestone.getFullYear() + wholeYears)
  // setMonth rolls over into the next year on its own when the fractional
  // part pushes past December.
  const extraMonths = Math.round((years - wholeYears) * 12)
  if (extraMonths > 0) milestone.setMonth(milestone.getMonth() + extraMonths)

  return milestone.getFullYear() <= year
}

export function birthYear(birthDate: string): number | null {
  const parsed = new Date(birthDate)
  return Number.isNaN(parsed.getTime()) ? null : parsed.getFullYear()
}

export function deathYear(birthDate: string, lifeExpectancy: number): number | null {
  const born = birthYear(birthDate)
  return born !== null ? born + lifeExpectancy : null
}

export function defaultBirthDate(age = 35): string {
  const date = new Date()
  date.setFullYear(date.getFullYear() - age)
  return date.toISOString().slice(0, 10)
}

// The synthetic "age"/"spouseAge" formula names available alongside "year"
// (see specialYearPreviewScope/runProjection's yearScope) — offered in
// ExpressionInput's "[" quick-select wherever birth year(s) are known.
// "spouseAge" only appears when a spouse birth year is available, same
// gating as every other spouse-specific figure in this app (off when spouse
// mode is off).
export function ageFormulaNames(selfBirthYear: number | null, spouseBirthYear: number | null): string[] {
  const names: string[] = []
  if (selfBirthYear !== null) names.push('age')
  if (spouseBirthYear !== null) names.push('spouseAge')
  return names
}
