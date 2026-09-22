import { birthYear } from './age'
import { activeRanges, resolveAllocation } from './projection'
import { resolveVariableAmounts } from './variables'
import type { AwiYear, FraRow, Owner, RetirementInputs, SocialSecurityOwnerConfig } from './types'

// Structural echo of YearlyRates from projection.ts (only inflationRatePct is
// ever used here) — kept local rather than imported to avoid an import cycle,
// since projection.ts imports from this file. Indexed from currentYear, same
// as YearlyRates arrays elsewhere: entry i is the rate for currentYear + i.
type InflationRateOverrides = { inflationRatePct: number }[]

// SSA's benefit formula fixes a worker's Primary Insurance Amount (PIA) using
// the National Average Wage Index (AWI) as of the year they turn 60 — both
// for wage-indexing their earnings history, and for the PIA "bend points"
// (see computeBendPoints). This is that anchor year.
//
// For anyone who hasn't turned 60 yet, the real anchor year's AWI can't be
// known, so this caps it — but at currentYear - 2, not currentYear. AWI is
// only published with about a two-year lag (this is also why SSA's own bend-
// point rule anchors two years *before* first eligibility rather than at
// eligibility itself, the same structural reason), so "this year's AWI" is
// never actually real data — the most recent year that could plausibly be
// known is currentYear - 2. Anchoring there instead of at currentYear
// matters: it's two fewer years of compounding the awiGrowthRatePct
// assumption (extrapolating this app's own necessarily-stale AWI table
// further to reach a "now" that isn't real data anyway would only add more
// guesswork on top of guesswork). Verified against a real ssa.gov estimate:
// anchoring at currentYear overstated it by ~2.7%; at currentYear - 2, ~1.2%
// low, well within the residual slack from this table's own extrapolation
// and SSA's own per-step rounding rules that aren't replicated here. Once
// age 60 has actually happened, the real age-60 year applies regardless,
// same as the law requires.
function indexingYear(birthYr: number, currentYear: number): number {
  return Math.min(birthYr + 60, currentYear - 2)
}

function ownerConfig(inputs: RetirementInputs, owner: Owner): SocialSecurityOwnerConfig {
  return owner === 'self' ? inputs.socialSecurity.self : inputs.socialSecurity.spouse
}

// claimingAge in months, rounded once here — every other computation derives
// the claim year from this rounded value (see claimYearFor) rather than
// re-deriving it from the raw fractional claimingAge with a different
// rounding rule, which would let the claim year and the claiming-age-in-
// months adjustment disagree by up to a year for a fractional age.
function claimAgeMonthsFor(config: SocialSecurityOwnerConfig): number {
  return Math.round(config.claimingAge * 12)
}

function claimYearFor(birthYr: number, claimAgeMonths: number): number {
  return birthYr + Math.floor(claimAgeMonths / 12)
}

// The year a PIA is effectively denominated in — the year whose dollars its
// value already has the purchasing power of, before any claiming-age
// adjustment. For the earnings-history method this is the same wage-
// indexing anchor computeAIME/computeBendPoints use (their multiplier is
// what puts the PIA in that year's terms in the first place). For the
// estimate method there's no wage-indexing at all — the field is entered
// and documented as "today's dollars" — so the anchor is simply currentYear.
function benefitAnchorYear(config: SocialSecurityOwnerConfig, birthYr: number, currentYear: number): number {
  return config.benefitMethod === 'earningsHistory' ? indexingYear(birthYr, currentYear) : currentYear
}

function ownerBirthDate(inputs: RetirementInputs, owner: Owner): string {
  return owner === 'self' ? inputs.birthDate : inputs.spouseBirthDate
}

// AWI for `year`, extrapolating forward from the table's last known year at
// growthRatePct for any year beyond it (needed for anyone who hasn't yet
// turned 60, since their indexing year/bend points depend on an AWI value
// that hasn't been published yet) and backward from the first entry for any
// year before it (defensive only — the shipped table starts in 1951).
export function awiForYear(table: AwiYear[], year: number, growthRatePct: number): number {
  if (table.length === 0) return 0
  const sorted = [...table].sort((a, b) => a.year - b.year)
  const first = sorted[0]
  const last = sorted[sorted.length - 1]
  if (year <= first.year) return first.index
  if (year <= last.year) {
    const exact = sorted.find((row) => row.year === year)
    if (exact) return exact.index
    // Not every calendar year needs its own row if the table is trimmed —
    // linearly interpolate between the surrounding known years.
    let lower = first
    let upper = last
    for (const row of sorted) {
      if (row.year <= year) lower = row
      if (row.year >= year) {
        upper = row
        break
      }
    }
    if (upper.year === lower.year) return lower.index
    const fraction = (year - lower.year) / (upper.year - lower.year)
    return lower.index + (upper.index - lower.index) * fraction
  }
  return last.index * Math.pow(1 + growthRatePct / 100, year - last.year)
}

