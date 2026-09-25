import { defaultBirthDate } from './age'

// Pre-tax and Roth balances are attributed to one spouse or the other.
export interface OwnedAccountBalances {
  preTax: number
  roth: number
  // Dollar amount of the Roth balance that is contribution/conversion basis
  // rather than growth — basis can be withdrawn tax- and penalty-free at any
  // time, unlike earnings.
  rothBasis: number
}

// Taxable brokerage, HSA, cash, high-yield savings, and 529 are treated as
// combined household accounts, even in spouse mode — they're never split by
// owner.
export interface SharedAccountBalances {
  taxable: number
  hsa: number
  cash: number
  // High-yield savings — like cash, fully liquid with no basis tracking (all
  // interest is taxed as it's earned, so a later withdrawal is already-taxed
  // principal), but unlike cash it earns interest. See hysaRealReturnRatePct.
  hysa: number
  // Dollar amount of the taxable brokerage balance that is cost basis rather
  // than unrealized gains — only the gain portion is taxable when sold.
  taxableBasis: number
  college529: number
  // Dollar amount of the 529 balance that is contribution basis rather than
  // growth — basis can always be withdrawn tax- and penalty-free, unlike
  // earnings, which are only tax/penalty-free when the withdrawal is used
  // for qualified education expenses.
  college529Basis: number
}

export interface RetirementInputs {
  birthDate: string
  // When true, spouse's birth date is tracked and pre-tax/Roth accounts and
  // lines can be assigned to either spouse — needed later to determine
  // penalty-free withdrawal ages per account owner.
  spouseEnabled: boolean
  spouseBirthDate: string
  lifeExpectancy: number
  // Federal ordinary-income tax brackets and standard deduction. Defaults to
  // current tax-year IRS figures for a single filer, but both are editable
  // in case the filing status differs or the user wants to model a future
  // year's inflation-adjusted numbers.
  federalTaxBrackets: TaxBracket[]
  federalStandardDeduction: number
  // Federal bracket thresholds and the standard deduction are indexed to
  // inflation by law, so — like income/spending amounts — they're entered in
  // today's dollars and grown by inflationRatePct each projection year by
  // default. Turn off to model a bracket freeze instead.
  federalBracketsInflationAdjusted: boolean
  // State income tax is entirely user-entered — rates, brackets, and the
  // standard deduction all vary by state, and some states have no income
  // tax at all, so there's no sensible built-in default.
  stateName: string
  stateTaxBrackets: TaxBracket[]
  stateStandardDeduction: number
  // Some states (e.g. Kansas) allow a personal exemption on top of the
  // standard deduction — 0 for states that don't have one.
  statePersonalExemption: number
  // Unlike the federal case, state bracket/deduction indexing isn't uniform —
  // some states index automatically, others only via legislature — so this
  // defaults to on but is worth checking against your state's own rules.
  stateBracketsInflationAdjusted: boolean
  // Federal long-term capital gains brackets, applied to gains realized when
  // the taxable brokerage account is sold to cover a shortfall. Gains stack on
  // top of ordinary taxable income rather than starting from zero, so these
  // thresholds are read against ordinary income + gains together. Short-term
  // gains aren't modeled — the projection has no holding periods, so every
  // realized gain is treated as long-term. Defaults to current tax-year IRS
  // figures for a single filer — married-filing-jointly thresholds are NOT
  // simply double the single-filer ones (unlike the ordinary brackets above,
  // where doubling is a reasonable approximation), so look up the actual MFJ
  // figures rather than doubling these once spouse mode is on.
  federalCapitalGainsBrackets: TaxBracket[]
  // Most states tax capital gains as ordinary income (Kansas among them), so
  // that's the default. Turn this on for a state with its own gains schedule,
  // and stateCapitalGainsBrackets is used instead.
  stateHasSeparateCapitalGainsRates: boolean
  stateCapitalGainsBrackets: TaxBracket[]
  // Social Security (OASDI) and Medicare (FICA) payroll tax rates. These
  // apply per worker to their own wages — Social Security stops once a
  // worker's wages for the year pass the wage base, while Medicare has no
  // cap but adds a surtax above the Additional Medicare Tax threshold. That
  // threshold is a household (filing-status) amount, not per-worker, and
  // unlike the brackets above it isn't inflation-adjusted by law. Defaults
  // to current tax-year figures for a single filer.
  socialSecurityTaxRatePct: number
  socialSecurityWageBase: number
  medicareTaxRatePct: number
  additionalMedicareTaxRatePct: number
  additionalMedicareTaxThreshold: number
  // Required minimum distributions from pre-tax accounts (401(k)/IRA — not
  // Roth). rmdStartAge is the age at which they begin — defaulted here to 75,
  // SECURE 2.0's age for anyone born 1960 or later; it's 73 for those born
  // 1951-1959, so adjust it if that's your case. Each year's RMD is the
  // prior year-end pre-tax balance divided by the divisor for the owner's
  // age that year, read from rmdDivisors (the IRS Uniform Lifetime Table).
  // Both are editable rather than hard-coded so a law change, or a mistake
  // in the pre-filled defaults, can be corrected without a code change. Not
  // modeled: the Joint Life and Last Survivor Table (a smaller RMD that
  // applies only when a spouse more than 10 years younger is the sole
  // beneficiary) and inherited-account rules — every owner here uses the
  // Uniform Lifetime Table.
  rmdStartAge: number
  rmdDivisors: RmdDivisor[]
  // State income tax deductions keyed to contributions into a specific
  // account type, e.g. Kansas's 529 contribution deduction. Generic rather
  // than hardcoded to any one state or account, but only one entry is
  // expected to be in use today. Each year, the lesser of that year's actual
  // contributions to `account` and `perBeneficiaryCap * beneficiaryCount` is
  // subtracted from state (never federal) taxable income; unused amounts do
  // not carry forward to future years.
  stateContributionDeductions: StateContributionDeduction[]
  balances: {
    self: OwnedAccountBalances
    spouse: OwnedAccountBalances
    shared: SharedAccountBalances
  }
  // Named years (e.g. "Retirement") that a range's start/end can link to,
  // so changing the special year's value updates every range that uses it.
  specialYears: SpecialYear[]
  // Named dollar amounts, reusable from any income/spending/savings line —
  // e.g. a variable "Regular spending" = $120,000 that a spending line can
  // reference as a yearly or monthly figure. The single source of truth for
  // a dollar value; a line can also skip this and hold its own custom amount.
  variables: Variable[]
  // Named, parameterized formulas (e.g. raise(base, pct) = base * (1 + pct /
  // 100)) callable by name from any formula below, including a Variable's
  // own formula source — see formula.ts's FormulaFunctionsContext. A
  // function's body sees only its own params as scope, not this catalog.
  functions: CustomFunction[]
  // User-defined pass/fail checks tracked alongside the built-in "don't run
  // out of money before death" goal — see Goal above.
  goals: Goal[]
  // User-defined numerical formulas tracked per year, summarized as an
  // average (year-by-year projection) or a distribution across runs
  // (simulation) — see Metric above.
  metrics: Metric[]
  // Each domain has its own independent set of year ranges — they don't need
  // to share boundaries, so e.g. your income ranges can differ from your
  // savings ranges.
  incomeRanges: IncomePlanRange[]
  spendingRanges: SpendingPlanRange[]
  savingsRanges: SavingsPlanRange[]
  withdrawalRanges: WithdrawalPlanRange[]
  // Elective transfers from pre-tax to Roth ("Roth conversions"), e.g. to fill
  // up a low tax bracket in early retirement before Social Security/RMDs
  // start. Applied before the withdrawal waterfall, and never subject to the
  // early-withdrawal penalty.
  rothConversionRanges: RothConversionPlanRange[]
  // Per-year choice of whether the taxable brokerage's dividends (see
  // dividendYieldRatePct) are reinvested or paid out as cash. Unlike the
  // ranges above, these must NOT overlap — only one policy can apply to a
  // given year — see findOverlappingRangeIds. A year not covered by any
  // range defaults to 'reinvest'.
  dividendPolicyRanges: DividendPolicyPlanRange[]
  expectedReturnRatePct: number
  // The taxable brokerage's assumed annual dividend yield — carved out of
  // the account's total growth (not added on top), so its balance is
  // unchanged when this is 0. Unlike expectedReturnRatePct, this is a plain
  // fraction of the account's current balance, not a real rate recombined
  // with inflation — a yield is a ratio of dividends to current price,
  // which doesn't itself drift with inflation the way a compounding return
  // does. Dividends are taxed as long-term capital gains the year they're
  // paid, whether reinvested or taken as cash — see runProjection.
  dividendYieldRatePct: number
  // The high-yield savings account's real interest rate — like
  // expectedReturnRatePct, net of inflation, and recombined with it each year
  // to get the nominal rate the balance actually earns. Interest is taxed as
  // ordinary income the year it's earned (a 1099-INT, not deferred like the
  // taxable brokerage's capital gains), so it's computed off the balance the
  // account opened the year with — see runProjection.
  hysaRealReturnRatePct: number
  inflationRatePct: number
  socialSecurity: SocialSecurityInputs
}

