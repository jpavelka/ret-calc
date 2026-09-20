import { Fragment, useState, type ReactNode } from 'react'
import { CellHelp } from './CellHelp'
import { HelpTooltip } from './HelpTooltip'
import type { AccountFlow, InvestmentAccountKey, YearlyRates, YearProjectionRow } from './projection'
import { nominalReturnPct } from './simulation'
import type { BracketBreakdownEntry } from './tax'
import type { RetirementInputs } from './types'

interface ProjectionTableProps {
  rows: YearProjectionRow[]
  inputs: RetirementInputs
  // The historical (return, inflation) draw behind each row, for a
  // simulation run — rates[i] corresponds to rows[i]. Omitted for the
  // deterministic table, which has no per-year draw to show.
  rates?: YearlyRates[]
}

type DetailLevel = 'basic' | 'standard' | 'detailed'

const LEVELS: { id: DetailLevel; label: string; description: string }[] = [
  { id: 'basic', label: 'Basic', description: 'Year, age, income, expenses, taxes, account balances, net worth.' },
  {
    id: 'standard',
    label: 'Standard',
    description:
      "Adds savings/match and the cash-flow swing. Click the '?' next to any figure for its breakdown.",
  },
  {
    id: 'detailed',
    label: 'Detailed',
    description:
      'Every year broken into full sections: each income source, expense bucket, and savings line as its own column, taxes split by kind, and every balance — each investment account and total net worth — split into what was contributed vs. what it earned.',
  },
]

function fmt(value: number): string {
  return Math.round(value).toLocaleString('en-US')
}

function Money({ value, highlightNegative = false }: { value: number; highlightNegative?: boolean }) {
  const negative = highlightNegative && value < 0
  return (
    <span className={negative ? 'text-red-600' : undefined}>
      {value < 0 ? '-' : ''}${fmt(Math.abs(value))}
    </span>
  )
}

function sum(rows: YearProjectionRow[], get: (row: YearProjectionRow) => number): number {
  return rows.reduce((total, row) => total + get(row), 0)
}

function ageLabel(row: YearProjectionRow, spouseEnabled: boolean): string {
  const self = row.ageSelf ?? '–'
  return spouseEnabled && row.ageSpouse !== null ? `${self} / ${row.ageSpouse}` : String(self)
}

function pct(value: number): string {
  return `${value >= 0 ? '' : '-'}${Math.abs(value).toFixed(1)}%`
}

type DollarMode = 'nominal' | 'real'

// Every dollar figure in a row is nominal — that year's actual dollars, per
// the projection engine's convention (see projection.ts). To show "today's
// dollars" instead, divide back out the same compounding the engine used to
// grow amounts forward, i.e. the inverse of its inflationFactor. Exported so
// other nominal-dollar displays (e.g. SocialSecurityBenefitChart) can offer
// the same today's-dollars toggle without duplicating this math.
export function realDollarFactor(inputs: RetirementInputs, year: number): number {
  const currentYear = new Date().getFullYear()
  return 1 / (1 + inputs.inflationRatePct / 100) ** (year - currentYear)
}

// The per-run equivalent of realDollarFactor for a simulation: row i's
// nominal dollars were inflated forward by the cumulative product of
// rates[0..i-1]'s own inflationRatePct (runProjection's inflationFactor —
// see projection.ts), not by the flat assumed rate. A simulation's drawn
// inflation almost never matches that flat rate, so deflating with
// realDollarFactor instead of this made "today's dollars" expenses drift
// year to year even when the underlying plan held real spending flat.
function simulatedRealDollarFactors(rates: YearlyRates[]): number[] {
  const factors: number[] = []
  let inflationFactor = 1
  for (const yearRates of rates) {
    factors.push(1 / inflationFactor)
    inflationFactor *= 1 + yearRates.inflationRatePct / 100
  }
  return factors
}

// Scales a bracket breakdown's dollar fields — everything but `ratePct`,
// which is a percentage, not a dollar amount that inflated over time.
function dBracketBreakdown(entries: BracketBreakdownEntry[], d: (v: number) => number): BracketBreakdownEntry[] {
  return entries.map((e) => ({ ...e, min: d(e.min), max: e.max === null ? null : d(e.max), amount: d(e.amount), tax: d(e.tax) }))
}

// Scales every dollar field in a row by `factor`, leaving year/age/booleans
// alone. Used to convert a row from nominal to today's dollars for display —
// the underlying projection is always computed and stored in nominal terms.
function deflateRow(row: YearProjectionRow, factor: number): YearProjectionRow {
  if (factor === 1) return row
  const d = (v: number) => v * factor
  return {
    ...row,
    incomeTotal: d(row.incomeTotal),
    incomeBySource: row.incomeBySource.map((x) => ({ ...x, amount: d(x.amount) })),
    expenseTotal: d(row.expenseTotal),
    expenseByBucket: row.expenseByBucket.map((x) => ({ ...x, amount: d(x.amount) })),
    savingsEmployeeTotal: d(row.savingsEmployeeTotal),
    savingsEmployerMatchTotal: d(row.savingsEmployerMatchTotal),
    savingsByLine: row.savingsByLine.map((x) => ({
      ...x,
      contribution: d(x.contribution),
      match: d(x.match),
    })),
    preTaxSavingsDeferrals: d(row.preTaxSavingsDeferrals),
    hsaSavingsContributions: d(row.hsaSavingsContributions),
    ordinaryAgi: d(row.ordinaryAgi),
    taxDeductions: {
      federalStandardDeduction: d(row.taxDeductions.federalStandardDeduction),
      stateStandardDeduction: d(row.taxDeductions.stateStandardDeduction),
      statePersonalExemption: d(row.taxDeductions.statePersonalExemption),
      stateContributionDeduction: d(row.taxDeductions.stateContributionDeduction),
    },
    federalTax: d(row.federalTax),
    federalCapitalGainsTax: d(row.federalCapitalGainsTax),
    stateTax: d(row.stateTax),
    stateCapitalGainsTax: d(row.stateCapitalGainsTax),
    federalTaxableIncome: d(row.federalTaxableIncome),
    federalTaxableGains: d(row.federalTaxableGains),
    stateTaxableIncome: d(row.stateTaxableIncome),
    stateTaxableGains: d(row.stateTaxableGains),
    taxBracketBreakdown: {
      federalOrdinary: dBracketBreakdown(row.taxBracketBreakdown.federalOrdinary, d),
      federalGains: dBracketBreakdown(row.taxBracketBreakdown.federalGains, d),
      stateOrdinary: dBracketBreakdown(row.taxBracketBreakdown.stateOrdinary, d),
      stateGains: dBracketBreakdown(row.taxBracketBreakdown.stateGains, d),
    },
    socialSecurityTax: d(row.socialSecurityTax),
    medicareTax: d(row.medicareTax),
    additionalMedicareTax: d(row.additionalMedicareTax),
    earlyWithdrawalPenalty: d(row.earlyWithdrawalPenalty),
    totalTax: d(row.totalTax),
    socialSecurity: {
      self: d(row.socialSecurity.self),
      spouse: d(row.socialSecurity.spouse),
      total: d(row.socialSecurity.total),
      taxableFederal: d(row.socialSecurity.taxableFederal),
      taxableState: d(row.socialSecurity.taxableState),
    },
    extraTaxableSavings: d(row.extraTaxableSavings),
    withdrawals: {
      total: d(row.withdrawals.total),
      fromCash: d(row.withdrawals.fromCash),
      ordinaryIncome: d(row.withdrawals.ordinaryIncome),
      ordinaryIncomeByAccount: {
        preTaxSelf: d(row.withdrawals.ordinaryIncomeByAccount.preTaxSelf),
        preTaxSpouse: d(row.withdrawals.ordinaryIncomeByAccount.preTaxSpouse),
        rothSelf: d(row.withdrawals.ordinaryIncomeByAccount.rothSelf),
        rothSpouse: d(row.withdrawals.ordinaryIncomeByAccount.rothSpouse),
        hsa: d(row.withdrawals.ordinaryIncomeByAccount.hsa),
        college529: d(row.withdrawals.ordinaryIncomeByAccount.college529),
      },
      capitalGains: d(row.withdrawals.capitalGains),
      penalty: d(row.withdrawals.penalty),
      unfunded: d(row.withdrawals.unfunded),
      rmd: { self: d(row.withdrawals.rmd.self), spouse: d(row.withdrawals.rmd.spouse) },
      taxableBasisUsed: d(row.withdrawals.taxableBasisUsed),
      rothBasisUsed: {
        self: d(row.withdrawals.rothBasisUsed.self),
        spouse: d(row.withdrawals.rothBasisUsed.spouse),
      },
      college529BasisUsed: d(row.withdrawals.college529BasisUsed),
    },
    balances: {
      preTaxSelf: d(row.balances.preTaxSelf),
      preTaxSpouse: d(row.balances.preTaxSpouse),
      rothSelf: d(row.balances.rothSelf),
      rothSelfBasis: d(row.balances.rothSelfBasis),
      rothSpouse: d(row.balances.rothSpouse),
      rothSpouseBasis: d(row.balances.rothSpouseBasis),
      taxable: d(row.balances.taxable),
      taxableBasis: d(row.balances.taxableBasis),
      hsa: d(row.balances.hsa),
      cash: d(row.balances.cash),
      hysa: d(row.balances.hysa),
      college529: d(row.balances.college529),
      college529Basis: d(row.balances.college529Basis),
    },
    accountFlows: Object.fromEntries(
      Object.entries(row.accountFlows).map(([key, flow]) => [
        key,
        { contributions: d(flow.contributions), withdrawals: d(flow.withdrawals), growth: d(flow.growth) },
      ]),
    ) as YearProjectionRow['accountFlows'],
    rothConversion: {
      total: d(row.rothConversion.total),
      self: d(row.rothConversion.self),
      spouse: d(row.rothConversion.spouse),
    },
    hysaInterest: d(row.hysaInterest),
    netWorth: d(row.netWorth),
  }
}

