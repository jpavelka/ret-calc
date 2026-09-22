import type { SpecialYear } from './types'

// Built-in pseudo special years — not stored in inputs.specialYears, always
// available as a base/link target. "Current year" always resolves to today's
// actual year (never stale, unlike a stored SpecialYear). "Death year"
// resolves to birth year + life expectancy, passed in by the caller since it
// depends on other inputs rather than being computed here.
export const CURRENT_YEAR_SPECIAL_ID = 'current-year'
export const CURRENT_YEAR_SPECIAL_NAME = 'Current year'
export const DEATH_YEAR_SPECIAL_ID = 'death-year'
export const DEATH_YEAR_SPECIAL_NAME = 'Death year'

// Every special year name available to insert into a formula/condition field
// — stored special years plus the two built-in pseudo years — for an
// "Insert…" dropdown's "Special years" group (see FormulaField/ConditionField).
export function listSpecialYearNames(specialYears: SpecialYear[]): string[] {
  return [...specialYears.map((s) => s.name), CURRENT_YEAR_SPECIAL_NAME, DEATH_YEAR_SPECIAL_NAME]
}

// The live-preview scope for a formula/condition field's "year" and special
// year names, evaluated against today's calendar year — the same "preview
// today's resolved value" convention every other live preview in this app
// uses, rather than letting the preview scrub across years. "year" is set
// last so it always wins even against a same-named special year (blocked
// already by isReservedSpecialYearName, but kept consistent with
// runProjection's own precedence regardless).
export function specialYearPreviewScope(
  specialYears: SpecialYear[],
  deathYear: number | null,
): Record<string, number> {
  const currentYear = new Date().getFullYear()
  const scope: Record<string, number> = {}
  for (const s of specialYears) scope[s.name] = s.year
  scope[CURRENT_YEAR_SPECIAL_NAME] = currentYear
  scope[DEATH_YEAR_SPECIAL_NAME] = deathYear ?? currentYear
  scope['year'] = currentYear
  return scope
}

export function isReservedSpecialYearName(name: string): boolean {
  const normalized = name.trim().toLowerCase()
  return (
    normalized === CURRENT_YEAR_SPECIAL_NAME.toLowerCase() ||
    normalized === DEATH_YEAR_SPECIAL_NAME.toLowerCase()
  )
}

// Resolves what a *SpecialYearId reference currently points to — the live
// current year or death year for the built-in pseudo entries, a stored
// special year's resolved value, or null if the reference is dangling
// (removed, or death year requested but not yet computable).
export function resolveSpecialYearRef(
  specialYearId: string,
  specialYears: SpecialYear[],
  deathYear: number | null = null,
): { name: string; year: number } | null {
  if (specialYearId === CURRENT_YEAR_SPECIAL_ID) {
    return { name: CURRENT_YEAR_SPECIAL_NAME, year: new Date().getFullYear() }
  }
  if (specialYearId === DEATH_YEAR_SPECIAL_ID) {
    return deathYear !== null ? { name: DEATH_YEAR_SPECIAL_NAME, year: deathYear } : null
  }
  const found = specialYears.find((s) => s.id === specialYearId)
  return found ? { name: found.name, year: found.year } : null
}

// True if, following baseSpecialYearId pointers starting at fromId, we ever
// reach targetId. Used to answer "does fromId (transitively) depend on
// targetId?". The built-in current-year pseudo entry has no base of its own,
// so it never contributes to a cycle.
function dependsOn(
  byId: Map<string, SpecialYear>,
  fromId: string,
  targetId: string,
): boolean {
  let current: string | null = fromId
  const visited = new Set<string>()
  while (current) {
    if (current === targetId) return true
    if (current === CURRENT_YEAR_SPECIAL_ID || current === DEATH_YEAR_SPECIAL_ID) return false
    if (visited.has(current)) return false // already-cyclic data; stop rather than loop
    visited.add(current)
    current = byId.get(current)?.baseSpecialYearId ?? null
  }
  return false
}

// The stored special years that are safe to pick as forId's base — excludes
// forId itself and anything that already (transitively) depends on forId,
// since basing forId on one of those would create a cycle. The built-in
// current-year pseudo entry is always valid and isn't part of this list —
// callers add it separately.
export function getValidBaseOptions(
  specialYears: SpecialYear[],
  forId: string,
): SpecialYear[] {
  const byId = new Map(specialYears.map((s) => [s.id, s]))
  return specialYears.filter((s) => s.id !== forId && !dependsOn(byId, s.id, forId))
}

// Recomputes every special year's resolved `year` from its base chain (if
// any), supporting multi-level chains and a base of the built-in current-year
// pseudo entry. Also defensively clears any dangling or (should one somehow
// slip through) cyclic base reference back to a plain custom value, keeping
// the last known year rather than crashing or looping.
export function resolveSpecialYears(
  specialYears: SpecialYear[],
  deathYear: number | null = null,
): SpecialYear[] {
  const byId = new Map(specialYears.map((s) => [s.id, s]))
  const resolvedYear = new Map<string, number>()
  const resolving = new Set<string>()

  function resolve(id: string): number {
    const cached = resolvedYear.get(id)
    if (cached !== undefined) return cached

    const entry = byId.get(id)
    if (!entry) return 0

    if (!entry.baseSpecialYearId) {
      resolvedYear.set(id, entry.year)
      return entry.year
    }

    if (entry.baseSpecialYearId === CURRENT_YEAR_SPECIAL_ID) {
      const value = new Date().getFullYear() + entry.baseSpecialYearOffset
      resolvedYear.set(id, value)
      return value
    }

    if (entry.baseSpecialYearId === DEATH_YEAR_SPECIAL_ID) {
      const value = deathYear !== null ? deathYear + entry.baseSpecialYearOffset : entry.year
      resolvedYear.set(id, value)
      return value
    }

    if (!byId.has(entry.baseSpecialYearId)) {
      resolvedYear.set(id, entry.year)
      return entry.year
    }

    if (resolving.has(id)) {
      // Cycle guard — shouldn't happen given getValidBaseOptions, but stay safe.
      resolvedYear.set(id, entry.year)
      return entry.year
    }

    resolving.add(id)
    const baseYear = resolve(entry.baseSpecialYearId)
    resolving.delete(id)

    const value = baseYear + entry.baseSpecialYearOffset
    resolvedYear.set(id, value)
    return value
  }

  return specialYears.map((s) => {
    const hasValidBase =
      s.baseSpecialYearId !== null &&
      (s.baseSpecialYearId === CURRENT_YEAR_SPECIAL_ID ||
        s.baseSpecialYearId === DEATH_YEAR_SPECIAL_ID ||
        byId.has(s.baseSpecialYearId))
    return {
      ...s,
      baseSpecialYearId: hasValidBase ? s.baseSpecialYearId : null,
      year: resolve(s.id),
    }
  })
}
