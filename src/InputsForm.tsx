import { useMemo } from 'react'
import { birthYear, calculateAge, deathYear } from './age'
import { AwiTableEditor } from './AwiTableEditor'
import {
  convertDanglingIncomeVariableRefs,
  convertDanglingRothConversionVariableRefs,
  convertDanglingSavingsRangeVariableRefs,
  convertDanglingSpendingVariableRefs,
  convertDanglingWithdrawalRangeVariableRefs,
  freezeFormulaRefsInGoals,
  freezeFormulaRefsInMetrics,
  freezeFormulaRefsInRanges,
  freezeFormulaRefsInRothConversionRanges,
  freezeFormulaRefsInSavingsRanges,
  freezeFormulaRefsInVariables,
  freezeFormulaRefsInWithdrawalRanges,
  freezeSpecialYearRefsInSavingsRanges,
  pruneDanglingMatchSourcesInSavingsRanges,
  renameFormulaRefsInFunctions,
  renameFormulaRefsInGoals,
  renameFormulaRefsInMetrics,
  renameFormulaRefsInRanges,
  renameFormulaRefsInRothConversionRanges,
  renameFormulaRefsInSavingsRanges,
  renameFormulaRefsInVariables,
  renameFormulaRefsInWithdrawalRanges,
  renameSpecialYearRefsInSavingsRanges,
} from './catalogSync'
import { CheckboxField } from './CheckboxField'
import { CollapsibleSection } from './CollapsibleSection'
import { CurrencyField } from './CurrencyField'
import { DateField } from './DateField'
import { DividendPolicyRangesEditor } from './DividendPolicyRangesEditor'
import { flatRateHistoryContext } from './formula'
import { FraTableEditor } from './FraTableEditor'
import { buildFormulaFunctions } from './functions'
import { FunctionsEditor } from './FunctionsEditor'
import { GoalsEditor } from './GoalsEditor'
import { HelpTooltip } from './HelpTooltip'
import { IncomeRangesEditor } from './IncomeRangesEditor'
import { MetricsEditor } from './MetricsEditor'
import { NumberField } from './NumberField'
import { accountBalanceSnapshot, totalNetWorth, type YearProjectionRow } from './projection'
import { resolveVariableAmounts } from './variables'
import { RmdDivisorsEditor } from './RmdDivisorsEditor'
import { RothConversionRangesEditor } from './RothConversionRangesEditor'
import { SavingsRangesEditor } from './SavingsRangesEditor'
import type { SimulationRun } from './simulation'
import { resolveInputsSpecialYears } from './specialYearsSync'
import { computeOwnerBenefitSummary, type SocialSecurityBenefitSummary } from './socialSecurity'
import { SocialSecurityBenefitChart } from './SocialSecurityBenefitChart'
import { SocialSecurityEarningsHistoryEditor } from './SocialSecurityEarningsHistoryEditor'
import { SpecialYearsEditor } from './SpecialYearsEditor'
import { SpendingRangesEditor } from './SpendingRangesEditor'
import { StateContributionDeductionsEditor } from './StateContributionDeductionsEditor'
import { TaxBracketsEditor } from './TaxBracketsEditor'
import { VariablesEditor } from './VariablesEditor'
import type {
  CustomFunction,
  Metric,
  Owner,
  OwnedAccountBalances,
  RetirementInputs,
  SharedAccountBalances,
  SocialSecurityBenefitMethod,
  SocialSecurityOwnerConfig,
  SpecialYear,
  Variable,
} from './types'
import { useYearDisplayMode } from './useYearDisplayMode'
import { WithdrawalRangesEditor } from './WithdrawalRangesEditor'

interface InputsFormProps {
  inputs: RetirementInputs
  onChange: (inputs: RetirementInputs) => void
  // The current (baseline, flat-rate) projection — threaded through only for
  // GoalsEditor's per-goal Met/Not met badge and MetricsEditor's per-metric
  // Avg badge; nothing else here needs it.
  projectionRows: YearProjectionRow[]
  // Latest Monte Carlo runs (null if none have been run yet) — threaded
  // through only for GoalsEditor's/MetricsEditor's simulation badges, which
  // mirror what the right-hand GoalPanel shows so the same results are
  // reachable on narrow screens where that panel is hidden.
  simulationRuns: SimulationRun[] | null
}

const COLUMN_CLASSES = {
  3: 'sm:grid-cols-3',
  4: 'sm:grid-cols-2 lg:grid-cols-4',
} as const

function Section({
  id,
  title,
  description,
  columns = 3,
  children,
}: {
  id?: string
  title: string
  description?: string
  columns?: keyof typeof COLUMN_CLASSES
  children: React.ReactNode
}) {
  return (
    <CollapsibleSection id={id} title={title} subtitle={description}>
      <div className={`grid grid-cols-1 gap-4 ${COLUMN_CLASSES[columns]}`}>
        {children}
      </div>
    </CollapsibleSection>
  )
}

function OwnedBalanceFields({
  balances,
  onChange,
}: {
  balances: OwnedAccountBalances
  onChange: (balances: OwnedAccountBalances) => void
}) {
  return (
    <>
      <CurrencyField
        label="Pre-tax (401k, IRA)"
        min={0}
        value={balances.preTax}
        onChange={(v) => onChange({ ...balances, preTax: v })}
        help="Traditional 401(k)/403(b)/IRA balances. Contributions were tax-deductible; withdrawals are taxed as ordinary income."
      />
      <CurrencyField
        label="Roth (401k, IRA)"
        min={0}
        value={balances.roth}
        onChange={(v) => onChange({ ...balances, roth: v })}
        help="Roth 401(k)/IRA balances. Contributions were made after-tax; qualified withdrawals are tax-free."
      />
      <CurrencyField
        label="Roth basis"
        min={0}
        value={balances.rothBasis}
        onChange={(v) => onChange({ ...balances, rothBasis: v })}
        help="How much of the Roth balance is contributions/conversions (basis) rather than growth. Basis can be withdrawn tax- and penalty-free at any time; earnings can't, until qualified."
      />
    </>
  )
}

function SharedBalanceFields({
  balances,
  onChange,
}: {
  balances: SharedAccountBalances
  onChange: (balances: SharedAccountBalances) => void
}) {
  return (
    <>
      <CurrencyField
        label="Taxable brokerage"
        min={0}
        value={balances.taxable}
        onChange={(v) => onChange({ ...balances, taxable: v })}
        help="A regular investment account with no special tax treatment. Gains may be taxed when sold."
      />
      <CurrencyField
        label="Taxable basis"
        min={0}
        value={balances.taxableBasis}
        onChange={(v) => onChange({ ...balances, taxableBasis: v })}
        help="How much of the taxable brokerage balance is cost basis rather than unrealized gains. Only the gain portion is taxed when sold."
      />
      <CurrencyField
        label="HSA"
        min={0}
        value={balances.hsa}
        onChange={(v) => onChange({ ...balances, hsa: v })}
        help="Health Savings Account balance. Contributions are tax-deductible, growth is tax-free, and withdrawals for qualified medical expenses are tax-free."
      />
      <CurrencyField
        label="Cash"
        min={0}
        value={balances.cash}
        onChange={(v) => onChange({ ...balances, cash: v })}
        help="Cash held outside investment accounts — checking, savings, or an emergency fund. Not invested, so it isn't assumed to grow at the investment return rate."
      />
      <CurrencyField
        label="High-yield savings"
        min={0}
        value={balances.hysa}
        onChange={(v) => onChange({ ...balances, hysa: v })}
        help="An interest-bearing savings account, taxed differently from a brokerage: interest is ordinary income in the year it's earned, not a deferred capital gain. Grows at the High-yield savings rate set under Assumptions."
      />
      <CurrencyField
        label="529 college savings"
        min={0}
        value={balances.college529}
        onChange={(v) => onChange({ ...balances, college529: v })}
        help="A joint 529 education savings account. Growth is tax-free, and withdrawals for qualified education expenses are tax- and penalty-free."
      />
      <CurrencyField
        label="529 basis"
        min={0}
        value={balances.college529Basis}
        onChange={(v) => onChange({ ...balances, college529Basis: v })}
        help="How much of the 529 balance is contributions (basis) rather than growth. Basis can be withdrawn tax- and penalty-free at any time; earnings can't, unless the withdrawal is for qualified education expenses."
      />
    </>
  )
}

