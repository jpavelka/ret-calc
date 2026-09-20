import { HelpTooltip } from './HelpTooltip'

interface CheckboxFieldProps {
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
  help?: string
}

export function CheckboxField({ label, checked, onChange, help }: CheckboxFieldProps) {
  return (
    <div className="flex flex-col gap-1">
      <span className="invisible text-sm font-medium text-slate-700">{label}</span>
      <label className="flex h-[42px] items-center gap-2">
        <input
          type="checkbox"
          className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span className="flex items-center gap-1 text-sm font-medium text-slate-700">
          {label}
          {help && <HelpTooltip text={help} />}
        </span>
      </label>
    </div>
  )
}
