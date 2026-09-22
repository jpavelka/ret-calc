// The default rule for covering a shortfall: any required minimum
// distribution comes out first (mandatory regardless of the shortfall size),
// then this year's qualified medical and education spending comes out of HSA
// and 529 respectively (each tax-free, up to the qualified amount), then
// cash, high-yield savings, taxable brokerage, pre-tax, Roth, and whatever's
// left of HSA and 529, accounting for the tax and penalty each draw triggers.
//
// Everything here is pure. The projection mutates its balances in place across
// years, and the solver calls planWithdrawals repeatedly while it converges on
// how much to take — so drawing against the live balances would compound the
// withdrawals across iterations and quietly diverge. Sources come in as a flat
// snapshot of primitives, which can't alias the caller's state, and the result
// is applied to the real balances exactly once.

import type { OwnedAccountBalances, SharedAccountBalances } from './types'

export interface WithdrawalBalances {
  self: OwnedAccountBalances
  spouse: OwnedAccountBalances
  shared: SharedAccountBalances
}

// Thirteen primitives rather than a copy of the nested Balances object.
export interface WithdrawalSources {
  cash: number
  hysa: number
  taxable: number
  taxableBasis: number
  preTaxSelf: number
  preTaxSpouse: number
  rothSelf: number
  rothSelfBasis: number
  rothSpouse: number
  rothSpouseBasis: number
  hsa: number
  college529: number
  college529Basis: number
}

export type WithdrawalAccountKey =
  | 'cash'
  | 'hysa'
  | 'taxable'
  | 'preTaxSelf'
  | 'preTaxSpouse'
  | 'rothSelf'
  | 'rothSpouse'
  | 'hsa'
  | 'college529'

export interface WithdrawalContext {
  // Whether each owner has reached 59½ by this year — gates both the tax on
  // Roth earnings and the 10% penalty on pre-tax and Roth earnings.
  selfPenaltyFree: boolean
  spousePenaltyFree: boolean
  // Whether the HSA holder has reached 65, after which a non-qualified
  // distribution is ordinary income but no longer carries the 20% penalty.
  hsaPenaltyFree: boolean
  // Medical spending this year that an HSA draw can cover tax-free — the sum
  // of spending lines flagged medicalRelated.
  qualifiedMedicalExpenses: number
  // Education spending this year a 529 draw can cover tax-free — federal and
  // state, regardless of basis vs. earnings split (the qualified-distribution
  // exclusion applies to the whole distribution, not just earnings). Unlike
  // HSA's 65 cutoff, 529 has no age exemption at all: a non-qualified draw at
  // any age owes tax on its earnings share plus the 10% federal penalty.
  qualifiedEducationExpenses: number
  // Each owner's required minimum distribution for the year, if any (0
  // before their RMD start age). Mandatory regardless of `need` — see the
  // RMD tier in planWithdrawals.
  rmdSelf: number
  rmdSpouse: number
}

// The subset of WithdrawalAccountKey that can ever produce ordinary income —
// cash, high-yield savings, and taxable-brokerage draws never do (taxable's
// gain is capitalGains, its basis is untaxed return of principal; HYSA
// interest was already taxed as ordinary income the year it was earned, so
// the withdrawal itself is just already-taxed principal, like cash).
export type OrdinaryIncomeAccountKey =
  | 'preTaxSelf'
  | 'preTaxSpouse'
  | 'rothSelf'
  | 'rothSpouse'
  | 'hsa'
  | 'college529'

export interface WithdrawalPlan {
  byAccount: Record<WithdrawalAccountKey, number>
  // Everything actually drawn, cash included. Excludes `unfunded`.
  total: number
  // Pre-tax draws, non-qualified Roth earnings, non-qualified HSA draws,
  // non-qualified 529 earnings.
  ordinaryIncome: number
  // ordinaryIncome broken out by which account it came from (RMD and
  // non-RMD pre-tax draws combined per owner) — a decomposition of
  // ordinaryIncome, not additional to it. Surfaced for display (e.g. "what
  // drove this year's tax bill"), not used in any further calculation.
  ordinaryIncomeByAccount: Record<OrdinaryIncomeAccountKey, number>
  // Always long-term: the model has no holding periods.
  capitalGains: number
  penalty: number
  taxableBasisUsed: number
  rothBasisUsed: { self: number; spouse: number }
  college529BasisUsed: number
  // The remainder once every account is empty, which drives cash negative.
  unfunded: number
  // How much of byAccount.preTaxSelf/preTaxSpouse was the mandatory RMD
  // (a subset of those totals, not additional to them) — broken out so
  // callers can show it as its own line rather than an ordinary draw.
  rmd: { self: number; spouse: number }
}

