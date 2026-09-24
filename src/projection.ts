import { birthYear, deathYear as computeDeathYear, hasReachedAgeDuringYear } from './age'
import { calculateMatchAmount } from './match'
import { benefitScheduleForOwner, taxableSocialSecurityBenefit } from './socialSecurity'
import { bracketBreakdown, computeIncomeTaxes, prepareTaxSchedules, scaleTaxSchedules } from './tax'
import type { BracketBreakdownEntry } from './tax'
import { FormulaError, tryEvaluateFormula, tryEvaluateCondition } from './formula'
import type { AccountHistoryKey, FormulaFunctionsContext, FormulaHistoryContext } from './formula'
import { buildFormulaFunctions } from './functions'
import { CURRENT_YEAR_SPECIAL_NAME, DEATH_YEAR_SPECIAL_NAME, DEATH_AGE_SPECIAL_NAME } from './specialYearGraph'
import { resolveVariableAmounts } from './variables'
import type {
  AccountType,
  AmountSource,
  DividendPolicy,
  DividendPolicyPlanRange,
  Frequency,
  GoalTarget,
  Owner,
  RetirementInputs,
  RmdDivisor,
  RothConversionAmount,
  RothConversionPlanRange,
  SavingsLine,
  Variable,
  WithdrawalPlanRange,
} from './types'
import {
  applyWithdrawalPlan,
  DEFAULT_WITHDRAWAL_STEPS,
  planWithdrawals,
  snapshotSources,
  withdrawalAccountKey,
  type OrdinaryIncomeAccountKey,
  type WithdrawalBalances,
  type WithdrawalStep,
} from './withdrawals'

export interface NamedAmount {
  id: string
  name: string
  amount: number
}

export interface SavingsLineResult {
  id: string
  name: string
  contribution: number
  match: number
}

// A savings line has no catalog id to identify it across ranges/years (see
// SavingsPlanRange) — its name is the closest thing to a stable identity, so
// it's what groups same-named lines together (within a year, and across
// years in a UI's own aggregation). Falls back to the line's own id only for
// a blank name, so two blank "Untitled" lines don't accidentally merge.
export function savingsLineKey(line: SavingsLine): string {
  return line.name.trim() || line.id
}

// This year's dollar change in an investment account, split into money that
// came in (employee/employer contributions, plus — for taxable — leftover
// cash swept in), money drawn out to cover a shortfall, and what was earned on
// the rest. Withdrawals are positive numbers, so the account reconciles as
// end = (start + contributions - withdrawals) * (1 + growthRate).
export interface AccountFlow {
  contributions: number
  withdrawals: number
  growth: number
}

export type InvestmentAccountKey =
  | 'preTaxSelf'
  | 'preTaxSpouse'
  | 'rothSelf'
  | 'rothSpouse'
  | 'taxable'
  | 'hsa'
  | 'hysa'
  | 'college529'

export interface YearProjectionRow {
  year: number
  ageSelf: number | null
  ageSpouse: number | null

  incomeTotal: number
  incomeBySource: NamedAmount[]

  expenseTotal: number
  expenseByBucket: NamedAmount[]

  savingsEmployeeTotal: number
  savingsEmployerMatchTotal: number
  savingsByLine: SavingsLineResult[]
  // The subset of savingsEmployeeTotal that reduces this year's taxable
  // ordinary income — pre-tax account deferrals and HSA contributions.
  // Display-only breakdown of what fed into the tax calculation below.
  preTaxSavingsDeferrals: number
  hsaSavingsContributions: number

  // AGI subject to ordinary rates, before either jurisdiction's own
  // deduction — the shared input behind federalTaxableIncome and
  // stateTaxableIncome below. Display-only.
  ordinaryAgi: number
  // The deductions federalTaxableIncome/stateTaxableIncome below were
  // computed net of. Federal has no separate personal-exemption concept in
  // this model, so its whole deduction is the standard deduction; state
  // splits the two since some states model them separately. Display-only.
  taxDeductions: {
    federalStandardDeduction: number
    stateStandardDeduction: number
    statePersonalExemption: number
    // This year's state-only deduction for contributions into an account
    // covered by inputs.stateContributionDeductions (e.g. Kansas's 529
    // deduction) — already capped and folded into stateTaxableIncome above.
    stateContributionDeduction: number
  }
  // federalTax and stateTax are totals — ordinary income plus capital gains.
  // The capital-gains components are broken out separately for display.
  federalTax: number
  federalCapitalGainsTax: number
  stateTax: number
  stateCapitalGainsTax: number
  // The taxable-income and taxable-gains bases the figures above were computed
  // against — AGI/gains after that jurisdiction's own deduction. Federal and
  // state can differ since each has its own deduction. Display-only.
  federalTaxableIncome: number
  federalTaxableGains: number
  stateTaxableIncome: number
  stateTaxableGains: number
  // Per-bracket detail behind federalTax/stateTax above, for display (e.g. a
  // "tax by bracket" breakdown) — see tax.ts's bracketBreakdown. Gains stack
  // on top of ordinary income, so the *Gains entries cover the range
  // [ordinary taxable, ordinary taxable + gains taxable), not [0, gains).
  taxBracketBreakdown: {
    federalOrdinary: BracketBreakdownEntry[]
    federalGains: BracketBreakdownEntry[]
    stateOrdinary: BracketBreakdownEntry[]
    stateGains: BracketBreakdownEntry[]
  }
  socialSecurityTax: number
  medicareTax: number
  additionalMedicareTax: number
  // Early-withdrawal penalties are included in totalTax: not a tax strictly
  // speaking, but cash out the door all the same.
  earlyWithdrawalPenalty: number
  totalTax: number

  // Social Security *benefits* — not to be confused with socialSecurityTax
  // above, which is the payroll (FICA) tax withheld from wages. self/spouse/
  // total are the full annual benefit, already reflected in incomeTotal's
  // effect on cash flow but broken out here for display since (unlike wage
  // income) it never appears in incomeBySource. taxableFederal/taxableState
  // are the portion of `total` the provisional-income test counted as
  // taxable this year — already folded into federalTax/stateTax above.
  socialSecurity: {
    self: number
    spouse: number
    total: number
    taxableFederal: number
    taxableState: number
  }

  // Whatever came in this year — income plus any withdrawal, RMDs included —
  // beyond what taxes/savings/spending used up. Swept into the taxable
  // brokerage account, unless an 'unlimited', goal-less savings line exists
  // this year — the catch-all case — in which case it's redirected into that
  // line's own account instead (see runProjection's savings pass) and also
  // already reflected in savingsByLine/savingsEmployeeTotal above. Usually 0
  // whenever withdrawals.total is non-zero (the draw was sized to exactly
  // cover the shortfall), except when a required minimum distribution forces
  // more out than the year actually needed.
  extraTaxableSavings: number
  // What the withdrawal waterfall drew — a required minimum distribution
  // (mandatory regardless of need) plus, if that wasn't enough, whatever
  // covers the shortfall — grossed up to cover the tax the withdrawals
  // themselves triggered.
  withdrawals: {
    total: number
    fromCash: number
    ordinaryIncome: number
    // ordinaryIncome broken out by the account it was drawn from — a
    // decomposition of ordinaryIncome, not additional to it.
    ordinaryIncomeByAccount: Record<OrdinaryIncomeAccountKey, number>
    capitalGains: number
    penalty: number
    // Left over once every account is empty; this is what drives cash negative.
    unfunded: number
    // The subset of total that was a required minimum distribution, by owner.
    rmd: { self: number; spouse: number }
    // The subset of the taxable/Roth draws above that was a tax-free return of
    // cost basis rather than a realized gain/earnings — display-only, for a
    // basis-vs-gain breakdown of this year's withdrawal.
    taxableBasisUsed: number
    rothBasisUsed: { self: number; spouse: number }
    college529BasisUsed: number
  }
  // False if the gross-up solver hit its iteration cap without settling, which
  // needs tax rates summing past 100% to happen.
  solverConverged: boolean

  // This year's elective pre-tax-to-Roth conversion, already reflected in
  // balances/accountFlows below (as a preTax withdrawal and a Roth
  // contribution) — broken out here since it isn't part of `withdrawals`,
  // which is only what the withdrawal waterfall drew.
  rothConversion: { total: number; self: number; spouse: number }

  // This year's high-yield savings interest — computed off the balance the
  // account opened the year with (see runProjection) and already folded into
  // ordinaryAgi/federalTax/stateTax above, same as wage income. Broken out
  // here purely for display, the same role rothConversion plays for taxes.
  hysaInterest: number

  // This year's taxable-brokerage dividend income — computed off the
  // balance the account opened the year with (see runProjection), taxed as
  // long-term capital gains (already folded into federalCapitalGainsTax/
  // stateCapitalGainsTax above) regardless of dividendPolicyRanges'
  // reinvest-vs-cash choice for the year. Broken out here purely for
  // display, the same role hysaInterest plays above.
  dividendIncome: number
  // Whether dividendIncome above was reinvested (folded into the taxable
  // balance/basis and accountFlows.taxable.contributions) or paid out as
  // cash (folded into balances.cash instead) this year — see
  // activeDividendPolicy. Broken out for display alongside dividendIncome.
  dividendPolicy: DividendPolicy

  balances: {
    preTaxSelf: number
    preTaxSpouse: number
    rothSelf: number
    rothSelfBasis: number
    rothSpouse: number
    rothSpouseBasis: number
    taxable: number
    taxableBasis: number
    hsa: number
    cash: number
    hysa: number
    college529: number
    college529Basis: number
  }
  accountFlows: Record<InvestmentAccountKey, AccountFlow>
  netWorth: number
  // This year's cumulative inflation multiplier — the same runProjection-loop
  // `inflationFactor` every inflationAdjusted amount in this file is scaled
  // by, captured for this row before it compounds again at the end of the
  // year. 1 in the first projected year (already "today's dollars"). Backs
  // dollar_convert()'s Goal-only lookup (see buildGoalProjectionLookups):
  // converting an amount from one row's year to another's is just rescaling
  // by the ratio of their inflationFactor, which reflects that run's own
  // drawn rates (rateOverridesByYear) rather than a flat assumption.
  inflationFactor: number
  // This year's result for each of inputs.goals with a non-blank formula,
  // keyed by Goal.id — true/false, or null if the formula errored this year
  // (e.g. an unknown name). Goals with a blank formula have no entry here.
  // See runProjection's goalScope for what a goal formula can reference.
  goalResults: Record<string, boolean | null>
  // Same idea as goalResults, but for inputs.metrics — this year's numeric
  // value, keyed by Metric.id, or null if the formula errored this year.
  // Metrics with a blank formula have no entry here. See metricAverageInRun.
  metricResults: Record<string, number | null>
}

interface RangeBounds {
  startYear: number
  endYear: number
}

// Exported for socialSecurity.ts's projectFutureWages, which needs to
// resolve income ranges the same way this loop does, without duplicating the
// logic — the only other caller of income-range resolution in the app.
export function activeRanges<T extends RangeBounds>(ranges: T[], year: number): T[] {
  return ranges.filter((r) => r.startYear <= year && r.endYear >= year)
}

