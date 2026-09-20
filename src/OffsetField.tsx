import { useEffect, useState } from 'react'

interface OffsetFieldProps {
  label: string
  value: number
  onChange: (value: number) => void
  hideLabel?: boolean
}

function formatOffset(value: number): string {
  if (!Number.isFinite(value)) return ''
  return value >= 0 ? `+${value}` : `${value}`
}

function parseOffset(text: string): number {
  const cleaned = text.replace(/\+/g, '').trim()
  if (cleaned === '' || cleaned === '-') return 0
  const parsed = Number(cleaned)
  return Number.isFinite(parsed) ? parsed : 0
}

// Displays a signed year offset with an explicit "+" for zero/positive
// values (e.g. +5, -3) while not focused, and the plain editable number
// while focused — same blur-format pattern as CurrencyField.
export function OffsetField({ label, value, onChange, hideLabel = false }: OffsetFieldProps) {
  const [focused, setFocused] = useState(false)
  const [text, setText] = useState(() => formatOffset(value))

  useEffect(() => {
    if (!focused) setText(formatOffset(value))
  }, [value, focused])

  return (
    <label className="flex flex-col gap-1">
      <span className={hideLabel ? 'sr-only' : 'text-sm font-medium text-slate-700'}>
        {label}
      </span>
      <div className="flex items-center rounded-md border border-slate-300 bg-white focus-within:ring-2 focus-within:ring-emerald-500 focus-within:border-emerald-500">
        <input
          type="text"
          inputMode="numeric"
          className="w-full min-w-0 rounded-md px-3 py-2 text-slate-900 outline-none"
          value={text}
          onFocus={() => {
            setFocused(true)
            setText(Number.isFinite(value) ? String(value) : '')
          }}
          onChange={(e) => setText(e.target.value)}
          onBlur={(e) => {
            setFocused(false)
            const parsed = parseOffset(e.target.value)
            onChange(parsed)
            setText(formatOffset(parsed))
          }}
        />
        <span className="pr-3 text-slate-400 select-none">yrs</span>
      </div>
    </label>
  )
}
