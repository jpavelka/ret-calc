import type { MouseEvent } from 'react'
import { TOC_EXPAND_EVENT, type TocExpandDetail } from './tocEvents'

const SECTIONS = [
  { id: 'projection', label: 'Year-by-year projection' },
  { id: 'simulation', label: 'Simulation' },
  { id: 'assumptions', label: 'Assumptions' },
  { id: 'goals', label: 'Goals' },
  { id: 'metrics', label: 'Metrics' },
  { id: 'balances', label: 'Current account balances' },
  { id: 'variables', label: 'Variables' },
  { id: 'special-years', label: 'Special years' },
  { id: 'functions', label: 'Functions' },
  { id: 'income', label: 'Income' },
  { id: 'spending', label: 'Spending' },
  { id: 'savings', label: 'Savings' },
  { id: 'withdrawals', label: 'Withdrawals' },
  { id: 'taxes', label: 'Taxes' },
  { id: 'social-security', label: 'Social Security' },
  { id: 'roth-conversions', label: 'Roth conversions' },
  { id: 'dividends', label: 'Dividend policy' },
]

export function TableOfContents() {
  function handleClick(e: MouseEvent<HTMLAnchorElement>, id: string) {
    const el = document.getElementById(id)
    if (!el) return
    e.preventDefault()
    window.dispatchEvent(
      new CustomEvent<TocExpandDetail>(TOC_EXPAND_EVENT, { detail: { id } }),
    )
    // Wait a frame so the section has expanded before measuring where to
    // scroll — otherwise a still-collapsed section's layout throws off the
    // scroll position.
    requestAnimationFrame(() => {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }

  return (
    <nav aria-label="Table of contents" className="flex flex-col gap-0.5 text-sm">
      {SECTIONS.map((s) => (
        <a
          key={s.id}
          href={`#${s.id}`}
          onClick={(e) => handleClick(e, s.id)}
          className="rounded-md px-2 py-1 text-slate-600 hover:bg-slate-100 hover:text-slate-900"
        >
          {s.label}
        </a>
      ))}
    </nav>
  )
}
