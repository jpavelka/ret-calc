import { extractIdentifiers, tryEvaluateFormula } from './formula'
import type { Variable } from './types'

export interface ResolvedVariables {
  amounts: Map<string, number>
  errors: Map<string, string>
}

// Variables can reference each other by name via a formula source, so
// resolving their amounts is a dependency-graph problem: each formula
// variable's value depends on other variables' (already resolved) values.
// Computed once from the day's variables list — a Variable's own value isn't
// inflation-adjusted (that's decided per use, see AmountSource's inflation
// flag), so this never needs to be recomputed per projection year.
export function resolveVariableAmounts(variables: Variable[]): ResolvedVariables {
  const byId = new Map(variables.map((v) => [v.id, v]))
  const byName = new Map<string, Variable>()
  for (const v of variables) {
    if (!byName.has(v.name)) byName.set(v.name, v)
  }

  const amounts = new Map<string, number>()
  const errors = new Map<string, string>()
  const done = new Set<string>()
  // The chain of variable ids currently being resolved, in DFS order — used
  // to find and flag every member of a cycle (not just the one edge that
  // closes the loop) when one is hit.
  const stack: string[] = []
  const stackIndex = new Map<string, number>()

  function resolve(v: Variable): number {
    if (done.has(v.id)) return amounts.get(v.id) ?? 0

    const cycleStart = stackIndex.get(v.id)
    if (cycleStart !== undefined) {
      const cycleIds = stack.slice(cycleStart)
      const names = cycleIds.map((id) => byId.get(id)?.name ?? '?')
      const message = `Circular reference: ${[...names, names[0]].join(' → ')}`
      for (const id of cycleIds) {
        errors.set(id, message)
        amounts.set(id, 0)
        done.add(id)
      }
      return 0
    }

    stackIndex.set(v.id, stack.length)
    stack.push(v.id)

    let value: number
    if (v.source.kind === 'custom') {
      value = v.source.amount
    } else {
      const scope: Record<string, number> = {}
      for (const name of extractIdentifiers(v.source.expression)) {
        const ref = byName.get(name)
        if (ref) scope[name] = resolve(ref)
      }
      const result = tryEvaluateFormula(v.source.expression, scope)
      if (result.ok) {
        value = result.value
      } else {
        errors.set(v.id, result.error)
        value = 0
      }
    }

    stack.pop()
    stackIndex.delete(v.id)

    // A cycle nested inside this variable's own dependencies may already
    // have finalized it (e.g. a direct self-reference) while this frame was
    // still computing — keep that frozen value/error instead of clobbering
    // it with this frame's own (cycle-tainted) result.
    if (done.has(v.id)) return amounts.get(v.id) ?? 0

    done.add(v.id)
    amounts.set(v.id, value)
    return value
  }

  for (const v of variables) resolve(v)

  return { amounts, errors }
}
