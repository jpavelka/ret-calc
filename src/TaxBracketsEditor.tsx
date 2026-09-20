import { CurrencyField } from './CurrencyField'
import { NumberField } from './NumberField'
import type { TaxBracket } from './types'

interface TaxBracketsEditorProps {
  brackets: TaxBracket[]
  onChange: (brackets: TaxBracket[]) => void
  emptyMessage?: string
  addLabel?: string
  removeLabel?: string
}

export function TaxBracketsEditor({
  brackets,
  onChange,
  emptyMessage = 'No brackets yet — add one below.',
  addLabel = 'Add bracket',
  removeLabel = 'Remove bracket',
}: TaxBracketsEditorProps) {
  function updateBracket(id: string, patch: Partial<TaxBracket>) {
    onChange(brackets.map((b) => (b.id === id ? { ...b, ...patch } : b)))
  }

  function removeBracket(id: string) {
    onChange(brackets.filter((b) => b.id !== id))
  }

  function addBracket() {
    const last = brackets[brackets.length - 1]
    onChange([
      ...brackets,
      { id: crypto.randomUUID(), min: last ? last.min : 0, ratePct: last ? last.ratePct : 0 },
    ])
  }

  return (
    <div className="flex flex-col gap-2">
      {brackets.length === 0 && (
        <p className="text-sm text-slate-400">{emptyMessage}</p>
      )}

      <div className="flex flex-col gap-2">
        {brackets.map((bracket, index) => (
          <div
            key={bracket.id}
            className="flex flex-wrap items-center gap-2 rounded-md border border-slate-200 p-2"
          >
            <span className="text-xs text-slate-500">Bracket {index + 1} starts at</span>
            <div className="w-32">
              <CurrencyField
                label="Starting income"
                hideLabel
                min={0}
                value={bracket.min}
                onChange={(v) => updateBracket(bracket.id, { min: v })}
              />
            </div>
            <span className="text-xs text-slate-500">taxed at</span>
            <div className="w-24">
              <NumberField
                label="Rate"
                hideLabel
                suffix="%"
                min={0}
                step={0.1}
                value={bracket.ratePct}
                onChange={(v) => updateBracket(bracket.id, { ratePct: v })}
              />
            </div>
            <button
              type="button"
              onClick={() => removeBracket(bracket.id)}
              aria-label={removeLabel}
              title={removeLabel}
              className="ml-auto rounded-md border border-red-300 px-2 py-1 text-xs text-red-600 hover:bg-red-50"
            >
              ✕
            </button>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={addBracket}
        className="self-start text-xs font-medium text-emerald-700 hover:underline"
      >
        + {addLabel}
      </button>
    </div>
  )
}
