import { HelpTooltip } from './HelpTooltip'

interface DateFieldProps {
  label: string
  value: string
  onChange: (value: string) => void
  hint?: string
  help?: string
}

export function DateField({ label, value, onChange, hint, help }: DateFieldProps) {
  return (
    <label className="flex flex-col gap-1">
      <span className="flex items-center gap-1 text-sm font-medium text-slate-700">
        {label}
        {help && <HelpTooltip text={help} />}
      </span>
      <input
        type="date"
        className="rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {hint && <span className="text-xs text-slate-400">{hint}</span>}
    </label>
  )
}