// "804" -> "67y 0m", used to make FRA/claiming-age months readable.
function formatMonths(months: number): string {
  const years = Math.floor(months / 12)
  const remainder = Math.round(months - years * 12)
  return `${years}y ${remainder}m`
}

function formatMonthlyDollars(amount: number): string {
  return `$${amount.toLocaleString('en-US', { maximumFractionDigits: 0 })}/mo`
}

// Every step behind the computed benefit — AIME (earnings-history method
// only), PIA at Full Retirement Age, the claiming-age adjustment, and the
// resulting benefit — so a number that looks off can be traced back to
// which step produced it, the same purpose tax.ts's bracket breakdown
// serves for the tax figures.
function SocialSecurityBenefitSummaryPanel({ summary }: { summary: SocialSecurityBenefitSummary }) {
  const monthsFromFRA = summary.claimAgeMonths - summary.fraMonths
  return (
    <div className="mt-3 rounded-md bg-slate-50 p-3 text-xs text-slate-600">
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-3">
        <div>
          <span className="text-slate-400">Full Retirement Age</span>
          <div className="font-medium text-slate-900">{formatMonths(summary.fraMonths)}</div>
        </div>
        {summary.aime !== null && (
          <div>
            <span className="text-slate-400">AIME</span>
            <div className="font-medium text-slate-900">{formatMonthlyDollars(summary.aime)}</div>
          </div>
        )}
        <div>
          <span className="text-slate-400">PIA (at FRA)</span>
          <div className="font-medium text-slate-900">{formatMonthlyDollars(summary.monthlyPIA)}</div>
        </div>
        <div>
          <span className="text-slate-400">Claiming adjustment</span>
          <div className="font-medium text-slate-900">
            {(summary.adjustmentFactor * 100).toFixed(1)}% of PIA
            <span className="font-normal text-slate-400">
              {' '}
              ({monthsFromFRA === 0 ? 'at FRA' : `${Math.abs(monthsFromFRA)} mo. ${monthsFromFRA < 0 ? 'early' : 'late'}`})
            </span>
          </div>
        </div>
        <div>
          <span className="text-slate-400">Benefit at claiming ({summary.claimYear})</span>
          <div className="font-medium text-slate-900">{formatMonthlyDollars(summary.monthlyBenefitAtClaim)}</div>
        </div>
      </div>
    </div>
  )
}

function SocialSecurityOwnerFields({
  label,
  config,
  onChange,
  variables,
  benefitSummary,
  inputs,
  owner,
}: {
  label: string
  config: SocialSecurityOwnerConfig
  onChange: (config: SocialSecurityOwnerConfig) => void
  variables: Variable[]
  benefitSummary: SocialSecurityBenefitSummary | null
  inputs: RetirementInputs
  owner: Owner
}) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-slate-600">{label}</h3>
      <div className="mt-2 flex flex-wrap items-end gap-4">
        <div className="w-32">
          <NumberField
            label="Claiming age"
            min={62}
            max={70}
            step={1}
            value={config.claimingAge}
            onChange={(v) => onChange({ ...config, claimingAge: v })}
            onBlur={() => {
              const clamped = Number.isFinite(config.claimingAge)
                ? Math.min(70, Math.max(62, Math.round(config.claimingAge)))
                : 67
              if (clamped !== config.claimingAge) onChange({ ...config, claimingAge: clamped })
            }}
            help="Age this benefit is claimed — a whole number from 62 (the earliest SSA allows) to 70 (delayed retirement credits stop accruing past it). Full Retirement Age (66-67, by birth year) pays the unreduced amount."
          />
        </div>
        <div className="w-52">
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-slate-700">Benefit method</span>
            <select
              className="w-full rounded-md border border-slate-300 bg-white px-2 py-2 text-sm text-slate-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500"
              value={config.benefitMethod}
              onChange={(e) =>
                onChange({ ...config, benefitMethod: e.target.value as SocialSecurityBenefitMethod })
              }
            >
              <option value="estimate">SSA estimate</option>
              <option value="earningsHistory">Full earnings history</option>
            </select>
          </label>
        </div>
      </div>

      {config.benefitMethod === 'estimate' ? (
        <div className="mt-3 flex flex-wrap gap-4">
          <div className="w-44">
            <CurrencyField
              label="Estimated monthly benefit"
              min={0}
              value={config.estimatedMonthlyBenefit}
              onChange={(v) => onChange({ ...config, estimatedMonthlyBenefit: v })}
              help="Straight from an SSA statement (ssa.gov/myaccount), in today's dollars, at the age below."
            />
          </div>
          <div className="w-36">
            <NumberField
              label="Estimate age"
              min={60}
              step={0.5}
              value={config.estimatedBenefitAge}
              onChange={(v) => onChange({ ...config, estimatedBenefitAge: v })}
              help="The age SSA calculated that estimate for — usually Full Retirement Age, but statements often also show 62 and 70 figures."
            />
          </div>
        </div>
      ) : (
        <div className="mt-3 flex flex-col gap-4">
          <div>
            <h4 className="text-xs font-semibold text-slate-500">Earnings history</h4>
            <p className="mt-1 text-xs text-slate-400">
              Actual dollars for each year, not today's dollars — the wage-indexing step below needs real
              historical amounts.
            </p>
            <div className="mt-2">
              <SocialSecurityEarningsHistoryEditor
                earningsHistory={config.earningsHistory}
                onChange={(earningsHistory) => onChange({ ...config, earningsHistory })}
              />
            </div>
          </div>
          <div>
            <h4 className="flex items-center gap-1 text-xs font-semibold text-slate-500">
              Future wages
              <HelpTooltip text="Which variables count toward this person's Social Security record for years not entered above (today through claiming age) — those variables' projected income-allocation amounts, capped at the wage base, fill in the missing years automatically." />
            </h4>
            <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1">
              {variables.length === 0 && (
                <p className="text-sm text-slate-400">
                  No variables defined yet — add one under Variables above.
                </p>
              )}
              {variables.map((v) => (
                <CheckboxField
                  key={v.id}
                  label={v.name || 'Untitled'}
                  checked={config.wageVariableIds.includes(v.id)}
                  onChange={(checked) =>
                    onChange({
                      ...config,
                      wageVariableIds: checked
                        ? [...config.wageVariableIds, v.id]
                        : config.wageVariableIds.filter((id) => id !== v.id),
                    })
                  }
                />
              ))}
            </div>
          </div>
        </div>
      )}

      {benefitSummary && <SocialSecurityBenefitSummaryPanel summary={benefitSummary} />}

      <div className="mt-3">
        <h4 className="flex items-center gap-1 text-xs font-semibold text-slate-500">
          Monthly benefit by claiming age
          <HelpTooltip text="How much the monthly benefit would be if claimed at each age from 62 to 70, holding everything else fixed — the dashed line marks Full Retirement Age, and the labeled dot marks the claiming age currently entered above." />
        </h4>
        <div className="mt-2">
          <SocialSecurityBenefitChart inputs={inputs} owner={owner} />
        </div>
      </div>
    </div>
  )
}