// Whether an owner's benefit is entered directly from their SSA statement, or
// built up from a full year-by-year earnings history the same way SSA itself
// computes it (Average Indexed Monthly Earnings -> Primary Insurance Amount).
export type SocialSecurityBenefitMethod = 'estimate' | 'earningsHistory'

// One calendar year of Social-Security-taxable wages, entered by hand —
// SSA's own "my Social Security" statement has this exact table. Years not
// present here (or entered as 0) count as $0 toward the 35-year average,
// same as SSA's own treatment of a short work history.
export interface SocialSecurityEarningsYear {
  id: string
  year: number
  earnings: number
}

// SSA's National Average Wage Index, published yearly — used to "wage-index"
// each year of earnings history to roughly age-60 dollars before averaging,
// and to derive that year's PIA bend points. A different series from
// inflationRatePct/CPI; historically grows faster than CPI over long spans.
export interface AwiYear {
  id: string
  year: number
  index: number
}

// Full Retirement Age by birth year, in total months (e.g. 792 = 66 years),
// same lookup-by-year shape as RmdDivisor's lookup-by-age.
export interface FraRow {
  id: string
  birthYear: number
  fraMonths: number
}

export interface SocialSecurityOwnerConfig {
  // Age benefits are claimed, in years — fractional allowed (e.g. 62.5),
  // same convention as the 59.5 early-withdrawal-penalty cutoff elsewhere.
  claimingAge: number
  benefitMethod: SocialSecurityBenefitMethod
  // "estimate" method: the monthly benefit straight from an SSA statement,
  // and the age SSA calculated it for — needed to back out this owner's PIA
  // so a different claiming age can still be modeled.
  estimatedMonthlyBenefit: number
  estimatedBenefitAge: number
  // "earningsHistory" method: manually entered actual past years.
  earningsHistory: SocialSecurityEarningsYear[]
  // "earningsHistory" method: which of inputs.variables count as this
  // owner's Social-Security-taxable wages for years not yet entered above
  // (today through claiming age) — referenced by id, same pattern as
  // MatchConfig.wageVariableId. Those variables' projected income-allocation
  // amounts (from incomeRanges, capped at each year's wage base) fill in the
  // future years of the earnings history automatically.
  wageVariableIds: string[]
}

