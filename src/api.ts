import {
  DEFAULT_INPUTS,
  type RetirementInputs,
  type RothConversionAmount,
  type RothConversionPlanRange,
  type ScenarioRecord,
  type ScenarioSummary,
} from './types'

export async function listScenarios(): Promise<ScenarioSummary[]> {
  const res = await fetch('/api/scenarios')
  if (!res.ok) throw new Error('Failed to list scenarios')
  return (await res.json()) as ScenarioSummary[]
}

export async function loadScenario(name: string): Promise<RetirementInputs> {
  const res = await fetch(`/api/scenarios/${encodeURIComponent(name)}`)
  if (!res.ok) throw new Error('Failed to load scenario')
  const record = (await res.json()) as ScenarioRecord
  // Merge over defaults so scenarios saved before a field existed still load.
  const merged = { ...DEFAULT_INPUTS, ...record.inputs }
  // balances' shape has changed over time (flat -> self/spouse -> shared
  // split out), so merge it one level deeper too, rather than letting an old
  // shape blow up the UI.
  type LegacyOwnedBalances = { preTax?: number; roth?: number; taxable?: number; hsa?: number; cash?: number }
  const loadedBalances = record.inputs?.balances as
    | { self?: LegacyOwnedBalances; spouse?: LegacyOwnedBalances; shared?: object }
    | undefined
  merged.balances = {
    self: { ...DEFAULT_INPUTS.balances.self, ...loadedBalances?.self },
    spouse: { ...DEFAULT_INPUTS.balances.spouse, ...loadedBalances?.spouse },
    // Scenarios saved before taxable/HSA/cash were combined had these split
    // per spouse — sum them into the shared bucket so that money isn't lost.
    shared: loadedBalances?.shared
      ? { ...DEFAULT_INPUTS.balances.shared, ...loadedBalances.shared }
      : {
          ...DEFAULT_INPUTS.balances.shared,
          taxable: (loadedBalances?.self?.taxable ?? 0) + (loadedBalances?.spouse?.taxable ?? 0),
          hsa: (loadedBalances?.self?.hsa ?? 0) + (loadedBalances?.spouse?.hsa ?? 0),
          cash: (loadedBalances?.self?.cash ?? 0) + (loadedBalances?.spouse?.cash ?? 0),
        },
  }
  // Roth conversion amounts moved from a plain number to a
  // variable/custom/formula source, same shape as income/spending amounts,
  // so a formula could be used to set them — migrate old numeric scenarios
  // to the equivalent flat custom amount. Later, inflationAdjusted was added
  // to that source (previously the amount always held flat) — default it to
  // false for scenarios saved before the flag existed, preserving their
  // old flat behavior.
  function migrateRothConversionAmount(amount: unknown): RothConversionAmount {
    if (typeof amount === 'number') return { kind: 'custom', amount, inflationAdjusted: false }
    const source = amount as RothConversionAmount & { inflationAdjusted?: boolean }
    return { ...source, inflationAdjusted: source.inflationAdjusted ?? false }
  }
  merged.rothConversionRanges = (record.inputs?.rothConversionRanges ?? []).map(
    (range: RothConversionPlanRange) => ({
      ...range,
      amountSelf: migrateRothConversionAmount(range.amountSelf),
      amountSpouse: migrateRothConversionAmount(range.amountSpouse),
    }),
  )
  // Withdrawal ranges used to reference a global line catalog and named
  // priority sets (withdrawalLineDefs/withdrawalPrioritySets) that the
  // projection never read; each range now holds its own ordered `lines`.
  // Drop the legacy fields, and any range still in the old shape — it had
  // no effect on the projection, and an empty-lines range would instead
  // leave its years unfunded.
  const legacy = merged as RetirementInputs & { withdrawalLineDefs?: unknown; withdrawalPrioritySets?: unknown }
  delete legacy.withdrawalLineDefs
  delete legacy.withdrawalPrioritySets
  merged.withdrawalRanges = merged.withdrawalRanges.filter((range) => Array.isArray(range.lines))
  return merged
}

export async function saveScenario(
  name: string,
  inputs: RetirementInputs,
): Promise<void> {
  const res = await fetch(`/api/scenarios/${encodeURIComponent(name)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(inputs),
  })
  if (!res.ok) throw new Error('Failed to save scenario')
}

export async function deleteScenario(name: string): Promise<void> {
  const res = await fetch(`/api/scenarios/${encodeURIComponent(name)}`, {
    method: 'DELETE',
  })
  if (!res.ok) throw new Error('Failed to delete scenario')
}
