import type { RetirementInputs, TaxBracket } from './types'

// Standard marginal-bracket calculation: each bracket's width runs from its
// own min up to the next bracket's min (or unbounded for the last one).
// Expects `sorted` to already be in ascending order by min.
function bracketTaxSorted(taxableIncome: number, sorted: TaxBracket[]): number {
  if (taxableIncome <= 0 || sorted.length === 0) return 0
  let tax = 0
  for (let i = 0; i < sorted.length; i++) {
    const start = sorted[i].min
    if (taxableIncome <= start) break
    const end = i + 1 < sorted.length ? sorted[i + 1].min : Infinity
    tax += (Math.min(taxableIncome, end) - start) * (sorted[i].ratePct / 100)
  }
  return tax
}

// Sorting wrapper, for callers holding an unsorted schedule.
export function bracketTax(taxableIncome: number, brackets: TaxBracket[]): number {
  return bracketTaxSorted(taxableIncome, [...brackets].sort((a, b) => a.min - b.min))
}

export interface BracketBreakdownEntry {
  min: number
  // null for the top, unbounded bracket.
  max: number | null
  ratePct: number
  // Dollars taxed at this rate within [rangeStart, rangeEnd).
  amount: number
  tax: number
}

// Per-bracket detail for the dollars in [rangeStart, rangeEnd) against
// `sorted` — the same marginal-bracket math as bracketTaxSorted, but keeping
// each bracket's contribution instead of only the summed total. Capital gains
// stack on top of ordinary income (see scheduleTax), so passing
// (ordinaryTaxable, ordinaryTaxable + gainsTaxable, gainsSchedule) gives the
// per-bracket breakdown of the stacked gains tax.
//
// Display only — not used by computeIncomeTaxes/scheduleTax, which the
// per-year solver calls many times per keystroke and must stay allocation-
// light. Call this once per year instead, after the solver has converged.
export function bracketBreakdown(
  rangeStart: number,
  rangeEnd: number,
  sorted: TaxBracket[],
): BracketBreakdownEntry[] {
  if (rangeEnd <= rangeStart || sorted.length === 0) return []
  const entries: BracketBreakdownEntry[] = []
  for (let i = 0; i < sorted.length; i++) {
    const start = sorted[i].min
    if (rangeEnd <= start) break
    const end = i + 1 < sorted.length ? sorted[i + 1].min : Infinity
    const lo = Math.max(start, rangeStart)
    const hi = Math.min(end, rangeEnd)
    if (hi <= lo) continue
    const amount = hi - lo
    entries.push({
      min: start,
      max: end === Infinity ? null : end,
      ratePct: sorted[i].ratePct,
      amount,
      tax: amount * (sorted[i].ratePct / 100),
    })
  }
  return entries
}

// The four schedules plus the deductions they're measured against, sorted once
// up front. The solver re-runs the whole tax calculation several times per
// year across ~70 years on every keystroke, so sorting per call (as the old
// inline bracketTax did) would mean tens of thousands of array copies.
export interface TaxSchedules {
  federalOrdinary: TaxBracket[]
  federalCapitalGains: TaxBracket[]
  federalDeduction: number
  stateOrdinary: TaxBracket[]
  // null when the state taxes gains as ordinary income, which is the common
  // case — then the ordinary schedule is used for the stacked gains too.
  stateCapitalGains: TaxBracket[] | null
  stateDeduction: number
}

const byMin = (a: TaxBracket, b: TaxBracket) => a.min - b.min

// Base-year (today's-dollars) schedules, sorted once — see scaleTaxSchedules
// for the per-year inflation adjustment applied on top of these.
export function prepareTaxSchedules(inputs: RetirementInputs): TaxSchedules {
  return {
    federalOrdinary: [...inputs.federalTaxBrackets].sort(byMin),
    federalCapitalGains: [...inputs.federalCapitalGainsBrackets].sort(byMin),
    federalDeduction: inputs.federalStandardDeduction,
    stateOrdinary: [...inputs.stateTaxBrackets].sort(byMin),
    stateCapitalGains: inputs.stateHasSeparateCapitalGainsRates
      ? [...inputs.stateCapitalGainsBrackets].sort(byMin)
      : null,
    stateDeduction: inputs.stateStandardDeduction + inputs.statePersonalExemption,
  }
}

function scaleBrackets(brackets: TaxBracket[], factor: number): TaxBracket[] {
  if (factor === 1) return brackets
  return brackets.map((b) => ({ ...b, min: b.min * factor }))
}

// Real-world bracket thresholds and standard deductions are indexed to
// inflation by law (federal) or by many states' own rules — a fixed nominal
// schedule would otherwise push a growing share of income into higher
// brackets every year for no reason but the model's own dollar inflation.
// Scaling every `min` by the same year's inflation factor preserves bracket
// order, so this never needs to re-sort — only prepareTaxSchedules does that,
// once, outside the per-year loop.
export function scaleTaxSchedules(
  base: TaxSchedules,
  inflationFactor: number,
  inputs: RetirementInputs,
): TaxSchedules {
  const federalFactor = inputs.federalBracketsInflationAdjusted ? inflationFactor : 1
  const stateFactor = inputs.stateBracketsInflationAdjusted ? inflationFactor : 1
  return {
    federalOrdinary: scaleBrackets(base.federalOrdinary, federalFactor),
    federalCapitalGains: scaleBrackets(base.federalCapitalGains, federalFactor),
    federalDeduction: base.federalDeduction * federalFactor,
    stateOrdinary: scaleBrackets(base.stateOrdinary, stateFactor),
    stateCapitalGains: base.stateCapitalGains ? scaleBrackets(base.stateCapitalGains, stateFactor) : null,
    stateDeduction: base.stateDeduction * stateFactor,
  }
}