// SSA's bend-point formula: each is a fixed 1979 dollar amount ($180/$1,085)
// scaled by wage growth from the 1977 AWI (the formula's fixed base year) to
// the AWI two years before first eligibility — i.e. the year the worker
// turns 60, same anchor as wage-indexing. Frozen for life once computed.
export function computeBendPoints(
  birthYr: number,
  currentYear: number,
  awiTable: AwiYear[],
  growthRatePct: number,
): { bend1: number; bend2: number } {
  const baseAwi = awiForYear(awiTable, indexingYear(birthYr, currentYear), growthRatePct)
  const awi1977 = awiForYear(awiTable, 1977, growthRatePct)
  const ratio = awi1977 > 0 ? baseAwi / awi1977 : 1
  return { bend1: 180 * ratio, bend2: 1085 * ratio }
}

// Average Indexed Monthly Earnings: each year at or before the indexing year
// is scaled by AWI(indexingYear)/AWI(thatYear); later years count at face
// value. Sums the top 35 (by indexed value) and divides by 420 months —
// years without an entry simply don't contribute, which is already exactly
// SSA's "fewer than 35 years counts the rest as $0" rule (dividing by the
// fixed 420 does that automatically, with no need to pad the array).
export function computeAIME(
  earningsByYear: Map<number, number>,
  birthYr: number,
  currentYear: number,
  awiTable: AwiYear[],
  growthRatePct: number,
): number {
  const idxYear = indexingYear(birthYr, currentYear)
  const idxAwi = awiForYear(awiTable, idxYear, growthRatePct)
  const indexed: number[] = []
  for (const [year, earnings] of earningsByYear) {
    if (earnings <= 0) continue
    if (year < idxYear) {
      const yearAwi = awiForYear(awiTable, year, growthRatePct)
      indexed.push(yearAwi > 0 ? earnings * (idxAwi / yearAwi) : earnings)
    } else {
      indexed.push(earnings)
    }
  }
  indexed.sort((a, b) => b - a)
  const top35 = indexed.slice(0, 35)
  return top35.reduce((sum, v) => sum + v, 0) / 420
}

// The 90%/32%/15% piecewise formula, applied to AIME to get the monthly PIA
// at Full Retirement Age.
export function computePIA(aime: number, bendPoints: { bend1: number; bend2: number }): number {
  const { bend1, bend2 } = bendPoints
  if (aime <= bend1) return aime * 0.9
  if (aime <= bend2) return bend1 * 0.9 + (aime - bend1) * 0.32
  return bend1 * 0.9 + (bend2 - bend1) * 0.32 + (aime - bend2) * 0.15
}

// Full Retirement Age, in total months, for a given birth year — the
// largest table entry at or below birthYr, same "largest match <= age"
// lookup RmdDivisor uses in projection.ts's rmdDivisorForAge. A birth year
// younger than every row falls back to the table's youngest row, and an
// older birth year to its oldest, extrapolating flat at both ends.
export function fullRetirementAgeMonths(birthYr: number, table: FraRow[]): number {
  if (table.length === 0) return 66 * 12
  const sorted = [...table].sort((a, b) => a.birthYear - b.birthYear)
  let match = sorted[0]
  for (const row of sorted) {
    if (row.birthYear > birthYr) break
    match = row
  }
  return match.fraMonths
}