// Year/Age stay pinned to the left edge while the rest of a wide table
// scrolls horizontally underneath them. Getting this right requires
// `table-layout: fixed` with an explicit <colgroup> — in the default "auto"
// table layout, a column's rendered width is driven by its content and can
// silently drift from whatever width a `w-*` class implies, which throws off
// a sticky column's `left` offset (gaps/overlaps at the boundary). Fixed
// layout honours the colgroup exactly — but only if the table is actually
// allowed to be as wide as the colgroup asks for. With the default
// `width: auto`, the table shrink-to-fits the scroll container instead and
// every specified column is scaled down proportionally, so the widths become
// mere ratios and the `left` offsets below drift out of alignment again (a
// 56px Year column renders 42px wide, leaving a transparent 14px gap that the
// scrolling columns show through, while Age overhangs the column after it by
// the same amount). Hence `w-max` on every table below: the sum of the
// colgroup is the table's width, the container scrolls, and these pixel
// constants are the single source of truth for both layout and stickiness.
// Both are sized to their widest real content plus the cells' 12px pr-3, and
// no wider — the columns after them are right-aligned numbers, so any slack
// here reads as one big empty channel between Age and the data.
// "2026" is ~34px at text-sm; "100 / 100" (the widest age label there can be)
// is ~64px, while a solo age never exceeds three digits.
const YEAR_COL_WIDTH = 52
const ageColWidth = (spouseEnabled: boolean) => (spouseEnabled ? 80 : 52)

const STICKY_YEAR_STYLE = { position: 'sticky', left: 0 } as const
const STICKY_AGE_STYLE = { position: 'sticky', left: YEAR_COL_WIDTH } as const
const STICKY_YEAR_CLASS = 'z-10 bg-white'
const STICKY_AGE_CLASS = 'z-10 whitespace-nowrap border-r border-slate-200 bg-white'