export interface SocialSecurityInputs {
  self: SocialSecurityOwnerConfig
  spouse: SocialSecurityOwnerConfig
  awiTable: AwiYear[]
  // Assumed future AWI growth, used to extrapolate wage-indexing and bend
  // points beyond the last year in awiTable (e.g. for a bend-point year that
  // hasn't happened yet, or a claiming age for someone who hasn't turned 60).
  awiGrowthRatePct: number
  fullRetirementAgeTable: FraRow[]
  // The early/delayed retirement adjustment, as three editable flat monthly
  // rates rather than a ~100-row table by months-from-FRA: reduction for the
  // first 36 months claimed early, a smaller reduction for further months
  // early, and a credit per month claimed late (up to age 70).
  earlyReductionRateFirst36MonthsPct: number
  earlyReductionRateBeyond36MonthsPct: number
  delayedCreditRatePct: number
  // Annual cost-of-living adjustment applied to a claimed benefit. Defaults
  // to inputs.inflationRatePct when null — historically close to CPI but not
  // identical, so overridable.
  colaRatePctOverride: number | null
  // Up to 85% of a Social Security benefit is federally taxable via a
  // "provisional income" test against these thresholds — flat dollar
  // amounts, NOT indexed for inflation by law (unchanged since 1984), same
  // treatment as additionalMedicareTaxThreshold. marriedFilingJointly is
  // used whenever spouseEnabled is on.
  provisionalIncomeThresholds: {
    single: { lower: number; upper: number }
    marriedFilingJointly: { lower: number; upper: number }
  }
  // Most states don't tax Social Security benefits at all — off by default.
  // When on, the same federally-taxable amount is added to state ordinary
  // income too (this app has no per-state provisional-income rule set).
  stateTaxesSocialSecurity: boolean
}

export interface SpecialYear {
  id: string
  name: string
  // The resolved absolute calendar year, same as a plan range's bounds. When
  // baseSpecialYearId is set, this is kept in sync with that special year's
  // own resolved value plus the offset, instead of being edited directly —
  // chains are allowed (a special year can be based on one that's itself
  // based on another), but circular references are not.
  year: number
  baseSpecialYearId: string | null
  baseSpecialYearOffset: number
}

// One marginal-rate tier of a tax bracket schedule. Brackets are given as a
// flat list rather than nested min/max pairs — a bracket's upper bound is
// implicitly the next-higher bracket's min, and the last bracket has no cap.
export interface TaxBracket {
  id: string
  // Taxable income at which this bracket begins (inclusive), in dollars.
  min: number
  // Marginal rate applied to income within this bracket, as a percent (e.g.
  // 22 for 22%).
  ratePct: number
}

// One row of the IRS Uniform Lifetime Table: the distribution period to
// divide a pre-tax balance by, for an owner who reaches `age` this year.
// Ages above the table's highest row use that row's divisor (the IRS table
// itself is open-ended at the top, "and over").
export interface RmdDivisor {
  id: string
  age: number
  divisor: number
}

// A state income tax deduction sized to contributions into a specific
// account type, e.g. Kansas's 529 deduction. `perBeneficiaryCap` is a flat
// dollar figure (not inflation-scaled), matching how the contribution
// amounts it's compared against are also held flat.
export interface StateContributionDeduction {
  id: string
  name: string
  account: AccountType
  perBeneficiaryCap: number
  beneficiaryCount: number
}

export type AccountType = 'preTax' | 'roth' | 'taxable' | 'hsa' | 'cash' | 'hysa' | 'college529'

export type Owner = 'self' | 'spouse'

export interface MatchTier {
  id: string
  // Width of this tier, as a percent of salary, e.g. 3 for "the first 3% of pay".
  salaryPercent: number
  // Percent matched by the employer for that portion, e.g. 100 or 50.
  matchPercent: number
}

export interface MatchConfig {
  // References a Variable; the tier percentages are calculated against
  // whatever amount that variable currently holds. A custom (non-variable)
  // income line has no stable cross-range identity to sum a salary against,
  // so it can't back a match — only a Variable can.
  wageVariableId: string | null
  // Applied in order: the first tier's slice of salary, then the next, etc.
  tiers: MatchTier[]
  // Which account the match itself lands in, e.g. a 401k plan that always
  // deposits its match pre-tax even when the employee elects Roth. null
  // means "same account as this line's own contribution" — also how
  // scenarios saved before this field existed behave, so it's read as
  // `?? line.account` wherever it's consumed.
  account: AccountType | null
}

// How a Variable's own dollar amount is supplied: a flat number, or a
// formula over other variables (referenced by name, e.g. "0.1 * salary") —
// see resolveVariableAmounts in variables.ts, which resolves the resulting
// dependency graph (and catches circular references) once per variables
// list.
export type VariableSource = { kind: 'custom'; amount: number } | { kind: 'formula'; expression: string }