const EARLY_WITHDRAWAL_PENALTY_RATE = 0.1
const HSA_NON_QUALIFIED_PENALTY_RATE = 0.2
// Same rate as EARLY_WITHDRAWAL_PENALTY_RATE but kept as its own constant:
// the 529 penalty is a distinct legal rule with no age-59½ exemption, unlike
// the pre-tax/Roth penalty it happens to share a rate with.
const FIVE29_NON_QUALIFIED_PENALTY_RATE = 0.1

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

// Never draw more than is there, and never draw from an already-negative
// balance — the waterfall funds shortfalls, it doesn't repay them.
function available(balance: number): number {
  return Math.max(0, balance)
}

export function snapshotSources(balances: WithdrawalBalances): WithdrawalSources {
  return {
    cash: balances.shared.cash,
    hysa: balances.shared.hysa,
    taxable: balances.shared.taxable,
    taxableBasis: balances.shared.taxableBasis,
    preTaxSelf: balances.self.preTax,
    preTaxSpouse: balances.spouse.preTax,
    rothSelf: balances.self.roth,
    rothSelfBasis: balances.self.rothBasis,
    rothSpouse: balances.spouse.roth,
    rothSpouseBasis: balances.spouse.rothBasis,
    hsa: balances.shared.hsa,
    college529: balances.shared.college529,
    college529Basis: balances.shared.college529Basis,
  }
}

// Posts a settled plan to the real balances. Call this once, after the solver
// has converged — never inside the iteration.
export function applyWithdrawalPlan(balances: WithdrawalBalances, plan: WithdrawalPlan): void {
  const { byAccount } = plan

  balances.shared.cash -= byAccount.cash + plan.unfunded
  balances.shared.hysa -= byAccount.hysa
  balances.shared.taxable -= byAccount.taxable
  balances.shared.taxableBasis -= plan.taxableBasisUsed
  balances.self.preTax -= byAccount.preTaxSelf
  balances.spouse.preTax -= byAccount.preTaxSpouse
  balances.self.roth -= byAccount.rothSelf
  balances.self.rothBasis -= plan.rothBasisUsed.self
  balances.spouse.roth -= byAccount.rothSpouse
  balances.spouse.rothBasis -= plan.rothBasisUsed.spouse
  balances.shared.hsa -= byAccount.hsa
  balances.shared.college529 -= byAccount.college529
  balances.shared.college529Basis -= plan.college529BasisUsed

  // Decades of floating-point drift can otherwise push basis a hair past its
  // balance (or below zero), which would show up as a phantom gain or loss.
  balances.shared.taxableBasis = clamp(
    balances.shared.taxableBasis,
    0,
    Math.max(0, balances.shared.taxable),
  )
  balances.self.rothBasis = clamp(balances.self.rothBasis, 0, Math.max(0, balances.self.roth))
  balances.spouse.rothBasis = clamp(balances.spouse.rothBasis, 0, Math.max(0, balances.spouse.roth))
  balances.shared.college529Basis = clamp(
    balances.shared.college529Basis,
    0,
    Math.max(0, balances.shared.college529),
  )
}