export function InputsForm({ inputs, onChange, projectionRows, simulationRuns }: InputsFormProps) {
  const age = calculateAge(inputs.birthDate)
  const spouseAge = inputs.spouseEnabled ? calculateAge(inputs.spouseBirthDate) : null
  const deathYr = deathYear(inputs.birthDate, inputs.lifeExpectancy)
  // birthYear (not calculateAge's DOB-precise age above) is what every
  // formula/condition preview's "age"/"spouseAge" is built from — same
  // year-level granularity as "year" itself and the rest of the app's
  // age-display mode (see YearBoundaryField/SpecialYearsEditor).
  const selfBirthYear = birthYear(inputs.birthDate)
  const spouseBirthYear = inputs.spouseEnabled ? birthYear(inputs.spouseBirthDate) : null
  const [yearMode, setYearMode] = useYearDisplayMode()
  const functionsContext = useMemo(() => buildFormulaFunctions(inputs.functions), [inputs.functions])
  const resolvedVariables = useMemo(
    () => resolveVariableAmounts(inputs.variables, functionsContext),
    [inputs.variables, functionsContext],
  )
  const resolvedVariableAmounts = resolvedVariables.amounts
  // return_rate()/inflation_rate()/net_worth()/account-balance functions
  // (pretax_self(), roth(), taxable(), ...) in every live formula/condition
  // preview below fall back to this flat scenario assumption — none of these
  // editors run inside a real per-year projection loop, so there's no actual
  // history to look back through (see runProjection's own historyContext for
  // that). net_worth()/account-balance functions fall back to today's
  // starting balances, regardless of the lookback argument — the same "no
  // real history, just today's snapshot" reasoning as the rate assumptions
  // above. previous_income()/previous_spending() always return 0 here, since
  // there's no "today's" income/spending total to fall back to.
  const formulaHistory = useMemo(
    () =>
      flatRateHistoryContext(
        inputs.expectedReturnRatePct,
        inputs.inflationRatePct,
        totalNetWorth(inputs.balances),
        accountBalanceSnapshot(inputs.balances),
      ),
    [inputs.expectedReturnRatePct, inputs.inflationRatePct, inputs.balances],
  )

  function handleSpecialYearsChange(specialYears: SpecialYear[]) {
    // A savings line's condition (or a Goal's or Roth conversion amount's
    // formula) can reference a special year by name (e.g. "year <
    // [College]") — same text-level rename/freeze cascade as a Variable
    // rename/delete (handleVariablesChange below). Income/spending/
    // withdrawal formulas can reference special years too, but reuse
    // renameFormulaRefsInRanges/renameFormulaRefsInWithdrawalRanges (and
    // their freeze counterparts) directly since nothing about that cascade
    // is variable-specific.
    let incomeRanges = inputs.incomeRanges
    let spendingRanges = inputs.spendingRanges
    let savingsRanges = inputs.savingsRanges
    let withdrawalRanges = inputs.withdrawalRanges
    let rothConversionRanges = inputs.rothConversionRanges
    let goals = inputs.goals
    let metrics = inputs.metrics
    for (const oldSpecialYear of inputs.specialYears) {
      const stillPresent = specialYears.find((s) => s.id === oldSpecialYear.id)
      if (stillPresent) {
        if (stillPresent.name === oldSpecialYear.name) continue
        const oldName = oldSpecialYear.name
        const newName = stillPresent.name
        incomeRanges = renameFormulaRefsInRanges(incomeRanges, oldName, newName)
        spendingRanges = renameFormulaRefsInRanges(spendingRanges, oldName, newName)
        savingsRanges = renameSpecialYearRefsInSavingsRanges(savingsRanges, oldName, newName)
        savingsRanges = renameFormulaRefsInSavingsRanges(savingsRanges, oldName, newName)
        withdrawalRanges = renameFormulaRefsInWithdrawalRanges(withdrawalRanges, oldName, newName)
        rothConversionRanges = renameFormulaRefsInRothConversionRanges(rothConversionRanges, oldName, newName)
        goals = renameFormulaRefsInGoals(goals, oldName, newName)
        metrics = renameFormulaRefsInMetrics(metrics, oldName, newName)
      } else {
        const oldName = oldSpecialYear.name
        const value = oldSpecialYear.year
        incomeRanges = freezeFormulaRefsInRanges(incomeRanges, oldName, value)
        spendingRanges = freezeFormulaRefsInRanges(spendingRanges, oldName, value)
        savingsRanges = freezeSpecialYearRefsInSavingsRanges(savingsRanges, oldName, value)
        savingsRanges = freezeFormulaRefsInSavingsRanges(savingsRanges, oldName, value)
        withdrawalRanges = freezeFormulaRefsInWithdrawalRanges(withdrawalRanges, oldName, value)
        rothConversionRanges = freezeFormulaRefsInRothConversionRanges(rothConversionRanges, oldName, value)
        goals = freezeFormulaRefsInGoals(goals, oldName, value)
        metrics = freezeFormulaRefsInMetrics(metrics, oldName, value)
      }
    }
    onChange(
      resolveInputsSpecialYears({
        ...inputs,
        specialYears,
        incomeRanges,
        spendingRanges,
        savingsRanges,
        withdrawalRanges,
        rothConversionRanges,
        goals,
        metrics,
      }),
    )
  }

  function handleBirthDateChange(birthDate: string) {
    onChange(resolveInputsSpecialYears({ ...inputs, birthDate }))
  }

  function handleLifeExpectancyChange(lifeExpectancy: number) {
    onChange(resolveInputsSpecialYears({ ...inputs, lifeExpectancy }))
  }

  function handleVariablesChange(variables: Variable[]) {
    const validIds = new Set(variables.map((v) => v.id))
    // Freeze/rename against the OLD variables (before this change) and their
    // OLD resolved amounts, so a deleted variable's last known amount
    // survives on any line/variable that referenced it, and a renamed
    // variable's formulas keep resolving.
    const oldVariablesById = new Map(inputs.variables.map((v) => [v.id, v]))
    const oldResolvedAmounts = resolvedVariableAmounts

    let incomeRanges = convertDanglingIncomeVariableRefs(inputs.incomeRanges, validIds, oldVariablesById, oldResolvedAmounts)
    let spendingRanges = convertDanglingSpendingVariableRefs(inputs.spendingRanges, validIds, oldVariablesById, oldResolvedAmounts)
    let savingsRanges = pruneDanglingMatchSourcesInSavingsRanges(
      convertDanglingSavingsRangeVariableRefs(inputs.savingsRanges, validIds, oldVariablesById, oldResolvedAmounts),
      variables,
    )
    let withdrawalRanges = convertDanglingWithdrawalRangeVariableRefs(inputs.withdrawalRanges, validIds, oldVariablesById, oldResolvedAmounts)
    let rothConversionRanges = convertDanglingRothConversionVariableRefs(
      inputs.rothConversionRanges,
      validIds,
      oldVariablesById,
      oldResolvedAmounts,
    )
    let nextVariables = variables
    let goals = inputs.goals
    let metrics = inputs.metrics

    // A 'variable'-kind source links by id (handled above, immune to
    // renames). A formula's expression references a variable BY NAME, so it
    // needs its own text-level rename/freeze cascade.
    for (const oldVar of inputs.variables) {
      const stillPresent = variables.find((v) => v.id === oldVar.id)
      if (stillPresent) {
        if (stillPresent.name === oldVar.name) continue
        const oldName = oldVar.name
        const newName = stillPresent.name
        incomeRanges = renameFormulaRefsInRanges(incomeRanges, oldName, newName)
        spendingRanges = renameFormulaRefsInRanges(spendingRanges, oldName, newName)
        savingsRanges = renameFormulaRefsInSavingsRanges(savingsRanges, oldName, newName)
        withdrawalRanges = renameFormulaRefsInWithdrawalRanges(withdrawalRanges, oldName, newName)
        rothConversionRanges = renameFormulaRefsInRothConversionRanges(rothConversionRanges, oldName, newName)
        nextVariables = renameFormulaRefsInVariables(nextVariables, oldName, newName)
        goals = renameFormulaRefsInGoals(goals, oldName, newName)
        metrics = renameFormulaRefsInMetrics(metrics, oldName, newName)
      } else {
        const value = oldResolvedAmounts.get(oldVar.id) ?? 0
        incomeRanges = freezeFormulaRefsInRanges(incomeRanges, oldVar.name, value)
        spendingRanges = freezeFormulaRefsInRanges(spendingRanges, oldVar.name, value)
        savingsRanges = freezeFormulaRefsInSavingsRanges(savingsRanges, oldVar.name, value)
        withdrawalRanges = freezeFormulaRefsInWithdrawalRanges(withdrawalRanges, oldVar.name, value)
        rothConversionRanges = freezeFormulaRefsInRothConversionRanges(rothConversionRanges, oldVar.name, value)
        nextVariables = freezeFormulaRefsInVariables(nextVariables, oldVar.name, value)
        goals = freezeFormulaRefsInGoals(goals, oldVar.name, value)
        metrics = freezeFormulaRefsInMetrics(metrics, oldVar.name, value)
      }
    }

    onChange({
      ...inputs,
      variables: nextVariables,
      goals,
      metrics,
      incomeRanges,
      spendingRanges,
      savingsRanges,
      withdrawalRanges,
      rothConversionRanges,
      socialSecurity: {
        ...inputs.socialSecurity,
        self: {
          ...inputs.socialSecurity.self,
          wageVariableIds: inputs.socialSecurity.self.wageVariableIds.filter((id) => validIds.has(id)),
        },
        spouse: {
          ...inputs.socialSecurity.spouse,
          wageVariableIds: inputs.socialSecurity.spouse.wageVariableIds.filter((id) => validIds.has(id)),
        },
      },
    })
  }

  // A custom function is referenced by name only (never by id, unlike a
  // Variable's 'variable'-kind source), so there's no dangling-ref
  // conversion to do here — just a rename cascade, same text-level treatment
  // as a Variable rename. Deleting a function is left as-is: any call sites
  // start erroring ("Unknown function") rather than being frozen, since a
  // function's result depends on its call site's own argument expressions,
  // not a single resolved value the way a Variable's does.
  function handleFunctionsChange(functions: CustomFunction[]) {
    let incomeRanges = inputs.incomeRanges
    let spendingRanges = inputs.spendingRanges
    let savingsRanges = inputs.savingsRanges
    let withdrawalRanges = inputs.withdrawalRanges
    let rothConversionRanges = inputs.rothConversionRanges
    let variables = inputs.variables
    let goals = inputs.goals
    let metrics = inputs.metrics
    let nextFunctions = functions

    for (const oldFn of inputs.functions) {
      const stillPresent = functions.find((f) => f.id === oldFn.id)
      if (!stillPresent || stillPresent.name === oldFn.name) continue
      const oldName = oldFn.name
      const newName = stillPresent.name
      incomeRanges = renameFormulaRefsInRanges(incomeRanges, oldName, newName)
      spendingRanges = renameFormulaRefsInRanges(spendingRanges, oldName, newName)
      savingsRanges = renameFormulaRefsInSavingsRanges(savingsRanges, oldName, newName)
      withdrawalRanges = renameFormulaRefsInWithdrawalRanges(withdrawalRanges, oldName, newName)
      rothConversionRanges = renameFormulaRefsInRothConversionRanges(rothConversionRanges, oldName, newName)
      variables = renameFormulaRefsInVariables(variables, oldName, newName)
      goals = renameFormulaRefsInGoals(goals, oldName, newName)
      metrics = renameFormulaRefsInMetrics(metrics, oldName, newName)
      nextFunctions = renameFormulaRefsInFunctions(nextFunctions, oldName, newName)
    }

    onChange({
      ...inputs,
      functions: nextFunctions,
      incomeRanges,
      spendingRanges,
      savingsRanges,
      withdrawalRanges,
      rothConversionRanges,
      variables,
      goals,
      metrics,
    })
  }

  function updateSocialSecurity(patch: Partial<RetirementInputs['socialSecurity']>) {
    onChange({ ...inputs, socialSecurity: { ...inputs.socialSecurity, ...patch } })
  }

  function updateProvisionalIncomeThreshold(
    filingStatus: 'single' | 'marriedFilingJointly',
    field: 'lower' | 'upper',
    value: number,
  ) {
    updateSocialSecurity({
      provisionalIncomeThresholds: {
        ...inputs.socialSecurity.provisionalIncomeThresholds,
        [filingStatus]: { ...inputs.socialSecurity.provisionalIncomeThresholds[filingStatus], [field]: value },
      },
    })
  }

  return (
    <div className="flex flex-col gap-6">
      <Section id="assumptions" title="Assumptions" columns={4}>
        <DateField
          label="Birth date"
          value={inputs.birthDate}
          onChange={handleBirthDateChange}
          hint={age !== null ? `Current age: ${age}` : undefined}
          help="Used to work out your current age, and to convert age-based year ranges below into calendar years."
        />
        <NumberField
          label="Life expectancy"
          min={0}
          value={inputs.lifeExpectancy}
          onChange={handleLifeExpectancyChange}
          help="The age through which your plan is projected. Spending and withdrawals are assumed to continue through this age — also used as the built-in 'Death year' (birth year + life expectancy) and 'Death age' (= this value) special years."
        />
        <NumberField
          label="Investment return"
          suffix="%"
          min={0}
          step={0.1}
          value={inputs.expectedReturnRatePct}
          onChange={(v) => onChange({ ...inputs, expectedReturnRatePct: v })}
          help="The average annual growth rate applied to your balances. This is a real return — already net of inflation — so don't subtract inflation from it yourself."
        />
        <NumberField
          label="Dividend yield"
          suffix="%"
          min={0}
          step={0.1}
          value={inputs.dividendYieldRatePct}
          onChange={(v) => onChange({ ...inputs, dividendYieldRatePct: v })}
          help="The taxable brokerage's assumed annual dividend yield, carved out of Investment return above (not added on top) — so total growth is unchanged at 0%. Unlike Investment return, this isn't a real/inflation-adjusted rate — it's a plain percentage of the account's current balance, same as how a fund's dividend yield is normally quoted. Dividends are taxed as long-term capital gains the year they're paid, whether reinvested or paid out as cash (see the Dividend policy section below)."
        />
        <NumberField
          label="High-yield savings rate"
          suffix="%"
          min={0}
          step={0.1}
          value={inputs.hysaRealReturnRatePct}
          onChange={(v) => onChange({ ...inputs, hysaRealReturnRatePct: v })}
          help="The interest rate applied to your high-yield savings balance. Like Investment return, this is a real rate — already net of inflation. Unlike other accounts' growth, this interest is taxed as ordinary income every year it's earned, not deferred until withdrawal."
        />
        <NumberField
          label="Inflation rate"
          suffix="%"
          min={0}
          step={0.1}
          value={inputs.inflationRatePct}
          onChange={(v) => onChange({ ...inputs, inflationRatePct: v })}
          help="Used to grow the dollar amounts you enter throughout the app — income sources, spending, and savings/withdrawal amounts — over time, so they keep pace with the cost of living. Enter every dollar amount in today's dollars; the app takes care of inflating it."
        />
        <CheckboxField
          label="Include spouse"
          checked={inputs.spouseEnabled}
          onChange={(checked) => onChange({ ...inputs, spouseEnabled: checked })}
          help="Track a spouse's birth date separately, and assign accounts and savings/withdrawal lines to whichever spouse owns them. Needed later to work out penalty-free withdrawal ages per account owner."
        />
        {inputs.spouseEnabled && (
          <DateField
            label="Spouse birth date"
            value={inputs.spouseBirthDate}
            onChange={(v) => onChange({ ...inputs, spouseBirthDate: v })}
            hint={spouseAge !== null ? `Current age: ${spouseAge}` : undefined}
            help="Used to work out your spouse's current age, and later to determine penalty-free withdrawal ages for accounts owned by your spouse."
          />
        )}
      </Section>

      <CollapsibleSection
        id="goals"
        title={
          <>
            Goals
            <HelpTooltip text="Name a pass/fail check against the projection, e.g. 'Leave an inheritance' = netWorth > 100000 — tracked alongside the built-in 'Don't run out of money before death' goal above. A goal is met only if its formula holds true in every projected year; write a one-time milestone as an implication, e.g. 'age < 65 || netWorth > 500000'." />
          </>
        }
      >
        <GoalsEditor
          goals={inputs.goals}
          onChange={(goals) => onChange({ ...inputs, goals })}
          variables={inputs.variables}
          resolvedVariableAmounts={resolvedVariableAmounts}
          specialYears={inputs.specialYears}
          deathYear={deathYr}
          selfBirthYear={selfBirthYear}
          spouseBirthYear={spouseBirthYear}
          history={formulaHistory}
          functions={functionsContext}
          projectionRows={projectionRows}
          simulationRuns={simulationRuns}
        />
      </CollapsibleSection>

      <CollapsibleSection
        id="metrics"
        title={
          <>
            Metrics
            <HelpTooltip text="Name a numerical formula tracked against the projection, e.g. 'Average annual spending' = spending. Each metric below (and in the right-hand panel) reports the average across every projected year, plus a worst-to-best percentile chart across simulation runs once you've run one." />
          </>
        }
      >
        <MetricsEditor
          metrics={inputs.metrics}
          onChange={(metrics) => onChange({ ...inputs, metrics })}
          variables={inputs.variables}
          resolvedVariableAmounts={resolvedVariableAmounts}
          specialYears={inputs.specialYears}
          deathYear={deathYr}
          selfBirthYear={selfBirthYear}
          spouseBirthYear={spouseBirthYear}
          history={formulaHistory}
          functions={functionsContext}
          projectionRows={projectionRows}
          simulationRuns={simulationRuns}
        />
      </CollapsibleSection>

      <CollapsibleSection id="balances" title="Current account balances">
        {inputs.spouseEnabled ? (
          <div className="flex flex-col gap-5">
            <div>
              <h3 className="text-sm font-semibold text-slate-600">You</h3>
              <div className="mt-2 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <OwnedBalanceFields
                  balances={inputs.balances.self}
                  onChange={(b) =>
                    onChange({ ...inputs, balances: { ...inputs.balances, self: b } })
                  }
                />
              </div>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-600">Spouse</h3>
              <div className="mt-2 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <OwnedBalanceFields
                  balances={inputs.balances.spouse}
                  onChange={(b) =>
                    onChange({ ...inputs, balances: { ...inputs.balances, spouse: b } })
                  }
                />
              </div>
            </div>
            <div>
              <h3 className="flex items-center gap-1 text-sm font-semibold text-slate-600">
                Shared
                <HelpTooltip text="Taxable brokerage, HSA, cash, and high-yield savings are tracked as combined household accounts rather than split between spouses." />
              </h3>
              <div className="mt-2 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <SharedBalanceFields
                  balances={inputs.balances.shared}
                  onChange={(b) =>
                    onChange({ ...inputs, balances: { ...inputs.balances, shared: b } })
                  }
                />
              </div>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <OwnedBalanceFields
              balances={inputs.balances.self}
              onChange={(b) =>
                onChange({ ...inputs, balances: { ...inputs.balances, self: b } })
              }
            />
            <SharedBalanceFields
              balances={inputs.balances.shared}
              onChange={(b) =>
                onChange({ ...inputs, balances: { ...inputs.balances, shared: b } })
              }
            />
          </div>
        )}
      </CollapsibleSection>

      <CollapsibleSection
        id="variables"
        title={
          <>
            Variables
            <HelpTooltip text="Named dollar amounts you can reuse across income, spending, and savings lines below — e.g. a variable 'Regular spending' that a spending line references as a yearly or monthly figure. Amounts are always entered in today's dollars." />
          </>
        }
      >
        <VariablesEditor
          bare
          variables={inputs.variables}
          onChange={handleVariablesChange}
          resolvedVariables={resolvedVariables}
          history={formulaHistory}
          functions={functionsContext}
        />
      </CollapsibleSection>

      <SpecialYearsEditor
        specialYears={inputs.specialYears}
        onChange={handleSpecialYearsChange}
        birthYear={birthYear(inputs.birthDate)}
        deathYear={deathYr}
        mode={yearMode}
        onModeChange={setYearMode}
      />

      <CollapsibleSection
        id="functions"
        title={
          <>
            Functions
            <HelpTooltip text="Define a reusable formula with named parameters, e.g. raise(base, pct) = base * (1 + pct / 100). Call it from any formula below as raise(salary, 3) — a function only sees its own parameters, not the variables above, and can call other functions here (but not itself, directly or indirectly)." />
          </>
        }
      >
        <FunctionsEditor
          bare
          functions={inputs.functions}
          onChange={handleFunctionsChange}
          functionsContext={functionsContext}
          history={formulaHistory}
        />
      </CollapsibleSection>

      <CollapsibleSection
        id="income"
        title={
          <>
            Income
            <HelpTooltip text="Name each line of income you might have, e.g. a job's wages, sourced from a variable or a custom one-off amount. Then build an income plan of year ranges below." />
          </>
        }
      >
        <IncomeRangesEditor
          bare
          ranges={inputs.incomeRanges}
          onChange={(ranges) => onChange({ ...inputs, incomeRanges: ranges })}
          variables={inputs.variables}
          resolvedVariableAmounts={resolvedVariableAmounts}
          birthYear={birthYear(inputs.birthDate)}
          spouseBirthYear={spouseBirthYear}
          deathYear={deathYr}
          specialYears={inputs.specialYears}
          mode={yearMode}
          history={formulaHistory}
          functions={functionsContext}
        />
      </CollapsibleSection>

      <CollapsibleSection
        id="spending"
        title={
          <>
            Spending
            <HelpTooltip text="Name each line of spending, e.g. Groceries or Travel, sourced from a variable or a custom one-off amount. Then build a spending plan of year ranges below." />
          </>
        }
      >
        <SpendingRangesEditor
          bare
          ranges={inputs.spendingRanges}
          onChange={(ranges) => onChange({ ...inputs, spendingRanges: ranges })}
          variables={inputs.variables}
          resolvedVariableAmounts={resolvedVariableAmounts}
          birthYear={birthYear(inputs.birthDate)}
          spouseBirthYear={spouseBirthYear}
          deathYear={deathYr}
          specialYears={inputs.specialYears}
          mode={yearMode}
          history={formulaHistory}
          functions={functionsContext}
        />
      </CollapsibleSection>

      <CollapsibleSection
        id="savings"
        title={
          <>
            Savings
            <HelpTooltip text="Add a year range, then build its savings plan directly inside it: layered lines (401k, Roth IRA, taxable, ...) in the order they're funded, each with an account, an amount, and an optional employer match." />
          </>
        }
      >
        <SavingsRangesEditor
          bare
          ranges={inputs.savingsRanges}
          onChange={(ranges) => onChange({ ...inputs, savingsRanges: ranges })}
          variables={inputs.variables}
          resolvedVariableAmounts={resolvedVariableAmounts}
          spouseEnabled={inputs.spouseEnabled}
          birthYear={birthYear(inputs.birthDate)}
          spouseBirthYear={spouseBirthYear}
          deathYear={deathYr}
          specialYears={inputs.specialYears}
          mode={yearMode}
          history={formulaHistory}
          functions={functionsContext}
        />
      </CollapsibleSection>

      <CollapsibleSection
        id="withdrawals"
        title={
          <>
            Withdrawals
            <HelpTooltip text="When income doesn't cover a year's spending, savings, and taxes, the shortfall is drawn from your accounts in the order you set here. Add a year range and list its withdrawal lines in order, each with an account and optional limits. Required minimum distributions always come out first. Years not covered by any range use the default order: HSA for that year's medical spending and 529 for its education spending, then cash, high-yield savings, taxable, pre-tax, Roth, and whatever's left of the HSA and 529." />
          </>
        }
      >
        <WithdrawalRangesEditor
          bare
          ranges={inputs.withdrawalRanges}
          onChange={(ranges) => onChange({ ...inputs, withdrawalRanges: ranges })}
          variables={inputs.variables}
          resolvedVariableAmounts={resolvedVariableAmounts}
          spouseEnabled={inputs.spouseEnabled}
          birthYear={birthYear(inputs.birthDate)}
          spouseBirthYear={spouseBirthYear}
          deathYear={deathYr}
          specialYears={inputs.specialYears}
          mode={yearMode}
          history={formulaHistory}
          functions={functionsContext}
        />
      </CollapsibleSection>

      <CollapsibleSection
        id="taxes"
        title={
          <>
            Taxes
            <HelpTooltip text="Ordinary-income and capital gains tax brackets, plus standard deductions, used to work out how much of your withdrawals and income go to tax. Federal is pre-filled with current tax-year IRS figures for a single filer — adjust it for your actual filing status. State is entirely up to you, since it varies (or doesn't apply) by state." />
          </>
        }
      >
        <div className="flex flex-col gap-5">
          <div>
            <h3 className="text-sm font-semibold text-slate-600">Federal</h3>
            <div className="mt-2 flex flex-col gap-3">
              <TaxBracketsEditor
                brackets={inputs.federalTaxBrackets}
                onChange={(federalTaxBrackets) => onChange({ ...inputs, federalTaxBrackets })}
                addLabel="Add federal bracket"
                removeLabel="Remove federal bracket"
              />
              <div className="w-40">
                <CurrencyField
                  label="Standard deduction"
                  min={0}
                  value={inputs.federalStandardDeduction}
                  onChange={(v) => onChange({ ...inputs, federalStandardDeduction: v })}
                />
              </div>
              <div>
                <h4 className="flex items-center gap-1 text-xs font-semibold text-slate-500">
                  Long-term capital gains
                  <HelpTooltip text="Applied to gains realized when the taxable brokerage account is sold to cover a shortfall. Gains stack on top of your ordinary taxable income, so which bracket they land in depends on both together. Pre-filled with current tax-year figures for a single filer — look up the actual married-filing-jointly thresholds if that applies to you rather than doubling these; unlike the ordinary brackets, MFJ capital gains thresholds aren't simply double the single-filer ones. Everything is treated as long-term — the projection has no holding periods." />
                </h4>
                <div className="mt-2">
                  <TaxBracketsEditor
                    brackets={inputs.federalCapitalGainsBrackets}
                    onChange={(federalCapitalGainsBrackets) =>
                      onChange({ ...inputs, federalCapitalGainsBrackets })
                    }
                    emptyMessage="No capital gains brackets — realized gains will be untaxed federally."
                    addLabel="Add capital gains bracket"
                    removeLabel="Remove capital gains bracket"
                  />
                </div>
              </div>
              <CheckboxField
                label="Federal brackets keep pace with inflation"
                checked={inputs.federalBracketsInflationAdjusted}
                onChange={(federalBracketsInflationAdjusted) =>
                  onChange({ ...inputs, federalBracketsInflationAdjusted })
                }
                help="Federal bracket thresholds and the standard deduction are indexed to inflation by law, so — like income and spending amounts — they're entered above in today's dollars and grown each projection year by the inflation rate. Turn off to model a bracket freeze instead."
              />
            </div>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slate-600">State</h3>
            <div className="mt-2 flex flex-col gap-3">
              <div className="w-56">
                <label className="flex flex-col gap-1">
                  <span className="text-sm font-medium text-slate-700">State</span>
                  <input
                    type="text"
                    placeholder="e.g. Kansas"
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500"
                    value={inputs.stateName}
                    onChange={(e) => onChange({ ...inputs, stateName: e.target.value })}
                  />
                </label>
              </div>
              <TaxBracketsEditor
                brackets={inputs.stateTaxBrackets}
                onChange={(stateTaxBrackets) => onChange({ ...inputs, stateTaxBrackets })}
                emptyMessage="No state brackets yet — add one below, or leave empty if your state has no income tax."
                addLabel="Add state bracket"
                removeLabel="Remove state bracket"
              />
              <div className="flex flex-wrap gap-4">
                <div className="w-40">
                  <CurrencyField
                    label="Standard deduction"
                    min={0}
                    value={inputs.stateStandardDeduction}
                    onChange={(v) => onChange({ ...inputs, stateStandardDeduction: v })}
                  />
                </div>
                <div className="w-40">
                  <CurrencyField
                    label="Personal exemption"
                    min={0}
                    value={inputs.statePersonalExemption}
                    onChange={(v) => onChange({ ...inputs, statePersonalExemption: v })}
                    help="Some states, like Kansas, allow a personal exemption on top of the standard deduction. Leave at 0 if your state doesn't have one."
                  />
                </div>
              </div>
              <CheckboxField
                label="State brackets keep pace with inflation"
                checked={inputs.stateBracketsInflationAdjusted}
                onChange={(stateBracketsInflationAdjusted) =>
                  onChange({ ...inputs, stateBracketsInflationAdjusted })
                }
                help="Unlike the federal case, states don't uniformly index brackets and deductions to inflation — some do automatically, others only by legislature. On by default; turn off if your state doesn't index, to model a bracket freeze instead."
              />
              <div>
                <CheckboxField
                  label="State has separate capital gains rates"
                  checked={inputs.stateHasSeparateCapitalGainsRates}
                  onChange={(stateHasSeparateCapitalGainsRates) =>
                    onChange({ ...inputs, stateHasSeparateCapitalGainsRates })
                  }
                  help="Most states, Kansas included, tax capital gains as ordinary income — leave this off and realized gains run through the state brackets above. Turn it on only if your state has its own schedule for gains."
                />
                {inputs.stateHasSeparateCapitalGainsRates && (
                  <div className="mt-2">
                    <TaxBracketsEditor
                      brackets={inputs.stateCapitalGainsBrackets}
                      onChange={(stateCapitalGainsBrackets) =>
                        onChange({ ...inputs, stateCapitalGainsBrackets })
                      }
                      emptyMessage="No state capital gains brackets yet — add one below, or leave empty if your state doesn't tax gains."
                      addLabel="Add state capital gains bracket"
                      removeLabel="Remove state capital gains bracket"
                    />
                  </div>
                )}
              </div>
              <div>
                <h4 className="flex items-center gap-1 text-sm font-medium text-slate-700">
                  Contribution deductions
                  <HelpTooltip text="Some states let you deduct contributions to a specific account type from state taxable income, up to a cap per beneficiary per year — e.g. Kansas's 529 deduction (currently $3,000/beneficiary single, $6,000/beneficiary married filing jointly), which applies to any state's 529 plan, not just its own. Unused amounts don't carry forward to future years. Federal taxable income is never affected." />
                </h4>
                <div className="mt-2">
                  <StateContributionDeductionsEditor
                    deductions={inputs.stateContributionDeductions}
                    onChange={(stateContributionDeductions) =>
                      onChange({ ...inputs, stateContributionDeductions })
                    }
                  />
                </div>
              </div>
            </div>
          </div>
          <div>
            <h3 className="flex items-center gap-1 text-sm font-semibold text-slate-600">
              Social Security &amp; Medicare
              <HelpTooltip text="FICA payroll tax rates, applied to each worker's own wages rather than household income. Social Security stops once a worker's wages for the year pass the wage base; Medicare has no cap but adds a surtax above the Additional Medicare Tax threshold, which is a household amount based on filing status. Pre-filled with current tax-year figures for a single filer." />
            </h3>
            <div className="mt-2 flex flex-wrap gap-4">
              <div className="w-36">
                <NumberField
                  label="Social Security rate"
                  suffix="%"
                  min={0}
                  step={0.1}
                  value={inputs.socialSecurityTaxRatePct}
                  onChange={(v) => onChange({ ...inputs, socialSecurityTaxRatePct: v })}
                  help="Employee-side OASDI rate, applied to each worker's wages up to the wage base below."
                />
              </div>
              <div className="w-40">
                <CurrencyField
                  label="Social Security wage base"
                  min={0}
                  value={inputs.socialSecurityWageBase}
                  onChange={(v) => onChange({ ...inputs, socialSecurityWageBase: v })}
                  help="The annual per-worker wage cap above which Social Security tax no longer applies."
                />
              </div>
              <div className="w-36">
                <NumberField
                  label="Medicare rate"
                  suffix="%"
                  min={0}
                  step={0.05}
                  value={inputs.medicareTaxRatePct}
                  onChange={(v) => onChange({ ...inputs, medicareTaxRatePct: v })}
                  help="Employee-side Medicare rate, applied to all of each worker's wages — there's no wage cap."
                />
              </div>
              <div className="w-36">
                <NumberField
                  label="Additional Medicare rate"
                  suffix="%"
                  min={0}
                  step={0.1}
                  value={inputs.additionalMedicareTaxRatePct}
                  onChange={(v) => onChange({ ...inputs, additionalMedicareTaxRatePct: v })}
                  help="Extra Medicare surtax on wages above the household threshold below. Employer doesn't match this portion."
                />
              </div>
              <div className="w-48">
                <CurrencyField
                  label="Additional Medicare threshold"
                  min={0}
                  value={inputs.additionalMedicareTaxThreshold}
                  onChange={(v) => onChange({ ...inputs, additionalMedicareTaxThreshold: v })}
                  help="Combined household wages above this amount owe the Additional Medicare rate. Set by filing status, e.g. higher when married filing jointly, and not inflation-adjusted."
                />
              </div>
            </div>
          </div>
          <div>
            <h3 className="flex items-center gap-1 text-sm font-semibold text-slate-600">
              Required minimum distributions
              <HelpTooltip text="Mandatory withdrawals from pre-tax accounts (401(k)/IRA — not Roth) once an owner reaches the start age below, sized off their pre-tax balance at the end of the prior year divided by the Uniform Lifetime Table's distribution period for their age that year. Applies to a spouse's pre-tax balance too, even with spouse mode off. Not modeled: the Joint Life and Last Survivor Table (a smaller RMD that applies only when a spouse more than 10 years younger is the sole beneficiary) and inherited-account rules." />
            </h3>
            <div className="mt-2">
              <div className="w-36">
                <NumberField
                  label="Start age"
                  min={0}
                  value={inputs.rmdStartAge}
                  onChange={(v) => onChange({ ...inputs, rmdStartAge: v })}
                  help="Defaulted to 75, SECURE 2.0's age for anyone born 1960 or later. It's 73 for those born 1951-1959 — adjust it if that's your case."
                />
              </div>
              <div className="mt-3">
                <h4 className="flex items-center gap-1 text-xs font-semibold text-slate-500">
                  Uniform Lifetime Table
                  <HelpTooltip text="Distribution period by age, used to size each year's RMD. Pre-filled with current IRS figures (Pub 590-B) — transcribed by hand, so worth checking against irs.gov, which is also why it's editable rather than fixed." />
                </h4>
                <div className="mt-2">
                  <RmdDivisorsEditor
                    divisors={inputs.rmdDivisors}
                    onChange={(rmdDivisors) => onChange({ ...inputs, rmdDivisors })}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </CollapsibleSection>

      <CollapsibleSection
        id="social-security"
        title={
          <>
            Social Security
            <HelpTooltip text="Each owner's benefit, from either a quick SSA-statement estimate or a full earnings history computed the same way SSA itself computes it (AIME → PIA). Never subject to payroll tax, and taxed federally through a separate 'provisional income' test rather than stacked onto ordinary income. Spousal and survivor benefits aren't modeled — each owner claims only their own benefit." />
          </>
        }
      >
        <div className="flex flex-col gap-5">
          <SocialSecurityOwnerFields
            label="You"
            config={inputs.socialSecurity.self}
            onChange={(self) => updateSocialSecurity({ self })}
            variables={inputs.variables}
            benefitSummary={computeOwnerBenefitSummary(inputs, 'self')}
            inputs={inputs}
            owner="self"
          />
          {inputs.spouseEnabled && (
            <SocialSecurityOwnerFields
              label="Spouse"
              config={inputs.socialSecurity.spouse}
              onChange={(spouse) => updateSocialSecurity({ spouse })}
              variables={inputs.variables}
              benefitSummary={computeOwnerBenefitSummary(inputs, 'spouse')}
              inputs={inputs}
              owner="spouse"
            />
          )}

          <div className="border-t border-slate-100 pt-4">
            <h3 className="flex items-center gap-1 text-sm font-semibold text-slate-600">
              Assumptions
              <HelpTooltip text="Published SSA figures behind the benefit calculation above — editable in case of a transcription error or a future law change, same treatment as the tax brackets and RMD table elsewhere in this app." />
            </h3>
            <div className="mt-2 flex flex-col gap-5">
              <div>
                <h4 className="flex items-center gap-1 text-xs font-semibold text-slate-500">
                  National Average Wage Index
                  <HelpTooltip text="Used to wage-index earnings history to roughly age-60 dollars, and to derive PIA bend points. A different series from the inflation rate above — transcribed from memory, worth checking against ssa.gov." />
                </h4>
                <div className="mt-2">
                  <AwiTableEditor
                    awiTable={inputs.socialSecurity.awiTable}
                    onChange={(awiTable) => updateSocialSecurity({ awiTable })}
                  />
                </div>
                <div className="mt-2 w-52">
                  <NumberField
                    label="Assumed future AWI growth"
                    suffix="%"
                    step={0.1}
                    value={inputs.socialSecurity.awiGrowthRatePct}
                    onChange={(v) => updateSocialSecurity({ awiGrowthRatePct: v })}
                    help="Extrapolates the table above for any year beyond its last published entry — needed for anyone who hasn't yet turned 60, since their bend points depend on an AWI value that hasn't been published yet."
                  />
                </div>
              </div>

              <div>
                <h4 className="text-xs font-semibold text-slate-500">Full Retirement Age</h4>
                <div className="mt-2">
                  <FraTableEditor
                    fullRetirementAgeTable={inputs.socialSecurity.fullRetirementAgeTable}
                    onChange={(fullRetirementAgeTable) => updateSocialSecurity({ fullRetirementAgeTable })}
                  />
                </div>
              </div>

              <div>
                <h4 className="flex items-center gap-1 text-xs font-semibold text-slate-500">
                  Claiming-age adjustment
                  <HelpTooltip text="Flat monthly rates applied to PIA for claiming away from Full Retirement Age: a steeper reduction for the first 36 months early, a shallower one beyond that, and a credit per month claimed late, capped at age 70." />
                </h4>
                <div className="mt-2 flex flex-wrap gap-4">
                  <div className="w-48">
                    <NumberField
                      label="Early reduction (first 36 mo.)"
                      suffix="%/mo"
                      step={0.01}
                      value={inputs.socialSecurity.earlyReductionRateFirst36MonthsPct}
                      onChange={(v) => updateSocialSecurity({ earlyReductionRateFirst36MonthsPct: v })}
                    />
                  </div>
                  <div className="w-48">
                    <NumberField
                      label="Early reduction (beyond 36 mo.)"
                      suffix="%/mo"
                      step={0.01}
                      value={inputs.socialSecurity.earlyReductionRateBeyond36MonthsPct}
                      onChange={(v) => updateSocialSecurity({ earlyReductionRateBeyond36MonthsPct: v })}
                    />
                  </div>
                  <div className="w-36">
                    <NumberField
                      label="Delayed credit"
                      suffix="%/mo"
                      step={0.01}
                      value={inputs.socialSecurity.delayedCreditRatePct}
                      onChange={(v) => updateSocialSecurity({ delayedCreditRatePct: v })}
                    />
                  </div>
                </div>
              </div>

              <div>
                <CheckboxField
                  label="Override COLA rate"
                  checked={inputs.socialSecurity.colaRatePctOverride !== null}
                  onChange={(checked) =>
                    updateSocialSecurity({
                      colaRatePctOverride: checked ? inputs.inflationRatePct : null,
                    })
                  }
                  help="Off by default — claimed benefits grow with the inflation rate above, same as the rest of the app's dollar amounts. Turn on to model a Social Security COLA that diverges from your inflation assumption."
                />
                {inputs.socialSecurity.colaRatePctOverride !== null && (
                  <div className="mt-2 w-36">
                    <NumberField
                      label="COLA rate"
                      suffix="%"
                      step={0.1}
                      value={inputs.socialSecurity.colaRatePctOverride}
                      onChange={(v) => updateSocialSecurity({ colaRatePctOverride: v })}
                    />
                  </div>
                )}
              </div>

              <div>
                <h4 className="flex items-center gap-1 text-xs font-semibold text-slate-500">
                  Provisional income thresholds
                  <HelpTooltip text="Up to 85% of a Social Security benefit is federally taxable based on 'provisional income' — AGI excluding Social Security, plus half the benefit — against these thresholds. Fixed by law since 1984, never inflation-adjusted. Married-filing-jointly figures apply automatically whenever spouse mode is on." />
                </h4>
                <div className="mt-2 flex flex-wrap gap-4">
                  <div className="w-36">
                    <CurrencyField
                      label="Single: lower"
                      min={0}
                      value={inputs.socialSecurity.provisionalIncomeThresholds.single.lower}
                      onChange={(v) => updateProvisionalIncomeThreshold('single', 'lower', v)}
                    />
                  </div>
                  <div className="w-36">
                    <CurrencyField
                      label="Single: upper"
                      min={0}
                      value={inputs.socialSecurity.provisionalIncomeThresholds.single.upper}
                      onChange={(v) => updateProvisionalIncomeThreshold('single', 'upper', v)}
                    />
                  </div>
                  <div className="w-36">
                    <CurrencyField
                      label="MFJ: lower"
                      min={0}
                      value={inputs.socialSecurity.provisionalIncomeThresholds.marriedFilingJointly.lower}
                      onChange={(v) => updateProvisionalIncomeThreshold('marriedFilingJointly', 'lower', v)}
                    />
                  </div>
                  <div className="w-36">
                    <CurrencyField
                      label="MFJ: upper"
                      min={0}
                      value={inputs.socialSecurity.provisionalIncomeThresholds.marriedFilingJointly.upper}
                      onChange={(v) => updateProvisionalIncomeThreshold('marriedFilingJointly', 'upper', v)}
                    />
                  </div>
                </div>
              </div>

              <CheckboxField
                label="My state taxes Social Security benefits"
                checked={inputs.socialSecurity.stateTaxesSocialSecurity}
                onChange={(stateTaxesSocialSecurity) => updateSocialSecurity({ stateTaxesSocialSecurity })}
                help="Most states don't tax Social Security at all — off by default. When on, the same federally-taxable amount is added to state ordinary income too, since this app has no per-state provisional-income rule set."
              />
            </div>
          </div>
        </div>
      </CollapsibleSection>

      <CollapsibleSection
        id="roth-conversions"
        title={
          <>
            Roth conversions
            <HelpTooltip text="Elective transfers from pre-tax to Roth over a range of years — e.g. to fill up a low tax bracket in early retirement before Social Security or RMDs start. The projection taxes each conversion as ordinary income and moves the money from pre-tax to Roth (as basis, so it's withdrawable tax- and penalty-free right away), but never applies the 10% early-withdrawal penalty to it." />
          </>
        }
      >
        <RothConversionRangesEditor
          bare
          ranges={inputs.rothConversionRanges}
          onChange={(ranges) => onChange({ ...inputs, rothConversionRanges: ranges })}
          variables={inputs.variables}
          resolvedVariableAmounts={resolvedVariableAmounts}
          spouseEnabled={inputs.spouseEnabled}
          birthYear={birthYear(inputs.birthDate)}
          spouseBirthYear={spouseBirthYear}
          deathYear={deathYr}
          specialYears={inputs.specialYears}
          mode={yearMode}
          history={formulaHistory}
          functions={functionsContext}
        />
      </CollapsibleSection>

      <CollapsibleSection
        id="dividends"
        title={
          <>
            Dividend policy
            <HelpTooltip text="Whether the taxable brokerage's dividends are reinvested or paid out as cash, by year range. Dividends are taxed as long-term capital gains the year they're paid either way — only reinvest vs. cash affects what happens to the money and the account's cost basis." />
          </>
        }
      >
        <DividendPolicyRangesEditor
          bare
          ranges={inputs.dividendPolicyRanges}
          onChange={(ranges) => onChange({ ...inputs, dividendPolicyRanges: ranges })}
          birthYear={birthYear(inputs.birthDate)}
          deathYear={deathYr}
          specialYears={inputs.specialYears}
          mode={yearMode}
        />
      </CollapsibleSection>
    </div>
  )
}
