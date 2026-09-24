import type { FormulaFunctionsContext } from './formula'
import type { CustomFunction } from './types'

// Builds the lookup formula.ts's evaluator calls into for a user-defined
// function's params/body. Unlike resolveVariableAmounts, this needs no
// up-front resolution/error pass: a function isn't evaluated until it's
// called, so an unknown name, wrong arg count, or a recursive call cycle is
// only ever discovered lazily, at that call site (see evaluateNode's 'call'
// case, which tracks a callStack for the cycle check).
export function buildFormulaFunctions(functions: CustomFunction[]): FormulaFunctionsContext {
  const map: FormulaFunctionsContext = new Map()
  for (const f of functions) {
    if (!map.has(f.name)) map.set(f.name, { params: f.params, expression: f.expression })
  }
  return map
}
