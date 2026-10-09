import { CurrencyField } from './CurrencyField'
import type { IrmaaTier } from './types'

interface IrmaaTiersEditorProps {
  tiers: IrmaaTier[]
  onChange: (tiers: IrmaaTier[]) => void
}

export function IrmaaTiersEditor({ tiers, onChange }: IrmaaTiersEditorProps) {
  function updateTier(id: string, patch: Partial<IrmaaTier>) {
    onChange(tiers.map((t) => (t.id === id ? { ...t, ...patch } : t)))
  }

  function removeTier(id: string) {
    onChange(tiers.filter((t) => t.id !== id))
  }

  function addTier() {
    const last = tiers[tiers.length - 1]
    onChange([
      ...tiers,
      {
        id: crypto.randomUUID(),
        minMagiSingle: last?.minMagiSingle ?? 0,
        minMagiMFJ: last?.minMagiMFJ ?? 0,
        partBSurchargeMonthly: last?.partBSurchargeMonthly ?? 0,
        partDSurchargeMonthly: last?.partDSurchargeMonthly ?? 0,
      },
    ])
  }

  return (
    <div className="flex flex-col gap-2">
      {tiers.length === 0 && <p className="text-sm text-slate-400">No tiers — no IRMAA surcharge will be calculated.</p>}

      {tiers.map((tier, index) => (
        <div key={tier.id} className="flex flex-wrap items-end gap-2 rounded-md border border-slate-200 p-2">
          <span className="self-center text-xs text-slate-500">Tier {index + 1}</span>
          <div className="w-32">
            <CurrencyField
              label="MAGI above (single)"
              min={0}
              value={tier.minMagiSingle}
              onChange={(v) => updateTier(tier.id, { minMagiSingle: v })}
            />
          </div>
          <div className="w-32">
            <CurrencyField
              label="MAGI above (joint)"
              min={0}
              value={tier.minMagiMFJ}
              onChange={(v) => updateTier(tier.id, { minMagiMFJ: v })}
            />
          </div>
          <div className="w-32">
            <CurrencyField
              label="Part B / mo"
              min={0}
              value={tier.partBSurchargeMonthly}
              onChange={(v) => updateTier(tier.id, { partBSurchargeMonthly: v })}
            />
          </div>
          <div className="w-32">
            <CurrencyField
              label="Part D / mo"
              min={0}
              value={tier.partDSurchargeMonthly}
              onChange={(v) => updateTier(tier.id, { partDSurchargeMonthly: v })}
            />
          </div>
          <button
            type="button"
            onClick={() => removeTier(tier.id)}
            aria-label="Remove tier"
            title="Remove tier"
            className="ml-auto rounded-md border border-red-300 px-2 py-1 text-xs text-red-600 hover:bg-red-50"
          >
            ✕
          </button>
        </div>
      ))}

      <button type="button" onClick={addTier} className="self-start text-xs font-medium text-emerald-700 hover:underline">
        + Add tier
      </button>
    </div>
  )
}