// The multiplier applied to PIA for claiming at claimAgeMonths instead of
// exactly at Full Retirement Age: a reduction for claiming early (a steeper
// rate for the first 36 months early, a shallower rate beyond that), or a
// credit for claiming late, capped at age 70 — delayed retirement credits
// stop accruing after that regardless of how much later the benefit is
// actually claimed.
export function claimingAdjustmentFactor(
  claimAgeMonths: number,
  fraMonths: number,
  earlyRateFirst36MonthsPct: number,
  earlyRateBeyond36MonthsPct: number,
  delayedCreditRatePct: number,
): number {
  const diff = claimAgeMonths - fraMonths
  if (diff === 0) return 1
  if (diff > 0) {
    const maxDelayedMonths = Math.max(0, 70 * 12 - fraMonths)
    const delayedMonths = Math.min(diff, maxDelayedMonths)
    return 1 + delayedMonths * (delayedCreditRatePct / 100)
  }
  const monthsEarly = -diff
  const first36 = Math.min(monthsEarly, 36)
  const beyond36 = Math.max(0, monthsEarly - 36)
  const reduction = first36 * (earlyRateFirst36MonthsPct / 100) + beyond36 * (earlyRateBeyond36MonthsPct / 100)
  return Math.max(0, 1 - reduction)
}

// Projects one owner's Social-Security-taxable wages for years not yet
// entered in their earnings history, using the same income-range resolution
// the main projection loop uses (activeRanges/resolveAllocation), filtered to
// whichever variables the user tagged as this owner's SS wages
// (config.wageVariableIds), and capped at the wage base — the same flat,
// non-inflation-grown cap projection.ts's own FICA calculation uses, so the
// two stay consistent with each other.
// rateOverridesByYear, when supplied, is assumed indexed from `fromYear`
// (true for this function's only caller, ownerEarningsByYear, which always
// passes currentYear) — same alignment the main projection loop relies on
// for its own inflationFactor. A future-projected wage is one more
// inflation-adjusted amount a Monte Carlo run should grow at that run's own
// drawn inflation, same as every other inflation-adjusted income source in
// projection.ts's main loop already does; without this, a simulated run's
// inflation path would move every dollar figure in the plan except a
// not-yet-claimed worker's own future SS wages.
export function projectFutureWages(
  inputs: RetirementInputs,
  owner: Owner,
  fromYear: number,
  throughYear: number,
  rateOverridesByYear?: InflationRateOverrides,
): Map<number, number> {
  const result = new Map<number, number>()
  if (throughYear < fromYear) return result
  const config = ownerConfig(inputs, owner)
  const wageVariableIds = new Set(config.wageVariableIds)
  if (wageVariableIds.size === 0) return result
  const variablesById = new Map(inputs.variables.map((v) => [v.id, v]))
  const resolvedVariableAmounts = resolveVariableAmounts(inputs.variables).amounts

  let inflationFactor = 1
  for (let year = fromYear; year <= throughYear; year++) {
    let total = 0
    for (const range of activeRanges(inputs.incomeRanges, year)) {
      for (const alloc of range.allocations) {
        if (alloc.source.kind !== 'variable' || !wageVariableIds.has(alloc.source.variableId)) continue
        const resolved = resolveAllocation(alloc, variablesById, resolvedVariableAmounts)
        if (!resolved) continue
        total += resolved.inflationAdjusted ? resolved.amount * inflationFactor : resolved.amount
      }
    }
    result.set(year, Math.min(total, inputs.socialSecurityWageBase))
    const yearInflationRatePct = rateOverridesByYear?.[year - fromYear]?.inflationRatePct ?? inputs.inflationRatePct
    inflationFactor *= 1 + yearInflationRatePct / 100
  }
  return result
}

// Earnings history for AIME purposes: manually entered rows (past or
// future) are authoritative for whatever year they cover; projected wages
// (see projectFutureWages) only fill years the user hasn't typed an amount
// for, through the year before claiming.
function ownerEarningsByYear(
  inputs: RetirementInputs,
  owner: Owner,
  birthYr: number,
  rateOverridesByYear?: InflationRateOverrides,
): Map<number, number> {
  const config = ownerConfig(inputs, owner)
  const currentYear = new Date().getFullYear()
  const earningsByYear = new Map<number, number>()
  for (const row of config.earningsHistory) {
    // Overwrite rather than sum: SSA's earnings record has exactly one
    // figure per year, so two rows for the same year (the editor guards
    // against creating these, but older saved data might still have them)
    // should mean "this one supersedes that one," not "add them together."
    earningsByYear.set(row.year, Math.max(0, row.earnings))
  }
  const claimYear = claimYearFor(birthYr, claimAgeMonthsFor(config))
  const projectThroughYear = Math.max(currentYear, claimYear - 1)
  const projected = projectFutureWages(inputs, owner, currentYear, projectThroughYear, rateOverridesByYear)
  for (const [year, wages] of projected) {
    if (!earningsByYear.has(year)) earningsByYear.set(year, wages)
  }
  return earningsByYear
}

