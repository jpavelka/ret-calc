import { useState, type KeyboardEvent, type ReactNode } from 'react'

interface CollapsibleSectionProps {
  title: ReactNode
  subtitle?: ReactNode
  headerRight?: ReactNode
  defaultOpen?: boolean
  children: ReactNode
}

export function CollapsibleSection({
  title,
  subtitle,
  headerRight,
  defaultOpen = false,
  children,
}: CollapsibleSectionProps) {
  const [open, setOpen] = useState(defaultOpen)

  function toggle() {
    setOpen((o) => !o)
  }

  function handleKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      toggle()
    }
  }

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div
          role="button"
          tabIndex={0}
          aria-expanded={open}
          onClick={toggle}
          onKeyDown={handleKeyDown}
          className="flex flex-1 cursor-pointer items-start gap-2 text-left"
        >
          <span
            className={`mt-1 shrink-0 text-xs text-slate-400 transition-transform ${
              open ? 'rotate-90' : ''
            }`}
            aria-hidden="true"
          >
            ▶
          </span>
          <div>
            <h2 className="flex items-center gap-1 text-lg font-semibold text-slate-900">
              {title}
            </h2>
            {open && subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
          </div>
        </div>
        {open && headerRight && (
          <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
            {headerRight}
          </div>
        )}
      </div>
      {open && <div className="mt-4 max-h-[80vh] overflow-y-auto">{children}</div>}
    </section>
  )
}
