import type { Frequency } from './types'

interface FrequencyFieldProps {
  label?: string
  value: Frequency
  onChange: (value: Frequency) => void
  hideLabel?: boolean
}

export function FrequencyField({ label = 'Frequency', value, onChange, hideLabel = false }: FrequencyFieldProps) {
  return (
    <label className="flex flex-col gap-1">
      <span className={hideLabel ? 'sr-only' : 'text-sm font-medium text-slate-700'}>{label}</span>
      <select
        className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500"
        value={value}
        onChange={(e) => onChange(e.target.value as Frequency)}
      >
        <option value="yearly">Yearly</option>
        <option value="monthly">Monthly</option>
      </select>
    </label>
  )
}