// One owner's monthly PIA — either computed from scratch via AIME (earnings-
// history method), or backed out of the user's SSA-statement estimate
// (estimate method), so both methods feed the same downstream claiming-age
// adjustment and COLA logic.
export function computeOwnerPIA(
  inputs: RetirementInputs,
  owner: Owner,
  rateOverridesByYear?: InflationRateOverrides,
): number {
  const config = ownerConfig(inputs, owner)
  const birthYr = birthYear(ownerBirthDate(inputs, owner))
  if (birthYr === null) return 0
  const ss = inputs.socialSecurity

  if (config.benefitMethod === 'estimate') {
    const fraMonths = fullRetirementAgeMonths(birthYr, ss.fullRetirementAgeTable)
    const estimateAgeMonths = Math.round(config.estimatedBenefitAge * 12)
    const factor = claimingAdjustmentFactor(
      estimateAgeMonths,
      fraMonths,
      ss.earlyReductionRateFirst36MonthsPct,
      ss.earlyReductionRateBeyond36MonthsPct,
      ss.delayedCreditRatePct,
    )
    return factor > 0 ? config.estimatedMonthlyBenefit / factor : 0
  }

  const currentYear = new Date().getFullYear()
  const earningsByYear = ownerEarningsByYear(inputs, owner, birthYr, rateOverridesByYear)
  const aime = computeAIME(earningsByYear, birthYr, currentYear, ss.awiTable, ss.awiGrowthRatePct)
  return computePIA(aime, computeBendPoints(birthYr, currentYear, ss.awiTable, ss.awiGrowthRatePct))
}

// The raw PIA is denominated in whatever year it's wage-indexed to
// (benefitAnchorYear) — which, for anyone not yet 60, is capped a couple
// years shy of "now" (see indexingYear). This grows it the rest of the way
// to genuine current-year dollars, the same way a real Social Security
// Statement's benefit keeps pace with wage/COLA growth between that anchor
// and today even before you've claimed. Used both as the "PIA (at FRA)"
// figure shown to the user (so it means what it's labeled: today's dollars,
// not a couple years stale) and as the fixed starting point
// monthlyBenefitForClaimAgeMonths grows forward from — anchoring every
// later growth step at currentYear, rather than at benefitAnchorYear
// directly, is what makes "Today's $" mode elsewhere in the app land back
// on exactly this number instead of a couple years' COLA short of it.
function monthlyPIAInTodaysDollars(
  inputs: RetirementInputs,
  owner: Owner,
  birthYr: number,
  rateOverridesByYear?: InflationRateOverrides,
): number {
  const config = ownerConfig(inputs, owner)
  const ss = inputs.socialSecurity
  const currentYear = new Date().getFullYear()
  const rawPIA = computeOwnerPIA(inputs, owner, rateOverridesByYear)
  const anchorYear = benefitAnchorYear(config, birthYr, currentYear)
  // anchorYear is always <= currentYear (indexingYear/benefitAnchorYear are
  // both capped there), so this growth step is entirely over years before
  // "now" — no simulated draw exists for those, hence always the flat rate,
  // same as benefitScheduleForOwner's own pre-currentYear catch-up growth.
  const colaRatePct = ss.colaRatePctOverride ?? inputs.inflationRatePct
  const growthToNow = Math.pow(1 + colaRatePct / 100, Math.max(0, currentYear - anchorYear))
  return rawPIA * growthToNow
}

// Shared COLA-growth step: compounds fromYear-dollars up to toYear-dollars,
// one year at a time so a Monte Carlo run's per-year draws compound
// correctly (same reasoning as projection.ts's own inflationFactor). Each
// year's own rate is what carries its dollars into the *next* year, so the
// loop covers fromYear..toYear-1 — toYear <= fromYear naturally yields 1
// with no separate clamp needed. colaRatePctOverride, when set, pins COLA to
// a fixed rate regardless of any simulated draw, same as elsewhere.
function colaGrowthFactor(
  fromYear: number,
  toYear: number,
  colaRatePctOverride: number | null | undefined,
  inflationRatePct: number,
  rateOverridesByYear?: InflationRateOverrides,
): number {
  let factor = 1
  for (let year = fromYear; year < toYear; year++) {
    const yearColaRatePct = colaRatePctOverride ?? rateOverridesByYear?.[year - fromYear]?.inflationRatePct ?? inflationRatePct
    factor *= 1 + yearColaRatePct / 100
  }
  return factor
}