interface ResolvedRothConversionAmount {
  amount: number
  inflationAdjusted: boolean
}

// Resolves a RothConversionAmount to a dollar figure — variable/custom/
// formula, same as resolveAllocation, but with no frequency (always a single
// annual figure), since that doesn't apply to a Roth conversion amount.
// Still carries its own inflationAdjusted flag, same as resolveAllocation/
// resolveGoal, for the caller to apply against inflationFactor.
function resolveRothConversionAmount(
  amount: RothConversionAmount,
  variablesById: Map<string, Variable>,
  resolvedVariableAmounts: Map<string, number>,
  extraScope: Record<string, number>,
  history?: FormulaHistoryContext,
  functions?: FormulaFunctionsContext,
): ResolvedRothConversionAmount {
  if (amount.kind === 'custom') {
    return { amount: amount.amount, inflationAdjusted: amount.inflationAdjusted }
  }
  if (amount.kind === 'variable') {
    return {
      amount: resolvedVariableAmounts.get(amount.variableId) ?? 0,
      inflationAdjusted: amount.inflationAdjusted,
    }
  }
  const scope: Record<string, number> = { ...extraScope }
  for (const v of variablesById.values()) scope[v.name] = resolvedVariableAmounts.get(v.id) ?? 0
  if (extraScope.year !== undefined) scope.year = extraScope.year
  if (extraScope.age !== undefined) scope.age = extraScope.age
  if (extraScope.spouseAge !== undefined) scope.spouseAge = extraScope.spouseAge
  const result = tryEvaluateFormula(amount.expression, scope, history, functions)
  return { amount: result.ok ? result.value : 0, inflationAdjusted: amount.inflationAdjusted }
}

// Sum of one owner's requested conversion amount across every active range —
// ranges are additive, like income/spending/savings ranges, so two
// overlapping conversion ranges both apply. Each range's amount is grown by
// inflationFactor first when its own inflationAdjusted flag is set, same as
// resolveAllocation/resolveGoal's callers do.
function activeConversionAmount(
  ranges: RothConversionPlanRange[],
  year: number,
  owner: 'self' | 'spouse',
  variablesById: Map<string, Variable>,
  resolvedVariableAmounts: Map<string, number>,
  extraScope: Record<string, number>,
  inflationFactor: number,
  history?: FormulaHistoryContext,
  functions?: FormulaFunctionsContext,
): number {
  return activeRanges(ranges, year).reduce((total, r) => {
    const resolved = resolveRothConversionAmount(
      owner === 'self' ? r.amountSelf : r.amountSpouse,
      variablesById,
      resolvedVariableAmounts,
      extraScope,
      history,
      functions,
    )
    const grown = resolved.inflationAdjusted ? resolved.amount * inflationFactor : resolved.amount
    return total + Math.max(0, grown)
  }, 0)
}

// Unlike activeConversionAmount, this resolves to a single policy rather
// than summing — dividend policy ranges are validated not to overlap (see
// findOverlappingRangeIds), so at most one range should ever match; if an
// in-progress edit leaves an overlap anyway, the last match in list order
// wins as a defensive fallback. No matching range means 'reinvest'.
function activeDividendPolicy(ranges: DividendPolicyPlanRange[], year: number): DividendPolicy {
  const matches = activeRanges(ranges, year)
  return matches.length > 0 ? matches[matches.length - 1].policy : 'reinvest'
}

function sumValues(map: Map<string, number>): number {
  let total = 0
  for (const v of map.values()) total += v
  return total
}

function mapToNamed(map: Map<string, number>, namesById: Map<string, string>): NamedAmount[] {
  return [...map.entries()].map(([id, amount]) => ({
    id,
    name: namesById.get(id) ?? 'Unknown',
    amount,
  }))
}

interface ResolvedAllocation {
  // A variable-linked allocation is keyed by the variable's id, so
  // allocations across overlapping/multiple ranges referencing the same
  // variable aggregate together. A custom allocation has no variable to
  // share, so it's keyed by its own id and stands alone.
  key: string
  name: string
  amount: number
  inflationAdjusted: boolean
}

export function annualizeAmount(amount: number, frequency: Frequency): number {
  return frequency === 'monthly' ? amount * 12 : amount
}

// A custom line carries its own amount/inflation flag. A variable-linked one
// has no stored amount of its own — it always reads the variable's (resolved)
// current value directly, so there's nothing that can go stale — but still
// carries its own inflation flag, same as 'custom'/'formula', since a
// Variable isn't necessarily a dollar figure. A formula line evaluates its
// expression against every variable's resolved value and carries its own
// inflation flag, same reasoning. Either way the line's own name is used (lines are
// named independently of any variable — `name` is optional since
// PriorityAllocation, the withdrawal case, has none), and the amount is
// annualized per the line's own chosen frequency.
export function resolveAllocation(
  alloc: { id: string; name?: string; source: AmountSource },
  variablesById: Map<string, Variable>,
  resolvedVariableAmounts: Map<string, number>,
  // Extra names available to a formula source beyond the variable catalog —
  // "year" and special years, keyed the same way runProjection's own
  // yearScope builds them. Optional since not every caller has them (e.g. a
  // UI preview that hasn't wired up special years).
  extraScope: Record<string, number> = {},
  // Prior-year inflation/return rate lookback for return_rate()/
  // inflation_rate() in a formula source. Optional for the same reason as
  // extraScope.
  history?: FormulaHistoryContext,
  functions?: FormulaFunctionsContext,
): ResolvedAllocation | null {
  const name = alloc.name ?? ''
  if (alloc.source.kind === 'custom') {
    return {
      key: alloc.id,
      name,
      amount: annualizeAmount(alloc.source.amount, alloc.source.frequency),
      inflationAdjusted: alloc.source.inflationAdjusted,
    }
  }
  if (alloc.source.kind === 'variable') {
    const v = variablesById.get(alloc.source.variableId)
    if (!v) return null
    return {
      key: v.id,
      name,
      amount: annualizeAmount(resolvedVariableAmounts.get(v.id) ?? 0, alloc.source.frequency),
      inflationAdjusted: alloc.source.inflationAdjusted,
    }
  }
  // 'unlimited' has no periodic amount to resolve — it's handled as a
  // special case directly by the callers where it's meaningful
  // (runProjection's savings pass, withdrawalStepsForYear), not through this
  // generic resolver. Callers elsewhere (income/spending, or a savings
  // line's own match-estimate display) treat null the same as any other
  // unresolvable amount.
  if (alloc.source.kind === 'unlimited') return null
  const scope: Record<string, number> = { ...extraScope }
  for (const v of variablesById.values()) scope[v.name] = resolvedVariableAmounts.get(v.id) ?? 0
  // "year" always wins even against a same-named Variable, same precedence
  // as runProjection's own yearScope.
  if (extraScope.year !== undefined) scope.year = extraScope.year
  if (extraScope.age !== undefined) scope.age = extraScope.age
  if (extraScope.spouseAge !== undefined) scope.spouseAge = extraScope.spouseAge
  const result = tryEvaluateFormula(alloc.source.expression, scope, history, functions)
  if (!result.ok) return null
  return {
    key: alloc.id,
    name,
    amount: annualizeAmount(result.value, alloc.source.frequency),
    inflationAdjusted: alloc.source.inflationAdjusted,
  }
}

interface ResolvedGoal {
  amount: number
  inflationAdjusted: boolean
}

// A trimmed sibling of resolveAllocation for a GoalTarget — a point-in-time
// balance, not a periodic amount, so there's no frequency/annualization step.
function resolveGoal(
  goal: GoalTarget,
  variablesById: Map<string, Variable>,
  resolvedVariableAmounts: Map<string, number>,
  extraScope: Record<string, number> = {},
  history?: FormulaHistoryContext,
  functions?: FormulaFunctionsContext,
): ResolvedGoal | null {
  if (goal.kind === 'custom') {
    return { amount: goal.amount, inflationAdjusted: goal.inflationAdjusted }
  }
  if (goal.kind === 'variable') {
    const v = variablesById.get(goal.variableId)
    if (!v) return null
    return { amount: resolvedVariableAmounts.get(v.id) ?? 0, inflationAdjusted: goal.inflationAdjusted }
  }
  const scope: Record<string, number> = { ...extraScope }
  for (const v of variablesById.values()) scope[v.name] = resolvedVariableAmounts.get(v.id) ?? 0
  if (extraScope.year !== undefined) scope.year = extraScope.year
  if (extraScope.age !== undefined) scope.age = extraScope.age
  if (extraScope.spouseAge !== undefined) scope.spouseAge = extraScope.spouseAge
  const result = tryEvaluateFormula(goal.expression, scope, history, functions)
  if (!result.ok) return null
  return { amount: result.value, inflationAdjusted: goal.inflationAdjusted }
}

// This year's withdrawal waterfall: the active withdrawal range's lines,
// resolved to plain numbers, or DEFAULT_WITHDRAWAL_STEPS when no range
// covers the year. Ranges aren't allowed to overlap (see
// findOverlappingRangeIds), so at most one is active; if an overlap slips
// through anyway, the first listed wins. Resolved once per year, outside the
// gross-up solver — nothing here depends on how much is being drawn.
function withdrawalStepsForYear(
  ranges: WithdrawalPlanRange[],
  year: number,
  variablesById: Map<string, Variable>,
  resolvedVariableAmounts: Map<string, number>,
  yearScope: Record<string, number>,
  inflationFactor: number,
  history?: FormulaHistoryContext,
  functions?: FormulaFunctionsContext,
): WithdrawalStep[] {
  const range = activeRanges(ranges, year)[0]
  if (!range) return DEFAULT_WITHDRAWAL_STEPS
  const steps: WithdrawalStep[] = []
  for (const line of range.lines) {
    if (line.condition) {
      const result = tryEvaluateCondition(line.condition, yearScope, history, functions)
      // Fails open on an evaluation error, same as a savings line's
      // condition — the condition editor surfaces the error directly.
      if (result.ok && !result.value) continue
    }
    let cap = Infinity
    if (line.source.kind !== 'unlimited') {
      const resolved = resolveAllocation(line, variablesById, resolvedVariableAmounts, yearScope, history, functions)
      // An unresolvable cap (e.g. a deleted variable) skips the line, same
      // as an unresolvable savings amount.
      if (!resolved) continue
      cap = resolved.inflationAdjusted ? resolved.amount * inflationFactor : resolved.amount
    }
    let floor = 0
    if (line.floor) {
      const resolved = resolveGoal(line.floor, variablesById, resolvedVariableAmounts, yearScope, history, functions)
      // An unresolvable floor fails open (no floor), same as a savings goal.
      if (resolved) floor = resolved.inflationAdjusted ? resolved.amount * inflationFactor : resolved.amount
    }
    steps.push({
      account: withdrawalAccountKey(line.account, line.owner),
      cap,
      floor,
      qualifiedOnly: line.qualifiedOnly ?? false,
    })
  }
  return steps
}