// A named amount, reusable from any income/spending/savings line. Not
// necessarily a dollar figure — it may back a formula elsewhere that derives
// a percentage, a count, or any other quantity — so it carries no currency
// formatting or inflation-adjustment assumption of its own. A use that
// treats it as a dollar amount (see AmountSource's 'variable' kind) decides
// inflation-adjustment there, per use.
export interface Variable {
  id: string
  name: string
  source: VariableSource
}

// A named, parameterized formula, callable by name (e.g. "raise(salary, 3)")
// from any formula elsewhere — a Variable's own formula source, an
// income/spending/savings/withdrawal line, a goal, or a condition. `params`
// is the function's ENTIRE scope when its own `expression` is evaluated — it
// deliberately can't see the Variables catalog or the calling formula's
// scope, so its result only ever depends on the arguments passed in. See
// formula.ts's FormulaFunctionsContext/buildFormulaFunctions.
export interface CustomFunction {
  id: string
  name: string
  params: string[]
  expression: string
}

// A user-defined pass/fail check against the projection, e.g. "Leave an
// inheritance" = netWorth > 100000. Evaluated once per projected year (see
// runProjection's goalScope/YearProjectionRow.goalResults) against that
// year's netWorth/unfunded plus the same year/age/spouseAge/variable/special
// year names available to any other condition — a goal is "met" only if its
// formula holds in every projected year (an invariant, same idea as "never
// run out of money"), so a one-time milestone like an age-65 balance check
// needs writing as an implication, e.g. "age < 65 || netWorth > 500000". A
// blank expression has no goal to check yet, so it's skipped rather than
// counted as met or failed — see GoalPanel.
export interface Goal {
  id: string
  name: string
  expression: string
}

// A user-defined numerical formula, e.g. "Average annual spending" =
// spending. Evaluated once per projected year (see runProjection's
// goalScope/YearProjectionRow.metricResults), against the same
// year/age/spouseAge/netWorth/unfunded/variable/special year names a Goal
// formula sees. Unlike a Goal, a Metric has no pass/fail notion — the
// year-by-year projection reports the average of its per-year values, and a
// simulation reports the distribution (mean/worst/percentiles/best) of each
// run's own average — see metricAverageInRun and GoalPanel.
export interface Metric {
  id: string
  name: string
  expression: string
}

export type Frequency = 'monthly' | 'yearly'

// How a line item's dollar amount is supplied: a reference to a Variable
// (whose resolved amount is read live, so it can never drift from the
// variable — but a Variable isn't necessarily a dollar figure, so this kind
// carries its own inflation flag, same as 'custom'/'formula' below), a
// one-off custom amount with its own inflation flag, or a formula over the
// variables catalog (its own inflation flag, same reasoning). Either way,
// `frequency` says whether the number is a monthly or yearly figure — chosen
// per line, not per variable, so the same variable can be used as a yearly
// amount in one place and monthly in another.
export type AmountSource =
  | { kind: 'variable'; variableId: string; inflationAdjusted: boolean; frequency: Frequency }
  | { kind: 'custom'; amount: number; inflationAdjusted: boolean; frequency: Frequency }
  | { kind: 'formula'; expression: string; inflationAdjusted: boolean; frequency: Frequency }
  // No fixed periodic amount of its own — only meaningful on a SavingsLine
  // with a `goal`, where it means "contribute whatever it takes to reach the
  // goal," rather than being bounded by a per-period figure. No frequency or
  // inflation flag: neither applies to an amount that isn't periodic (the
  // goal's own inflationAdjusted flag already governs the target it fills
  // toward). Without a goal it's a no-op (contributes nothing of its own).
  | { kind: 'unlimited' }

// A point-in-time target balance — like AmountSource but with no `frequency`,
// since a goal is "reach $X", not "$X per year/month".
export type GoalTarget =
  | { kind: 'variable'; variableId: string; inflationAdjusted: boolean }
  | { kind: 'custom'; amount: number; inflationAdjusted: boolean }
  | { kind: 'formula'; expression: string; inflationAdjusted: boolean }

// A savings line, defined directly inside the range it applies to — there's
// no catalog to draw from (see SavingsPlanRange below). Its account/owner/
// match/source live and are edited entirely within that one range.
export interface SavingsLine {
  id: string
  name: string
  account: AccountType
  // Which spouse owns this account. Only meaningful when spouse mode is on
  // and account is 'preTax' or 'roth' — taxable/hsa/cash/hysa accounts are always
  // combined, so this is ignored (and irrelevant) for those.
  owner: Owner
  // Employer match policy for this line, if any.
  match: MatchConfig | null
  source: AmountSource
  // Contributions to this line stop once its account balance reaches this
  // target; any amount that would have exceeded it cascades to fund the next
  // line(s) in this range's list instead (see runProjection's savings pass).
  // Optional for backward compatibility with scenarios saved before this
  // field existed — read as `?? null` wherever it's consumed.
  goal?: GoalTarget | null
  // Boolean formula gating whether this line applies in a given year (e.g.
  // "year < 2040"), evaluated against the normal Variable scope plus an
  // injected `year`. null/undefined/empty = always applies (subject only to
  // the enclosing range's own startYear/endYear). Optional for backward
  // compatibility; read as `?? null` wherever it's consumed.
  condition?: string | null
}

// A named line item inside a plan range — e.g. "Base" spending $120,000/year,
// sourced from a Variable or a custom one-off amount (see AmountSource).
export interface IncomeAllocation {
  id: string
  name: string
  source: AmountSource
}