// The monthly benefit for claiming at a specific age, in that claim year's
// nominal dollars — the today's-dollars PIA (see monthlyPIAInTodaysDollars)
// adjusted for the claiming age, then grown from currentYear up through the
// claim year, using the same COLA rate the post-claim schedule compounds
// with. Without this growth step, a PIA that's really in today's dollars
// would get used directly as a future claim year's nominal figure,
// understating it more the further out the claim year is — and "today's
// dollars" display modes elsewhere in the app would then deflate that
// already-undergrown number on top of that. Shared by
// computeOwnerBenefitSummary (the configured claiming age) and the
// claiming-age chart (every age 62-70), so both stay consistent with each
// other and with benefitScheduleForOwner.
// rateOverridesByYear, when supplied, drives the currentYear-to-claimYear
// COLA growth step below — this is the same COLA mechanism as the post-claim
// growth benefitScheduleForOwner applies year by year, just collapsed into
// one closed loop here since nothing else depends on the intermediate years.
// There's no principled reason pre-claim COLA should be immune to a
// simulation's drawn inflation while post-claim COLA isn't; both apply to
// the same PIA once a worker is past first eligibility, whether or not
// they've actually claimed yet.
export function monthlyBenefitForClaimAgeMonths(
  inputs: RetirementInputs,
  owner: Owner,
  claimAgeMonths: number,
  rateOverridesByYear?: InflationRateOverrides,
): number {
  const birthYr = birthYear(ownerBirthDate(inputs, owner))
  if (birthYr === null) return 0
  const ss = inputs.socialSecurity
  const currentYear = new Date().getFullYear()

  const fraMonths = fullRetirementAgeMonths(birthYr, ss.fullRetirementAgeTable)
  const factor = claimingAdjustmentFactor(
    claimAgeMonths,
    fraMonths,
    ss.earlyReductionRateFirst36MonthsPct,
    ss.earlyReductionRateBeyond36MonthsPct,
    ss.delayedCreditRatePct,
  )
  const monthlyPIAToday = monthlyPIAInTodaysDollars(inputs, owner, birthYr, rateOverridesByYear)
  const claimYear = claimYearFor(birthYr, claimAgeMonths)
  const growthToClaim = colaGrowthFactor(
    currentYear,
    claimYear,
    ss.colaRatePctOverride,
    inputs.inflationRatePct,
    rateOverridesByYear,
  )

  return monthlyPIAToday * factor * growthToClaim
}

// This owner's annual benefit for every projection year from currentYear
// through finalYear: 0 before the claim year, then PIA adjusted for claiming
// age, grown by COLA compounding from the claim year forward (the claim year
// itself is claim-year dollars, same convention inflationFactor uses for the
// current year in projection.ts).
//
// Real Social Security COLA tracks actual realized CPI, so when a Monte
// Carlo run supplies rateOverridesByYear (see YearlyRates in projection.ts —
// only the inflationRatePct field is used, kept structural here to avoid an
// import cycle with projection.ts), each year's benefit is grown by that
// run's own drawn inflation for the year, the same rate inflationFactor
// compounds with there — not the flat assumed rate every other simulated run
// would then also use, which would make Social Security the one line in a
// simulation immune to that run's inflation path. Absent an override (or for
// any year before currentYear, which no simulation draws cover), it falls
// back to colaRatePctOverride/inputs.inflationRatePct exactly as before —
// including for the closed-form catch-up growth applied once here for a
// claimYear before currentYear, modeling someone who has already been
// claiming for a while.
//
// summary.annualBenefitAtClaim (via computeOwnerBenefitSummary) is itself
// computed with the same rateOverridesByYear, so a not-yet-claimed worker's
// pre-claim wage projection and currentYear-to-claimYear COLA also reflect
// this run's drawn inflation, not just the post-claim growth applied below —
// otherwise a simulated run's inflation path would move every dollar figure
// in the plan except this one, right up until the claim year.
export function benefitScheduleForOwner(
  inputs: RetirementInputs,
  owner: Owner,
  currentYear: number,
  finalYear: number,
  rateOverridesByYear?: InflationRateOverrides,
): Map<number, number> {
  const schedule = new Map<number, number>()
  const summary = computeOwnerBenefitSummary(inputs, owner, rateOverridesByYear)
  if (summary === null) return schedule

  const ss = inputs.socialSecurity
  const flatColaRatePct = ss.colaRatePctOverride ?? inputs.inflationRatePct

  // Catch-up growth for any COLA years before currentYear (claimYear could
  // predate it) — always at the flat rate, since no simulated draw exists
  // for a year before "now".
  let colaFactor = Math.pow(1 + flatColaRatePct / 100, Math.max(0, currentYear - summary.claimYear))

  for (let year = currentYear; year <= finalYear; year++) {
    if (year < summary.claimYear) {
      schedule.set(year, 0)
      continue
    }
    if (year > currentYear && year > summary.claimYear) {
      const priorYear = year - 1
      const yearColaRatePct =
        ss.colaRatePctOverride ?? rateOverridesByYear?.[priorYear - currentYear]?.inflationRatePct ?? inputs.inflationRatePct
      colaFactor *= 1 + yearColaRatePct / 100
    }
    schedule.set(year, summary.annualBenefitAtClaim * colaFactor)
  }
  return schedule
}

