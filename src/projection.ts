import { birthYear, deathYear as computeDeathYear, hasReachedAgeDuringYear } from './age'
import { calculateMatchAmount } from './match'
import { benefitScheduleForOwner, taxableSocialSecurityBenefit } from './socialSecurity'
import { bracketBreakdown, computeIncomeTaxes, prepareTaxSchedules, scaleTaxSchedules } from './tax'
import type { BracketBreakdownEntry } from './tax'
import type {
  AccountType,
  IncomeAllocation,
  IncomeSourceDef,
  RetirementInputs,
  RmdDivisor,
  RothConversionPlanRange,
  SavingsLineDef,
  SpendingAllocation,
  SpendingBucketDef,
} from './types'
import {
  applyWithdrawalPlan,
  planWithdrawals,
  snapshotSources,
  type OrdinaryIncomeAccountKey,
  type WithdrawalBalances,
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
  // beyond what taxes/savings/spending used up, swept into the taxable
  // brokerage account. Usually 0 whenever withdrawals.total is non-zero (the
  // draw was sized to exactly cover the shortfall), except when a required
  // minimum distribution forces more out than the year actually needed.
  extraTaxableSavings: number
  // What the default withdrawal rule drew — a required minimum distribution
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
  // which is only what the default withdrawal rule drew.
  rothConversion: { total: number; self: number; spouse: number }

  // This year's high-yield savings interest — computed off the balance the
  // account opened the year with (see runProjection) and already folded into
  // ordinaryAgi/federalTax/stateTax above, same as wage income. Broken out
  // here purely for display, the same role rothConversion plays for taxes.
  hysaInterest: number

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

// Sum of one owner's requested conversion amount across every active range —
// ranges are additive, like income/spending/savings ranges, so two
// overlapping conversion ranges both apply.
function activeConversionAmount(
  ranges: RothConversionPlanRange[],
  year: number,
  owner: 'self' | 'spouse',
): number {
  return activeRanges(ranges, year).reduce(
    (total, r) => total + Math.max(0, owner === 'self' ? r.amountSelf : r.amountSpouse),
    0,
  )
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
  // A catalog-linked allocation is keyed by the def's id, so allocations
  // across overlapping/multiple ranges referencing the same def aggregate
  // together. A custom allocation has no def to share, so it's keyed by its
  // own id and stands alone.
  key: string
  name: string
  amount: number
  inflationAdjusted: boolean
}

// A custom allocation carries its own name/amount/inflation flag. A
// catalog-linked one has no stored amount of its own — it always reads the
// def's current values directly, so there's nothing that can go stale.
export function resolveIncomeAllocation(
  alloc: IncomeAllocation,
  defsById: Map<string, IncomeSourceDef>,
): ResolvedAllocation | null {
  if (alloc.custom) {
    return {
      key: alloc.id,
      name: alloc.custom.name,
      amount: alloc.custom.amount,
      inflationAdjusted: alloc.custom.inflationAdjusted,
    }
  }
  const def = alloc.sourceId ? defsById.get(alloc.sourceId) : undefined
  if (!def) return null
  return { key: def.id, name: def.name, amount: def.amount, inflationAdjusted: def.inflationAdjusted ?? true }
}

function resolveSpendingAllocation(
  alloc: SpendingAllocation,
  defsById: Map<string, SpendingBucketDef>,
): ResolvedAllocation | null {
  if (alloc.custom) {
    return {
      key: alloc.id,
      name: alloc.custom.name,
      amount: alloc.custom.amount,
      inflationAdjusted: alloc.custom.inflationAdjusted,
    }
  }
  const def = alloc.bucketId ? defsById.get(alloc.bucketId) : undefined
  if (!def) return null
  return { key: def.id, name: def.name, amount: def.amount, inflationAdjusted: def.inflationAdjusted ?? true }
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
}

type Balances = WithdrawalBalances

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

// Medical spending this year that an HSA withdrawal could cover tax-free.
// Nothing populates this yet — tracking qualified medical expenses is still
// ahead of us, and will most likely arrive as a flag on SpendingBucketDef, at
// which point only this function changes. Until then every HSA draw is
// non-qualified.
function qualifiedMedicalExpensesForYear(_inputs: RetirementInputs, _year: number): number {
  return 0
}

// Education spending this year a 529 withdrawal could cover tax-free — the
// sum of expenseByBucketMap's entries whose bucket def is flagged
// educationRelated. Custom (non-catalog) allocations are keyed by their own
// id in expenseByBucketMap, which never matches an entry in
// spendingBucketDefsById, so they're naturally excluded — only catalog
// buckets can be flagged as education-related today.
function qualifiedEducationExpensesForYear(
  expenseByBucketMap: Map<string, number>,
  spendingBucketDefsById: Map<string, SpendingBucketDef>,
): number {
  let total = 0
  for (const [bucketId, amount] of expenseByBucketMap) {
    if (spendingBucketDefsById.get(bucketId)?.educationRelated) total += amount
  }
  return total
}

// This year's total contributed into savings lines targeting `account` —
// generic over AccountType so it can back any StateContributionDeduction
// entry, not just the 529 case.
function contributionsForAccountType(
  account: AccountType,
  contributionByLine: Map<string, number>,
  savingsDefsById: Map<string, SavingsLineDef>,
): number {
  let total = 0
  for (const [lineId, amount] of contributionByLine) {
    if (savingsDefsById.get(lineId)?.account === account) total += amount
  }
  return total
}

// Which investment-account bucket a savings line's contributions land in —
// null for cash, which isn't tracked as an investment account.
function accountKeyFor(def: SavingsLineDef): InvestmentAccountKey | null {
  switch (def.account) {
    case 'preTax':
      return def.owner === 'spouse' ? 'preTaxSpouse' : 'preTaxSelf'
    case 'roth':
      return def.owner === 'spouse' ? 'rothSpouse' : 'rothSelf'
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

function applyContribution(
  balances: Balances,
  contributionsByAccount: Record<InvestmentAccountKey, number>,
  def: SavingsLineDef,
  contribution: number,
  match: number,
): void {
  const total = contribution + match
  if (total === 0) return
  switch (def.account) {
    case 'preTax':
      balances[def.owner].preTax += total
      break
    case 'roth':
      balances[def.owner].roth += total
      balances[def.owner].rothBasis += total
      break
    case 'taxable':
      balances.shared.taxable += total
      balances.shared.taxableBasis += total
      break
    case 'hsa':
      balances.shared.hsa += total
      break
    case 'college529':
      balances.shared.college529 += total
      balances.shared.college529Basis += total
      break
    case 'hysa':
      balances.shared.hysa += total
      break
    case 'cash':
      balances.shared.cash += total
      return
  }
  const key = accountKeyFor(def)
  if (key) contributionsByAccount[key] += total
}

// Steps the scenario forward one year at a time, from the current calendar
// year through death year. Each year: total up active income and expense
// allocations, fund the active savings plan (plus any employer match),
// then either sweep what's left into the taxable brokerage account or, if
// income fell short, cover the gap with the default withdrawal rule — cash,
// then high-yield savings, then taxable, then pre-tax, then Roth, then HSA,
// with the tax and penalties each draw triggers solved for by iteration.
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

  const incomeSourceDefsById = new Map(inputs.incomeSourceDefs.map((d) => [d.id, d]))
  const spendingBucketDefsById = new Map(inputs.spendingBucketDefs.map((d) => [d.id, d]))
  const savingsDefsById = new Map(inputs.savingsLineDefs.map((d) => [d.id, d]))

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

  for (let year = currentYear; year <= finalYear; year++) {
    const yearRates = rateOverridesByYear?.[year - currentYear]
    const yearReturnRatePct = yearRates?.realReturnRatePct ?? inputs.expectedReturnRatePct
    const yearInflationRatePct = yearRates?.inflationRatePct ?? inputs.inflationRatePct
    const growthRate = nominalGrowthRate(yearReturnRatePct, yearInflationRatePct)
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

    // --- Required minimum distributions ---
    // Captured before this year's contributions/growth touch the balance, so
    // this is last year's Dec-31 figure — what an RMD is actually sized off.
    const selfAge = selfBirthYear !== null ? year - selfBirthYear : null
    const spouseAgeForRmd = spouseBirthYearForRmd !== null ? year - spouseBirthYearForRmd : null
    const rmdSelf = requiredMinimumDistribution(inputs, balances.self.preTax, selfAge)
    const rmdSpouse = requiredMinimumDistribution(inputs, balances.spouse.preTax, spouseAgeForRmd)

    // --- Income ---
    const incomeBySourceMap = new Map<string, number>()
    const incomeNameByKey = new Map<string, string>()
    for (const range of activeRanges(inputs.incomeRanges, year)) {
      for (const alloc of range.allocations) {
        const resolved = resolveIncomeAllocation(alloc, incomeSourceDefsById)
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
    for (const range of activeRanges(inputs.spendingRanges, year)) {
      for (const alloc of range.allocations) {
        const resolved = resolveSpendingAllocation(alloc, spendingBucketDefsById)
        if (!resolved) continue
        const grown = resolved.inflationAdjusted ? resolved.amount * inflationFactor : resolved.amount
        expenseByBucketMap.set(resolved.key, (expenseByBucketMap.get(resolved.key) ?? 0) + grown)
        expenseNameByKey.set(resolved.key, resolved.name)
      }
    }
    const expenseTotal = sumValues(expenseByBucketMap)

    // --- Savings plan (line amounts have no inflation flag, so held flat) ---
    const contributionByLine = new Map<string, number>()
    for (const range of activeRanges(inputs.savingsRanges, year)) {
      for (const alloc of range.allocations) {
        if (!alloc.lineId || !savingsDefsById.has(alloc.lineId)) continue
        contributionByLine.set(alloc.lineId, (contributionByLine.get(alloc.lineId) ?? 0) + alloc.amount)
      }
    }

    let savingsEmployeeTotal = 0
    let savingsEmployerMatchTotal = 0
    let preTaxDeferrals = 0
    let hsaContributions = 0
    const savingsByLine: SavingsLineResult[] = []
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

    for (const [lineId, contribution] of contributionByLine) {
      const def = savingsDefsById.get(lineId)
      if (!def) continue
      const match = def.match?.incomeSourceId
        ? calculateMatchAmount(
            contribution,
            incomeBySourceMap.get(def.match.incomeSourceId) ?? 0,
            def.match.tiers,
          )
        : 0

      savingsEmployeeTotal += contribution
      savingsEmployerMatchTotal += match
      if (def.account === 'preTax') preTaxDeferrals += contribution
      if (def.account === 'hsa') hsaContributions += contribution

      applyContribution(balances, contributionsByAccount, def, contribution, match)
      savingsByLine.push({ id: lineId, name: def.name, contribution, match })
    }

    // --- State contribution-based deductions (e.g. Kansas's 529 deduction) ---
    // Non-carryforward: each year's deduction is capped independently against
    // that year's own contributions, with no banking of unused amounts.
    const stateContributionDeductionAmount = inputs.stateContributionDeductions.reduce((total, d) => {
      const contributed = contributionsForAccountType(d.account, contributionByLine, savingsDefsById)
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
    const conversionRequestedSelf = activeConversionAmount(inputs.rothConversionRanges, year, 'self')
    const conversionRequestedSpouse = activeConversionAmount(inputs.rothConversionRanges, year, 'spouse')
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
      qualifiedMedicalExpenses: qualifiedMedicalExpensesForYear(inputs, year),
      qualifiedEducationExpenses: qualifiedEducationExpensesForYear(expenseByBucketMap, spendingBucketDefsById),
      rmdSelf,
      rmdSpouse,
    }

    // How much of ssBenefitTotal is federally/state taxable, from the
    // provisional-income test — a function of baseOrdinary plus whatever the
    // withdrawal solver is drawing this pass, so (like plan.ordinaryIncome
    // and plan.capitalGains) it has to be re-derived every iteration, not
    // computed once up front.
    function taxableSocialSecurityFor(plan: { ordinaryIncome: number; capitalGains: number }) {
      const otherAGI = baseOrdinary + plan.ordinaryIncome + plan.capitalGains
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
          0,
          0,
          taxableSocialSecurityFor({ ordinaryIncome: 0, capitalGains: 0 }),
          stateContributionDeductionAmount,
        ).total -
        incomeTotal -
        ssBenefitTotal,
    )
    let plan = planWithdrawals(sources, need, withdrawalContext)
    let solverConverged = need === 0
    for (let i = 0; i < SOLVER_MAX_ITERATIONS && !solverConverged; i++) {
      const iterationTax = computeIncomeTaxes(
        taxSchedules,
        baseOrdinary,
        plan.ordinaryIncome,
        plan.capitalGains,
        plan.penalty,
        taxableSocialSecurityFor(plan),
        stateContributionDeductionAmount,
      )
      const nextNeed = Math.max(0, committed + ficaTax + iterationTax.total - incomeTotal - ssBenefitTotal)
      solverConverged = Math.abs(nextNeed - need) <= SOLVER_TOLERANCE
      need = nextNeed
      // The loop has to end on a plan, not a tax figure, so the plan actually
      // applied is the one that funds the final `need`.
      plan = planWithdrawals(sources, need, withdrawalContext)
    }

    const ssTaxable = taxableSocialSecurityFor(plan)
    const incomeTax = computeIncomeTaxes(
      taxSchedules,
      baseOrdinary,
      plan.ordinaryIncome,
      plan.capitalGains,
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
    // default withdrawal rule drew to cover a shortfall.
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
    balances.shared.taxable += extraTaxableSavings
    balances.shared.taxableBasis += extraTaxableSavings
    contributionsByAccount.taxable += extraTaxableSavings

    // --- Growth: this year's contributions grow for the full year, and
    // withdrawals forgo a full year's growth (grow-then-sit-flat isn't
    // modeled); cash isn't invested. HYSA is the exception to "contributions
    // grow for the full year" — hysaInterest was fixed above, off the
    // opening balance, to avoid a circular dependency with the tax solver, so
    // it's added as a flat amount rather than compounded via *= like the rest ---
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
    balances.shared.taxable *= 1 + growthRate
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

    const netWorth =
      balances.self.preTax +
      balances.self.roth +
      balances.spouse.preTax +
      balances.spouse.roth +
      balances.shared.taxable +
      balances.shared.hsa +
      balances.shared.cash +
      balances.shared.hysa +
      balances.shared.college529

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
    })

    inflationFactor *= 1 + yearInflationRatePct / 100
  }

  return rows
}
