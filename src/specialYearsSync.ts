import { deathYear as computeDeathYear } from './age'
import {
  CURRENT_YEAR_SPECIAL_ID,
  DEATH_YEAR_SPECIAL_ID,
  resolveSpecialYears,
} from './specialYearGraph'
import type { RetirementInputs, SpecialYear } from './types'

interface HasYearBounds {
  startYear: number
  endYear: number
  startSpecialYearId: string | null
  startSpecialYearOffset: number
  endSpecialYearId: string | null
  endSpecialYearOffset: number
}

// Whenever special years change (edited or removed), keep every range
// boundary that links to one in sync (special year's value plus its offset,
// or today's actual year for the built-in "Current year") — or, if its
// special year was removed, unlink it back to a plain custom year (keeping
// the last known value). Generic so it works across each domain's
// independent range list.
export function syncRangesToSpecialYears<T extends HasYearBounds>(
  ranges: T[],
  specialYears: SpecialYear[],
  deathYear: number | null = null,
): T[] {
  const byId = new Map(specialYears.map((s) => [s.id, s]))

  function resolvedYear(specialYearId: string): number | null {
    if (specialYearId === CURRENT_YEAR_SPECIAL_ID) return new Date().getFullYear()
    if (specialYearId === DEATH_YEAR_SPECIAL_ID) return deathYear
    return byId.get(specialYearId)?.year ?? null
  }

  return ranges.map((range) => {
    let next = range

    if (range.startSpecialYearId) {
      const year = resolvedYear(range.startSpecialYearId)
      next =
        year !== null
          ? { ...next, startYear: year + (range.startSpecialYearOffset ?? 0) }
          : { ...next, startSpecialYearId: null }
    }

    if (range.endSpecialYearId) {
      const year = resolvedYear(range.endSpecialYearId)
      next =
        year !== null
          ? { ...next, endYear: year + (range.endSpecialYearOffset ?? 0) }
          : { ...next, endSpecialYearId: null }
    }

    return next
  })
}

// Re-resolves special years (including any based on the built-in "Current
// year") and re-syncs every domain's ranges to them. Run this whenever
// special years are edited, and also right after loading a scenario, so
// "Current year"-based values are never stale relative to today.
export function resolveInputsSpecialYears(inputs: RetirementInputs): RetirementInputs {
  const deathYear = computeDeathYear(inputs.birthDate, inputs.lifeExpectancy)
  const specialYears = resolveSpecialYears(inputs.specialYears, deathYear)
  return {
    ...inputs,
    specialYears,
    incomeRanges: syncRangesToSpecialYears(inputs.incomeRanges, specialYears, deathYear),
    spendingRanges: syncRangesToSpecialYears(inputs.spendingRanges, specialYears, deathYear),
    savingsRanges: syncRangesToSpecialYears(inputs.savingsRanges, specialYears, deathYear),
    withdrawalRanges: syncRangesToSpecialYears(
      inputs.withdrawalRanges,
      specialYears,
      deathYear,
    ),
    rothConversionRanges: syncRangesToSpecialYears(
      inputs.rothConversionRanges,
      specialYears,
      deathYear,
    ),
  }
}
