import { DEFAULT_INPUTS, type RetirementInputs, type ScenarioRecord, type ScenarioSummary } from './types'

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
