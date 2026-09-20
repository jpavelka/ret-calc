import type { MatchConfig } from './types'

// Tiers are a waterfall over slices of salary: the first tier's percent of
// salary is matched at its rate, then the next tier's percent at its rate,
// and so on — mirroring "100% match on the first 3% of pay, 50% on the next
// 2%". The employee's own contribution caps how much can actually be matched.
export function calculateMatchAmount(
  contribution: number,
  salary: number,
  tiers: MatchConfig['tiers'],
): number {
  let remaining = Math.max(contribution, 0)
  let total = 0
  for (const tier of tiers) {
    if (remaining <= 0) break
    const tierWidth = Math.max(salary, 0) * (Math.max(tier.salaryPercent, 0) / 100)
    const applied = Math.min(remaining, tierWidth)
    total += applied * (tier.matchPercent / 100)
    remaining -= applied
  }
  return total
}
