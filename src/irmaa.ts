import type { IrmaaTier } from './types'

export interface IrmaaResult {
  // The lookback MAGI (two years before the premium year) the tier was read from.
  lookbackMagi: number
  // 0 when below the lowest threshold, else the 1-based tier reached.
  tier: number
  medicareCount: number
  partBPerPerson: number // annual surcharge
  partDPerPerson: number // annual surcharge
  total: number // annual, across everyone on Medicare
}

// Computes one household-year of Medicare IRMAA surcharge. Pure function —
// the caller resolves the lookback MAGI, inflation-scales the tiers, and
// counts who is on Medicare. A tier applies when MAGI is strictly above its
// threshold; the highest tier exceeded wins (they don't stack).
export function computeIrmaa(params: {
  lookbackMagi: number
  married: boolean
  tiers: IrmaaTier[] // already inflation-scaled by caller
  medicareCount: number
}): IrmaaResult {
  const threshold = (t: IrmaaTier) => (params.married ? t.minMagiMFJ : t.minMagiSingle)
  const sorted = [...params.tiers].sort((a, b) => threshold(a) - threshold(b))
  let tier = 0
  for (let i = 0; i < sorted.length; i++) {
    if (params.lookbackMagi > threshold(sorted[i])) tier = i + 1
  }
  const reached = tier > 0 ? sorted[tier - 1] : null
  const partBPerPerson = (reached?.partBSurchargeMonthly ?? 0) * 12
  const partDPerPerson = (reached?.partDSurchargeMonthly ?? 0) * 12
  return {
    lookbackMagi: params.lookbackMagi,
    tier,
    medicareCount: params.medicareCount,
    partBPerPerson,
    partDPerPerson,
    total: (partBPerPerson + partDPerPerson) * params.medicareCount,
  }
}