// Every step behind one owner's benefit, surfaced for display (e.g. "why is
// my Social Security number what it is") — the AIME/PIA/adjustment-factor
// equivalent of tax.ts's bracketBreakdown. `aime` is null under the
// "estimate" method, since that method backs PIA out of the entered
// estimate directly rather than computing it from earnings.
export interface SocialSecurityBenefitSummary {
  fraMonths: number
  claimAgeMonths: number
  claimYear: number
  aime: number | null
  monthlyPIA: number
  adjustmentFactor: number
  monthlyBenefitAtClaim: number
  annualBenefitAtClaim: number
}

export function computeOwnerBenefitSummary(
  inputs: RetirementInputs,
  owner: Owner,
  rateOverridesByYear?: InflationRateOverrides,
): SocialSecurityBenefitSummary | null {
  const birthYr = birthYear(ownerBirthDate(inputs, owner))
  if (birthYr === null) return null
  const config = ownerConfig(inputs, owner)
  const ss = inputs.socialSecurity

  const fraMonths = fullRetirementAgeMonths(birthYr, ss.fullRetirementAgeTable)
  const claimAgeMonths = claimAgeMonthsFor(config)
  const adjustmentFactor = claimingAdjustmentFactor(
    claimAgeMonths,
    fraMonths,
    ss.earlyReductionRateFirst36MonthsPct,
    ss.earlyReductionRateBeyond36MonthsPct,
    ss.delayedCreditRatePct,
  )
  const aime =
    config.benefitMethod === 'earningsHistory'
      ? computeAIME(
          ownerEarningsByYear(inputs, owner, birthYr, rateOverridesByYear),
          birthYr,
          new Date().getFullYear(),
          ss.awiTable,
          ss.awiGrowthRatePct,
        )
      : null
  const monthlyPIA = monthlyPIAInTodaysDollars(inputs, owner, birthYr, rateOverridesByYear)
  const monthlyBenefitAtClaim = monthlyBenefitForClaimAgeMonths(inputs, owner, claimAgeMonths, rateOverridesByYear)

  return {
    fraMonths,
    claimAgeMonths,
    claimYear: claimYearFor(birthYr, claimAgeMonths),
    aime,
    monthlyPIA,
    adjustmentFactor,
    monthlyBenefitAtClaim,
    annualBenefitAtClaim: monthlyBenefitAtClaim * 12,
  }
}

// The "provisional income" test that decides how much of a Social Security
// benefit is federally taxable — a separate test from ordinary tax brackets,
// not a variation on them. taxExemptInterest is always 0 for now (nothing
// else in the app models tax-exempt interest), kept as a parameter so this
// isn't a breaking change if that's ever added.
export function taxableSocialSecurityBenefit(
  annualBenefit: number,
  otherAGI: number,
  taxExemptInterest: number,
  thresholds: { lower: number; upper: number },
): number {
  if (annualBenefit <= 0) return 0
  const provisionalIncome = otherAGI + taxExemptInterest + 0.5 * annualBenefit
  if (provisionalIncome <= thresholds.lower) return 0
  if (provisionalIncome <= thresholds.upper) {
    return Math.max(0, Math.min(0.5 * annualBenefit, 0.5 * (provisionalIncome - thresholds.lower)))
  }
  const tier2Max = Math.min(0.5 * annualBenefit, 0.5 * (thresholds.upper - thresholds.lower))
  return Math.max(0, Math.min(0.85 * annualBenefit, 0.85 * (provisionalIncome - thresholds.upper) + tier2Max))
}