export interface SpendingAllocation {
  id: string
  name: string
  source: AmountSource
  // Marks this line's spending as a qualified education expense, so a 529
  // withdrawal can cover it tax- and penalty-free. Optional for backward
  // compatibility with scenarios saved before this field existed — read as
  // `?? false` wherever it's consumed.
  educationRelated?: boolean
  // Marks this line's spending as a qualified medical expense, so an HSA
  // withdrawal can cover it tax-free. Optional for backward compatibility
  // with scenarios saved before this field existed — read as `?? false`
  // wherever it's consumed.
  medicalRelated?: boolean
  // Marks this line as a pre-tax payroll deduction (e.g. employer-sponsored
  // health insurance premiums) rather than an after-tax expense: it's still
  // counted normally in expenseTotal/committed (real money the household
  // doesn't have to spend elsewhere), but it's also subtracted from taxable
  // ordinary income and FICA wages (see runProjection's baseOrdinary/
  // payrollWages), since — unlike an ordinary expense paid out of already-
  // taxed take-home pay — this amount was never part of taxable wages to
  // begin with. Matches how a Section 125 cafeteria-plan deduction is
  // excluded from W-2 boxes 1, 3, and 5. Optional for backward compatibility
  // with scenarios saved before this field existed; read as `?? false`
  // wherever it's consumed.
  preTax?: boolean
}

// Shared by every domain's plan ranges. Ranges are always stored as actual
// calendar years (inclusive) so they stay unambiguous regardless of how the
// user chooses to display/enter them (calendar years vs. age, a display
// preference kept in localStorage). When a *SpecialYearId is set, that bound
// is kept in sync with the linked SpecialYear's value (plus its offset,
// e.g. -1 for "the year before") instead of being edited directly.
interface PlanRangeBounds {
  id: string
  startYear: number
  endYear: number
  startSpecialYearId: string | null
  startSpecialYearOffset: number
  endSpecialYearId: string | null
  endSpecialYearOffset: number
}

export interface IncomePlanRange extends PlanRangeBounds {
  allocations: IncomeAllocation[]
}

export interface SpendingPlanRange extends PlanRangeBounds {
  allocations: SpendingAllocation[]
}

export interface SavingsPlanRange extends PlanRangeBounds {
  // Ordered — the first line is funded first, then the next ("layered").
  // Defined directly on the range; no shared catalog to draw from.
  lines: SavingsLine[]
}

// One step of a withdrawal range's waterfall, defined directly on the range
// (no shared catalog — same as SavingsLine). When a year's income falls
// short, the shortfall is drawn from each applicable line in order until
// it's covered; see planWithdrawals in withdrawals.ts. The same account may
// appear more than once, e.g. HSA for qualified medical spending near the
// top and whatever's left of it at the bottom.
export interface WithdrawalLine {
  id: string
  name: string
  account: AccountType
  // Which spouse owns this account. Only meaningful when spouse mode is on
  // and account is 'preTax' or 'roth' — every other account is combined.
  owner: Owner
  // The most this line draws in a year. { kind: 'unlimited' } means no cap:
  // draw whatever the remaining shortfall needs.
  source: AmountSource
  // HSA/529 only: cap this line's draw at what's left of this year's
  // qualified medical/education spending, so the whole draw is tax- and
  // penalty-free. Ignored for other accounts. Optional; read as `?? false`.
  qualifiedOnly?: boolean
  // Never draw the account below this balance, e.g. to keep an emergency
  // reserve. Optional; read as `?? null`.
  floor?: GoalTarget | null
  // Boolean formula gating whether this line applies in a given year — same
  // semantics as SavingsLine.condition. Optional; read as `?? null`.
  condition?: string | null
}

// Unlike income/spending/savings ranges, withdrawal ranges must NOT overlap —
// two ordered waterfalls can't be combined — see findOverlappingRangeIds. A
// year not covered by any range uses DEFAULT_WITHDRAWAL_ORDER. Required
// minimum distributions are always taken first, ahead of these lines.
export interface WithdrawalPlanRange extends PlanRangeBounds {
  // Ordered — the first line is drawn first, then the next.
  lines: WithdrawalLine[]
}

// A Roth conversion range's per-owner amount — like AmountSource, but always
// a single annual dollar figure (so no frequency), unlike a periodic income/
// spending/savings amount. Carries its own inflationAdjusted flag, same as
// AmountSource/GoalTarget, so a conversion amount given in today's dollars
// can optionally grow with inflation like those do, rather than always
// holding flat.
export type RothConversionAmount =
  | { kind: 'variable'; variableId: string; inflationAdjusted: boolean }
  | { kind: 'custom'; amount: number; inflationAdjusted: boolean }
  | { kind: 'formula'; expression: string; inflationAdjusted: boolean }

// How much to convert from pre-tax to Roth each year this range is active,
// per owner. amountSpouse is only meaningful (and only shown) when spouse
// mode is on; it's otherwise ignored by the projection.
export interface RothConversionPlanRange extends PlanRangeBounds {
  amountSelf: RothConversionAmount
  amountSpouse: RothConversionAmount
}

export type DividendPolicy = 'reinvest' | 'cash'

// Whether the taxable brokerage's dividends are reinvested or paid out as
// cash during this range of years. Unlike every other *PlanRange above,
// these ranges must not overlap — a year has exactly one policy, so an
// overlap is a validation error (see findOverlappingRangeIds) rather than
// something that resolves by combining both.
export interface DividendPolicyPlanRange extends PlanRangeBounds {
  policy: DividendPolicy
}