// expectedReturnRatePct is documented (see the Investment return field) as a
// real rate, already net of inflation, so it's comparable to a savings
// account's "real growth". Account balances themselves are nominal dollars
// (like income/spending amounts once inflated), so growing them requires
// recombining the real rate with inflation to get a nominal rate. Takes the
// rates as arguments, rather than reading inputs.expectedReturnRatePct /
// inputs.inflationRatePct directly, so a simulation run can pass a different
// draw for each year instead of the flat scenario-wide rate.
function nominalGrowthRate(realReturnRatePct: number, inflationRatePct: number): number {
  return (1 + realReturnRatePct / 100) * (1 + inflationRatePct / 100) - 1
}

// The IRS Uniform Lifetime Table's distribution period for an owner who
// reaches `age` this year — the largest table age at or below theirs, since
// the table's oldest row is open-ended ("and over"). An age younger than
// every row (only reachable by lowering rmdStartAge below the table's own
// floor) falls back to the table's youngest row, extrapolating the same way
// at both ends rather than silently producing no RMD. Null only if the
// table is empty.
function rmdDivisorForAge(table: RmdDivisor[], age: number): number | null {
  if (table.length === 0) return null
  const sorted = [...table].sort((a, b) => a.age - b.age)
  let match = sorted[0]
  for (const row of sorted) {
    if (row.age > age) break
    match = row
  }
  return match.divisor
}

// This year's required minimum distribution for one owner, sized off their
// pre-tax balance as of the end of last year (before this year's
// contributions/growth) — the model can't do better than that without
// tracking a separate Dec-31 snapshot, and it's what a custodian would use
// too. Zero before the owner reaches rmdStartAge.
function requiredMinimumDistribution(
  inputs: RetirementInputs,
  priorYearEndBalance: number,
  age: number | null,
): number {
  if (age === null || age < inputs.rmdStartAge || priorYearEndBalance <= 0) return 0
  const divisor = rmdDivisorForAge(inputs.rmdDivisors, age)
  return divisor && divisor > 0 ? priorYearEndBalance / divisor : 0
}

// One simulated year's draw for a Monte Carlo run — see simulation.ts. When
// runProjection is called without an override for a given year, it falls
// back to the scenario's own flat expectedReturnRatePct/inflationRatePct, so
// every existing (non-simulation) call site behaves exactly as before.
export interface YearlyRates {
  realReturnRatePct: number
  inflationRatePct: number
  // The historical calendar year this draw was bootstrapped from (see
  // simulation.ts's toYearlyRates), for display alongside a simulation's
  // year-by-year detail. Undefined for a flat-rate override.
  sourceYear?: number
}

type Balances = WithdrawalBalances

// Total across every account, self + spouse + shared — the same figure
// YearProjectionRow's own `netWorth` field reports (computed there from
// `balances` AFTER a year's activity), reused here for runProjection's
// netWorthHistory (computed BEFORE a year's activity — see there for why).
// Exported for InputsForm's live-preview net_worth() fallback (see
// flatRateHistoryContext), which has no real per-year balances to look back
// through — just today's starting balances, same shape as Balances.
export function totalNetWorth(balances: Balances): number {
  return (
    balances.self.preTax +
    balances.self.roth +
    balances.spouse.preTax +
    balances.spouse.roth +
    balances.shared.taxable +
    balances.shared.hsa +
    balances.shared.cash +
    balances.shared.hysa +
    balances.shared.college529
  )
}

// Per-account start-of-year balances, keyed for the account-balance lookback
// functions (pretax_self(), roth(), taxable(), ...) — combines self+spouse
// for the three owner-split "combined" keys, same "attributed to one spouse
// or the other" vs. "always shared" split as OwnedAccountBalances/
// SharedAccountBalances (types.ts). Exported for InputsForm's live-preview
// fallback (see flatRateHistoryContext call site), same reasoning as
// totalNetWorth above.
export function accountBalanceSnapshot(balances: Balances): Record<AccountHistoryKey, number> {
  return {
    pretaxSelf: balances.self.preTax,
    pretaxSpouse: balances.spouse.preTax,
    pretax: balances.self.preTax + balances.spouse.preTax,
    rothSelf: balances.self.roth,
    rothSpouse: balances.spouse.roth,
    roth: balances.self.roth + balances.spouse.roth,
    rothBasisSelf: balances.self.rothBasis,
    rothBasisSpouse: balances.spouse.rothBasis,
    rothBasis: balances.self.rothBasis + balances.spouse.rothBasis,
    taxable: balances.shared.taxable,
    taxableBasis: balances.shared.taxableBasis,
    hsa: balances.shared.hsa,
    cash: balances.shared.cash,
    hysa: balances.shared.hysa,
    college529: balances.shared.college529,
    college529Basis: balances.shared.college529Basis,
  }
}

// Same per-account keying as accountBalanceSnapshot above, but reading a
// completed YearProjectionRow's own end-of-year `balances` snapshot instead
// of a live Balances mid-projection — backs the account_..._in_year()/
// account_..._at_age() Goal functions (see runProjection's Goals pass),
// which look up a specific *finished* year rather than "as of right now".
// Exported for buildFirstWhenPreviewRows below.
export function accountBalanceFromRow(row: YearProjectionRow, key: AccountHistoryKey): number {
  const b = row.balances
  switch (key) {
    case 'pretaxSelf':
      return b.preTaxSelf
    case 'pretaxSpouse':
      return b.preTaxSpouse
    case 'pretax':
      return b.preTaxSelf + b.preTaxSpouse
    case 'rothSelf':
      return b.rothSelf
    case 'rothSpouse':
      return b.rothSpouse
    case 'roth':
      return b.rothSelf + b.rothSpouse
    case 'rothBasisSelf':
      return b.rothSelfBasis
    case 'rothBasisSpouse':
      return b.rothSpouseBasis
    case 'rothBasis':
      return b.rothSelfBasis + b.rothSpouseBasis
    case 'taxable':
      return b.taxable
    case 'taxableBasis':
      return b.taxableBasis
    case 'hsa':
      return b.hsa
    case 'cash':
      return b.cash
    case 'hysa':
      return b.hysa
    case 'college529':
      return b.college529
    case 'college529Basis':
      return b.college529Basis
  }
}

// The absolute-lookup half of a Goal's FormulaHistoryContext —
// net_worth_in_year()/_at_age()/_at_spouse_age() and their per-account
// equivalents (see formula.ts's PROJECTION_LOOKUP_FUNCTIONS), plus the
// UNRESTRICTED (any year, forward or back) versions of dollar_convert()/
// rmd_in_year()/_at_age()/_at_spouse_age() — outside a Goal those are still
// available, but only for years already reached (see runProjection's inline
// historyContext). Needs nothing but the finished rows array, unlike the
// relative return_rate()/net_worth()/etc. lookbacks alongside them in
// runProjection's Goals pass, which also need that row's own position in the
// projection — so this is the same closures for every row, AND the same
// ones GoalsEditor's live preview can use directly against the real baseline
// projection, instead of the flat/fake fallback previous_income()-style
// lookbacks fall back to when there's no real per-year loop to read (see
// flatRateHistoryContext). Exported for that live-preview use.
export function buildGoalProjectionLookups(
  rows: YearProjectionRow[],
): Pick<
  FormulaHistoryContext,
  | 'netWorthInYear'
  | 'netWorthAtAge'
  | 'netWorthAtSpouseAge'
  | 'accountBalanceInYear'
  | 'accountBalanceAtAge'
  | 'accountBalanceAtSpouseAge'
  | 'dollarConvert'
  | 'rmdInYear'
  | 'rmdAtAge'
  | 'rmdAtSpouseAge'
> {
  const rowsByYear = new Map(rows.map((r) => [r.year, r]))
  const rowsByAge = new Map(
    rows.filter((r): r is YearProjectionRow & { ageSelf: number } => r.ageSelf !== null).map((r) => [r.ageSelf, r]),
  )
  const rowsBySpouseAge = new Map(
    rows.filter((r): r is YearProjectionRow & { ageSpouse: number } => r.ageSpouse !== null).map((r) => [r.ageSpouse, r]),
  )
  return {
    netWorthInYear: (year) => {
      const r = rowsByYear.get(year)
      if (!r) throw new FormulaError(`net_worth_in_year(${year}): no such projected year`)
      return r.netWorth
    },
    netWorthAtAge: (age) => {
      const r = rowsByAge.get(age)
      if (!r) throw new FormulaError(`net_worth_at_age(${age}): no projected year reaches that age`)
      return r.netWorth
    },
    netWorthAtSpouseAge: (age) => {
      const r = rowsBySpouseAge.get(age)
      if (!r) throw new FormulaError(`net_worth_at_spouse_age(${age}): no projected year reaches that spouse age`)
      return r.netWorth
    },
    accountBalanceInYear: (key, year) => {
      const r = rowsByYear.get(year)
      if (!r) throw new FormulaError(`${key}_in_year(${year}): no such projected year`)
      return accountBalanceFromRow(r, key)
    },
    accountBalanceAtAge: (key, age) => {
      const r = rowsByAge.get(age)
      if (!r) throw new FormulaError(`${key}_at_age(${age}): no projected year reaches that age`)
      return accountBalanceFromRow(r, key)
    },
    accountBalanceAtSpouseAge: (key, age) => {
      const r = rowsBySpouseAge.get(age)
      if (!r) throw new FormulaError(`${key}_at_spouse_age(${age}): no projected year reaches that spouse age`)
      return accountBalanceFromRow(r, key)
    },
    dollarConvert: (amount, fromYear, toYear) => {
      const fromRow = rowsByYear.get(fromYear)
      if (!fromRow) throw new FormulaError(`dollar_convert(): no such projected year ${fromYear}`)
      const toRow = rowsByYear.get(toYear)
      if (!toRow) throw new FormulaError(`dollar_convert(): no such projected year ${toYear}`)
      return amount * (toRow.inflationFactor / fromRow.inflationFactor)
    },
    rmdInYear: (year) => {
      const r = rowsByYear.get(year)
      if (!r) throw new FormulaError(`rmd_in_year(${year}): no such projected year`)
      return r.withdrawals.rmd.self + r.withdrawals.rmd.spouse
    },
    rmdAtAge: (age) => {
      const r = rowsByAge.get(age)
      if (!r) throw new FormulaError(`rmd_at_age(${age}): no projected year reaches that age`)
      return r.withdrawals.rmd.self + r.withdrawals.rmd.spouse
    },
    rmdAtSpouseAge: (age) => {
      const r = rowsBySpouseAge.get(age)
      if (!r) throw new FormulaError(`rmd_at_spouse_age(${age}): no projected year reaches that spouse age`)
      return r.withdrawals.rmd.self + r.withdrawals.rmd.spouse
    },
  }
}