export interface IncomeTaxResult {
  federalOrdinary: number
  federalCapitalGains: number
  stateOrdinary: number
  stateCapitalGains: number
  penalty: number
  // Everything above: income tax plus early-withdrawal penalties. FICA is not
  // included — it's driven by wages alone and is computed once per year
  // outside the solver.
  total: number
  // The dollar amounts the tax figures above were actually computed against —
  // AGI less that jurisdiction's deduction, and gains less whatever deduction
  // was left over after absorbing ordinary income (see scheduleTax). These can
  // differ between federal and state since each jurisdiction has its own
  // deduction, and are broken out here purely for display (e.g. the Detailed
  // table), not used in any further calculation.
  federalTaxableIncome: number
  federalTaxableGains: number
  stateTaxableIncome: number
  stateTaxableGains: number
  // Federal AGI before its own deduction — the input behind
  // federalTaxableIncome above (includes any taxable Social Security).
  // Display-only. State AGI can differ (see stateTaxableIncome) whenever
  // taxableSocialSecurity's federal/state figures themselves differ.
  ordinaryAgi: number
}

// Tax for one jurisdiction's schedule. Capital gains stack on top of ordinary
// income rather than starting from zero, so the gains tax is the difference
// between running (ordinary + gains) and ordinary alone through the gains
// schedule.
//
// The deduction absorbs ordinary income first and spills onto gains — that
// matters in exactly the case this app cares about, a drawdown year with
// little ordinary income funded by brokerage sales, where treating the gains
// as if they started at dollar zero would overtax them.
function scheduleTax(
  ordinaryAgi: number,
  capitalGains: number,
  deduction: number,
  ordinaryBrackets: TaxBracket[],
  capitalGainsBrackets: TaxBracket[] | null,
): { ordinary: number; ordinaryTaxable: number; capitalGains: number; capitalGainsTaxable: number } {
  const ordinaryTaxable = Math.max(0, ordinaryAgi - deduction)
  const ordinary = bracketTaxSorted(ordinaryTaxable, ordinaryBrackets)
  if (capitalGains <= 0) return { ordinary, ordinaryTaxable, capitalGains: 0, capitalGainsTaxable: 0 }

  const unusedDeduction = Math.max(0, deduction - ordinaryAgi)
  const gainsTaxable = Math.max(0, capitalGains - unusedDeduction)
  // When the jurisdiction has no separate gains schedule, stacking against the
  // ordinary schedule is exactly "gains taxed as ordinary income".
  const schedule = capitalGainsBrackets ?? ordinaryBrackets
  const stacked =
    bracketTaxSorted(ordinaryTaxable + gainsTaxable, schedule) -
    bracketTaxSorted(ordinaryTaxable, schedule)

  return { ordinary, ordinaryTaxable, capitalGains: stacked, capitalGainsTaxable: gainsTaxable }
}

// Income tax for one year. `baseOrdinary` is wage/pension income already net
// of pre-tax deferrals and HSA contributions, and is deliberately left
// unclamped by the caller so the clamp happens once, after withdrawal income
// is added — clamping first would overstate AGI in an over-contribution year.
//
// `penalty` is passed through rather than computed here: it's a flat surcharge
// on the withdrawal, not income, so it must not enter any bracket calculation.
// It's folded into `total` because the solver needs one number for "cash owed
// to the government this year".
//
// `taxableSocialSecurity` is the portion of a Social Security benefit that
// the provisional-income test (see socialSecurity.ts's
// taxableSocialSecurityBenefit) determined is taxable — already computed by
// the caller, since that test is SS-specific and not bracket math. Split by
// jurisdiction because most states don't tax Social Security at all, so the
// caller passes 0 for `state` in that case while federal still applies.
//
// `stateOnlyDeduction` is a per-year, contribution-dependent deduction
// (e.g. that year's Kansas 529 deduction) passed in rather than folded into
// TaxSchedules.stateDeduction, since — unlike the standard deduction/personal
// exemption — it depends on that year's actual contributions, not a static
// schedule value. It reduces state taxable income only; federal is untouched.
export function computeIncomeTaxes(
  schedules: TaxSchedules,
  baseOrdinary: number,
  withdrawalOrdinary: number,
  capitalGains: number,
  penalty: number,
  taxableSocialSecurity: { federal: number; state: number } = { federal: 0, state: 0 },
  stateOnlyDeduction: number = 0,
): IncomeTaxResult {
  const federalAgi = Math.max(0, baseOrdinary + withdrawalOrdinary + taxableSocialSecurity.federal)
  const stateAgi = Math.max(0, baseOrdinary + withdrawalOrdinary + taxableSocialSecurity.state)

  const federal = scheduleTax(
    federalAgi,
    capitalGains,
    schedules.federalDeduction,
    schedules.federalOrdinary,
    schedules.federalCapitalGains,
  )
  const state = scheduleTax(
    stateAgi,
    capitalGains,
    schedules.stateDeduction + stateOnlyDeduction,
    schedules.stateOrdinary,
    schedules.stateCapitalGains,
  )

  return {
    federalOrdinary: federal.ordinary,
    federalCapitalGains: federal.capitalGains,
    stateOrdinary: state.ordinary,
    stateCapitalGains: state.capitalGains,
    penalty,
    total:
      federal.ordinary +
      federal.capitalGains +
      state.ordinary +
      state.capitalGains +
      penalty,
    federalTaxableIncome: federal.ordinaryTaxable,
    federalTaxableGains: federal.capitalGainsTaxable,
    stateTaxableIncome: state.ordinaryTaxable,
    stateTaxableGains: state.capitalGainsTaxable,
    ordinaryAgi: federalAgi,
  }
}