export interface ScenarioSummary {
  name: string
  updatedAt: string
}

export interface ScenarioRecord extends ScenarioSummary {
  inputs: RetirementInputs
}

const EMPTY_OWNED_BALANCES: OwnedAccountBalances = { preTax: 0, roth: 0, rothBasis: 0 }
const EMPTY_SHARED_BALANCES: SharedAccountBalances = {
  taxable: 0,
  hsa: 0,
  cash: 0,
  hysa: 0,
  taxableBasis: 0,
  college529: 0,
  college529Basis: 0,
}

// 2026 IRS federal income tax brackets for a single filer (Rev. Proc.
// 2025-32). Married-filing-jointly filers roughly double each threshold —
// edit the brackets below to match once spouse mode is on.
const DEFAULT_FEDERAL_TAX_BRACKETS: TaxBracket[] = [
  { id: 'fed-10', min: 0, ratePct: 10 },
  { id: 'fed-12', min: 12_400, ratePct: 12 },
  { id: 'fed-22', min: 50_400, ratePct: 22 },
  { id: 'fed-24', min: 105_700, ratePct: 24 },
  { id: 'fed-32', min: 201_775, ratePct: 32 },
  { id: 'fed-35', min: 256_225, ratePct: 35 },
  { id: 'fed-37', min: 640_600, ratePct: 37 },
]
const DEFAULT_FEDERAL_STANDARD_DEDUCTION = 16_100

// 2026 federal long-term capital gains brackets for a single filer (Rev. Proc.
// 2025-32). Same convention as the ordinary brackets above: each entry's
// ceiling is the next entry's min. These thresholds are measured against
// ordinary taxable income plus gains, since gains stack on top.
const DEFAULT_FEDERAL_CAPITAL_GAINS_BRACKETS: TaxBracket[] = [
  { id: 'fed-cg-0', min: 0, ratePct: 0 },
  { id: 'fed-cg-15', min: 49_450, ratePct: 15 },
  { id: 'fed-cg-20', min: 545_500, ratePct: 20 },
]

const DEFAULT_RMD_START_AGE = 75

// IRS Uniform Lifetime Table (Pub 590-B, effective 2022) — transcribed from
// memory rather than fetched, so it's worth checking against irs.gov before
// relying on it; that's also the reason this is editable data rather than a
// hard-coded formula.
const DEFAULT_RMD_DIVISORS: RmdDivisor[] = [
  { id: 'rmd-72', age: 72, divisor: 27.4 },
  { id: 'rmd-73', age: 73, divisor: 26.5 },
  { id: 'rmd-74', age: 74, divisor: 25.5 },
  { id: 'rmd-75', age: 75, divisor: 24.6 },
  { id: 'rmd-76', age: 76, divisor: 23.7 },
  { id: 'rmd-77', age: 77, divisor: 22.9 },
  { id: 'rmd-78', age: 78, divisor: 22.0 },
  { id: 'rmd-79', age: 79, divisor: 21.1 },
  { id: 'rmd-80', age: 80, divisor: 20.2 },
  { id: 'rmd-81', age: 81, divisor: 19.4 },
  { id: 'rmd-82', age: 82, divisor: 18.5 },
  { id: 'rmd-83', age: 83, divisor: 17.7 },
  { id: 'rmd-84', age: 84, divisor: 16.8 },
  { id: 'rmd-85', age: 85, divisor: 16.0 },
  { id: 'rmd-86', age: 86, divisor: 15.2 },
  { id: 'rmd-87', age: 87, divisor: 14.4 },
  { id: 'rmd-88', age: 88, divisor: 13.7 },
  { id: 'rmd-89', age: 89, divisor: 12.9 },
  { id: 'rmd-90', age: 90, divisor: 12.2 },
  { id: 'rmd-91', age: 91, divisor: 11.5 },
  { id: 'rmd-92', age: 92, divisor: 10.8 },
  { id: 'rmd-93', age: 93, divisor: 10.1 },
  { id: 'rmd-94', age: 94, divisor: 9.5 },
  { id: 'rmd-95', age: 95, divisor: 8.9 },
  { id: 'rmd-96', age: 96, divisor: 8.4 },
  { id: 'rmd-97', age: 97, divisor: 7.8 },
  { id: 'rmd-98', age: 98, divisor: 7.3 },
  { id: 'rmd-99', age: 99, divisor: 6.8 },
  { id: 'rmd-100', age: 100, divisor: 6.4 },
  { id: 'rmd-101', age: 101, divisor: 6.0 },
  { id: 'rmd-102', age: 102, divisor: 5.6 },
  { id: 'rmd-103', age: 103, divisor: 5.2 },
  { id: 'rmd-104', age: 104, divisor: 4.9 },
  { id: 'rmd-105', age: 105, divisor: 4.6 },
  { id: 'rmd-106', age: 106, divisor: 4.3 },
  { id: 'rmd-107', age: 107, divisor: 4.1 },
  { id: 'rmd-108', age: 108, divisor: 3.9 },
  { id: 'rmd-109', age: 109, divisor: 3.7 },
  { id: 'rmd-110', age: 110, divisor: 3.5 },
  { id: 'rmd-111', age: 111, divisor: 3.4 },
  { id: 'rmd-112', age: 112, divisor: 3.3 },
  { id: 'rmd-113', age: 113, divisor: 3.1 },
  { id: 'rmd-114', age: 114, divisor: 3.0 },
  { id: 'rmd-115', age: 115, divisor: 2.9 },
  { id: 'rmd-116', age: 116, divisor: 2.8 },
  { id: 'rmd-117', age: 117, divisor: 2.7 },
  { id: 'rmd-118', age: 118, divisor: 2.5 },
  { id: 'rmd-119', age: 119, divisor: 2.3 },
  { id: 'rmd-120', age: 120, divisor: 2.0 },
]