export function ProjectionTable({ rows, inputs, rates }: ProjectionTableProps) {
  const [level, setLevel] = useState<DetailLevel>('standard')
  const [dollarMode, setDollarMode] = useState<DollarMode>('nominal')

  if (rows.length === 0) {
    return (
      <p className="text-sm text-slate-400">
        Nothing to project yet — life expectancy must be at or beyond the current year.
      </p>
    )
  }

  const active = LEVELS.find((l) => l.id === level) ?? LEVELS[1]
  const simulatedFactors = rates ? simulatedRealDollarFactors(rates) : null
  const displayRows =
    dollarMode === 'real'
      ? rows.map((row, i) =>
          deflateRow(row, simulatedFactors ? simulatedFactors[i] : realDollarFactor(inputs, row.year)),
        )
      : rows

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1">
          {LEVELS.map((l) => (
            <button
              key={l.id}
              type="button"
              onClick={() => setLevel(l.id)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                l.id === level
                  ? 'bg-emerald-600 text-white'
                  : 'border border-slate-300 text-slate-600 hover:bg-slate-50'
              }`}
            >
              {l.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1">
          <div className="flex items-center gap-1">
            {(
              [
                { id: 'nominal', label: 'Nominal $' },
                { id: 'real', label: "Today's $" },
              ] as const
            ).map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setDollarMode(m.id)}
                className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                  m.id === dollarMode
                    ? 'bg-emerald-600 text-white'
                    : 'border border-slate-300 text-slate-600 hover:bg-slate-50'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
          <HelpTooltip
            text={
              'Nominal $ shows every figure in that year’s actual dollars, the same amounts the ' +
              'projection is computed in. Today’s $ divides each year’s figures back down by ' +
              'cumulative inflation, so they’re comparable to what a dollar buys right now — ' +
              'useful for judging purchasing power, but it also shrinks non-inflating amounts ' +
              '(like a fixed mortgage payment) even though their real burden falls over time ' +
              'the same way.'
            }
          />
        </div>
      </div>
      <p className="mt-2 text-xs text-slate-500">
        {active.description}
        {rates &&
          ' Return and Inflation show the historical year drawn for that simulated year — Return is ' +
            'that year’s actual nominal market return, the same figure balances were grown by.'}
      </p>

      <div className="mt-4">
        {level === 'basic' && (
          <BasicTable rows={displayRows} spouseEnabled={inputs.spouseEnabled} rates={rates} />
        )}
        {level === 'standard' && (
          <StandardTable rows={displayRows} spouseEnabled={inputs.spouseEnabled} rates={rates} />
        )}
        {level === 'detailed' && <DetailedTable rows={displayRows} inputs={inputs} rates={rates} />}
      </div>
    </div>
  )
}

export function ProjectionSectionHeading() {
  return (
    <>
      Year-by-year projection
      <HelpTooltip
        text={
          'Each year: income pays taxes, then the savings plan, then expenses. ' +
          'Whatever is left over is swept into the taxable brokerage account. ' +
          'If income falls short, the difference is drawn in a fixed order — cash, then ' +
          'high-yield savings, then taxable brokerage, then pre-tax, then Roth, then HSA, then ' +
          '529 — and the amount drawn is grossed up to cover the tax it triggers, since a ' +
          'withdrawal can itself be taxable. Selling from the taxable account realizes a ' +
          'long-term capital gain on the proportion of the balance that is not cost basis. ' +
          'Pre-tax withdrawals are ordinary income. Roth comes out basis first, and once the ' +
          'owner reaches 59½ the earnings are tax-free too; before that they are ordinary ' +
          'income. HSA withdrawals are ordinary income, since qualified medical expenses are ' +
          'not tracked yet. 529 withdrawals up to that year’s education-related spending are ' +
          'federal- and state-tax-free regardless of basis; any remainder’s earnings share is ' +
          'ordinary income plus a flat 10% federal penalty, with no age exemption. Withdrawing ' +
          'pre-tax or Roth before 59½ adds a 10% penalty (20% on an HSA before 65) — the whole ' +
          'year counts as penalty-free once the birthday falls in it. If every account runs dry ' +
          'the remainder still comes out of cash, which can go negative. ' +
          'Balances grow at your investment return (recombined with inflation, since that ' +
          'field is a real rate) after that year’s activity is posted; cash does not grow. ' +
          'High-yield savings grows at its own real rate, but its interest is taxed as ordinary ' +
          'income the year it’s earned rather than deferred like the taxable account’s gains, ' +
          'so a withdrawal from it is never itself taxable.'
        }
      />
    </>
  )
}

// ---------------------------------------------------------------------------
// Basic: the headline numbers only, one row per year.
// ---------------------------------------------------------------------------

const basicColWidths = (spouseEnabled: boolean, showRates: boolean) => [
  YEAR_COL_WIDTH,
  ageColWidth(spouseEnabled),
  ...(showRates ? [70, 70] : []),
  100,
  100,
  100,
  100,
  110,
  110,
  110,
  100,
  100,
  100,
  100,
  120,
]

function BasicTable({
  rows,
  spouseEnabled,
  rates,
}: {
  rows: YearProjectionRow[]
  spouseEnabled: boolean
  rates?: YearlyRates[]
}) {
  return (
    <div className="max-h-[32rem] overflow-auto">
      <table className="w-max table-fixed border-separate border-spacing-0 text-sm">
        <colgroup>
          {basicColWidths(spouseEnabled, !!rates).map((w, i) => (
            <col key={i} style={{ width: w }} />
          ))}
        </colgroup>
        <thead className="sticky top-0 z-20 bg-white">
          <tr className="border-b border-slate-200 text-left text-xs font-semibold text-slate-500">
            <th className={`py-2 pr-3 ${STICKY_YEAR_CLASS}`} style={STICKY_YEAR_STYLE}>Year</th>
            <th className={`py-2 pr-3 ${STICKY_AGE_CLASS}`} style={STICKY_AGE_STYLE}>Age</th>
            {rates && (
              <>
                <th className="py-2 pr-3 text-right">Return</th>
                <th className="py-2 pr-3 text-right">Inflation</th>
              </>
            )}
            <th className="py-2 pr-3 text-right">Income</th>
            <th className="py-2 pr-3 text-right">Social Security</th>
            <th className="py-2 pr-3 text-right">Expenses</th>
            <th className="py-2 pr-3 text-right">Taxes</th>
            <th className="py-2 pr-3 text-right">Pre-tax</th>
            <th className="py-2 pr-3 text-right">Roth</th>
            <th className="py-2 pr-3 text-right">Taxable</th>
            <th className="py-2 pr-3 text-right">HSA</th>
            <th className="py-2 pr-3 text-right">529</th>
            <th className="py-2 pr-3 text-right">HYSA</th>
            <th className="py-2 pr-3 text-right">Cash</th>
            <th className="py-2 pr-3 text-right">Net worth</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={row.year} className="border-b border-slate-100">
              <td className={`py-1.5 pr-3 font-medium text-slate-700 ${STICKY_YEAR_CLASS}`} style={STICKY_YEAR_STYLE}>
                {row.year}
              </td>
              <td className={`py-1.5 pr-3 text-slate-500 ${STICKY_AGE_CLASS}`} style={STICKY_AGE_STYLE}>
                {ageLabel(row, spouseEnabled)}
              </td>
              {rates && (
                <>
                  <td className="py-1.5 pr-3 text-right text-slate-700">{pct(nominalReturnPct(rates[i]))}</td>
                  <td className="py-1.5 pr-3 text-right text-slate-700">{pct(rates[i].inflationRatePct)}</td>
                </>
              )}
              <td className="py-1.5 pr-3 text-right text-slate-700">${fmt(row.incomeTotal)}</td>
              <td className="py-1.5 pr-3 text-right text-slate-700">${fmt(row.socialSecurity.total)}</td>
              <td className="py-1.5 pr-3 text-right text-slate-700">${fmt(row.expenseTotal)}</td>
              <td className="py-1.5 pr-3 text-right text-slate-700">${fmt(row.totalTax)}</td>
              <td className="py-1.5 pr-3 text-right text-slate-700">
                ${fmt(row.balances.preTaxSelf + row.balances.preTaxSpouse)}
              </td>
              <td className="py-1.5 pr-3 text-right text-slate-700">
                ${fmt(row.balances.rothSelf + row.balances.rothSpouse)}
              </td>
              <td className="py-1.5 pr-3 text-right text-slate-700">${fmt(row.balances.taxable)}</td>
              <td className="py-1.5 pr-3 text-right text-slate-700">${fmt(row.balances.hsa)}</td>
              <td className="py-1.5 pr-3 text-right text-slate-700">${fmt(row.balances.college529)}</td>
              <td className="py-1.5 pr-3 text-right text-slate-700">${fmt(row.balances.hysa)}</td>
              <td className="py-1.5 pr-3 text-right">
                <Money value={row.balances.cash} highlightNegative />
              </td>
              <td className="py-1.5 pr-3 text-right font-medium text-slate-900">
                <Money value={row.netWorth} highlightNegative />
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-slate-300 bg-slate-50 font-semibold text-slate-700">
            <td className={`py-1.5 pr-3 text-slate-900 ${STICKY_YEAR_CLASS}`} style={STICKY_YEAR_STYLE}>
              Total
            </td>
            <td className={STICKY_AGE_CLASS} style={STICKY_AGE_STYLE} />
            {/* Rates and balances aren't summed across years. */}
            {rates && (
              <>
                <td className="py-1.5 pr-3" />
                <td className="py-1.5 pr-3" />
              </>
            )}
            <td className="py-1.5 pr-3 text-right">${fmt(sum(rows, (r) => r.incomeTotal))}</td>
            <td className="py-1.5 pr-3 text-right">${fmt(sum(rows, (r) => r.socialSecurity.total))}</td>
            <td className="py-1.5 pr-3 text-right">${fmt(sum(rows, (r) => r.expenseTotal))}</td>
            <td className="py-1.5 pr-3 text-right">${fmt(sum(rows, (r) => r.totalTax))}</td>
            <td className="py-1.5 pr-3" />
            <td className="py-1.5 pr-3" />
            <td className="py-1.5 pr-3" />
            <td className="py-1.5 pr-3" />
            <td className="py-1.5 pr-3" />
            <td className="py-1.5 pr-3" />
            <td className="py-1.5 pr-3" />
            <td className="py-1.5 pr-3" />
          </tr>
        </tfoot>
      </table>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Standard: headline numbers plus savings/match/cash-flow. Every value cell
// carries a CellHelp "?" whose popup breaks that one figure down — one
// consistent list style (BreakdownList) for every cell, rather than each
// section inventing its own markup.
// ---------------------------------------------------------------------------

interface BreakdownRow {
  label: string
  amount: number
  // A computed step rather than an input, e.g. "→ Federal tax" — rendered
  // italic/muted with an arrow.
  derived?: boolean
  // One level deeper than a normal row, e.g. a tax bracket line under
  // "→ Federal tax", or a basis/gain split under a withdrawal.
  sub?: boolean
  // Starts a new derivation section: divider plus extra top margin.
  section?: boolean
  // Rose/red — e.g. "Unfunded".
  warn?: boolean
}

function BreakdownList({ rows, empty = 'None' }: { rows: BreakdownRow[]; empty?: string }) {
  if (rows.length === 0) return <p className="text-slate-400">{empty}</p>
  return (
    <ul className="flex flex-col gap-0.5">
      {rows.map((r, i) => (
        <li
          key={i}
          className={[
            'flex justify-between gap-4',
            r.derived || r.sub ? 'italic' : '',
            r.sub ? 'pl-3' : '',
            r.section ? 'mt-1 border-t border-slate-200 pt-1' : '',
          ]
            .filter(Boolean)
            .join(' ')}
        >
          <span className={r.warn ? 'text-rose-500' : r.derived || r.sub ? 'text-slate-400' : 'text-slate-500'}>
            {r.derived ? `→ ${r.label}` : r.label}
          </span>
          <span className={r.warn ? 'text-rose-600' : r.derived || r.sub ? 'text-slate-500' : 'text-slate-700'}>
            {r.amount < 0 ? '-' : ''}${fmt(Math.abs(r.amount))}
          </span>
        </li>
      ))}
    </ul>
  )
}

function bracketRows(label: string, entries: BracketBreakdownEntry[]): BreakdownRow[] {
  return entries
    .filter((b) => b.amount > 0)
    .map((b) => ({
      label: `${label}: ${b.ratePct}% of $${fmt(b.amount)}`,
      amount: b.tax,
      sub: true,
    }))
}

// The full income → AGI → deduction → taxable base → tax-by-bracket
// derivation, per jurisdiction, plus payroll tax and any penalty. Same steps
// the old hand-rolled Taxes panel walked through, now as BreakdownList rows
// with the standard deduction/exemption and per-bracket amounts (previously
// nowhere in the UI) made explicit. AGI and capital gains realized are the
// same inputs to both jurisdictions' calculations (see tax.ts's
// computeIncomeTaxes), so each is repeated once per jurisdiction section
// rather than shown only once up top — deductions differ per jurisdiction,
// so the reader needs both restated to follow either derivation on its own.
function taxBreakdownRows(row: YearProjectionRow): BreakdownRow[] {
  const preTaxDistributions =
    row.withdrawals.ordinaryIncomeByAccount.preTaxSelf + row.withdrawals.ordinaryIncomeByAccount.preTaxSpouse
  const rothEarlyWithdrawals =
    row.withdrawals.ordinaryIncomeByAccount.rothSelf + row.withdrawals.ordinaryIncomeByAccount.rothSpouse
  const hsaNonQualifiedWithdrawals = row.withdrawals.ordinaryIncomeByAccount.hsa
  const college529NonQualifiedWithdrawals = row.withdrawals.ordinaryIncomeByAccount.college529

  const rows: BreakdownRow[] = [{ label: 'Income', amount: row.incomeTotal }]
  if (row.preTaxSavingsDeferrals > 0) {
    rows.push({ label: '− Pre-tax savings', amount: row.preTaxSavingsDeferrals })
  }
  if (row.hsaSavingsContributions > 0) {
    rows.push({ label: '− HSA contributions', amount: row.hsaSavingsContributions })
  }
  if (row.rothConversion.total > 0) {
    rows.push({ label: '+ Roth conversion', amount: row.rothConversion.total })
  }
  if (row.hysaInterest > 0) {
    rows.push({ label: '+ HYSA interest', amount: row.hysaInterest })
  }
  if (preTaxDistributions > 0) {
    rows.push({ label: '+ Pre-tax distributions', amount: preTaxDistributions })
  }
  if (rothEarlyWithdrawals > 0) {
    rows.push({ label: '+ Roth early withdrawals', amount: rothEarlyWithdrawals })
  }
  if (hsaNonQualifiedWithdrawals > 0) {
    rows.push({ label: '+ HSA non-qualified withdrawals', amount: hsaNonQualifiedWithdrawals })
  }
  if (college529NonQualifiedWithdrawals > 0) {
    rows.push({ label: '+ 529 non-qualified withdrawals', amount: college529NonQualifiedWithdrawals })
  }
  rows.push({ label: 'Adjusted gross income (ordinary)', amount: row.ordinaryAgi, derived: true, section: true })

  // The standard deduction absorbs ordinary AGI first and spills onto gains
  // (see tax.ts's scheduleTax) — whatever's left over after that is what
  // actually reduces this year's taxable capital gains.
  const unusedFederalDeduction = Math.max(0, row.taxDeductions.federalStandardDeduction - row.ordinaryAgi)
  const stateDeductionTotal =
    row.taxDeductions.stateStandardDeduction +
    row.taxDeductions.statePersonalExemption +
    row.taxDeductions.stateContributionDeduction
  const unusedStateDeduction = Math.max(0, stateDeductionTotal - row.ordinaryAgi)

  rows.push({
    label: '− Federal standard deduction',
    amount: row.taxDeductions.federalStandardDeduction,
    section: true,
  })
  rows.push({ label: 'Federal taxable (ordinary)', amount: row.federalTaxableIncome, derived: true })
  rows.push({ label: 'Federal tax', amount: row.federalTax - row.federalCapitalGainsTax, derived: true })
  rows.push(...bracketRows('Federal', row.taxBracketBreakdown.federalOrdinary))
  if (row.withdrawals.capitalGains > 0) {
    rows.push({ label: '+ Capital gains (brokerage sale)', amount: row.withdrawals.capitalGains, section: true })
    if (unusedFederalDeduction > 0) {
      rows.push({ label: '− Federal deduction (unused portion)', amount: unusedFederalDeduction })
    }
    rows.push({ label: 'Federal taxable (cap. gains)', amount: row.federalTaxableGains, derived: true })
    rows.push({ label: 'Federal gains tax', amount: row.federalCapitalGainsTax, derived: true })
    rows.push(...bracketRows('Fed. gains', row.taxBracketBreakdown.federalGains))
  }

  rows.push({ label: 'Adjusted gross income (ordinary)', amount: row.ordinaryAgi, section: true })
  rows.push({ label: '− State standard deduction', amount: row.taxDeductions.stateStandardDeduction })
  if (row.taxDeductions.statePersonalExemption > 0) {
    rows.push({ label: '− State personal exemption', amount: row.taxDeductions.statePersonalExemption })
  }
  if (row.taxDeductions.stateContributionDeduction > 0) {
    rows.push({ label: '− State 529 contribution deduction', amount: row.taxDeductions.stateContributionDeduction })
  }
  rows.push({ label: 'State taxable (ordinary)', amount: row.stateTaxableIncome, derived: true })
  rows.push({ label: 'State tax', amount: row.stateTax - row.stateCapitalGainsTax, derived: true })
  rows.push(...bracketRows('State', row.taxBracketBreakdown.stateOrdinary))
  if (row.withdrawals.capitalGains > 0) {
    rows.push({ label: '+ Capital gains (brokerage sale)', amount: row.withdrawals.capitalGains, section: true })
    if (unusedStateDeduction > 0) {
      rows.push({ label: '− State deduction (unused portion)', amount: unusedStateDeduction })
    }
    rows.push({ label: 'State taxable (cap. gains)', amount: row.stateTaxableGains, derived: true })
    rows.push({ label: 'State gains tax', amount: row.stateCapitalGainsTax, derived: true })
    rows.push(...bracketRows('St. gains', row.taxBracketBreakdown.stateGains))
  }

  rows.push({ label: 'Social Security', amount: row.socialSecurityTax, section: true })
  rows.push({ label: 'Medicare', amount: row.medicareTax + row.additionalMedicareTax })
  if (row.earlyWithdrawalPenalty > 0) {
    rows.push({ label: 'Early withdrawal penalty', amount: row.earlyWithdrawalPenalty })
  }
  rows.push({ label: 'Total', amount: row.totalTax, derived: true, section: true })
  return rows
}

// Per-account breakdown of what the default withdrawal rule drew this year.
// "Unfunded" is the part no account could cover, which drives cash negative.
function withdrawalRows(row: YearProjectionRow, spouseEnabled: boolean): BreakdownRow[] {
  const items: BreakdownRow[] = [
    { label: 'Cash', amount: row.withdrawals.fromCash },
    { label: 'HYSA', amount: row.accountFlows.hysa.withdrawals },
    { label: 'Taxable', amount: row.accountFlows.taxable.withdrawals },
    {
      // accountFlows.preTaxSelf.withdrawals also includes this year's Roth
      // conversion (needed for the Detailed table's balance reconciliation),
      // which isn't a withdrawal rule draw — netted back out here so this
      // stays scoped to what the default rule actually drew.
      label: spouseEnabled ? 'Pre-tax (You)' : 'Pre-tax',
      amount: row.accountFlows.preTaxSelf.withdrawals - row.rothConversion.self,
    },
    ...(spouseEnabled
      ? [
          {
            label: 'Pre-tax (Spouse)',
            amount: row.accountFlows.preTaxSpouse.withdrawals - row.rothConversion.spouse,
          },
        ]
      : []),
    { label: spouseEnabled ? 'Roth (You)' : 'Roth', amount: row.accountFlows.rothSelf.withdrawals },
    ...(spouseEnabled ? [{ label: 'Roth (Spouse)', amount: row.accountFlows.rothSpouse.withdrawals }] : []),
    { label: 'HSA', amount: row.accountFlows.hsa.withdrawals },
    { label: '529', amount: row.accountFlows.college529.withdrawals },
  ].filter((item) => item.amount > 0)

  if (items.length === 0 && row.withdrawals.unfunded === 0) return []

  const rows = [...items]
  if (row.withdrawals.unfunded > 0) {
    rows.push({ label: 'Unfunded', amount: row.withdrawals.unfunded, warn: true })
  }
  if (row.withdrawals.rmd.self > 0) {
    rows.push({
      label: `of which required minimum distribution${spouseEnabled ? ' (You)' : ''}`,
      amount: row.withdrawals.rmd.self,
      sub: true,
      section: true,
    })
  }
  if (row.withdrawals.rmd.spouse > 0) {
    rows.push({
      label: `of which required minimum distribution${spouseEnabled ? ' (Spouse)' : ''}`,
      amount: row.withdrawals.rmd.spouse,
      sub: true,
    })
  }
  if (row.withdrawals.capitalGains > 0) {
    rows.push({ label: 'Gains realized', amount: row.withdrawals.capitalGains, sub: true, section: true })
  }
  if (row.withdrawals.ordinaryIncome > 0) {
    rows.push({ label: 'Taxed as income', amount: row.withdrawals.ordinaryIncome, sub: true })
  }
  return rows
}

// Sums each investment account's contributions/withdrawals/growth into one
// total — the same three numbers Net worth's cell shows, aggregated across
// every account rather than per-account.
function sumAccountFlows(row: YearProjectionRow): AccountFlow {
  return Object.values(row.accountFlows).reduce(
    (total, flow) => ({
      contributions: total.contributions + flow.contributions,
      withdrawals: total.withdrawals + flow.withdrawals,
      growth: total.growth + flow.growth,
    }),
    { contributions: 0, withdrawals: 0, growth: 0 },
  )
}

// Contributions/withdrawals/growth/balance rows for one investment account,
// shared by the Pre-tax/Roth/Taxable/HSA cell popovers. `basis` and
// `basisUsed` (this year's tax-free return-of-basis portion of the
// withdrawal, if any) only apply to Roth and Taxable.
function accountRows(
  ownerLabel: string,
  flow: AccountFlow,
  balance: number,
  basis?: number,
  basisUsed?: number,
): BreakdownRow[] {
  const rows: BreakdownRow[] = [{ label: ownerLabel, amount: balance, section: true }]
  if (flow.contributions > 0) rows.push({ label: 'Contributions', amount: flow.contributions })
  if (flow.withdrawals > 0) {
    rows.push({ label: 'Withdrawals', amount: flow.withdrawals })
    if (basisUsed !== undefined) {
      rows.push({ label: 'Of which basis (tax-free)', amount: basisUsed, sub: true })
      rows.push({ label: 'Of which gain/earnings', amount: flow.withdrawals - basisUsed, sub: true })
    }
  }
  rows.push({ label: 'Growth', amount: flow.growth })
  if (basis !== undefined) rows.push({ label: 'Cost basis', amount: basis })
  return rows
}

// Each numeric column got a little wider than Basic's equivalent to make
// room for the CellHelp "?" glyph next to the value without wrapping.
const standardColWidths = (spouseEnabled: boolean, showRates: boolean) => [
  YEAR_COL_WIDTH,
  ageColWidth(spouseEnabled),
  ...(showRates ? [70, 70] : []),
  116,
  116,
  116,
  116,
  116,
  116,
  178,
  126,
  126,
  126,
  116,
  116,
  116,
  116,
  136,
]

// One value cell: the figure itself plus a CellHelp "?" whose popup shows
// what goes into it. `value` is usually a plain "$1,234" string, but takes a
// ReactNode so cells that can go negative can pass a <Money> instead (for its
// red highlighting).
function ValueCell({
  value,
  label,
  bold,
  children,
}: {
  value: ReactNode
  label: string
  bold?: boolean
  children: ReactNode
}) {
  return (
    <td className={`py-1.5 pr-3 text-right ${bold ? 'font-medium text-slate-900' : 'text-slate-700'}`}>
      <span className="inline-flex items-center justify-end gap-1">
        {value}
        <CellHelp label={label}>{children}</CellHelp>
      </span>
    </td>
  )
}

function StandardTable({
  rows,
  spouseEnabled,
  rates,
}: {
  rows: YearProjectionRow[]
  spouseEnabled: boolean
  rates?: YearlyRates[]
}) {
  return (
    <div className="max-h-[32rem] overflow-auto">
      <table className="w-max table-fixed border-separate border-spacing-0 text-sm">
        <colgroup>
          {standardColWidths(spouseEnabled, !!rates).map((w, i) => (
            <col key={i} style={{ width: w }} />
          ))}
        </colgroup>
        <thead className="sticky top-0 z-20 bg-white">
          <tr className="border-b border-slate-200 text-left text-xs font-semibold text-slate-500">
            <th className={`py-2 pr-3 ${STICKY_YEAR_CLASS}`} style={STICKY_YEAR_STYLE}>Year</th>
            <th className={`py-2 pr-3 ${STICKY_AGE_CLASS}`} style={STICKY_AGE_STYLE}>Age</th>
            {rates && (
              <>
                <th className="py-2 pr-3 text-right">Return</th>
                <th className="py-2 pr-3 text-right">Inflation</th>
              </>
            )}
            <th className="py-2 pr-3 text-right">Income</th>
            <th className="py-2 pr-3 text-right">Social Security</th>
            <th className="py-2 pr-3 text-right">Expenses</th>
            <th className="py-2 pr-3 text-right">Savings</th>
            <th className="py-2 pr-3 text-right">Match</th>
            <th className="py-2 pr-3 text-right">Taxes</th>
            <th className="py-2 pr-3 text-right">To taxable / withdrawn</th>
            <th className="py-2 pr-3 text-right">Pre-tax</th>
            <th className="py-2 pr-3 text-right">Roth</th>
            <th className="py-2 pr-3 text-right">Taxable</th>
            <th className="py-2 pr-3 text-right">HSA</th>
            <th className="py-2 pr-3 text-right">529</th>
            <th className="py-2 pr-3 text-right">HYSA</th>
            <th className="py-2 pr-3 text-right">Cash</th>
            <th className="py-2 pr-3 text-right">Net worth</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            // Negative shows the whole gap that had to be funded, including any
            // part no account could cover.
            const net = row.extraTaxableSavings - (row.withdrawals.total + row.withdrawals.unfunded)

            const withdrawalDetail = withdrawalRows(row, spouseEnabled)
            const netCellRows: BreakdownRow[] = [
              { label: 'To taxable (leftover swept in)', amount: row.extraTaxableSavings },
              { label: 'Withdrawn (default rule)', amount: row.withdrawals.total },
              ...(row.withdrawals.unfunded > 0
                ? [{ label: 'Unfunded', amount: row.withdrawals.unfunded, warn: true }]
                : []),
              { label: 'Net', amount: net, derived: true, section: true },
              ...withdrawalDetail.map((r, idx) => (idx === 0 ? { ...r, section: true } : r)),
            ]

            const preTaxRows = spouseEnabled
              ? [
                  ...accountRows('Pre-tax (You)', row.accountFlows.preTaxSelf, row.balances.preTaxSelf),
                  ...accountRows('Pre-tax (Spouse)', row.accountFlows.preTaxSpouse, row.balances.preTaxSpouse),
                ]
              : accountRows('Pre-tax', row.accountFlows.preTaxSelf, row.balances.preTaxSelf)

            const rothRows = spouseEnabled
              ? [
                  ...accountRows(
                    'Roth (You)',
                    row.accountFlows.rothSelf,
                    row.balances.rothSelf,
                    row.balances.rothSelfBasis,
                    row.accountFlows.rothSelf.withdrawals > 0 ? row.withdrawals.rothBasisUsed.self : undefined,
                  ),
                  ...accountRows(
                    'Roth (Spouse)',
                    row.accountFlows.rothSpouse,
                    row.balances.rothSpouse,
                    row.balances.rothSpouseBasis,
                    row.accountFlows.rothSpouse.withdrawals > 0 ? row.withdrawals.rothBasisUsed.spouse : undefined,
                  ),
                ]
              : accountRows(
                  'Roth',
                  row.accountFlows.rothSelf,
                  row.balances.rothSelf,
                  row.balances.rothSelfBasis,
                  row.accountFlows.rothSelf.withdrawals > 0 ? row.withdrawals.rothBasisUsed.self : undefined,
                )

            const taxableRows = accountRows(
              'Taxable',
              row.accountFlows.taxable,
              row.balances.taxable,
              row.balances.taxableBasis,
              row.accountFlows.taxable.withdrawals > 0 ? row.withdrawals.taxableBasisUsed : undefined,
            )

            const hsaRows = accountRows('HSA', row.accountFlows.hsa, row.balances.hsa)

            const college529Rows = accountRows(
              '529',
              row.accountFlows.college529,
              row.balances.college529,
              row.balances.college529Basis,
              row.accountFlows.college529.withdrawals > 0 ? row.withdrawals.college529BasisUsed : undefined,
            )

            const hysaRows = accountRows('HYSA', row.accountFlows.hysa, row.balances.hysa)

            const cashRows: BreakdownRow[] = [{ label: 'Ending balance', amount: row.balances.cash }]
            if (row.withdrawals.fromCash > 0) {
              cashRows.push({ label: 'Drawn to cover shortfall', amount: row.withdrawals.fromCash })
            }
            if (row.withdrawals.unfunded > 0) {
              cashRows.push({
                label: 'Unfunded (shortfall no account covered)',
                amount: row.withdrawals.unfunded,
                warn: true,
              })
            }

            const accountTotals = sumAccountFlows(row)
            const netWorthRows: BreakdownRow[] = [
              { label: 'Contributions', amount: accountTotals.contributions },
              { label: 'Withdrawals', amount: accountTotals.withdrawals },
              { label: 'Growth', amount: accountTotals.growth },
              { label: 'Cash', amount: row.balances.cash, section: true },
              { label: 'Net worth', amount: row.netWorth, derived: true },
            ]

            return (
              <tr key={row.year} className="border-b border-slate-100">
                <td className={`py-1.5 pr-3 font-medium text-slate-700 ${STICKY_YEAR_CLASS}`} style={STICKY_YEAR_STYLE}>
                  {row.year}
                </td>
                <td className={`py-1.5 pr-3 text-slate-500 ${STICKY_AGE_CLASS}`} style={STICKY_AGE_STYLE}>
                  {ageLabel(row, spouseEnabled)}
                </td>
                {rates && (
                  <>
                    <td className="py-1.5 pr-3 text-right text-slate-700">{pct(nominalReturnPct(rates[i]))}</td>
                    <td className="py-1.5 pr-3 text-right text-slate-700">{pct(rates[i].inflationRatePct)}</td>
                  </>
                )}
                <ValueCell value={`$${fmt(row.incomeTotal)}`} label="Income">
                  <BreakdownList rows={row.incomeBySource.map((s) => ({ label: s.name, amount: s.amount }))} />
                </ValueCell>
                <ValueCell value={`$${fmt(row.socialSecurity.total)}`} label="Social Security">
                  <BreakdownList
                    rows={[
                      ...(spouseEnabled
                        ? [
                            { label: 'You', amount: row.socialSecurity.self },
                            { label: 'Spouse', amount: row.socialSecurity.spouse },
                          ]
                        : []),
                      {
                        label: 'Taxable (federal)',
                        amount: row.socialSecurity.taxableFederal,
                        section: spouseEnabled,
                      },
                      ...(row.socialSecurity.taxableState > 0
                        ? [{ label: 'Taxable (state)', amount: row.socialSecurity.taxableState }]
                        : []),
                    ]}
                  />
                </ValueCell>
                <ValueCell value={`$${fmt(row.expenseTotal)}`} label="Expenses">
                  <BreakdownList rows={row.expenseByBucket.map((s) => ({ label: s.name, amount: s.amount }))} />
                </ValueCell>
                <ValueCell value={`$${fmt(row.savingsEmployeeTotal)}`} label="Savings">
                  <BreakdownList
                    rows={row.savingsByLine.map((l) => ({ label: l.name, amount: l.contribution }))}
                  />
                </ValueCell>
                <ValueCell value={`$${fmt(row.savingsEmployerMatchTotal)}`} label="Match">
                  <BreakdownList
                    rows={row.savingsByLine
                      .filter((l) => l.match > 0)
                      .map((l) => ({ label: l.name, amount: l.match }))}
                  />
                </ValueCell>
                <ValueCell value={`$${fmt(row.totalTax)}`} label="Taxes">
                  <BreakdownList rows={taxBreakdownRows(row)} />
                </ValueCell>
                <ValueCell value={<Money value={net} highlightNegative />} label="To taxable / withdrawn">
                  <BreakdownList rows={netCellRows} />
                </ValueCell>
                <ValueCell
                  value={`$${fmt(row.balances.preTaxSelf + row.balances.preTaxSpouse)}`}
                  label="Pre-tax"
                >
                  <BreakdownList rows={preTaxRows} />
                </ValueCell>
                <ValueCell value={`$${fmt(row.balances.rothSelf + row.balances.rothSpouse)}`} label="Roth">
                  <BreakdownList rows={rothRows} />
                </ValueCell>
                <ValueCell value={`$${fmt(row.balances.taxable)}`} label="Taxable">
                  <BreakdownList rows={taxableRows} />
                </ValueCell>
                <ValueCell value={`$${fmt(row.balances.hsa)}`} label="HSA">
                  <BreakdownList rows={hsaRows} />
                </ValueCell>
                <ValueCell value={`$${fmt(row.balances.college529)}`} label="529">
                  <BreakdownList rows={college529Rows} />
                </ValueCell>
                <ValueCell value={<Money value={row.balances.hysa} highlightNegative />} label="HYSA">
                  <BreakdownList rows={hysaRows} />
                </ValueCell>
                <ValueCell value={<Money value={row.balances.cash} highlightNegative />} label="Cash">
                  <BreakdownList rows={cashRows} />
                  <p className="mt-1 text-slate-400">Cash isn't invested, so it never grows.</p>
                </ValueCell>
                <ValueCell value={<Money value={row.netWorth} highlightNegative />} label="Net worth" bold>
                  <BreakdownList rows={netWorthRows} />
                </ValueCell>
              </tr>
            )
          })}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-slate-300 bg-slate-50 font-semibold text-slate-700">
            <td className={`py-1.5 pr-3 text-slate-900 ${STICKY_YEAR_CLASS}`} style={STICKY_YEAR_STYLE}>
              Total
            </td>
            <td className={STICKY_AGE_CLASS} style={STICKY_AGE_STYLE} />
            {rates && (
              <>
                <td className="py-1.5 pr-3" />
                <td className="py-1.5 pr-3" />
              </>
            )}
            <td className="py-1.5 pr-3 text-right">${fmt(sum(rows, (r) => r.incomeTotal))}</td>
            <td className="py-1.5 pr-3 text-right">${fmt(sum(rows, (r) => r.socialSecurity.total))}</td>
            <td className="py-1.5 pr-3 text-right">${fmt(sum(rows, (r) => r.expenseTotal))}</td>
            <td className="py-1.5 pr-3 text-right">${fmt(sum(rows, (r) => r.savingsEmployeeTotal))}</td>
            <td className="py-1.5 pr-3 text-right">${fmt(sum(rows, (r) => r.savingsEmployerMatchTotal))}</td>
            <td className="py-1.5 pr-3 text-right">${fmt(sum(rows, (r) => r.totalTax))}</td>
            <td className="py-1.5 pr-3 text-right">
              <Money
                value={sum(rows, (r) => r.extraTaxableSavings - (r.withdrawals.total + r.withdrawals.unfunded))}
                highlightNegative
              />
            </td>
            {/* Balances aren't summed across years — only the current year's is meaningful. */}
            <td className="py-1.5 pr-3" />
            <td className="py-1.5 pr-3" />
            <td className="py-1.5 pr-3" />
            <td className="py-1.5 pr-3" />
            <td className="py-1.5 pr-3" />
            <td className="py-1.5 pr-3" />
            <td className="py-1.5 pr-3" />
            <td className="py-1.5 pr-3" />
          </tr>
        </tfoot>
      </table>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Detailed: every section broken into its own columns — a column per income
// source, expense bucket, and savings line; taxes split by kind; each
// investment account's balance, and the net-worth total, split into this
// year's contributions vs. this year's growth. One wide table, grouped
// headers.
// ---------------------------------------------------------------------------

interface ColumnGroup {
  label: string
  columns: { key: string; label: string; total?: boolean }[]
}

function GroupHeaderRow({ groups, showRates }: { groups: ColumnGroup[]; showRates: boolean }) {
  return (
    <tr className="text-left text-[11px] font-semibold text-slate-500">
      <th
        rowSpan={2}
        className={`border-b border-slate-200 py-2 pr-3 align-bottom ${STICKY_YEAR_CLASS}`}
        style={STICKY_YEAR_STYLE}
      >
        Year
      </th>
      <th
        rowSpan={2}
        className={`border-b border-slate-200 py-2 pr-3 align-bottom ${STICKY_AGE_CLASS}`}
        style={STICKY_AGE_STYLE}
      >
        Age
      </th>
      {showRates && (
        <>
          <th rowSpan={2} className="border-b border-slate-200 py-2 px-2 text-right align-bottom">
            Return
          </th>
          <th rowSpan={2} className="border-b border-slate-200 py-2 px-2 text-right align-bottom">
            Inflation
          </th>
        </>
      )}
      {groups.map((g) => (
        <th
          key={g.label}
          colSpan={g.columns.length}
          className="border-b border-l border-slate-200 py-1.5 px-2 text-center"
        >
          {g.label}
        </th>
      ))}
    </tr>
  )
}

function GroupSubHeaderRow({ groups }: { groups: ColumnGroup[] }) {
  return (
    <tr className="text-left text-[11px] text-slate-400">
      {groups.map((g) =>
        g.columns.map((c, i) => (
          <th
            key={`${g.label}-${c.key}`}
            className={`border-b border-slate-200 py-1.5 px-2 text-right font-normal ${
              i === 0 ? 'border-l' : ''
            }`}
          >
            {c.label}
          </th>
        )),
      )}
    </tr>
  )
}

function DetailedTable({
  rows,
  inputs,
  rates,
}: {
  rows: YearProjectionRow[]
  inputs: RetirementInputs
  rates?: YearlyRates[]
}) {
  const spouseEnabled = inputs.spouseEnabled
  const catalogIncomeIds = new Set(inputs.incomeSourceDefs.map((d) => d.id))
  const catalogExpenseIds = new Set(inputs.spendingBucketDefs.map((d) => d.id))

  // Custom lines aren't tied to any catalog def, so they can't get their own
  // fixed column the way a def can — they're pooled into one "Custom" column
  // instead, keeping every column in the group additive up to Total. Their
  // individual names/amounts are still visible in Standard view's expandable
  // per-year breakdown.
  const incomeGroup: ColumnGroup = {
    label: 'Income',
    columns: [
      ...inputs.incomeSourceDefs.map((d) => ({ key: d.id, label: d.name || 'Untitled' })),
      { key: 'custom', label: 'Custom' },
      { key: 'total', label: 'Total', total: true },
    ],
  }
  // Never part of incomeGroup above — it's a separate income stream that
  // bypasses payroll tax and ordinary-income treatment entirely (see
  // projection.ts), so it isn't one of incomeSourceDefs' columns.
  const socialSecurityGroup: ColumnGroup = {
    label: 'Social Security',
    columns: [
      ...(spouseEnabled
        ? [
            { key: 'self', label: 'You' },
            { key: 'spouse', label: 'Spouse' },
          ]
        : []),
      { key: 'taxableFederal', label: 'Taxable (fed.)' },
      ...(inputs.socialSecurity.stateTaxesSocialSecurity
        ? [{ key: 'taxableState', label: 'Taxable (state)' }]
        : []),
      { key: 'total', label: 'Total', total: true },
    ],
  }
  const expenseGroup: ColumnGroup = {
    label: 'Expenses',
    columns: [
      ...inputs.spendingBucketDefs.map((d) => ({ key: d.id, label: d.name || 'Untitled' })),
      { key: 'custom', label: 'Custom' },
      { key: 'total', label: 'Total', total: true },
    ],
  }
  const savingsGroup: ColumnGroup = {
    label: 'Savings (+ match)',
    columns: [
      ...inputs.savingsLineDefs.map((d) => ({ key: d.id, label: d.name || 'Untitled' })),
      { key: 'total', label: 'Total', total: true },
    ],
  }
  // Elective pre-tax-to-Roth transfers. Split by owner only when spouse mode
  // is on — otherwise Total is the only column, since there's nothing to add
  // it up from.
  const rothConversionGroup: ColumnGroup = {
    label: 'Roth conversion',
    columns: spouseEnabled
      ? [
          { key: 'self', label: 'You' },
          { key: 'spouse', label: 'Spouse' },
          { key: 'total', label: 'Total', total: true },
        ]
      : [{ key: 'total', label: 'Amount', total: true }],
  }
  // Ordinary and capital-gains tax are split per jurisdiction rather than
  // shown as a combined "capital gains" column, so every column in the group
  // is additive and the row still sums to Total.
  const taxGroup: ColumnGroup = {
    label: 'Taxes',
    columns: [
      { key: 'federalTaxable', label: 'Fed. taxable' },
      { key: 'federal', label: 'Federal' },
      { key: 'federalGainsTaxable', label: 'Fed. gains taxable' },
      { key: 'federalGains', label: 'Fed. gains' },
      { key: 'stateTaxable', label: 'St. taxable' },
      { key: 'state', label: 'State' },
      { key: 'stateGainsTaxable', label: 'St. gains taxable' },
      { key: 'stateGains', label: 'St. gains' },
      { key: 'ss', label: 'Soc. Sec.' },
      { key: 'medicare', label: 'Medicare' },
      { key: 'penalty', label: 'Penalty' },
      { key: 'total', label: 'Total', total: true },
    ],
  }
  const cashFlowGroup: ColumnGroup = {
    label: 'Leftover',
    columns: [
      { key: 'toTaxable', label: 'To taxable' },
      { key: 'withdrawn', label: 'Withdrawn' },
      { key: 'unfunded', label: 'Unfunded' },
    ],
  }
  // One group per investment account: how much of this year's change came
  // from contributions (employee + employer match, plus — for taxable —
  // leftover cash swept in) vs. investment growth on what was already there.
  const investmentAccounts: { key: InvestmentAccountKey; label: string }[] = [
    { key: 'preTaxSelf', label: spouseEnabled ? 'Pre-tax (You)' : 'Pre-tax' },
    ...(spouseEnabled ? [{ key: 'preTaxSpouse' as const, label: 'Pre-tax (Spouse)' }] : []),
    { key: 'rothSelf', label: spouseEnabled ? 'Roth (You)' : 'Roth' },
    ...(spouseEnabled ? [{ key: 'rothSpouse' as const, label: 'Roth (Spouse)' }] : []),
    { key: 'taxable', label: 'Taxable' },
    { key: 'hsa', label: 'HSA' },
    { key: 'college529', label: '529' },
    { key: 'hysa', label: 'HYSA' },
  ]

  // Roth, taxable-brokerage, and 529 balances track cost basis (contributions/
  // conversions that can come out tax- and penalty-free) separately from
  // unrealized growth — pre-tax and HSA have no such distinction, since the
  // whole balance is treated the same way on withdrawal.
  const hasBasis = (key: InvestmentAccountKey) =>
    key === 'rothSelf' || key === 'rothSpouse' || key === 'taxable' || key === 'college529'

  const accountGroups: ColumnGroup[] = investmentAccounts.map((acct) => ({
    label: acct.label,
    columns: [
      { key: 'contributions', label: 'Contributions' },
      { key: 'withdrawals', label: 'Withdrawals' },
      { key: 'growth', label: 'Growth' },
      { key: 'balance', label: 'Balance', total: true },
      ...(hasBasis(acct.key) ? [{ key: 'basis', label: 'Basis' }] : []),
    ],
  }))

  const cashGroup: ColumnGroup = {
    label: 'Cash',
    columns: [{ key: 'balance', label: 'Balance' }],
  }

  // The same contributions/withdrawals/growth split as an individual account,
  // summed over all of them (HYSA included — it does earn "growth" in this
  // sense, even though that growth is taxed differently from the rest). Cash
  // is deliberately not part of any of the three: it is never invested (no
  // growth), and cash drawn to cover a shortfall is shown by the Leftover and
  // Cash groups instead. So the year-over-year move in net worth is
  // contributions - withdrawals + growth, less whatever came out of cash.
  const netWorthGroup: ColumnGroup = {
    label: 'Net worth',
    columns: [
      { key: 'contributions', label: 'Contributions' },
      { key: 'withdrawals', label: 'Withdrawals' },
      { key: 'growth', label: 'Growth' },
      { key: 'total', label: 'Total', total: true },
    ],
  }

  const groups = [
    incomeGroup,
    socialSecurityGroup,
    expenseGroup,
    savingsGroup,
    rothConversionGroup,
    taxGroup,
    cashFlowGroup,
    ...accountGroups,
    cashGroup,
    netWorthGroup,
  ]
  const totalCols = 2 + (rates ? 2 : 0) + groups.reduce((n, g) => n + g.columns.length, 0)

  // Savings columns show combined "$contribution + $match" text, and net-worth
  // figures are the largest numbers in the table, so both get extra room;
  // everything else gets a plain default width.
  const colWidthForGroup = (label: string) =>
    label === 'Savings (+ match)' ? 150 : label === 'Net worth' ? 130 : 110
  const colWidths = [
    YEAR_COL_WIDTH,
    ageColWidth(spouseEnabled),
    ...(rates ? [70, 70] : []),
    ...groups.flatMap((g) => g.columns.map(() => colWidthForGroup(g.label))),
  ]

  function endingBalance(row: YearProjectionRow, key: InvestmentAccountKey): number {
    switch (key) {
      case 'preTaxSelf':
        return row.balances.preTaxSelf
      case 'preTaxSpouse':
        return row.balances.preTaxSpouse
      case 'rothSelf':
        return row.balances.rothSelf
      case 'rothSpouse':
        return row.balances.rothSpouse
      case 'taxable':
        return row.balances.taxable
      case 'hsa':
        return row.balances.hsa
      case 'college529':
        return row.balances.college529
      case 'hysa':
        return row.balances.hysa
    }
  }

  function accountBasis(row: YearProjectionRow, key: InvestmentAccountKey): number | null {
    switch (key) {
      case 'rothSelf':
        return row.balances.rothSelfBasis
      case 'rothSpouse':
        return row.balances.rothSpouseBasis
      case 'taxable':
        return row.balances.taxableBasis
      case 'college529':
        return row.balances.college529Basis
      default:
        return null
    }
  }

  // Totals for the footer row: every flow (income, expenses, taxes,
  // contributions, withdrawals, growth, ...) summed across all years.
  // Balances (account/cash balances, basis, net-worth total) are point-in-time
  // snapshots, not flows, so summing them across years wouldn't mean anything
  // — those columns stay blank in the footer.
  const totalIncomeBySource = new Map<string, number>()
  const totalExpenseByBucket = new Map<string, number>()
  const totalSavingsByLine = new Map<string, { contribution: number; match: number }>()
  let totalCustomIncome = 0
  let totalCustomExpense = 0
  let totalIncomeAll = 0
  let totalSocialSecuritySelf = 0
  let totalSocialSecuritySpouse = 0
  let totalSocialSecurityAll = 0
  let totalSocialSecurityTaxableFederal = 0
  let totalSocialSecurityTaxableState = 0
  let totalExpenseAll = 0
  let totalSavingsEmployeeAll = 0
  let totalSavingsMatchAll = 0
  let totalConversionSelf = 0
  let totalConversionSpouse = 0
  let totalFederalOrdinary = 0
  let totalFederalGains = 0
  let totalStateOrdinary = 0
  let totalStateGains = 0
  let totalFederalTaxableIncome = 0
  let totalFederalTaxableGains = 0
  let totalStateTaxableIncome = 0
  let totalStateTaxableGains = 0
  let totalSSAll = 0
  let totalMedicareAll = 0
  let totalPenaltyAll = 0
  let totalTaxAll = 0
  let totalToTaxable = 0
  let totalWithdrawnAll = 0
  let totalUnfundedAll = 0
  const totalsByAccount = new Map<InvestmentAccountKey, { contributions: number; withdrawals: number; growth: number }>(
    investmentAccounts.map((a) => [a.key, { contributions: 0, withdrawals: 0, growth: 0 }]),
  )
  let totalContributionsAll = 0
  let totalWithdrawalsAllAcct = 0
  let totalGrowthAllAcct = 0

  for (const row of rows) {
    for (const item of row.incomeBySource) {
      totalIncomeBySource.set(item.id, (totalIncomeBySource.get(item.id) ?? 0) + item.amount)
    }
    for (const item of row.expenseByBucket) {
      totalExpenseByBucket.set(item.id, (totalExpenseByBucket.get(item.id) ?? 0) + item.amount)
    }
    for (const line of row.savingsByLine) {
      const prev = totalSavingsByLine.get(line.id) ?? { contribution: 0, match: 0 }
      totalSavingsByLine.set(line.id, {
        contribution: prev.contribution + line.contribution,
        match: prev.match + line.match,
      })
    }
    totalCustomIncome += row.incomeBySource
      .filter((x) => !catalogIncomeIds.has(x.id))
      .reduce((n, x) => n + x.amount, 0)
    totalCustomExpense += row.expenseByBucket
      .filter((x) => !catalogExpenseIds.has(x.id))
      .reduce((n, x) => n + x.amount, 0)
    totalIncomeAll += row.incomeTotal
    totalSocialSecuritySelf += row.socialSecurity.self
    totalSocialSecuritySpouse += row.socialSecurity.spouse
    totalSocialSecurityAll += row.socialSecurity.total
    totalSocialSecurityTaxableFederal += row.socialSecurity.taxableFederal
    totalSocialSecurityTaxableState += row.socialSecurity.taxableState
    totalExpenseAll += row.expenseTotal
    totalSavingsEmployeeAll += row.savingsEmployeeTotal
    totalSavingsMatchAll += row.savingsEmployerMatchTotal
    totalConversionSelf += row.rothConversion.self
    totalConversionSpouse += row.rothConversion.spouse
    totalFederalOrdinary += row.federalTax - row.federalCapitalGainsTax
    totalFederalGains += row.federalCapitalGainsTax
    totalStateOrdinary += row.stateTax - row.stateCapitalGainsTax
    totalStateGains += row.stateCapitalGainsTax
    totalFederalTaxableIncome += row.federalTaxableIncome
    totalFederalTaxableGains += row.federalTaxableGains
    totalStateTaxableIncome += row.stateTaxableIncome
    totalStateTaxableGains += row.stateTaxableGains
    totalSSAll += row.socialSecurityTax
    totalMedicareAll += row.medicareTax + row.additionalMedicareTax
    totalPenaltyAll += row.earlyWithdrawalPenalty
    totalTaxAll += row.totalTax
    totalToTaxable += row.extraTaxableSavings
    totalWithdrawnAll += row.withdrawals.total
    totalUnfundedAll += row.withdrawals.unfunded
    for (const acct of investmentAccounts) {
      const flow = row.accountFlows[acct.key]
      const t = totalsByAccount.get(acct.key)!
      t.contributions += flow.contributions
      t.withdrawals += flow.withdrawals
      t.growth += flow.growth
    }
    const flows = Object.values(row.accountFlows)
    totalContributionsAll += flows.reduce((n, f) => n + f.contributions, 0)
    totalWithdrawalsAllAcct += flows.reduce((n, f) => n + f.withdrawals, 0)
    totalGrowthAllAcct += flows.reduce((n, f) => n + f.growth, 0)
  }
  const totalSavingsAll = totalSavingsEmployeeAll + totalSavingsMatchAll
  const totalConversionAll = totalConversionSelf + totalConversionSpouse

  return (
    <div className="max-h-[32rem] overflow-auto">
      <table className="w-max table-fixed border-separate border-spacing-0 text-xs">
        <colgroup>
          {colWidths.map((w, i) => (
            <col key={i} style={{ width: w }} />
          ))}
        </colgroup>
        <thead className="sticky top-0 z-20 bg-white">
          <GroupHeaderRow groups={groups} showRates={!!rates} />
          <GroupSubHeaderRow groups={groups} />
        </thead>
        <tbody>
          {rows.map((row, i) => {
            const incomeById = new Map(row.incomeBySource.map((x) => [x.id, x.amount]))
            const expenseById = new Map(row.expenseByBucket.map((x) => [x.id, x.amount]))
            const customIncomeTotal = row.incomeBySource
              .filter((x) => !catalogIncomeIds.has(x.id))
              .reduce((n, x) => n + x.amount, 0)
            const customExpenseTotal = row.expenseByBucket
              .filter((x) => !catalogExpenseIds.has(x.id))
              .reduce((n, x) => n + x.amount, 0)
            const savingsById = new Map(row.savingsByLine.map((x) => [x.id, x]))
            const savingsTotal = row.savingsEmployeeTotal + row.savingsEmployerMatchTotal
            const medicareTotal = row.medicareTax + row.additionalMedicareTax
            // Every account, not just the ones with columns: a scenario that
            // turned the spouse off can still carry spouse balances, and those
            // are part of the net worth shown here.
            const flows = Object.values(row.accountFlows)
            const contributionsTotal = flows.reduce((n, f) => n + f.contributions, 0)
            const withdrawalsTotal = flows.reduce((n, f) => n + f.withdrawals, 0)
            const growthTotal = flows.reduce((n, f) => n + f.growth, 0)

            return (
              <tr key={row.year} className="border-b border-slate-100">
                <td className={`py-1 pr-3 font-medium text-slate-700 ${STICKY_YEAR_CLASS}`} style={STICKY_YEAR_STYLE}>
                  {row.year}
                </td>
                <td className={`py-1 pr-3 text-slate-500 ${STICKY_AGE_CLASS}`} style={STICKY_AGE_STYLE}>
                  {ageLabel(row, spouseEnabled)}
                </td>

                {rates && (
                  <>
                    <td className="py-1 px-2 text-right text-slate-700">{pct(nominalReturnPct(rates[i]))}</td>
                    <td className="py-1 px-2 text-right text-slate-700">{pct(rates[i].inflationRatePct)}</td>
                  </>
                )}

                {inputs.incomeSourceDefs.map((d, i) => (
                  <td key={d.id} className={`py-1 px-2 text-right text-slate-700 ${i === 0 ? 'border-l border-slate-100' : ''}`}>
                    ${fmt(incomeById.get(d.id) ?? 0)}
                  </td>
                ))}
                <td className={`py-1 px-2 text-right text-slate-700 ${inputs.incomeSourceDefs.length === 0 ? 'border-l border-slate-100' : ''}`}>
                  {customIncomeTotal !== 0 ? `$${fmt(customIncomeTotal)}` : '–'}
                </td>
                <td className="py-1 px-2 text-right font-medium text-slate-900">${fmt(row.incomeTotal)}</td>

                {spouseEnabled && (
                  <>
                    <td className="py-1 px-2 text-right text-slate-700 border-l border-slate-100">
                      {row.socialSecurity.self !== 0 ? `$${fmt(row.socialSecurity.self)}` : '–'}
                    </td>
                    <td className="py-1 px-2 text-right text-slate-700">
                      {row.socialSecurity.spouse !== 0 ? `$${fmt(row.socialSecurity.spouse)}` : '–'}
                    </td>
                  </>
                )}
                <td
                  className={`py-1 px-2 text-right text-slate-500 ${spouseEnabled ? '' : 'border-l border-slate-100'}`}
                >
                  ${fmt(row.socialSecurity.taxableFederal)}
                </td>
                {inputs.socialSecurity.stateTaxesSocialSecurity && (
                  <td className="py-1 px-2 text-right text-slate-500">${fmt(row.socialSecurity.taxableState)}</td>
                )}
                <td className="py-1 px-2 text-right font-medium text-slate-900">${fmt(row.socialSecurity.total)}</td>

                {inputs.spendingBucketDefs.map((d, i) => (
                  <td key={d.id} className={`py-1 px-2 text-right text-slate-700 ${i === 0 ? 'border-l border-slate-100' : ''}`}>
                    ${fmt(expenseById.get(d.id) ?? 0)}
                  </td>
                ))}
                <td className={`py-1 px-2 text-right text-slate-700 ${inputs.spendingBucketDefs.length === 0 ? 'border-l border-slate-100' : ''}`}>
                  {customExpenseTotal !== 0 ? `$${fmt(customExpenseTotal)}` : '–'}
                </td>
                <td className="py-1 px-2 text-right font-medium text-slate-900">${fmt(row.expenseTotal)}</td>

                {inputs.savingsLineDefs.map((d, i) => {
                  const s = savingsById.get(d.id)
                  return (
                    <td key={d.id} className={`py-1 px-2 text-right text-slate-700 ${i === 0 ? 'border-l border-slate-100' : ''}`}>
                      {s ? `$${fmt(s.contribution)}${s.match > 0 ? ` + $${fmt(s.match)}` : ''}` : '–'}
                    </td>
                  )
                })}
                <td className="py-1 px-2 text-right font-medium text-slate-900">${fmt(savingsTotal)}</td>

                {spouseEnabled && (
                  <>
                    <td className="py-1 px-2 text-right text-slate-700 border-l border-slate-100">
                      {row.rothConversion.self !== 0 ? `$${fmt(row.rothConversion.self)}` : '–'}
                    </td>
                    <td className="py-1 px-2 text-right text-slate-700">
                      {row.rothConversion.spouse !== 0 ? `$${fmt(row.rothConversion.spouse)}` : '–'}
                    </td>
                  </>
                )}
                <td
                  className={`py-1 px-2 text-right font-medium text-slate-900 ${spouseEnabled ? '' : 'border-l border-slate-100'}`}
                >
                  {row.rothConversion.total !== 0 ? `$${fmt(row.rothConversion.total)}` : '–'}
                </td>

                <td className="py-1 px-2 text-right text-slate-500 border-l border-slate-100">
                  ${fmt(row.federalTaxableIncome)}
                </td>
                <td className="py-1 px-2 text-right text-slate-700">
                  ${fmt(row.federalTax - row.federalCapitalGainsTax)}
                </td>
                <td className="py-1 px-2 text-right text-slate-500">
                  ${fmt(row.federalTaxableGains)}
                </td>
                <td className="py-1 px-2 text-right text-slate-700">
                  ${fmt(row.federalCapitalGainsTax)}
                </td>
                <td className="py-1 px-2 text-right text-slate-500">
                  ${fmt(row.stateTaxableIncome)}
                </td>
                <td className="py-1 px-2 text-right text-slate-700">
                  ${fmt(row.stateTax - row.stateCapitalGainsTax)}
                </td>
                <td className="py-1 px-2 text-right text-slate-500">
                  ${fmt(row.stateTaxableGains)}
                </td>
                <td className="py-1 px-2 text-right text-slate-700">
                  ${fmt(row.stateCapitalGainsTax)}
                </td>
                <td className="py-1 px-2 text-right text-slate-700">${fmt(row.socialSecurityTax)}</td>
                <td className="py-1 px-2 text-right text-slate-700">${fmt(medicareTotal)}</td>
                <td className="py-1 px-2 text-right text-slate-700">
                  ${fmt(row.earlyWithdrawalPenalty)}
                </td>
                <td className="py-1 px-2 text-right font-medium text-slate-900">${fmt(row.totalTax)}</td>

                <td className="py-1 px-2 text-right text-slate-700 border-l border-slate-100">
                  {row.extraTaxableSavings > 0 ? `$${fmt(row.extraTaxableSavings)}` : '–'}
                </td>
                <td className="py-1 px-2 text-right">
                  {row.withdrawals.total > 0 ? (
                    <Money value={-row.withdrawals.total} highlightNegative />
                  ) : (
                    '–'
                  )}
                </td>
                <td className="py-1 px-2 text-right">
                  {row.withdrawals.unfunded > 0 ? (
                    <Money value={-row.withdrawals.unfunded} highlightNegative />
                  ) : (
                    '–'
                  )}
                </td>

                {investmentAccounts.map((acct) => {
                  const flow = row.accountFlows[acct.key]
                  const basis = accountBasis(row, acct.key)
                  return (
                    <Fragment key={acct.key}>
                      <td className="py-1 px-2 text-right text-slate-700 border-l border-slate-100">
                        {flow.contributions !== 0 ? `$${fmt(flow.contributions)}` : '–'}
                      </td>
                      <td className="py-1 px-2 text-right">
                        {flow.withdrawals !== 0 ? (
                          <Money value={-flow.withdrawals} highlightNegative />
                        ) : (
                          '–'
                        )}
                      </td>
                      <td className="py-1 px-2 text-right text-slate-700">
                        <Money value={flow.growth} highlightNegative />
                      </td>
                      <td className="py-1 px-2 text-right font-medium text-slate-900">
                        <Money value={endingBalance(row, acct.key)} highlightNegative />
                      </td>
                      {basis !== null && (
                        <td className="py-1 px-2 text-right text-slate-700">
                          <Money value={basis} highlightNegative />
                        </td>
                      )}
                    </Fragment>
                  )
                })}

                <td className="py-1 px-2 text-right text-slate-700 border-l border-slate-100">
                  <Money value={row.balances.cash} highlightNegative />
                </td>

                <td className="py-1 px-2 text-right text-slate-700 border-l border-slate-100">
                  {contributionsTotal !== 0 ? `$${fmt(contributionsTotal)}` : '–'}
                </td>
                <td className="py-1 px-2 text-right">
                  {withdrawalsTotal !== 0 ? (
                    <Money value={-withdrawalsTotal} highlightNegative />
                  ) : (
                    '–'
                  )}
                </td>
                <td className="py-1 px-2 text-right text-slate-700">
                  <Money value={growthTotal} highlightNegative />
                </td>
                <td className="py-1 px-2 text-right font-medium text-slate-900">
                  <Money value={row.netWorth} highlightNegative />
                </td>
              </tr>
            )
          })}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-slate-300 bg-slate-50 font-semibold text-slate-700">
            <td className={`py-1 pr-3 text-slate-900 ${STICKY_YEAR_CLASS}`} style={STICKY_YEAR_STYLE}>
              Total
            </td>
            <td className={STICKY_AGE_CLASS} style={STICKY_AGE_STYLE} />

            {/* Rates aren't summed across years. */}
            {rates && (
              <>
                <td className="py-1 px-2" />
                <td className="py-1 px-2" />
              </>
            )}

            {inputs.incomeSourceDefs.map((d, i) => (
              <td key={d.id} className={`py-1 px-2 text-right ${i === 0 ? 'border-l border-slate-100' : ''}`}>
                ${fmt(totalIncomeBySource.get(d.id) ?? 0)}
              </td>
            ))}
            <td className={`py-1 px-2 text-right ${inputs.incomeSourceDefs.length === 0 ? 'border-l border-slate-100' : ''}`}>
              {totalCustomIncome !== 0 ? `$${fmt(totalCustomIncome)}` : '–'}
            </td>
            <td className="py-1 px-2 text-right text-slate-900">${fmt(totalIncomeAll)}</td>

            {spouseEnabled && (
              <>
                <td className="py-1 px-2 text-right border-l border-slate-100">
                  ${fmt(totalSocialSecuritySelf)}
                </td>
                <td className="py-1 px-2 text-right">${fmt(totalSocialSecuritySpouse)}</td>
              </>
            )}
            <td className={`py-1 px-2 text-right font-normal text-slate-500 ${spouseEnabled ? '' : 'border-l border-slate-100'}`}>
              ${fmt(totalSocialSecurityTaxableFederal)}
            </td>
            {inputs.socialSecurity.stateTaxesSocialSecurity && (
              <td className="py-1 px-2 text-right font-normal text-slate-500">
                ${fmt(totalSocialSecurityTaxableState)}
              </td>
            )}
            <td className="py-1 px-2 text-right text-slate-900">${fmt(totalSocialSecurityAll)}</td>

            {inputs.spendingBucketDefs.map((d, i) => (
              <td key={d.id} className={`py-1 px-2 text-right ${i === 0 ? 'border-l border-slate-100' : ''}`}>
                ${fmt(totalExpenseByBucket.get(d.id) ?? 0)}
              </td>
            ))}
            <td className={`py-1 px-2 text-right ${inputs.spendingBucketDefs.length === 0 ? 'border-l border-slate-100' : ''}`}>
              {totalCustomExpense !== 0 ? `$${fmt(totalCustomExpense)}` : '–'}
            </td>
            <td className="py-1 px-2 text-right text-slate-900">${fmt(totalExpenseAll)}</td>

            {inputs.savingsLineDefs.map((d, i) => {
              const s = totalSavingsByLine.get(d.id)
              return (
                <td key={d.id} className={`py-1 px-2 text-right ${i === 0 ? 'border-l border-slate-100' : ''}`}>
                  {s ? `$${fmt(s.contribution)}${s.match > 0 ? ` + $${fmt(s.match)}` : ''}` : '–'}
                </td>
              )
            })}
            <td className="py-1 px-2 text-right text-slate-900">${fmt(totalSavingsAll)}</td>

            {spouseEnabled && (
              <>
                <td className="py-1 px-2 text-right border-l border-slate-100">
                  ${fmt(totalConversionSelf)}
                </td>
                <td className="py-1 px-2 text-right">${fmt(totalConversionSpouse)}</td>
              </>
            )}
            <td className={`py-1 px-2 text-right text-slate-900 ${spouseEnabled ? '' : 'border-l border-slate-100'}`}>
              ${fmt(totalConversionAll)}
            </td>

            <td className="py-1 px-2 text-right font-normal text-slate-500 border-l border-slate-100">
              ${fmt(totalFederalTaxableIncome)}
            </td>
            <td className="py-1 px-2 text-right">${fmt(totalFederalOrdinary)}</td>
            <td className="py-1 px-2 text-right font-normal text-slate-500">${fmt(totalFederalTaxableGains)}</td>
            <td className="py-1 px-2 text-right">${fmt(totalFederalGains)}</td>
            <td className="py-1 px-2 text-right font-normal text-slate-500">${fmt(totalStateTaxableIncome)}</td>
            <td className="py-1 px-2 text-right">${fmt(totalStateOrdinary)}</td>
            <td className="py-1 px-2 text-right font-normal text-slate-500">${fmt(totalStateTaxableGains)}</td>
            <td className="py-1 px-2 text-right">${fmt(totalStateGains)}</td>
            <td className="py-1 px-2 text-right">${fmt(totalSSAll)}</td>
            <td className="py-1 px-2 text-right">${fmt(totalMedicareAll)}</td>
            <td className="py-1 px-2 text-right">${fmt(totalPenaltyAll)}</td>
            <td className="py-1 px-2 text-right text-slate-900">${fmt(totalTaxAll)}</td>

            <td className="py-1 px-2 text-right border-l border-slate-100">
              {totalToTaxable > 0 ? `$${fmt(totalToTaxable)}` : '–'}
            </td>
            <td className="py-1 px-2 text-right">
              {totalWithdrawnAll > 0 ? <Money value={-totalWithdrawnAll} highlightNegative /> : '–'}
            </td>
            <td className="py-1 px-2 text-right">
              {totalUnfundedAll > 0 ? <Money value={-totalUnfundedAll} highlightNegative /> : '–'}
            </td>

            {investmentAccounts.map((acct) => {
              const t = totalsByAccount.get(acct.key)!
              return (
                <Fragment key={acct.key}>
                  <td className="py-1 px-2 text-right border-l border-slate-100">
                    {t.contributions !== 0 ? `$${fmt(t.contributions)}` : '–'}
                  </td>
                  <td className="py-1 px-2 text-right">
                    {t.withdrawals !== 0 ? <Money value={-t.withdrawals} highlightNegative /> : '–'}
                  </td>
                  <td className="py-1 px-2 text-right">
                    <Money value={t.growth} highlightNegative />
                  </td>
                  {/* Ending balance is a snapshot, not a flow — not summed. */}
                  <td className="py-1 px-2 text-right text-slate-900">–</td>
                  {hasBasis(acct.key) && <td className="py-1 px-2 text-right">–</td>}
                </Fragment>
              )
            })}

            {/* Cash balance is a snapshot, not a flow — not summed. */}
            <td className="py-1 px-2 text-right border-l border-slate-100">–</td>

            <td className="py-1 px-2 text-right border-l border-slate-100">
              {totalContributionsAll !== 0 ? `$${fmt(totalContributionsAll)}` : '–'}
            </td>
            <td className="py-1 px-2 text-right">
              {totalWithdrawalsAllAcct !== 0 ? <Money value={-totalWithdrawalsAllAcct} highlightNegative /> : '–'}
            </td>
            <td className="py-1 px-2 text-right">
              <Money value={totalGrowthAllAcct} highlightNegative />
            </td>
            {/* Net worth is a snapshot, not a flow — not summed. */}
            <td className="py-1 px-2 text-right text-slate-900">–</td>
          </tr>
        </tfoot>
      </table>
      <p className="mt-2 text-[11px] text-slate-400">{`${totalCols} columns — scroll horizontally to see them all.`}</p>
    </div>
  )
}