// Best-effort first_year_when()/first_age_when()/first_spouse_age_when()
// support for GoalsEditor/MetricsEditor's live preview, which (unlike
// runProjection's real Goals & Metrics pass) has no per-row return-rate/
// inflation/income/spending history to read — only the real baseline
// projection's finished rows. `baseScope`/`baseHistory` are that preview's
// already-built single-row scope/history (variables, special years, and the
// exact _in_year()/_at_age() lookups from buildGoalProjectionLookups); each
// row here overrides just year/age/spouseAge/netWorth/unfunded with that
// row's own real values, and overrides accountBalance() with that row's own
// real (end-of-year) balances so a condition like "taxable() <= 0" gets a
// real, row-by-row answer in the preview, not baseHistory's flat/"today"
// fallback. return_rate()/inflation_rate()/previous_income()/etc. inside the
// condition keep whatever approximation baseHistory already uses for them
// outside these functions too.
export function buildFirstWhenPreviewRows(
  rows: YearProjectionRow[],
  baseScope: Record<string, number>,
  baseHistory: FormulaHistoryContext,
): { year: number; age: number | null; spouseAge: number | null; scope: Record<string, number>; history: FormulaHistoryContext }[] {
  return rows.map((row, i) => ({
    year: row.year,
    age: row.ageSelf,
    spouseAge: row.ageSpouse,
    scope: {
      ...baseScope,
      year: row.year,
      ...(row.ageSelf !== null ? { age: row.ageSelf } : {}),
      ...(row.ageSpouse !== null ? { spouseAge: row.ageSpouse } : {}),
      netWorth: row.netWorth,
      unfunded: row.withdrawals.unfunded,
    },
    history: {
      ...baseHistory,
      accountBalance: (key: AccountHistoryKey, yearsAgo: number) =>
        accountBalanceFromRow(rows[Math.max(0, i - yearsAgo)] ?? row, key),
    },
  }))
}

// The gross-up solver: withdrawing to cover a shortfall creates taxable
// income, which raises the tax bill, which widens the shortfall. Iterating
// settles this quickly. The step is monotone increasing and bounded above —
// bounded because taxable withdrawals can't exceed the account balances, and
// once those are exhausted the remainder falls through to the untaxed cash
// backstop, dropping the marginal rate to zero. So it converges even if a user
// enters rates summing past 100%; it just converges on "drain everything".
// Normally it's a contraction (marginal rate well under 100%) and settles in a
// handful of passes. The cap only backstops pathological input.
const SOLVER_MAX_ITERATIONS = 100
const SOLVER_TOLERANCE = 0.01

// Medical spending this year that an HSA withdrawal could cover tax-free, or
// education spending a 529 withdrawal could cover tax-free — the sum of
// expenseByBucketMap's entries whose originating spending line is flagged
// medicalRelated / educationRelated, respectively.
function qualifiedExpensesForYear(
  expenseByBucketMap: Map<string, number>,
  expenseFlagByKey: Map<string, boolean>,
): number {
  let total = 0
  for (const [bucketId, amount] of expenseByBucketMap) {
    if (expenseFlagByKey.get(bucketId)) total += amount
  }
  return total
}

// This year's total contributed into savings lines targeting `account` —
// generic over AccountType so it can back any StateContributionDeduction
// entry, not just the 529 case.
function contributionsForAccountType(
  account: AccountType,
  contributionGroups: Map<string, { def: SavingsLine; amount: number }>,
): number {
  let total = 0
  for (const group of contributionGroups.values()) {
    if (group.def.account === account) total += group.amount
  }
  return total
}

// Which investment-account bucket a contribution lands in — null for cash,
// which isn't tracked as an investment account. Takes account/owner directly
// (rather than a SavingsLine) so it also covers an employer match landing in
// a different account than the line's own contribution.
function accountKeyFor(account: AccountType, owner: Owner): InvestmentAccountKey | null {
  switch (account) {
    case 'preTax':
      return owner === 'spouse' ? 'preTaxSpouse' : 'preTaxSelf'
    case 'roth':
      return owner === 'spouse' ? 'rothSpouse' : 'rothSelf'
    case 'taxable':
      return 'taxable'
    case 'hsa':
      return 'hsa'
    case 'college529':
      return 'college529'
    case 'hysa':
      return 'hysa'
    case 'cash':
      return null
  }
}

// Reads a savings line's current account balance for a goal check — like
// accountKeyFor's mapping, but also covers 'cash' (which accountKeyFor
// returns null for, since it isn't an InvestmentAccountKey). This is an
// opening-of-year, pre-growth-for-this-year read (RMDs/HYSA interest already
// applied, this year's growth/withdrawals not yet) — close enough for "has
// this account reached $X" without needing a separate settlement pass.
function currentBalanceFor(balances: Balances, def: SavingsLine): number {
  switch (def.account) {
    case 'preTax':
      return balances[def.owner].preTax
    case 'roth':
      return balances[def.owner].roth
    case 'taxable':
      return balances.shared.taxable
    case 'hsa':
      return balances.shared.hsa
    case 'college529':
      return balances.shared.college529
    case 'hysa':
      return balances.shared.hysa
    case 'cash':
      return balances.shared.cash
  }
}

function addToAccount(
  balances: Balances,
  contributionsByAccount: Record<InvestmentAccountKey, number>,
  account: AccountType,
  owner: Owner,
  amount: number,
): void {
  if (amount === 0) return
  switch (account) {
    case 'preTax':
      balances[owner].preTax += amount
      break
    case 'roth':
      balances[owner].roth += amount
      balances[owner].rothBasis += amount
      break
    case 'taxable':
      balances.shared.taxable += amount
      balances.shared.taxableBasis += amount
      break
    case 'hsa':
      balances.shared.hsa += amount
      break
    case 'college529':
      balances.shared.college529 += amount
      balances.shared.college529Basis += amount
      break
    case 'hysa':
      balances.shared.hysa += amount
      break
    case 'cash':
      balances.shared.cash += amount
      return
  }
  const key = accountKeyFor(account, owner)
  if (key) contributionsByAccount[key] += amount
}

// The employee's own contribution always lands in the line's account; the
// employer match lands there too unless the match itself specifies a
// different account (e.g. a plan that matches Roth contributions pre-tax) —
// see MatchConfig.account.
function applyContribution(
  balances: Balances,
  contributionsByAccount: Record<InvestmentAccountKey, number>,
  def: SavingsLine,
  contribution: number,
  match: number,
): void {
  addToAccount(balances, contributionsByAccount, def.account, def.owner, contribution)
  addToAccount(balances, contributionsByAccount, def.match?.account ?? def.account, def.owner, match)
}