// SSA's National Average Wage Index, 1951-2023 — transcribed from memory
// rather than fetched, so (like the RMD table above) it's worth checking
// against ssa.gov before relying on it; that's also why it's editable rather
// than hard-coded. Years beyond the last entry are extrapolated using
// awiGrowthRatePct (see awiForYear in socialSecurity.ts) — worth keeping this
// table's last entry as current as possible (AWI is published with roughly a
// two-year lag), since every added real year is one fewer year of guessing.
const DEFAULT_AWI_TABLE: AwiYear[] = [
  { id: 'awi-1951', year: 1951, index: 2_799.16 },
  { id: 'awi-1952', year: 1952, index: 2_973.32 },
  { id: 'awi-1953', year: 1953, index: 3_139.44 },
  { id: 'awi-1954', year: 1954, index: 3_155.64 },
  { id: 'awi-1955', year: 1955, index: 3_301.44 },
  { id: 'awi-1956', year: 1956, index: 3_532.36 },
  { id: 'awi-1957', year: 1957, index: 3_641.72 },
  { id: 'awi-1958', year: 1958, index: 3_673.80 },
  { id: 'awi-1959', year: 1959, index: 3_855.80 },
  { id: 'awi-1960', year: 1960, index: 4_007.12 },
  { id: 'awi-1961', year: 1961, index: 4_086.76 },
  { id: 'awi-1962', year: 1962, index: 4_291.40 },
  { id: 'awi-1963', year: 1963, index: 4_396.64 },
  { id: 'awi-1964', year: 1964, index: 4_576.32 },
  { id: 'awi-1965', year: 1965, index: 4_658.72 },
  { id: 'awi-1966', year: 1966, index: 4_938.36 },
  { id: 'awi-1967', year: 1967, index: 5_213.44 },
  { id: 'awi-1968', year: 1968, index: 5_571.76 },
  { id: 'awi-1969', year: 1969, index: 5_893.76 },
  { id: 'awi-1970', year: 1970, index: 6_186.24 },
  { id: 'awi-1971', year: 1971, index: 6_497.08 },
  { id: 'awi-1972', year: 1972, index: 7_133.80 },
  { id: 'awi-1973', year: 1973, index: 7_580.16 },
  { id: 'awi-1974', year: 1974, index: 8_030.76 },
  { id: 'awi-1975', year: 1975, index: 8_630.92 },
  { id: 'awi-1976', year: 1976, index: 9_226.48 },
  { id: 'awi-1977', year: 1977, index: 9_779.44 },
  { id: 'awi-1978', year: 1978, index: 10_556.03 },
  { id: 'awi-1979', year: 1979, index: 11_479.46 },
  { id: 'awi-1980', year: 1980, index: 12_513.46 },
  { id: 'awi-1981', year: 1981, index: 13_773.10 },
  { id: 'awi-1982', year: 1982, index: 14_531.34 },
  { id: 'awi-1983', year: 1983, index: 15_239.24 },
  { id: 'awi-1984', year: 1984, index: 16_135.07 },
  { id: 'awi-1985', year: 1985, index: 16_822.51 },
  { id: 'awi-1986', year: 1986, index: 17_321.82 },
  { id: 'awi-1987', year: 1987, index: 18_426.51 },
  { id: 'awi-1988', year: 1988, index: 19_334.04 },
  { id: 'awi-1989', year: 1989, index: 20_099.55 },
  { id: 'awi-1990', year: 1990, index: 21_027.98 },
  { id: 'awi-1991', year: 1991, index: 21_811.60 },
  { id: 'awi-1992', year: 1992, index: 22_935.42 },
  { id: 'awi-1993', year: 1993, index: 23_132.67 },
  { id: 'awi-1994', year: 1994, index: 23_753.53 },
  { id: 'awi-1995', year: 1995, index: 24_705.66 },
  { id: 'awi-1996', year: 1996, index: 25_913.90 },
  { id: 'awi-1997', year: 1997, index: 27_426.00 },
  { id: 'awi-1998', year: 1998, index: 28_861.44 },
  { id: 'awi-1999', year: 1999, index: 30_469.84 },
  { id: 'awi-2000', year: 2000, index: 32_154.82 },
  { id: 'awi-2001', year: 2001, index: 32_921.92 },
  { id: 'awi-2002', year: 2002, index: 33_252.09 },
  { id: 'awi-2003', year: 2003, index: 34_064.95 },
  { id: 'awi-2004', year: 2004, index: 35_648.55 },
  { id: 'awi-2005', year: 2005, index: 36_952.94 },
  { id: 'awi-2006', year: 2006, index: 38_651.41 },
  { id: 'awi-2007', year: 2007, index: 40_405.48 },
  { id: 'awi-2008', year: 2008, index: 41_334.97 },
  { id: 'awi-2009', year: 2009, index: 40_711.61 },
  { id: 'awi-2010', year: 2010, index: 41_673.83 },
  { id: 'awi-2011', year: 2011, index: 42_979.61 },
  { id: 'awi-2012', year: 2012, index: 44_321.67 },
  { id: 'awi-2013', year: 2013, index: 44_888.16 },
  { id: 'awi-2014', year: 2014, index: 46_481.52 },
  { id: 'awi-2015', year: 2015, index: 48_098.63 },
  { id: 'awi-2016', year: 2016, index: 48_642.15 },
  { id: 'awi-2017', year: 2017, index: 50_321.89 },
  { id: 'awi-2018', year: 2018, index: 52_145.80 },
  { id: 'awi-2019', year: 2019, index: 54_099.99 },
  { id: 'awi-2020', year: 2020, index: 55_628.60 },
  { id: 'awi-2021', year: 2021, index: 60_575.07 },
  { id: 'awi-2022', year: 2022, index: 63_795.13 },
  { id: 'awi-2023', year: 2023, index: 66_621.80 },
]

