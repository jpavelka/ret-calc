import { useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

// Reference documentation for a "?" button shown next to every formula/
// condition input (see ExpressionInput) — a full modal rather than a
// HelpTooltip-style popover, since the content (every available function,
// grouped) is too long to skim in a small popup. Static content: it doesn't
// need to know which specific variables/special years this field offers
// (that's what the "[" quick-select is for), just the syntax and function
// catalog that's the same everywhere a formula can be typed.
export function FormulaHelp() {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open])

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Formula help"
        title="Formula help"
        className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-md border border-slate-300 bg-white text-sm font-semibold text-slate-500 outline-none hover:bg-slate-100 hover:text-slate-700 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500"
      >
        ?
      </button>
      {open &&
        createPortal(
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) setOpen(false)
            }}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-label="Formula help"
              className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-lg bg-white shadow-xl"
            >
              <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
                <h2 className="text-lg font-semibold text-slate-900">Writing formulas</h2>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="Close"
                  className="flex h-7 w-7 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                >
                  ✕
                </button>
              </div>
              <div className="overflow-y-auto px-5 py-4 text-sm text-slate-700">
                <FormulaHelpContent />
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  )
}

function Code({ children }: { children: string }) {
  return <code className="rounded bg-slate-100 px-1 py-0.5 font-mono text-[0.85em] text-slate-800">{children}</code>
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-4 first:mt-0">
      <h3 className="mb-1.5 text-sm font-semibold text-slate-900">{title}</h3>
      <div className="flex flex-col gap-1.5 text-slate-600">{children}</div>
    </section>
  )
}

// One name/description row for the function-reference lists below.
function Fn({ sig, children }: { sig: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-2">
      <Code>{sig}</Code>
      <span>{children}</span>
    </div>
  )
}

