import { HelpTooltip } from './HelpTooltip'

interface NumberFieldProps {
  label: string
  value: number
  onChange: (value: number) => void
  prefix?: string
  suffix?: string
  min?: number
  max?: number
  step?: number
  hideLabel?: boolean
  help?: string
  disabled?: boolean
  // Fires on blur, after onChange — for a caller that wants to clamp/round
  // the committed value (e.g. to a whole number in a fixed range) without
  // fighting every keystroke: clamping inside onChange instead would rewrite
  // the field mid-edit (e.g. typing "6" then "5" for 65 gets snapped to the
  // min the instant "6" is parsed, so "5" lands on the wrong value).
  onBlur?: () => void
}

export function NumberField({
  label,
  value,
  onChange,
  prefix,
  suffix,
  min,
  max,
  step = 1,
  hideLabel = false,
  help,
  disabled = false,
  onBlur,
}: NumberFieldProps) {
  return (
    <label className="flex flex-col gap-1">
      <span
        className={
          hideLabel
            ? 'sr-only'
            : 'flex items-center gap-1 text-sm font-medium text-slate-700'
        }
      >
        {label}
        {help && !hideLabel && <HelpTooltip text={help} />}
      </span>
      <div
        className={`flex items-center rounded-md border border-slate-300 bg-white focus-within:ring-2 focus-within:ring-emerald-500 focus-within:border-emerald-500 ${
          disabled ? 'bg-slate-50' : ''
        }`}
      >
        {prefix && (
          <span className="pl-3 text-slate-400 select-none">{prefix}</span>
        )}
        <input
          type="number"
          className="w-full min-w-0 rounded-md px-3 py-2 text-slate-900 outline-none disabled:text-slate-400 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
          value={Number.isNaN(value) ? '' : value}
          min={min}
          max={max}
          step={step}
          disabled={disabled}
          onChange={(e) => onChange(e.target.valueAsNumber)}
          onBlur={onBlur}
        />
        {suffix && (
          <span className="pr-3 text-slate-400 select-none">{suffix}</span>
        )}
      </div>
    </label>
  )
}
