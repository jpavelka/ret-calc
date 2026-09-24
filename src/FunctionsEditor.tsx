import { ExpressionInput } from './ExpressionInput'
import type { FormulaFunctionsContext, FormulaHistoryContext } from './formula'
import { renameIdentifierInExpression, tryEvaluateFormula } from './formula'
import { HelpTooltip } from './HelpTooltip'
import type { CustomFunction, Variable } from './types'

interface FunctionsEditorProps {
  functions: CustomFunction[]
  onChange: (functions: CustomFunction[]) => void
  // Includes this editor's own in-progress functions (InputsForm rebuilds it
  // from inputs.functions on every keystroke), so the live preview below
  // sees nesting/recursion against the current draft, not a stale catalog.
  functionsContext: FormulaFunctionsContext
  bare?: boolean
  history?: FormulaHistoryContext
}

export function FunctionsEditor({
  functions,
  onChange,
  functionsContext,
  bare = false,
  history,
}: FunctionsEditorProps) {
  function updateFunction(id: string, patch: Partial<CustomFunction>) {
    onChange(functions.map((f) => (f.id === id ? { ...f, ...patch } : f)))
  }

  function removeFunction(id: string) {
    onChange(functions.filter((f) => f.id !== id))
  }

  function addFunction() {
    onChange([...functions, { id: crypto.randomUUID(), name: '', params: [], expression: '' }])
  }

  function addParam(fn: CustomFunction) {
    updateFunction(fn.id, { params: [...fn.params, ''] })
  }

  function updateParam(fn: CustomFunction, index: number, name: string) {
    const oldName = fn.params[index]
    const params = fn.params.map((p, i) => (i === index ? name : p))
    const expression = oldName ? renameIdentifierInExpression(fn.expression, oldName, name) : fn.expression
    updateFunction(fn.id, { params, expression })
  }

  function removeParam(fn: CustomFunction, index: number) {
    updateFunction(fn.id, { params: fn.params.filter((_, i) => i !== index) })
  }

  const Wrapper = bare ? 'div' : 'section'
  const Heading = bare ? 'h3' : 'h2'

  return (
    <Wrapper className={bare ? '' : 'rounded-lg border border-slate-200 bg-white p-5 shadow-sm'}>
      <Heading
        className={
          bare
            ? 'flex items-center gap-1 text-sm font-semibold text-slate-600'
            : 'flex items-center gap-1 text-lg font-semibold text-slate-900'
        }
      >
        Custom functions
        <HelpTooltip text='Define a reusable formula with named parameters, e.g. raise(base, pct) = base * (1 + pct / 100). Call it from any formula below as raise(salary, 3). A function only sees its own parameters as scope — not the variables above — and can call other functions defined here, but never itself, directly or indirectly.' />
      </Heading>

      {functions.length === 0 && (
        <p className="mt-2 text-sm text-slate-400">No functions yet — add one, e.g. "raise(base, pct)".</p>
      )}

      <div className="mt-3 flex flex-col gap-2">
        {functions.map((fn) => {
          const previewScope: Record<string, number> = {}
          for (const p of fn.params) if (p) previewScope[p] = 1
          const result = fn.expression.trim()
            ? tryEvaluateFormula(fn.expression, previewScope, history, functionsContext)
            : null
          // A stub Variable per param, purely so ExpressionInput's "["
          // bracket-autocomplete affordance (which only knows about
          // Variable[]) offers this function's own params — not a real
          // reuse of the Variables catalog (functions can't see it).
          const paramStubs: Variable[] = fn.params
            .filter((p) => p)
            .map((p) => ({ id: p, name: p, source: { kind: 'custom', amount: 0 } }))

          return (
            <div key={fn.id} className="flex flex-col gap-2 rounded-md border border-slate-200 p-2">
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="text"
                  placeholder="e.g. raise"
                  className="min-w-[8rem] flex-1 rounded-md border border-slate-300 px-2 py-1.5 text-sm text-slate-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500"
                  value={fn.name}
                  onChange={(e) => updateFunction(fn.id, { name: e.target.value })}
                />
                <button
                  type="button"
                  onClick={() => removeFunction(fn.id)}
                  aria-label="Remove function"
                  title="Remove function"
                  className="ml-auto rounded-md border border-red-300 px-2 py-1 text-red-600 hover:bg-red-50"
                >
                  ✕
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-medium text-slate-500">Parameters</span>
                {fn.params.map((p, i) => (
                  <div key={i} className="flex items-center gap-1">
                    <input
                      type="text"
                      placeholder={`param ${i + 1}`}
                      className="w-24 rounded-md border border-slate-300 px-2 py-1 text-sm text-slate-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500"
                      value={p}
                      onChange={(e) => updateParam(fn, i, e.target.value)}
                    />
                    <button
                      type="button"
                      onClick={() => removeParam(fn, i)}
                      aria-label="Remove parameter"
                      title="Remove parameter"
                      className="rounded-md border border-red-300 px-1.5 py-1 text-xs text-red-600 hover:bg-red-50"
                    >
                      ✕
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => addParam(fn)}
                  className="rounded-md border border-emerald-600 px-2 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-50"
                >
                  Add parameter
                </button>
              </div>

              <ExpressionInput
                expression={fn.expression}
                onChange={(expression) => updateFunction(fn.id, { expression })}
                placeholder="e.g. base * (1 + pct / 100)"
                variables={paramStubs}
              />
              {result && !result.ok && <span className="text-xs text-red-600">{result.error}</span>}
            </div>
          )
        })}
      </div>

      <button
        type="button"
        onClick={addFunction}
        className="mt-3 rounded-md border border-emerald-600 px-4 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-50"
      >
        Add function
      </button>
    </Wrapper>
  )
}