// Steps the scenario forward one year at a time, from the current calendar
// year through death year. Each year: total up active income and expense
// allocations, fund the active savings plan (plus any employer match),
// then either sweep what's left into the taxable brokerage account or, if
// income fell short, cover the gap with that year's withdrawal waterfall —
// the active withdrawal range's lines, or DEFAULT_WITHDRAWAL_ORDER when no
// range covers the year (see withdrawalStepsForYear) — with the tax and
// penalties each draw triggers solved for by iteration.
// Growth is applied to each account after that year's activity is posted.
//
// Required minimum distributions are modeled using the IRS Uniform Lifetime
// Table for both owners — not the Joint Life and Last Survivor Table some
// couples qualify for (a smaller RMD, only when a spouse more than 10 years
// younger is the sole beneficiary), and not inherited-account rules.
//
// Not modelled, and worth knowing before trusting a long projection: the net
// investment income tax, Social Security provisional-income taxability,
// IRMAA, capital-loss carryforwards, and the 5-year Roth clock. The savings
// plan is also funded before the waterfall runs, so a shortfall year can
// contribute to an account and immediately draw it back out.
export function runProjection(
  inputs: RetirementInputs,
  rateOverridesByYear?: YearlyRates[],
): YearProjectionRow[] {
  const currentYear = new Date().getFullYear()
  const selfBirthYear = birthYear(inputs.birthDate)
  const spouseBirthYear = inputs.spouseEnabled ? birthYear(inputs.spouseBirthDate) : null
  const finalYear = computeDeathYear(inputs.birthDate, inputs.lifeExpectancy)
  if (finalYear === null || finalYear < currentYear) return []

  const variablesById = new Map(inputs.variables.map((v) => [v.id, v]))
  // Functions, like variables, don't vary per projection year — built once
  // here rather than per formula evaluation. Built before resolving
  // variables so a Variable's own formula can call one too.
  const functionsContext = buildFormulaFunctions(inputs.functions)
  const resolvedVariableAmounts = resolveVariableAmounts(inputs.variables, functionsContext).amounts

  // Special years, by name, for condition and amount/goal formulas (e.g.
  // "year < [College]"). inputs.specialYears is trusted to already carry
  // each entry's resolved absolute year — the same assumption
  // resolveSpecialYearRef's callers
  // (YearBoundaryField, SpecialYearsEditor) make, kept true by
  // resolveInputsSpecialYears running on load and on every special-year/
  // birth-date/life-expectancy edit. The two built-in pseudo years aren't
  // stored in inputs.specialYears, so they're added separately; a user can't
  // name their own special year "Current year"/"Death year" (see
  // isReservedSpecialYearName), so there's no collision to arbitrate here.
  const specialYearScope: Record<string, number> = {}
  for (const sy of inputs.specialYears) specialYearScope[sy.name] = sy.year
  specialYearScope[CURRENT_YEAR_SPECIAL_NAME] = currentYear
  specialYearScope[DEATH_YEAR_SPECIAL_NAME] = finalYear
  // deathYear is birthYear + lifeExpectancy (age.ts), so the age reached in
  // the death year is just lifeExpectancy itself.
  specialYearScope[DEATH_AGE_SPECIAL_NAME] = inputs.lifeExpectancy

  // Sorted once here rather than per bracketTax call: the solver re-runs the
  // tax calculation several times a year across every year of the projection,
  // and App re-runs the whole projection on every keystroke. Each year below
  // rescales these base (today's-dollars) schedules by that year's inflation
  // factor — cheap, since scaling preserves bracket order and so never needs
  // to re-sort.
  const baseTaxSchedules = prepareTaxSchedules(inputs)
  // Spouse pre-tax/Roth balances count toward net worth even when spouse mode
  // is off, so they're still drawable — fall back to the primary birth date
  // for the penalty-age test when there's no spouse birth date to use.
  const spousePenaltyBirthDate = inputs.spouseEnabled ? inputs.spouseBirthDate : inputs.birthDate
  // Same idea for RMDs: the spouse's pre-tax balance is still subject to
  // them even when spouse mode (and so the spouse's own age display) is off.
  const spouseBirthYearForRmd = birthYear(spousePenaltyBirthDate)

  const balances: Balances = {
    self: { ...inputs.balances.self },
    spouse: { ...inputs.balances.spouse },
    shared: { ...inputs.balances.shared },
  }

  // Each owner's annual Social Security benefit by year, computed once up
  // front rather than inside the year loop: everything it depends on
  // (earnings history, projected future wages, claiming age, COLA) is known
  // before the loop runs and doesn't depend on withdrawals/balances/taxes —
  // unlike the benefit's *taxable* portion, which does and so is computed
  // fresh every solver iteration below instead.
  const ssScheduleSelf = benefitScheduleForOwner(inputs, 'self', currentYear, finalYear, rateOverridesByYear)
  const ssScheduleSpouse = inputs.spouseEnabled
    ? benefitScheduleForOwner(inputs, 'spouse', currentYear, finalYear, rateOverridesByYear)
    : new Map<number, number>()

  const rows: YearProjectionRow[] = []

  // Cumulative product of each year's own inflation rate, rather than a
  // closed-form power of a flat rate, so a simulation run's per-year draws
  // compound correctly. Starts at 1 (the current year is already "today's
  // dollars") and is carried forward at the end of each iteration below.
  let inflationFactor = 1

  // Realized rates so far, most-recent-first (index 0 = the year currently
  // being evaluated, index 1 = one year before it, ...) — read by
  // return_rate()/inflation_rate() in a formula via historyContext below.
  // Unshifted onto at the top of each iteration, before that year's formulas
  // run, so "this year" is always available at index 0.
  const returnRateHistory: number[] = []
  const inflationRateHistory: number[] = []
  // Same idea for net_worth(), but holding the year's STARTING net worth
  // (balances as left by the prior year, before this year's income/spending/
  // savings/withdrawals/growth run) rather than an ending figure — the
  // year's own ending net worth isn't known until this iteration finishes,
  // so a formula evaluated mid-year can't reference its own
  // still-in-progress result. This means net_worth(0) is one step "behind"
  // return_rate(0)/inflation_rate(0) (which are known assumptions, not
  // outputs) — but it's the only value available without circularity.
  const netWorthHistory: number[] = []
  // Same "starting balance, before this year's activity" timing as
  // netWorthHistory, but per-account — backs the account-balance lookback
  // functions (pretax_self(), roth(), taxable(), ...).
  const accountBalanceHistory: Record<AccountHistoryKey, number>[] = []
  // Unlike accountBalanceHistory/netWorthHistory (captured at the top of
  // each iteration, before this year's activity), these are captured at the
  // BOTTOM of each iteration, once incomeTotal/expenseTotal are known — see
  // the unshift calls near inflationFactor below. So previousIncome(0)/
  // previousSpending(0) mean "last year", one step further back than
  // net_worth(0)'s "start of this year".
  const incomeHistory: number[] = []
  const expenseHistory: number[] = []
  // Same "captured at the bottom of the iteration" timing as incomeHistory/
  // expenseHistory above — backs previous_rmd_self()/previous_rmd_spouse()/
  // previous_rmd().
  const rmdSelfHistory: number[] = []
  const rmdSpouseHistory: number[] = []

  // Absolute-year/age lookups for dollar_convert()/rmd_in_year()/
  // rmd_at_age()/rmd_at_spouse_age() (see FormulaHistoryContext) — unlike
  // every history array above, these are keyed by the actual year/age rather
  // than an offset from "now", and grow one entry per iteration (set right
  // after rmdSelf/rmdSpouse are computed below, before this year's own
  // income/spending/etc. formulas run) so a formula can ask about THIS
  // year, not just prior ones. A key simply isn't present yet for a year/age
  // still in the current formula's own future — the inline historyContext
  // built each iteration treats that as an error rather than a fallback,
  // since (unlike a too-far-back lookback) there's no real answer to guess
  // at; a Goal's formula instead reads the complete `rows` array after the
  // whole projection has run (see buildGoalProjectionLookups), so it isn't
  // bounded by these maps at all.
  const inflationFactorByYear = new Map<number, number>()
  const rmdByYear = new Map<number, number>()
  const rmdByAge = new Map<number, number>()
  const rmdBySpouseAge = new Map<number, number>()

  for (let year = currentYear; year <= finalYear; year++) {
    const yearRates = rateOverridesByYear?.[year - currentYear]
    const yearReturnRatePct = yearRates?.realReturnRatePct ?? inputs.expectedReturnRatePct
    const yearInflationRatePct = yearRates?.inflationRatePct ?? inputs.inflationRatePct
    const growthRate = nominalGrowthRate(yearReturnRatePct, yearInflationRatePct)
    returnRateHistory.unshift(yearReturnRatePct)
    inflationRateHistory.unshift(yearInflationRatePct)
    netWorthHistory.unshift(totalNetWorth(balances))
    accountBalanceHistory.unshift(accountBalanceSnapshot(balances))
    // Years further back than history exists yet (e.g. return_rate(5) in
    // year 2 of the projection) fall back to the flat scenario assumption,
    // rather than erroring, so a lookback formula doesn't misfire early on.
    // net_worth()/account-balance lookups fall back to the current (index 0)
    // figure instead, per the same "don't error, use what's known" reasoning
    // — there's no flat scenario-level assumption for a balance to fall back
    // to. previous_income()/previous_spending() fall back to 0 directly
    // (there's no "current" total yet at the point this closure is built —
    // see incomeHistory/expenseHistory above).
    const historyContext: FormulaHistoryContext = {
      returnRate: (n) => returnRateHistory[n] ?? inputs.expectedReturnRatePct,
      inflationRate: (n) => inflationRateHistory[n] ?? inputs.inflationRatePct,
      netWorth: (n) => netWorthHistory[n] ?? netWorthHistory[0] ?? 0,
      accountBalance: (key, n) => (accountBalanceHistory[n] ?? accountBalanceHistory[0])?.[key] ?? 0,
      previousIncome: (n) => incomeHistory[n] ?? 0,
      previousSpending: (n) => expenseHistory[n] ?? 0,
      previousRmdSelf: (n) => rmdSelfHistory[n] ?? 0,
      previousRmdSpouse: (n) => rmdSpouseHistory[n] ?? 0,
      previousRmd: (n) => (rmdSelfHistory[n] ?? 0) + (rmdSpouseHistory[n] ?? 0),
      // Bounded to years/ages already reached — see
      // inflationFactorByYear/rmdByYear/rmdByAge/rmdBySpouseAge above. Safe to
      // read from those maps here even though this closure is built before
      // this year's own entries are inserted (below, right after rmdSelf/
      // rmdSpouse are computed): nothing calls into historyContext until the
      // income/spending/etc. formulas further down, by which point this
      // year's entries are already in.
      dollarConvert: (amount, fromYear, toYear) => {
        const fromFactor = inflationFactorByYear.get(fromYear)
        if (fromFactor === undefined) throw new FormulaError(`dollar_convert(): ${fromYear} hasn't been projected yet`)
        const toFactor = inflationFactorByYear.get(toYear)
        if (toFactor === undefined) throw new FormulaError(`dollar_convert(): ${toYear} hasn't been projected yet`)
        return amount * (toFactor / fromFactor)
      },
      rmdInYear: (y) => {
        const v = rmdByYear.get(y)
        if (v === undefined) throw new FormulaError(`rmd_in_year(${y}): that year hasn't been projected yet`)
        return v
      },
      rmdAtAge: (age) => {
        const v = rmdByAge.get(age)
        if (v === undefined) throw new FormulaError(`rmd_at_age(${age}): that age hasn't been reached yet`)
        return v
      },
      rmdAtSpouseAge: (age) => {
        const v = rmdBySpouseAge.get(age)
        if (v === undefined) throw new FormulaError(`rmd_at_spouse_age(${age}): that spouse age hasn't been reached yet`)
        return v
      },
    }
    const taxSchedules = scaleTaxSchedules(baseTaxSchedules, inflationFactor, inputs)

    // --- High-yield savings interest ---
    // Computed off the balance the account opened the year with (before this
    // year's contributions/withdrawals touch it — same "prior year-end
    // figure" idea as the RMD balances captured below) so it's known up front
    // and can be taxed as ordinary income alongside wages, rather than
    // depending on the withdrawal solver it would otherwise create a circular
    // dependency with. The real/nominal split mirrors growthRate above, but
    // HYSA has its own real rate rather than sharing the investment one —
    // and unlike investment growth, this amount is added to the balance
    // as-is (not compounded via *=), so this year's contributions to it don't
    // themselves earn interest until next year.
    const hysaGrowthRate = nominalGrowthRate(inputs.hysaRealReturnRatePct, yearInflationRatePct)
    const hysaInterest = balances.shared.hysa * hysaGrowthRate

    // --- Taxable brokerage dividends ---
    // Unlike expectedReturnRatePct/hysaRealReturnRatePct, this is a plain
    // fraction of the account's current (already-nominal) balance, not a
    // real rate to recombine with inflation — a dividend yield is a ratio of
    // dividends to current price, which doesn't itself drift with inflation
    // the way a multi-year compounding return does. Carved out of the
    // account's total nominal return (growthRate) rather than added on top,
    // so dividendYieldRatePct=0 reproduces today's behavior exactly.
    // dividendIncome is computed off the opening balance, same "known up
    // front, no circular dependency with the solver" reasoning as
    // hysaInterest above, and taxed as long-term capital gains every year
    // regardless of dividendPolicy (see the solver's computeIncomeTaxes
    // calls below) — only reinvest-vs-cash differs in what happens to the
    // money afterward.
    const dividendFraction = inputs.dividendYieldRatePct / 100
    const dividendIncome = balances.shared.taxable * dividendFraction
    const dividendPriceGrowthRate = growthRate - dividendFraction
    const dividendPolicy = activeDividendPolicy(inputs.dividendPolicyRanges, year)

    // --- Required minimum distributions ---
    // Captured before this year's contributions/growth touch the balance, so
    // this is last year's Dec-31 figure — what an RMD is actually sized off.
    const selfAge = selfBirthYear !== null ? year - selfBirthYear : null
    const spouseAgeForRmd = spouseBirthYearForRmd !== null ? year - spouseBirthYearForRmd : null
    const rmdSelf = requiredMinimumDistribution(inputs, balances.self.preTax, selfAge)
    const rmdSpouse = requiredMinimumDistribution(inputs, balances.spouse.preTax, spouseAgeForRmd)
    // Recorded before any formula this year runs, so rmd_in_year(year)/etc.
    // (and dollar_convert() via inflationFactor) can answer for THIS year,
    // not just prior ones — see inflationFactorByYear/rmdByYear/rmdByAge/
    // rmdBySpouseAge above. rmd_at_spouse_age() uses spouseBirthYear (only
    // set when spouse mode is genuinely on), same as row.ageSpouse/
    // net_worth_at_spouse_age, not the RMD-penalty fallback spouseAgeForRmd.
    inflationFactorByYear.set(year, inflationFactor)
    rmdByYear.set(year, rmdSelf + rmdSpouse)
    if (selfAge !== null) rmdByAge.set(selfAge, rmdSelf + rmdSpouse)
    if (spouseBirthYear !== null) rmdBySpouseAge.set(year - spouseBirthYear, rmdSelf + rmdSpouse)

    // The scope every formula/condition this year evaluates against, beyond
    // its own variable catalog — layered lowest to highest precedence:
    // special years, then variables (a variable can shadow a same-named
    // special year), then "year"/"age"/"spouseAge" last, so they always win
    // even against a same-named Variable. "spouseAge" is only added when
    // spouse mode is actually on — same gating as ageSpouse on the row output
    // below, rather than the RMD-only spouseBirthYearForRmd fallback.
    const yearScope: Record<string, number> = { ...specialYearScope }
    for (const v of variablesById.values()) yearScope[v.name] = resolvedVariableAmounts.get(v.id) ?? 0
    yearScope['year'] = year
    if (selfBirthYear !== null) yearScope['age'] = year - selfBirthYear
    if (spouseBirthYear !== null) yearScope['spouseAge'] = year - spouseBirthYear

    // --- Income ---
    const incomeBySourceMap = new Map<string, number>()
    const incomeNameByKey = new Map<string, string>()
    for (const range of activeRanges(inputs.incomeRanges, year)) {
      for (const alloc of range.allocations) {
        const resolved = resolveAllocation(alloc, variablesById, resolvedVariableAmounts, yearScope, historyContext, functionsContext)
        if (!resolved) continue
        const grown = resolved.inflationAdjusted ? resolved.amount * inflationFactor : resolved.amount
        incomeBySourceMap.set(resolved.key, (incomeBySourceMap.get(resolved.key) ?? 0) + grown)
        incomeNameByKey.set(resolved.key, resolved.name)
      }
    }
    const incomeTotal = sumValues(incomeBySourceMap)

    // --- Expenses ---
    const expenseByBucketMap = new Map<string, number>()
    const expenseNameByKey = new Map<string, string>()
    const expenseEducationByKey = new Map<string, boolean>()
    const expenseMedicalByKey = new Map<string, boolean>()
    for (const range of activeRanges(inputs.spendingRanges, year)) {
      for (const alloc of range.allocations) {
        const resolved = resolveAllocation(alloc, variablesById, resolvedVariableAmounts, yearScope, historyContext, functionsContext)
        if (!resolved) continue
        const grown = resolved.inflationAdjusted ? resolved.amount * inflationFactor : resolved.amount
        expenseByBucketMap.set(resolved.key, (expenseByBucketMap.get(resolved.key) ?? 0) + grown)
        expenseNameByKey.set(resolved.key, resolved.name)
        expenseEducationByKey.set(
          resolved.key,
          (expenseEducationByKey.get(resolved.key) ?? false) || (alloc.educationRelated ?? false),
        )
        expenseMedicalByKey.set(
          resolved.key,
          (expenseMedicalByKey.get(resolved.key) ?? false) || (alloc.medicalRelated ?? false),
        )
      }
    }
    const expenseTotal = sumValues(expenseByBucketMap)

    // --- Savings plan ---
    // Lines are defined directly on each range (no shared catalog), so
    // there's no stable id to group same-account lines by across ranges the
    // way a Variable's id does for income/spending. Grouping by name instead
    // (see savingsLineKey) keeps tiered employer match correct when
    // overlapping ranges both fund a same-named line, and gives that line a
    // single, stable result entry — same reasoning as resolveAllocation's
    // 'variable' case. If overlapping ranges give a same-named line
    // different account/owner/match, whichever is encountered first that
    // year wins as the representative def; amounts still sum.
    //
    // Each active range is processed as one ordered pass over its own
    // `lines`, rather than building every range's contributions into a map
    // first and applying them in a second phase: a goal-capped line needs to
    // see the live account balance left by the lines before it *in the same
    // range this same year* (so balances are mutated immediately, per line),
    // and any amount a goal-capped line doesn't need cascades as `overflow`
    // to fund the next line in that same range's list — the "layered,
    // first-line-funded-first" ordering SavingsPlanRange's own doc comment
    // already describes. `overflow` is reset per range: it never crosses
    // from one range into another's lines.
    const contributionGroups = new Map<string, { def: SavingsLine; amount: number }>()
    const savingsByLineMap = new Map<string, SavingsLineResult>()
    let savingsEmployeeTotal = 0
    let savingsEmployerMatchTotal = 0
    let preTaxDeferrals = 0
    let hsaContributions = 0
    // The first 'unlimited' line (in range/line order) with no goal to aim
    // at — i.e. nothing bounds it. Rather than being a no-op, such a line
    // becomes this year's catch-all: whatever's left over after taxes,
    // expenses, and every other savings line (computed below as
    // extraTaxableSavings) is redirected into its account instead of the
    // default taxable sweep. Only the first one found is used — same
    // "first line wins" precedent as the same-name-merge comment above.
    let catchAllLine: SavingsLine | null = null
    const contributionsByAccount: Record<InvestmentAccountKey, number> = {
      preTaxSelf: 0,
      preTaxSpouse: 0,
      rothSelf: 0,
      rothSpouse: 0,
      taxable: 0,
      hsa: 0,
      hysa: 0,
      college529: 0,
    }

    for (const range of activeRanges(inputs.savingsRanges, year)) {
      let overflow = 0

      for (const line of range.lines) {
        if (line.condition) {
          const result = tryEvaluateCondition(line.condition, yearScope, historyContext, functionsContext)
          // A condition that fails to evaluate (e.g. mid-edit typo) fails
          // OPEN — treated as if no condition were set — since a savings
          // line silently vanishing from the whole projection over a formula
          // error is a worse failure mode than it silently always applying;
          // the condition editor surfaces the parse error directly.
          if (result.ok && !result.value) continue
        }

        // 'unlimited' has no periodic amount to resolve — it never
        // contributes anything of its own (grown stays 0); its whole point
        // is the goal-cap branch below, which for this kind ignores
        // `requested` and always tops up to the goal directly instead of
        // being bounded by it.
        const isUnlimited = line.source.kind === 'unlimited'
        let grown = 0
        if (!isUnlimited) {
          const resolved = resolveAllocation(line, variablesById, resolvedVariableAmounts, yearScope, historyContext, functionsContext)
          if (!resolved) continue
          grown = resolved.inflationAdjusted ? resolved.amount * inflationFactor : resolved.amount
        }

        const requested = grown + overflow
        overflow = 0
        let toContribute = requested
        let goalApplied = false

        if (line.goal) {
          const resolvedGoal = resolveGoal(line.goal, variablesById, resolvedVariableAmounts, yearScope, historyContext, functionsContext)
          // A dangling goal reference (e.g. deleted variable) fails open too:
          // uncapped this year, same reasoning as the condition case above —
          // for 'unlimited' this leaves toContribute at `requested` and
          // goalApplied false, the same "nothing to aim at" state as having
          // no goal at all (see catchAllLine below).
          if (resolvedGoal) {
            goalApplied = true
            const target = resolvedGoal.inflationAdjusted
              ? resolvedGoal.amount * inflationFactor
              : resolvedGoal.amount
            const room = Math.max(0, target - currentBalanceFor(balances, line))
            if (isUnlimited) {
              // Not bounded by `requested` (there is none, by design) — draws
              // whatever it takes, beyond incoming overflow if it has to, to
              // land exactly on the goal. Same "not capped by funds on hand"
              // caveat as every other savings line.
              toContribute = room
              if (requested > room) overflow += requested - room
            } else if (requested > room) {
              overflow += requested - room
              toContribute = room
            }
          }
        }

        if (isUnlimited && !goalApplied && !catchAllLine) catchAllLine = line

        const match = line.match?.wageVariableId
          ? calculateMatchAmount(
              toContribute,
              incomeBySourceMap.get(line.match.wageVariableId) ?? 0,
              line.match.tiers,
            )
          : 0

        savingsEmployeeTotal += toContribute
        savingsEmployerMatchTotal += match
        if (line.account === 'preTax') preTaxDeferrals += toContribute
        if (line.account === 'hsa') hsaContributions += toContribute

        applyContribution(balances, contributionsByAccount, line, toContribute, match)

        const key = savingsLineKey(line)
        const existingGroup = contributionGroups.get(key)
        if (existingGroup) {
          existingGroup.amount += toContribute
        } else {
          contributionGroups.set(key, { def: line, amount: toContribute })
        }

        const existingRow = savingsByLineMap.get(key)
        if (existingRow) {
          existingRow.contribution += toContribute
          existingRow.match += match
        } else {
          savingsByLineMap.set(key, { id: key, name: line.name, contribution: toContribute, match })
        }
      }
      // Any overflow left once this range's lines run out simply isn't
      // contributed — no cross-range spillover.
    }
    // savingsByLine is flattened from savingsByLineMap further below, after
    // extraTaxableSavings may add one more contribution to catchAllLine.

    // --- State contribution-based deductions (e.g. Kansas's 529 deduction) ---
    // Non-carryforward: each year's deduction is capped independently against
    // that year's own contributions, with no banking of unused amounts.
    const stateContributionDeductionAmount = inputs.stateContributionDeductions.reduce((total, d) => {
      const contributed = contributionsForAccountType(d.account, contributionGroups)
      const cap = Math.max(0, d.perBeneficiaryCap) * Math.max(0, d.beneficiaryCount)
      return total + Math.min(Math.max(0, contributed), cap)
    }, 0)

    // --- Roth conversion ---
    // An elective transfer from pre-tax to Roth: taxed as ordinary income like
    // a pre-tax withdrawal, but — unlike one — never subject to the early-
    // withdrawal penalty, since a conversion isn't a distribution. This year's
    // RMD is reserved first (the IRS won't let RMD dollars be converted), and
    // the rest is capped at whatever's actually in the pre-tax account after
    // this year's contributions — you can't convert money that isn't there.
    const conversionRequestedSelf = activeConversionAmount(
      inputs.rothConversionRanges,
      year,
      'self',
      variablesById,
      resolvedVariableAmounts,
      yearScope,
      inflationFactor,
      historyContext,
      functionsContext,
    )
    const conversionRequestedSpouse = activeConversionAmount(
      inputs.rothConversionRanges,
      year,
      'spouse',
      variablesById,
      resolvedVariableAmounts,
      yearScope,
      inflationFactor,
      historyContext,
      functionsContext,
    )
    const conversionSelf = Math.min(conversionRequestedSelf, Math.max(0, balances.self.preTax - rmdSelf))
    const conversionSpouse = Math.min(
      conversionRequestedSpouse,
      Math.max(0, balances.spouse.preTax - rmdSpouse),
    )
    balances.self.preTax -= conversionSelf
    balances.self.roth += conversionSelf
    balances.self.rothBasis += conversionSelf
    balances.spouse.preTax -= conversionSpouse
    balances.spouse.roth += conversionSpouse
    balances.spouse.rothBasis += conversionSpouse
    contributionsByAccount.rothSelf += conversionSelf
    contributionsByAccount.rothSpouse += conversionSpouse
    const rothConversionTotal = conversionSelf + conversionSpouse

    // --- Payroll tax ---
    // FICA is driven by wages alone, so it doesn't change as the solver below
    // varies withdrawals. Computing it out here keeps "withdrawals are never
    // subject to FICA" a structural property rather than something a later
    // edit could quietly break.
    const payrollWages = Math.max(0, incomeTotal - hsaContributions)
    const socialSecurityTax =
      Math.min(payrollWages, inputs.socialSecurityWageBase) *
      (inputs.socialSecurityTaxRatePct / 100)
    const medicareTax = payrollWages * (inputs.medicareTaxRatePct / 100)
    const additionalMedicareTax =
      Math.max(0, payrollWages - inputs.additionalMedicareTaxThreshold) *
      (inputs.additionalMedicareTaxRatePct / 100)
    const ficaTax = socialSecurityTax + medicareTax + additionalMedicareTax

    // --- Social Security benefits ---
    // Real cash income like incomeTotal, but never wages: excluded from
    // payrollWages/FICA above, and its taxable portion is decided by the
    // provisional-income test (below) rather than flat inclusion in
    // baseOrdinary — so it's tracked separately from both.
    const ssBenefitSelf = ssScheduleSelf.get(year) ?? 0
    const ssBenefitSpouse = ssScheduleSpouse.get(year) ?? 0
    const ssBenefitTotal = ssBenefitSelf + ssBenefitSpouse
    const ssThresholds = inputs.spouseEnabled
      ? inputs.socialSecurity.provisionalIncomeThresholds.marriedFilingJointly
      : inputs.socialSecurity.provisionalIncomeThresholds.single

    // --- Income tax and the withdrawal gross-up ---
    // Traditional 401(k)/IRA deferrals and HSA contributions reduce taxable
    // income; Roth and taxable-brokerage contributions don't (already
    // after-tax money). A Roth conversion adds ordinary income the same way a
    // pre-tax withdrawal would. HYSA interest is ordinary income too, like a
    // 1099-INT, and — unlike every other account's growth — taxed the year
    // it's earned rather than deferred to withdrawal. Left unclamped here so
    // the clamp happens once, after withdrawal income is added — clamping
    // first would overstate AGI in a year where contributions exceed income.
    const baseOrdinary =
      incomeTotal - preTaxDeferrals - hsaContributions + rothConversionTotal + hysaInterest
    const committed = expenseTotal + savingsEmployeeTotal
    // Snapshot after contributions and the conversion are posted but before
    // any withdrawal, so every solver pass draws against the same starting
    // balances — and so the tax the conversion itself triggers becomes part
    // of what the withdrawal waterfall has to fund, same as any other bill.
    const sources = snapshotSources(balances)
    const withdrawalContext = {
      selfPenaltyFree: hasReachedAgeDuringYear(inputs.birthDate, 59.5, year),
      spousePenaltyFree: hasReachedAgeDuringYear(spousePenaltyBirthDate, 59.5, year),
      hsaPenaltyFree: hasReachedAgeDuringYear(inputs.birthDate, 65, year),
      qualifiedMedicalExpenses: qualifiedExpensesForYear(expenseByBucketMap, expenseMedicalByKey),
      qualifiedEducationExpenses: qualifiedExpensesForYear(expenseByBucketMap, expenseEducationByKey),
      rmdSelf,
      rmdSpouse,
    }
    const withdrawalSteps = withdrawalStepsForYear(
      inputs.withdrawalRanges,
      year,
      variablesById,
      resolvedVariableAmounts,
      yearScope,
      inflationFactor,
      historyContext,
      functionsContext,
    )

    // How much of ssBenefitTotal is federally/state taxable, from the
    // provisional-income test — a function of baseOrdinary plus whatever the
    // withdrawal solver is drawing this pass, so (like plan.ordinaryIncome
    // and plan.capitalGains) it has to be re-derived every iteration, not
    // computed once up front. dividendIncome is folded in too, even though
    // it's fixed for the year (not solver-dependent), since it's still part
    // of this year's capital gains for the provisional-income test.
    function taxableSocialSecurityFor(plan: { ordinaryIncome: number; capitalGains: number }) {
      const otherAGI = baseOrdinary + plan.ordinaryIncome + plan.capitalGains + dividendIncome
      const federal = taxableSocialSecurityBenefit(ssBenefitTotal, otherAGI, 0, ssThresholds)
      const state = inputs.socialSecurity.stateTaxesSocialSecurity ? federal : 0
      return { federal, state }
    }

    let need = Math.max(
      0,
      committed +
        ficaTax +
        computeIncomeTaxes(
          taxSchedules,
          baseOrdinary,
          0,
          dividendIncome,
          0,
          taxableSocialSecurityFor({ ordinaryIncome: 0, capitalGains: 0 }),
          stateContributionDeductionAmount,
        ).total -
        incomeTotal -
        ssBenefitTotal,
    )
    let plan = planWithdrawals(sources, need, withdrawalContext, withdrawalSteps)
    let solverConverged = need === 0
    for (let i = 0; i < SOLVER_MAX_ITERATIONS && !solverConverged; i++) {
      const iterationTax = computeIncomeTaxes(
        taxSchedules,
        baseOrdinary,
        plan.ordinaryIncome,
        plan.capitalGains + dividendIncome,
        plan.penalty,
        taxableSocialSecurityFor(plan),
        stateContributionDeductionAmount,
      )
      const nextNeed = Math.max(0, committed + ficaTax + iterationTax.total - incomeTotal - ssBenefitTotal)
      solverConverged = Math.abs(nextNeed - need) <= SOLVER_TOLERANCE
      need = nextNeed
      // The loop has to end on a plan, not a tax figure, so the plan actually
      // applied is the one that funds the final `need`.
      plan = planWithdrawals(sources, need, withdrawalContext, withdrawalSteps)
    }

    const ssTaxable = taxableSocialSecurityFor(plan)
    const incomeTax = computeIncomeTaxes(
      taxSchedules,
      baseOrdinary,
      plan.ordinaryIncome,
      plan.capitalGains + dividendIncome,
      plan.penalty,
      ssTaxable,
      stateContributionDeductionAmount,
    )
    const federalTax = incomeTax.federalOrdinary + incomeTax.federalCapitalGains
    const stateTax = incomeTax.stateOrdinary + incomeTax.stateCapitalGains
    const totalTax = incomeTax.total + ficaTax

    // --- Cash flow: expenses + savings plan first, then either sweep the
    // leftover into taxable or run the withdrawal waterfall ---
    // The conversion amounts are folded into preTaxSelf/preTaxSpouse here (on
    // top of whatever the waterfall itself drew) so accountFlows — and so the
    // Detailed table's per-account balance reconciliation — reflect the real
    // money that left the pre-tax account this year. `plan` itself, and so
    // `withdrawals` below, stays conversion-free: it's only ever what the
    // withdrawal waterfall drew to cover a shortfall.
    const withdrawalsByAccount: Record<InvestmentAccountKey, number> = {
      preTaxSelf: plan.byAccount.preTaxSelf + conversionSelf,
      preTaxSpouse: plan.byAccount.preTaxSpouse + conversionSpouse,
      rothSelf: plan.byAccount.rothSelf,
      rothSpouse: plan.byAccount.rothSpouse,
      taxable: plan.byAccount.taxable,
      hsa: plan.byAccount.hsa,
      hysa: plan.byAccount.hysa,
      college529: plan.byAccount.college529,
    }

    // A required minimum distribution can draw more than the year actually
    // needs (e.g. income alone already covers spending), so — unlike a
    // shortfall draw — withdrawing doesn't imply nothing is left over.
    // extraTaxableSavings is whatever, after this year's withdrawal (RMD
    // included), came in beyond what taxes/savings/spending used up.
    const extraTaxableSavings = Math.max(
      0,
      incomeTotal + ssBenefitTotal + plan.total - totalTax - savingsEmployeeTotal - expenseTotal,
    )
    applyWithdrawalPlan(balances, plan)
    if (catchAllLine) {
      // Redirect the leftover into the catch-all line's own account instead
      // of the default taxable sweep — "contribute everything remaining."
      // No employer match on this portion (a leftover sweep isn't a real
      // payroll contribution). Not folded back into this year's tax
      // calculation even when the account is preTax/hsa (those would
      // otherwise reduce taxable income) — recomputing taxes off an amount
      // that itself depends on the tax result would be circular; same
      // "good enough, not exact" tradeoff as the engine's other simplifications.
      applyContribution(balances, contributionsByAccount, catchAllLine, extraTaxableSavings, 0)
      savingsEmployeeTotal += extraTaxableSavings
      const key = savingsLineKey(catchAllLine)
      const existingGroup = contributionGroups.get(key)
      if (existingGroup) {
        existingGroup.amount += extraTaxableSavings
      } else {
        contributionGroups.set(key, { def: catchAllLine, amount: extraTaxableSavings })
      }
      const existingRow = savingsByLineMap.get(key)
      if (existingRow) {
        existingRow.contribution += extraTaxableSavings
      } else {
        savingsByLineMap.set(key, { id: key, name: catchAllLine.name, contribution: extraTaxableSavings, match: 0 })
      }
    } else {
      balances.shared.taxable += extraTaxableSavings
      balances.shared.taxableBasis += extraTaxableSavings
      contributionsByAccount.taxable += extraTaxableSavings
    }
    const savingsByLine = [...savingsByLineMap.values()]

    // This year's dividend, independent of the catch-all/extraTaxableSavings
    // sweep above — it's brokerage income, not leftover cash. Reinvested
    // dividends buy new shares at current value, so — unlike hysaInterest —
    // they add fresh cost basis; paid-out dividends leave the taxable
    // account (and its basis) untouched and land in cash instead, the same
    // account a withdrawal line can already draw from.
    if (dividendPolicy === 'cash') {
      balances.shared.cash += dividendIncome
    } else {
      balances.shared.taxable += dividendIncome
      balances.shared.taxableBasis += dividendIncome
      contributionsByAccount.taxable += dividendIncome
    }

    // --- Growth: this year's contributions grow for the full year, and
    // withdrawals forgo a full year's growth (grow-then-sit-flat isn't
    // modeled); cash isn't invested. HYSA is the exception to "contributions
    // grow for the full year" — hysaInterest was fixed above, off the
    // opening balance, to avoid a circular dependency with the tax solver, so
    // it's added as a flat amount rather than compounded via *= like the
    // rest. The taxable balance's own growth rate (dividendPriceGrowthRate,
    // below) likewise excludes the dividend already folded in just above ---
    const preGrowth = {
      preTaxSelf: balances.self.preTax,
      preTaxSpouse: balances.spouse.preTax,
      rothSelf: balances.self.roth,
      rothSpouse: balances.spouse.roth,
      taxable: balances.shared.taxable,
      hsa: balances.shared.hsa,
      hysa: balances.shared.hysa,
      college529: balances.shared.college529,
    }

    balances.self.preTax *= 1 + growthRate
    balances.self.roth *= 1 + growthRate
    balances.spouse.preTax *= 1 + growthRate
    balances.spouse.roth *= 1 + growthRate
    // Price appreciation only — the dividend portion of the account's
    // return was already folded in above, as either a contribution
    // (reinvested) or a transfer to cash (paid out), before this snapshot.
    balances.shared.taxable *= 1 + dividendPriceGrowthRate
    balances.shared.hsa *= 1 + growthRate
    balances.shared.college529 *= 1 + growthRate
    balances.shared.hysa += hysaInterest

    const accountFlows: Record<InvestmentAccountKey, AccountFlow> = {
      preTaxSelf: {
        contributions: contributionsByAccount.preTaxSelf,
        withdrawals: withdrawalsByAccount.preTaxSelf,
        growth: balances.self.preTax - preGrowth.preTaxSelf,
      },
      preTaxSpouse: {
        contributions: contributionsByAccount.preTaxSpouse,
        withdrawals: withdrawalsByAccount.preTaxSpouse,
        growth: balances.spouse.preTax - preGrowth.preTaxSpouse,
      },
      rothSelf: {
        contributions: contributionsByAccount.rothSelf,
        withdrawals: withdrawalsByAccount.rothSelf,
        growth: balances.self.roth - preGrowth.rothSelf,
      },
      rothSpouse: {
        contributions: contributionsByAccount.rothSpouse,
        withdrawals: withdrawalsByAccount.rothSpouse,
        growth: balances.spouse.roth - preGrowth.rothSpouse,
      },
      taxable: {
        contributions: contributionsByAccount.taxable,
        withdrawals: withdrawalsByAccount.taxable,
        growth: balances.shared.taxable - preGrowth.taxable,
      },
      hsa: {
        contributions: contributionsByAccount.hsa,
        withdrawals: withdrawalsByAccount.hsa,
        growth: balances.shared.hsa - preGrowth.hsa,
      },
      hysa: {
        contributions: contributionsByAccount.hysa,
        withdrawals: withdrawalsByAccount.hysa,
        growth: balances.shared.hysa - preGrowth.hysa,
      },
      college529: {
        contributions: contributionsByAccount.college529,
        withdrawals: withdrawalsByAccount.college529,
        growth: balances.shared.college529 - preGrowth.college529,
      },
    }

    // Per-bracket detail for display — computed once, off the already-
    // converged incomeTax/taxSchedules, not re-solved.
    const taxBracketBreakdown = {
      federalOrdinary: bracketBreakdown(0, incomeTax.federalTaxableIncome, taxSchedules.federalOrdinary),
      federalGains: bracketBreakdown(
        incomeTax.federalTaxableIncome,
        incomeTax.federalTaxableIncome + incomeTax.federalTaxableGains,
        taxSchedules.federalCapitalGains,
      ),
      stateOrdinary: bracketBreakdown(0, incomeTax.stateTaxableIncome, taxSchedules.stateOrdinary),
      stateGains: bracketBreakdown(
        incomeTax.stateTaxableIncome,
        incomeTax.stateTaxableIncome + incomeTax.stateTaxableGains,
        taxSchedules.stateCapitalGains ?? taxSchedules.stateOrdinary,
      ),
    }

    // taxSchedules.stateDeduction is standard deduction + personal exemption
    // combined (see prepareTaxSchedules) — split back out here purely for
    // display, using the same inflation factor scaleTaxSchedules applied to
    // the combined figure.
    const stateDeductionFactor = inputs.stateBracketsInflationAdjusted ? inflationFactor : 1
    const taxDeductions = {
      federalStandardDeduction: taxSchedules.federalDeduction,
      stateStandardDeduction: inputs.stateStandardDeduction * stateDeductionFactor,
      statePersonalExemption: inputs.statePersonalExemption * stateDeductionFactor,
      stateContributionDeduction: stateContributionDeductionAmount,
    }

    const netWorth = totalNetWorth(balances)

    // User-defined Goals (inputs.goals) can reference years/ages that haven't
    // happened yet as of this iteration (net_worth_in_year()/at_age() and
    // friends — see PROJECTION_LOOKUP_FUNCTIONS in formula.ts), so they can't
    // be evaluated inline here like every other formula in this file.
    // Filled in by the second pass below, once `rows` is complete.
    const goalResults: Record<string, boolean | null> = {}
    const metricResults: Record<string, number | null> = {}

    rows.push({
      year,
      ageSelf: selfAge,
      ageSpouse: spouseBirthYear !== null ? year - spouseBirthYear : null,
      incomeTotal,
      incomeBySource: mapToNamed(incomeBySourceMap, incomeNameByKey),
      expenseTotal,
      expenseByBucket: mapToNamed(expenseByBucketMap, expenseNameByKey),
      savingsEmployeeTotal,
      savingsEmployerMatchTotal,
      savingsByLine,
      preTaxSavingsDeferrals: preTaxDeferrals,
      hsaSavingsContributions: hsaContributions,
      ordinaryAgi: incomeTax.ordinaryAgi,
      taxDeductions,
      federalTax,
      federalCapitalGainsTax: incomeTax.federalCapitalGains,
      stateTax,
      stateCapitalGainsTax: incomeTax.stateCapitalGains,
      federalTaxableIncome: incomeTax.federalTaxableIncome,
      federalTaxableGains: incomeTax.federalTaxableGains,
      stateTaxableIncome: incomeTax.stateTaxableIncome,
      stateTaxableGains: incomeTax.stateTaxableGains,
      taxBracketBreakdown,
      socialSecurityTax,
      medicareTax,
      additionalMedicareTax,
      earlyWithdrawalPenalty: plan.penalty,
      totalTax,
      socialSecurity: {
        self: ssBenefitSelf,
        spouse: ssBenefitSpouse,
        total: ssBenefitTotal,
        taxableFederal: ssTaxable.federal,
        taxableState: ssTaxable.state,
      },
      extraTaxableSavings,
      withdrawals: {
        total: plan.total,
        fromCash: plan.byAccount.cash,
        ordinaryIncome: plan.ordinaryIncome,
        ordinaryIncomeByAccount: plan.ordinaryIncomeByAccount,
        capitalGains: plan.capitalGains,
        penalty: plan.penalty,
        unfunded: plan.unfunded,
        rmd: plan.rmd,
        taxableBasisUsed: plan.taxableBasisUsed,
        rothBasisUsed: plan.rothBasisUsed,
        college529BasisUsed: plan.college529BasisUsed,
      },
      solverConverged,
      rothConversion: { total: rothConversionTotal, self: conversionSelf, spouse: conversionSpouse },
      hysaInterest,
      dividendIncome,
      dividendPolicy,
      balances: {
        preTaxSelf: balances.self.preTax,
        preTaxSpouse: balances.spouse.preTax,
        rothSelf: balances.self.roth,
        rothSelfBasis: balances.self.rothBasis,
        rothSpouse: balances.spouse.roth,
        rothSpouseBasis: balances.spouse.rothBasis,
        taxable: balances.shared.taxable,
        taxableBasis: balances.shared.taxableBasis,
        hsa: balances.shared.hsa,
        cash: balances.shared.cash,
        hysa: balances.shared.hysa,
        college529: balances.shared.college529,
        college529Basis: balances.shared.college529Basis,
      },
      accountFlows,
      netWorth,
      inflationFactor,
      goalResults,
      metricResults,
    })

    incomeHistory.unshift(incomeTotal)
    expenseHistory.unshift(expenseTotal)
    rmdSelfHistory.unshift(rmdSelf)
    rmdSpouseHistory.unshift(rmdSpouse)
    inflationFactor *= 1 + yearInflationRatePct / 100
  }

  // --- Goals & Metrics ---
  // A second pass over the now-complete `rows`, rather than inline in the
  // loop above like every other formula in this file — see the goalResults
  // placeholder's own comment for why. Metrics (inputs.metrics) share this
  // pass since they read the identical scope/history a Goal does. Each row still gets its own
  // FormulaHistoryContext so return_rate()/net_worth()/pretax_self()/etc.
  // keep meaning exactly what they meant during the live loop (relative to
  // THAT row, not the end of the projection) — reconstructed here by
  // indexing into the same arrays the loop built, rather than re-deriving
  // them, since those arrays are now complete rather than growing one
  // unshift at a time. net_worth_in_year()/net_worth_at_age()/
  // net_worth_at_spouse_age() and their per-account equivalents are new:
  // absolute lookups anywhere in the finished projection, which only this
  // pass (not the live loop) can answer.
  if (inputs.goals.length > 0 || inputs.metrics.length > 0) {
    const numYears = rows.length
    // Absolute (year/age-indexed) lookups don't depend on which row is being
    // evaluated, unlike the relative ones below — so built once here, not
    // per row. See buildGoalProjectionLookups.
    const projectionLookups = buildGoalProjectionLookups(rows)

    // Every row's own scope/history, precomputed up front (rather than
    // inline in the evaluation loop below) so first_year_when()/
    // first_age_when()/first_spouse_age_when()'s condition can be
    // re-evaluated against ANY row's scope/history from ANY other row's own
    // formula — including a row later in the projection than the one
    // first_year_when() and friends are themselves being evaluated from.
    // Each goalHistoryContext below captures `rowContexts` in its own
    // projectionRows closure before this array finishes building, but that's
    // fine: the closure is only ever called later, once one of those
    // functions runs, by which point `rowContexts` is fully populated.
    const rowContexts: {
      year: number
      age: number | null
      spouseAge: number | null
      scope: Record<string, number>
      history: FormulaHistoryContext
    }[] = rows.map((row, i) => {
      // Index into the complete history arrays (index 0 = the LAST
      // projected year) as if only `i`'s own unshift, and everything before
      // it, had happened yet — i.e. exactly the array these functions saw
      // during row i's own turn in the loop above.
      const asOf = numYears - 1 - i
      // incomeHistory/expenseHistory are unshifted one step later than the
      // rest (see their declaration above), so "as of row i" is one index
      // further in.
      const asOfPrevious = numYears - i
      const goalHistoryContext: FormulaHistoryContext = {
        returnRate: (n) => returnRateHistory[asOf + n] ?? inputs.expectedReturnRatePct,
        inflationRate: (n) => inflationRateHistory[asOf + n] ?? inputs.inflationRatePct,
        netWorth: (n) => netWorthHistory[asOf + n] ?? netWorthHistory[asOf] ?? 0,
        accountBalance: (key, n) => (accountBalanceHistory[asOf + n] ?? accountBalanceHistory[asOf])?.[key] ?? 0,
        previousIncome: (n) => incomeHistory[asOfPrevious + n] ?? 0,
        previousSpending: (n) => expenseHistory[asOfPrevious + n] ?? 0,
        previousRmdSelf: (n) => rmdSelfHistory[asOfPrevious + n] ?? 0,
        previousRmdSpouse: (n) => rmdSpouseHistory[asOfPrevious + n] ?? 0,
        previousRmd: (n) => (rmdSelfHistory[asOfPrevious + n] ?? 0) + (rmdSpouseHistory[asOfPrevious + n] ?? 0),
        ...projectionLookups,
        projectionRows: () => rowContexts,
      }

      const goalScope: Record<string, number> = { ...specialYearScope }
      for (const v of variablesById.values()) goalScope[v.name] = resolvedVariableAmounts.get(v.id) ?? 0
      goalScope['year'] = row.year
      if (row.ageSelf !== null) goalScope['age'] = row.ageSelf
      if (row.ageSpouse !== null) goalScope['spouseAge'] = row.ageSpouse
      goalScope['netWorth'] = row.netWorth
      goalScope['unfunded'] = row.withdrawals.unfunded

      return { year: row.year, age: row.ageSelf, spouseAge: row.ageSpouse, scope: goalScope, history: goalHistoryContext }
    })

    rowContexts.forEach(({ scope: goalScope, history: goalHistoryContext }, i) => {
      const row = rows[i]
      for (const goal of inputs.goals) {
        if (!goal.expression.trim()) continue
        const result = tryEvaluateCondition(goal.expression, goalScope, goalHistoryContext, functionsContext)
        row.goalResults[goal.id] = result.ok ? result.value : null
      }

      // Metrics reuse the exact same scope/history a Goal formula sees —
      // just evaluated numerically (tryEvaluateFormula) instead of as a
      // boolean condition.
      for (const metric of inputs.metrics) {
        if (!metric.expression.trim()) continue
        const result = tryEvaluateFormula(metric.expression, goalScope, goalHistoryContext, functionsContext)
        row.metricResults[metric.id] = result.ok ? result.value : null
      }
    })
  }

  return rows
}