// SSA's Full Retirement Age by birth year (66 for 1943-1954, stepping up two
// months per birth year to 67 for 1960 and later).
const DEFAULT_FRA_TABLE: FraRow[] = [
  { id: 'fra-1937', birthYear: 1937, fraMonths: 780 },
  { id: 'fra-1938', birthYear: 1938, fraMonths: 782 },
  { id: 'fra-1939', birthYear: 1939, fraMonths: 784 },
  { id: 'fra-1940', birthYear: 1940, fraMonths: 786 },
  { id: 'fra-1941', birthYear: 1941, fraMonths: 788 },
  { id: 'fra-1942', birthYear: 1942, fraMonths: 790 },
  { id: 'fra-1943', birthYear: 1943, fraMonths: 792 },
  { id: 'fra-1955', birthYear: 1955, fraMonths: 794 },
  { id: 'fra-1956', birthYear: 1956, fraMonths: 796 },
  { id: 'fra-1957', birthYear: 1957, fraMonths: 798 },
  { id: 'fra-1958', birthYear: 1958, fraMonths: 800 },
  { id: 'fra-1959', birthYear: 1959, fraMonths: 802 },
  { id: 'fra-1960', birthYear: 1960, fraMonths: 804 },
]

function defaultSocialSecurityOwnerConfig(): SocialSecurityOwnerConfig {
  return {
    claimingAge: 67,
    benefitMethod: 'estimate',
    estimatedMonthlyBenefit: 0,
    estimatedBenefitAge: 67,
    earningsHistory: [],
    wageVariableIds: [],
  }
}

const DEFAULT_SOCIAL_SECURITY: SocialSecurityInputs = {
  self: defaultSocialSecurityOwnerConfig(),
  spouse: defaultSocialSecurityOwnerConfig(),
  awiTable: DEFAULT_AWI_TABLE,
  awiGrowthRatePct: 3.5,
  fullRetirementAgeTable: DEFAULT_FRA_TABLE,
  earlyReductionRateFirst36MonthsPct: 5 / 9,
  earlyReductionRateBeyond36MonthsPct: 5 / 12,
  delayedCreditRatePct: 2 / 3,
  colaRatePctOverride: null,
  // 1984 figures — fixed by law, never inflation-adjusted.
  provisionalIncomeThresholds: {
    single: { lower: 25_000, upper: 34_000 },
    marriedFilingJointly: { lower: 32_000, upper: 44_000 },
  },
  stateTaxesSocialSecurity: false,
}

export const DEFAULT_INPUTS: RetirementInputs = {
  birthDate: defaultBirthDate(35),
  spouseEnabled: false,
  spouseBirthDate: defaultBirthDate(35),
  lifeExpectancy: 95,
  federalTaxBrackets: DEFAULT_FEDERAL_TAX_BRACKETS,
  federalStandardDeduction: DEFAULT_FEDERAL_STANDARD_DEDUCTION,
  federalBracketsInflationAdjusted: true,
  stateName: '',
  stateTaxBrackets: [],
  stateStandardDeduction: 0,
  statePersonalExemption: 0,
  stateBracketsInflationAdjusted: true,
  federalCapitalGainsBrackets: DEFAULT_FEDERAL_CAPITAL_GAINS_BRACKETS,
  stateHasSeparateCapitalGainsRates: false,
  stateCapitalGainsBrackets: [],
  socialSecurityTaxRatePct: 6.2,
  socialSecurityWageBase: 184_500,
  medicareTaxRatePct: 1.45,
  additionalMedicareTaxRatePct: 0.9,
  additionalMedicareTaxThreshold: 200_000,
  rmdStartAge: DEFAULT_RMD_START_AGE,
  rmdDivisors: DEFAULT_RMD_DIVISORS,
  stateContributionDeductions: [],
  balances: {
    self: { ...EMPTY_OWNED_BALANCES },
    spouse: { ...EMPTY_OWNED_BALANCES },
    shared: { ...EMPTY_SHARED_BALANCES },
  },
  specialYears: [],
  variables: [],
  functions: [],
  goals: [],
  metrics: [],
  incomeRanges: [],
  spendingRanges: [],
  savingsRanges: [],
  withdrawalRanges: [],
  rothConversionRanges: [],
  dividendPolicyRanges: [],
  expectedReturnRatePct: 7,
  dividendYieldRatePct: 1.5,
  hysaRealReturnRatePct: 0,
  inflationRatePct: 3,
  socialSecurity: DEFAULT_SOCIAL_SECURITY,
}
