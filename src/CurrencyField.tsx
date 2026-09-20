import { useEffect, useState } from 'react'
import { HelpTooltip } from './HelpTooltip'

interface CurrencyFieldProps {
  label: string
  value: number
  onChange: (value: number) => void
  min?: number
  hideLabel?: boolean
  help?: string
}

function formatCurrency(value: number): string {
  if (!Number.isFinite(value)) return ''
  return value.toLocaleString('en-US', { maximumFractionDigits: 2 })
}

function parseCurrency(text: string): number {
  const cleaned = text.replace(/,/g, '').trim()
  if (cleaned === '' || cleaned === '-') return 0
  const parsed = Number(cleaned)
  return Number.isFinite(parsed) ? parsed : 0
}

// Displays dollar amounts with thousands separators (e.g. 250,000) while not
// focused, and the plain editable number while focused — commas make typing
// awkward, so we only format on blur.
export function CurrencyField({
  label,
  value,
  onChange,
  min,
  hideLabel = false,
  help,
}: CurrencyFieldProps) {
  const [focused, setFocused] = useState(false)
  const [text, setText] = useState(() => formatCurrency(value))

  useEffect(() => {
    if (!focused) setText(formatCurrency(value))
  }, [value, focused])

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
      <div className="flex items-center rounded-md border border-slate-300 bg-white focus-within:ring-2 focus-within:ring-emerald-500 focus-within:border-emerald-500">
        <span className="pl-3 text-slate-400 select-none">$</span>
        <input
          type="text"
          inputMode="decimal"
          className="w-full min-w-0 rounded-md px-3 py-2 text-slate-900 outline-none"
          value={text}
          onFocus={() => {
            setFocused(true)
            setText(Number.isFinite(value) ? String(value) : '')
          }}
          onChange={(e) => setText(e.target.value)}
          onBlur={(e) => {
            setFocused(false)
            let parsed = parseCurrency(e.target.value)
            if (min !== undefined && parsed < min) parsed = min
            onChange(parsed)
            setText(formatCurrency(parsed))
          }}
        />
      </div>
    </label>
  )
}