function FormulaHelpContent() {
  return (
    <>
      <Section title="Basics">
        <p>
          A formula is a normal arithmetic expression: <Code>+</Code> <Code>-</Code> <Code>*</Code> <Code>/</Code>,
          parentheses for grouping, and number literals like <Code>1000</Code> or <Code>0.1</Code>. Example:{' '}
          <Code>0.1 * salary + 500</Code>.
        </p>
        <p>
          A condition (used for "applies this year" fields) is a yes/no expression built from comparisons —{' '}
          <Code>&lt;</Code> <Code>&lt;=</Code> <Code>&gt;</Code> <Code>&gt;=</Code> <Code>==</Code> <Code>!=</Code> —
          combined with <Code>&&</Code> (and), <Code>||</Code> (or), and <Code>!</Code> (not). Example:{' '}
          <Code>year &gt;= 2040 && netWorth &gt; 0</Code>.
        </p>
      </Section>

      <Section title="Referencing variables and years">
        <p>
          Type <Code>[</Code> anywhere in the box to search every variable, special year, and constant available
          here and insert it — the only way to insert one. A plain name like <Code>salary</Code> works bare; a name
          with spaces or punctuation (e.g. a variable called "401k Match") is wrapped automatically, as{' '}
          <Code>[401k Match]</Code> — both forms mean the same thing.
        </p>
        <p>
          <Code>year</Code> is always available and means the calendar year currently being evaluated.{' '}
          <Code>age</Code>/<Code>spouseAge</Code> are available once a birth date is set. Special years you've
          defined, plus the built-ins <Code>[Current year]</Code>, <Code>[Death year]</Code>, and{' '}
          <Code>[Death age]</Code>, are also offered through <Code>[</Code>.
        </p>
        <p>
          <Code>[infinity]</Code> is a constant for "never" — what <Code>first_year_when()</Code> and friends
          (below) return when their condition never holds.
        </p>
      </Section>

      <Section title="Math functions">
        <Fn sig="min(a, b, ...)">Smallest of two or more values.</Fn>
        <Fn sig="max(a, b, ...)">Largest of two or more values.</Fn>
        <Fn sig="round(x)">Rounds to the nearest whole number.</Fn>
        <Fn sig="if(condition, then, else)">
          Evaluates to <Code>then</Code> when <Code>condition</Code> holds, otherwise <Code>else</Code> — e.g.{' '}
          <Code>if(age &gt;= 65, 0, 500)</Code>.
        </Fn>
      </Section>

      <Section title="Looking back at prior years">
        <p>
          These take <Code>n</Code>, a whole number of years back from the year being evaluated (<Code>0</Code>{' '}
          means last year for income/spending/RMDs, or the start of this year for rates/balances).
        </p>
        <Fn sig="return_rate(n) / inflation_rate(n)">That year's actual drawn rate, as a percentage (e.g. 7 for 7%).</Fn>
        <Fn sig="net_worth(n)">Total net worth at the start of that year.</Fn>
        <Fn sig="previous_income(n) / previous_spending(n)">Total income or spending in that year.</Fn>
        <Fn sig="previous_rmd_self(n) / previous_rmd_spouse(n) / previous_rmd(n)">
          That year's required minimum distribution, by owner (<Code>previous_rmd</Code> is the combined total).
        </Fn>
        <Fn sig="pretax_self(n) / pretax_spouse(n) / pretax(n)">Pre-tax account balance at the start of that year.</Fn>
        <Fn sig="roth_self(n) / roth_spouse(n) / roth(n)">Roth account balance at the start of that year.</Fn>
        <Fn sig="roth_basis_self(n) / roth_basis_spouse(n) / roth_basis(n)">Roth contribution basis at the start of that year.</Fn>
        <Fn sig="taxable(n) / taxable_basis(n)">Taxable account balance and basis at the start of that year.</Fn>
        <Fn sig="hsa(n) / cash(n) / hysa(n)">HSA, cash, and high-yield savings balances at the start of that year.</Fn>
        <Fn sig="college529(n) / college529_basis(n)">529 balance and basis at the start of that year.</Fn>
      </Section>

      <Section title="Looking up a specific year or age">
        <p>
          Unlike the lookback functions above (relative to "now"), these ask about an absolute year or age anywhere
          in the projection.
        </p>
        <Fn sig="dollar_convert(amount, from_year, to_year)">
          Restates <Code>amount</Code> in another year's dollars, using this run's own inflation.
        </Fn>
        <Fn sig="rmd_in_year(year) / rmd_at_age(age) / rmd_at_spouse_age(age)">
          The household's total required minimum distribution in that year/age.
        </Fn>
        <p className="text-xs text-slate-400">
          The functions above work in any formula, but only for a year already reached by the projection. The ones
          below work only in a Goal or Metric formula, which can look forward or back across the whole run:
        </p>
        <Fn sig="net_worth_in_year(year) / net_worth_at_age(age) / net_worth_at_spouse_age(age)">
          Net worth at that point in the projection.
        </Fn>
        <Fn sig="<account>_in_year(year) / <account>_at_age(age) / <account>_at_spouse_age(age)">
          Same idea per account, e.g. <Code>roth_at_age(65)</Code>, <Code>taxable_in_year(2040)</Code> — one trio
          per account listed above.
        </Fn>
        <Fn sig="first_year_when(condition) / first_age_when(condition) / first_spouse_age_when(condition)">
          Scans the whole projection and returns the year/age/spouse age of the first row where{' '}
          <Code>condition</Code> holds (e.g. <Code>first_year_when(taxable(0) &lt;= 0)</Code>), or{' '}
          <Code>[infinity]</Code> if it never does.
        </Fn>
      </Section>

      <Section title="Custom functions">
        <p>
          Define your own reusable formula with named parameters in the "Custom functions" section (e.g.{' '}
          <Code>raise(base, pct) = base * (1 + pct / 100)</Code>), then call it from any formula here as{' '}
          <Code>raise(salary, 3)</Code>. A function only sees its own parameters as scope, and can call other
          functions but never itself, directly or indirectly.
        </p>
      </Section>
    </>
  )
}
