import type { AcaFederalPovertyGuideline, TaxBracket } from './types'

export function fplForHouseholdSize(guideline: AcaFederalPovertyGuideline, householdSize: number): number {
  const size = Math.max(1, householdSize)
  return guideline.basePerson1 + guideline.perAdditionalPerson * (size - 1)
}

// Piecewise-linear interpolation between consecutive (FPL%, applicable%)
// anchor points — NOT marginal-bracket accumulation the way tax.ts's
// bracketTax works, since there's nothing to accumulate here (the
// applicable percentage applies to the household's whole MAGI, not layered
// like a tax bracket). `sorted` must be pre-sorted ascending by `min`, same
// convention as tax.ts's prepareTaxSchedules. Below the first point or above
// the last, the nearest endpoint's rate is used (flat extrapolation).
export function applicablePercentageForFpl(fplPct: number, sorted: TaxBracket[]): number | null {
  if (sorted.length === 0) return null
  if (fplPct <= sorted[0].min) return sorted[0].ratePct
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i]
    const b = sorted[i + 1]
    if (fplPct <= b.min) {
      const t = b.min === a.min ? 1 : (fplPct - a.min) / (b.min - a.min)
      return a.ratePct + t * (b.ratePct - a.ratePct)
    }
  }
  return sorted[sorted.length - 1].ratePct
}

export interface AcaPtcResult {
  magi: number
  householdSize: number
  fpl: number
  fplPct: number
  applicablePct: number
  expectedContribution: number
  benchmarkPremium: number
  actualPremium: number
  premiumTaxCredit: number
  netPremium: number
  aboveCliff: boolean
}

// Computes the ACA marketplace premium tax credit for one household-year.
// Pure function — the caller resolves inflation, the active coverage range,
// and MAGI before calling this; `applicableSchedule` must already be sorted
// ascending by `min`.
//
// Known limitations:
//  - No modeling of Medicaid-expansion-state treatment of MAGI below 100%
//    FPL (expansion states effectively floor eligibility at 100% FPL to
//    avoid the "coverage gap") — this app has no state-Medicaid-expansion
//    data, so a household below 100% FPL here simply gets the schedule's
//    lowest anchor point's rate via applicablePercentageForFpl's flat
//    extrapolation, which is only an approximation of real eligibility
//    rules at very low income.
//  - The applicable-percentage schedule is a small set of editable,
//    linearly-interpolated anchor points, not the IRS's exact per-integer-
//    FPL-point published table (Form 8962 Table 2) — a "good enough,
//    editable" approximation, the same tradeoff this app already makes for
//    RMD divisors and provisional-income thresholds.
export function computePtc(params: {
  magi: number
  householdSize: number
  fplGuideline: AcaFederalPovertyGuideline // already inflation-scaled by caller
  applicableSchedule: TaxBracket[] // sorted ascending by min; NOT inflation-scaled
  actualPremium: number
  benchmarkPremium: number
  cliffAt400Pct: boolean
  capAbovePct400: number
}): AcaPtcResult {
  const fpl = fplForHouseholdSize(params.fplGuideline, params.householdSize)
  const magi = Math.max(0, params.magi)
  const fplPct = fpl > 0 ? (magi / fpl) * 100 : 0
  const aboveCliff = fplPct > 400 && params.cliffAt400Pct
  const applicablePct = fplPct > 400
    ? (params.cliffAt400Pct ? 0 : params.capAbovePct400)
    : (applicablePercentageForFpl(fplPct, params.applicableSchedule) ?? 0)
  const expectedContribution = magi * (applicablePct / 100)
  const premiumTaxCredit = aboveCliff
    ? 0
    : Math.max(0, Math.min(params.actualPremium, params.benchmarkPremium - expectedContribution))
  return {
    magi,
    householdSize: params.householdSize,
    fpl,
    fplPct,
    applicablePct,
    expectedContribution,
    benchmarkPremium: params.benchmarkPremium,
    actualPremium: params.actualPremium,
    premiumTaxCredit,
    netPremium: params.actualPremium - premiumTaxCredit,
    aboveCliff,
  }
}
