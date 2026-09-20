import type { ReactNode } from 'react'
import { CurrencyField } from './CurrencyField'
import { HelpTooltip } from './HelpTooltip'

interface NamedAmountDef {
  id: string
  name: string
  amount: number
  inflationAdjusted: boolean
}

interface NamedAmountCatalogEditorProps<T extends NamedAmountDef> {
  title: string
  help: string
  emptyMessage: string
  namePlaceholder: string
  addLabel: string
  removeLabel: string
  defs: T[]
  onChange: (defs: T[]) => void
  // When true, renders as a plain block (no card/border/top-level heading) so
  // it can be embedded inside another section instead of standing alone.
  bare?: boolean
  // Rendered after the inflation checkbox, before the remove button, for a
  // call site that needs one extra per-row field without this component
  // needing to know what it is.
  renderExtraField?: (def: T, updateDef: (patch: Partial<T>) => void) => ReactNode
}

export function NamedAmountCatalogEditor<T extends NamedAmountDef>({
  title,
  help,
  emptyMessage,
  namePlaceholder,
  addLabel,
  removeLabel,
  defs,
  onChange,
  bare = false,
  renderExtraField,
}: NamedAmountCatalogEditorProps<T>) {
  function updateDef(id: string, patch: Partial<T>) {
    onChange(defs.map((d) => (d.id === id ? { ...d, ...patch } : d)))
  }

  function removeDef(id: string) {
    onChange(defs.filter((d) => d.id !== id))
  }

  function addDef() {
    onChange([
      ...defs,
      { id: crypto.randomUUID(), name: '', amount: 0, inflationAdjusted: true } as T,
    ])
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
        {title}
        <HelpTooltip text={help} />
      </Heading>

      {defs.length === 0 && (
        <p className="mt-2 text-sm text-slate-400">{emptyMessage}</p>
      )}

      <div className="mt-3 flex flex-col gap-2">
        {defs.map((def) => (
          <div
            key={def.id}
            className="flex flex-wrap items-center gap-2 rounded-md border border-slate-200 p-2"
          >
            <input
              type="text"
              placeholder={namePlaceholder}
              className="min-w-[8rem] flex-1 rounded-md border border-slate-300 px-2 py-1.5 text-sm text-slate-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500"
              value={def.name}
              onChange={(e) => updateDef(def.id, { name: e.target.value } as Partial<T>)}
            />
            <div className="w-32">
              <CurrencyField
                label="Amount"
                hideLabel
                min={0}
                value={def.amount}
                onChange={(v) => updateDef(def.id, { amount: v } as Partial<T>)}
              />
            </div>
            <label className="flex items-center gap-1.5 text-sm text-slate-600">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                checked={def.inflationAdjusted ?? true}
                onChange={(e) =>
                  updateDef(def.id, { inflationAdjusted: e.target.checked } as Partial<T>)
                }
              />
              Adjust for inflation
            </label>
            {renderExtraField?.(def, (patch) => updateDef(def.id, patch))}
            <button
              type="button"
              onClick={() => removeDef(def.id)}
              aria-label={removeLabel}
              title={removeLabel}
              className="ml-auto rounded-md border border-red-300 px-2 py-1 text-red-600 hover:bg-red-50"
            >
              ✕
            </button>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={addDef}
        className="mt-3 rounded-md border border-emerald-600 px-4 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-50"
      >
        {addLabel}
      </button>
    </Wrapper>
  )
}