export function planWithdrawals(
  sources: WithdrawalSources,
  need: number,
  ctx: WithdrawalContext,
): WithdrawalPlan {
  const byAccount: Record<WithdrawalAccountKey, number> = {
    cash: 0,
    hysa: 0,
    taxable: 0,
    preTaxSelf: 0,
    preTaxSpouse: 0,
    rothSelf: 0,
    rothSpouse: 0,
    hsa: 0,
    college529: 0,
  }
  let remaining = Math.max(0, need)
  let ordinaryIncome = 0
  const ordinaryIncomeByAccount: Record<OrdinaryIncomeAccountKey, number> = {
    preTaxSelf: 0,
    preTaxSpouse: 0,
    rothSelf: 0,
    rothSpouse: 0,
    hsa: 0,
    college529: 0,
  }
  let capitalGains = 0
  let penalty = 0
  let taxableBasisUsed = 0
  const rothBasisUsed = { self: 0, spouse: 0 }
  let college529BasisUsed = 0
  const rmd = { self: 0, spouse: 0 }

  // 1. Required minimum distributions — mandatory regardless of `need`, and
  // taken before anything else: the cash they produce is already in hand for
  // the year, so it should cover spending before cash/taxable are tapped for
  // the same purpose. Almost always penalty-free in practice, since RMDs
  // start well past 59½, but the penalty test still applies for correctness.
  const rmdTiers = [
    {
      key: 'preTaxSelf' as const,
      owner: 'self' as const,
      balance: sources.preTaxSelf,
      penaltyFree: ctx.selfPenaltyFree,
      amount: ctx.rmdSelf,
    },
    {
      key: 'preTaxSpouse' as const,
      owner: 'spouse' as const,
      balance: sources.preTaxSpouse,
      penaltyFree: ctx.spousePenaltyFree,
      amount: ctx.rmdSpouse,
    },
  ]
  for (const tier of rmdTiers) {
    const take = Math.min(available(tier.balance), Math.max(0, tier.amount))
    if (take <= 0) continue
    ordinaryIncome += take
    ordinaryIncomeByAccount[tier.key] += take
    if (!tier.penaltyFree) penalty += take * EARLY_WITHDRAWAL_PENALTY_RATE
    byAccount[tier.key] += take
    rmd[tier.owner] = take
    remaining = Math.max(0, remaining - take)
  }

  // 2. HSA, for this year's qualified medical expenses — drawn ahead of cash
  // and every other source so the account actually pays for the medical
  // spending it exists for, rather than sitting untouched until every other
  // source is exhausted. Entirely tax- and penalty-free, since it never
  // exceeds the qualified amount. Tracked against a running
  // remainingQualifiedMedical rather than ctx.qualifiedMedicalExpenses
  // directly, so step 9's non-qualified draw later doesn't double-count this.
  let remainingQualifiedMedical = Math.max(0, ctx.qualifiedMedicalExpenses)
  const defaultFromHsa = Math.min(remaining, available(sources.hsa), remainingQualifiedMedical)
  if (defaultFromHsa > 0) {
    byAccount.hsa += defaultFromHsa
    remaining -= defaultFromHsa
    remainingQualifiedMedical -= defaultFromHsa
  }

  // 3. 529, for this year's qualified education expenses — same reasoning as
  // HSA above, and same basis-fraction invariant used again in step 10.
  let remainingQualifiedEducation = Math.max(0, ctx.qualifiedEducationExpenses)
  const defaultFrom529 = Math.min(remaining, available(sources.college529), remainingQualifiedEducation)
  if (defaultFrom529 > 0) {
    const basisFraction =
      sources.college529 > 0 ? clamp(sources.college529Basis / sources.college529, 0, 1) : 1
    college529BasisUsed += defaultFrom529 * basisFraction
    byAccount.college529 += defaultFrom529
    remaining -= defaultFrom529
    remainingQualifiedEducation -= defaultFrom529
  }

  // 4. Cash — untaxed, drawn only down to zero.
  const fromCash = Math.min(remaining, available(sources.cash))
  byAccount.cash = fromCash
  remaining -= fromCash

  // 5. High-yield savings — untaxed on withdrawal, same as cash: its interest
  // was already taxed as ordinary income the year it was earned (see
  // runProjection), so what's left is just already-taxed principal.
  const fromHysa = Math.min(remaining, available(sources.hysa))
  byAccount.hysa = fromHysa
  remaining -= fromHysa

  // 6. Taxable brokerage — pro-rata basis/gain split on the aggregate cost
  // basis. Note the fraction is invariant under withdrawal: removing `a` at
  // fraction `b` leaves (basis - a*b)/(balance - a) = b, so the account's
  // marginal tax rate stays flat until it's exhausted.
  const fromTaxable = Math.min(remaining, available(sources.taxable))
  if (fromTaxable > 0) {
    // A balance at or below its basis means an unrealized loss. Capital losses
    // aren't modeled, so the clamp floors the realized gain at zero.
    const basisFraction =
      sources.taxable > 0 ? clamp(sources.taxableBasis / sources.taxable, 0, 1) : 1
    taxableBasisUsed = fromTaxable * basisFraction
    capitalGains += fromTaxable - taxableBasisUsed
    byAccount.taxable = fromTaxable
    remaining -= fromTaxable
  }

  // 7. Pre-tax — any further shortfall beyond the RMD already drawn above.
  // Fully ordinary income, penalised before 59½. Self before spouse; the
  // withdrawal-priority UI will supersede that ordering once it's wired to
  // the engine.
  const preTaxTiers = [
    {
      key: 'preTaxSelf' as const,
      balance: sources.preTaxSelf - byAccount.preTaxSelf,
      penaltyFree: ctx.selfPenaltyFree,
    },
    {
      key: 'preTaxSpouse' as const,
      balance: sources.preTaxSpouse - byAccount.preTaxSpouse,
      penaltyFree: ctx.spousePenaltyFree,
    },
  ]
  for (const tier of preTaxTiers) {
    const take = Math.min(remaining, available(tier.balance))
    if (take <= 0) continue
    ordinaryIncome += take
    ordinaryIncomeByAccount[tier.key] += take
    if (!tier.penaltyFree) penalty += take * EARLY_WITHDRAWAL_PENALTY_RATE
    byAccount[tier.key] += take
    remaining -= take
  }

  // 8. Roth — IRS ordering: contribution/conversion basis comes out first,
  // always tax- and penalty-free. Earnings are only reached once basis is
  // exhausted, and once the owner is 59½ the whole distribution is qualified,
  // so those earnings are tax-free too. Before 59½ they're ordinary income
  // plus the 10% penalty. (The 5-year clock isn't trackable here; assumed met.)
  const rothTiers = [
    {
      key: 'rothSelf' as const,
      owner: 'self' as const,
      balance: sources.rothSelf,
      basis: sources.rothSelfBasis,
      penaltyFree: ctx.selfPenaltyFree,
    },
    {
      key: 'rothSpouse' as const,
      owner: 'spouse' as const,
      balance: sources.rothSpouse,
      basis: sources.rothSpouseBasis,
      penaltyFree: ctx.spousePenaltyFree,
    },
  ]
  for (const tier of rothTiers) {
    const take = Math.min(remaining, available(tier.balance))
    if (take <= 0) continue
    const fromBasis = Math.min(take, clamp(tier.basis, 0, available(tier.balance)))
    const earnings = take - fromBasis
    rothBasisUsed[tier.owner] = fromBasis
    if (!tier.penaltyFree && earnings > 0) {
      ordinaryIncome += earnings
      ordinaryIncomeByAccount[tier.key] += earnings
      penalty += earnings * EARLY_WITHDRAWAL_PENALTY_RATE
    }
    byAccount[tier.key] = take
    remaining -= take
  }

  // 9. HSA, for any further shortfall beyond step 2's default draw — tax-free
  // up to what's left of this year's qualified medical expenses after step 2
  // (remainingQualifiedMedical, not ctx.qualifiedMedicalExpenses, so that
  // amount isn't credited twice), the rest ordinary income plus a 20% penalty
  // before 65.
  const fromHsa = Math.min(remaining, available(sources.hsa) - byAccount.hsa)
  if (fromHsa > 0) {
    const taxFree = Math.min(fromHsa, remainingQualifiedMedical)
    const nonQualified = fromHsa - taxFree
    ordinaryIncome += nonQualified
    ordinaryIncomeByAccount.hsa += nonQualified
    if (!ctx.hsaPenaltyFree) penalty += nonQualified * HSA_NON_QUALIFIED_PENALTY_RATE
    byAccount.hsa += fromHsa
    remaining -= fromHsa
  }

  // 10. 529, for any further shortfall beyond step 3's default draw —
  // pro-rata basis/earnings split, same invariant-preserving math as the
  // taxable-brokerage step (the basis fraction is unchanged by a
  // proportional withdrawal). Placed last, after HSA: like HSA, it's a
  // specialized tax-advantaged account best preserved until other sources are
  // exhausted. Up to what's left of this year's qualified education expenses
  // after step 3 (remainingQualifiedEducation) comes out completely tax-free
  // (federal and state), regardless of the basis split — that's the real 529
  // qualified-distribution exclusion. Only the earnings share of whatever's
  // left non-qualified is taxable, plus a flat 10% federal-only penalty on
  // that earnings share; there's no age exemption for 529s, unlike every
  // other account in this waterfall. Note, same simplification as HSA's
  // qualifiedMedicalExpenses: this doesn't verify the withdrawal actually
  // funded the education spend, and unused qualified amount doesn't carry
  // over — it's a per-year cap on whatever's drawn.
  const from529 = Math.min(remaining, available(sources.college529) - byAccount.college529)
  if (from529 > 0) {
    const basisFraction =
      sources.college529 > 0 ? clamp(sources.college529Basis / sources.college529, 0, 1) : 1
    college529BasisUsed += from529 * basisFraction
    const qualified = Math.min(from529, remainingQualifiedEducation)
    const nonQualified = from529 - qualified
    const nonQualifiedEarnings = nonQualified * (1 - basisFraction)
    ordinaryIncome += nonQualifiedEarnings
    ordinaryIncomeByAccount.college529 += nonQualifiedEarnings
    penalty += nonQualifiedEarnings * FIVE29_NON_QUALIFIED_PENALTY_RATE
    byAccount.college529 += from529
    remaining -= from529
  }

  // Everything is empty and the bills still have to be paid: the rest goes on
  // the cash balance, driving it negative. It's untaxed, which is also what
  // guarantees the solver terminates — once here, the marginal rate is zero.
  const unfunded = remaining

  const total =
    byAccount.cash +
    byAccount.hysa +
    byAccount.taxable +
    byAccount.preTaxSelf +
    byAccount.preTaxSpouse +
    byAccount.rothSelf +
    byAccount.rothSpouse +
    byAccount.hsa +
    byAccount.college529

  return {
    byAccount,
    total,
    ordinaryIncome,
    ordinaryIncomeByAccount,
    capitalGains,
    penalty,
    taxableBasisUsed,
    rothBasisUsed,
    college529BasisUsed,
    unfunded,
    rmd,
  }
}
