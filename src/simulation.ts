import { deathYear as computeDeathYear } from './age'
import { HISTORICAL_MARKET_DATA, type HistoricalMarketYear } from './historicalMarketData'
import { metricAverageInRun } from './metrics'
import { runProjection, type YearlyRates, type YearProjectionRow } from './projection'
import type { RetirementInputs } from './types'

// Converts one historical year's published nominal return + inflation into
// the (real return, inflation) pair the engine actually consumes —
// expectedReturnRatePct is a real rate (see nominalGrowthRate in
// projection.ts), while historical data is published in nominal terms.
function toYearlyRates(historical: HistoricalMarketYear): YearlyRates {
  const realReturnRatePct =
    ((1 + historical.nominalReturnPct / 100) / (1 + historical.inflationPct / 100) - 1) * 100
  return { realReturnRatePct, inflationRatePct: historical.inflationPct, sourceYear: historical.year }
}

// The inverse of toYearlyRates' real-return conversion: recombining a drawn
// (real return, inflation) pair reproduces the original historical nominal
// return exactly — the same figure the engine actually grew balances by that
// year (nominalGrowthRate in projection.ts), so it's what's worth showing
// alongside a simulation's year-by-year detail.
export function nominalReturnPct(rates: YearlyRates): number {
  return ((1 + rates.realReturnRatePct / 100) * (1 + rates.inflationRatePct / 100) - 1) * 100
}

// One simulated path's sequence of yearly rates, built by block bootstrap:
// every blockLength years, pick a random historical start year Y (with
// replacement) and take Y, Y+1, ... as the next blockLength years' (return,
// inflation) pairs, instead of drawing each year independently. Drawing a
// whole contiguous run at once preserves not just a year's own
// return/inflation correlation (e.g. the stagflation years) but also
// realistic year-to-year market dynamics — momentum, mean reversion,
// multi-year drawdowns — that i.i.d. per-year draws would smooth away.
export function drawYearlyRates(
  numYears: number,
  dataset: HistoricalMarketYear[] = HISTORICAL_MARKET_DATA,
  blockLength = 10,
): YearlyRates[] {
  const rates: YearlyRates[] = []
  // dataset is sorted by contiguous calendar year, so a run of
  // effectiveBlockLength consecutive entries starting at any index up to
  // this bound stays within it. Blocks longer than the dataset itself are
  // capped to the whole dataset (the only run that fits).
  const effectiveBlockLength = Math.max(1, Math.min(blockLength, dataset.length))
  const maxStartIndex = dataset.length - effectiveBlockLength
  while (rates.length < numYears) {
    const startIndex = Math.floor(Math.random() * (maxStartIndex + 1))
    for (let offset = 0; offset < effectiveBlockLength && rates.length < numYears; offset++) {
      rates.push(toYearlyRates(dataset[startIndex + offset]))
    }
  }
  return rates
}

export interface SimulationRun {
  rows: YearProjectionRow[]
  // The draw fed into runProjection for this run — rates[i] corresponds to
  // rows[i] (both indexed from the scenario's current year), so a caller can
  // show what the market/inflation did alongside that year's outcome.
  rates: YearlyRates[]
  finalNetWorth: number
  ranOutOfMoney: boolean
  // The first year an unfunded withdrawal appears, or null if the plan made
  // it to the end of the horizon without one. depletionAgeSelf/Spouse are
  // that same row's ages, carried alongside the year for display.
  depletionYear: number | null
  depletionAgeSelf: number | null
  depletionAgeSpouse: number | null
}

function runOne(
  inputs: RetirementInputs,
  dataset: HistoricalMarketYear[],
  blockLength: number,
): SimulationRun {
  const currentYear = new Date().getFullYear()
  const finalYear = computeDeathYear(inputs.birthDate, inputs.lifeExpectancy)
  const numYears = finalYear === null ? 0 : Math.max(0, finalYear - currentYear + 1)

  const rates = drawYearlyRates(numYears, dataset, blockLength)
  const rows = runProjection(inputs, rates)
  const depletionRow = rows.find((row) => row.withdrawals.unfunded > 0)

  return {
    rows,
    rates,
    finalNetWorth: rows.length > 0 ? rows[rows.length - 1].netWorth : 0,
    ranOutOfMoney: depletionRow !== undefined,
    depletionYear: depletionRow?.year ?? null,
    depletionAgeSelf: depletionRow?.ageSelf ?? null,
    depletionAgeSpouse: depletionRow?.ageSpouse ?? null,
  }
}

export function runSimulations(
  inputs: RetirementInputs,
  numSimulations: number,
  dataset: HistoricalMarketYear[] = HISTORICAL_MARKET_DATA,
  blockLength = 10,
): SimulationRun[] {
  const runs: SimulationRun[] = []
  for (let i = 0; i < numSimulations; i++) {
    runs.push(runOne(inputs, dataset, blockLength))
  }
  return runs
}

export interface SimulationSummary {
  successRatePct: number
  worst: SimulationRun
  p10: SimulationRun
  q1: SimulationRun
  median: SimulationRun
  q3: SimulationRun
  p90: SimulationRun
  best: SimulationRun
}

// Nearest-rank percentile on the runs sorted by final net worth — simple and
// exact-index (no interpolation), which is plenty precise for a 100-run
// sample size.
function percentile(sorted: SimulationRun[], p: number): SimulationRun {
  const index = Math.min(sorted.length - 1, Math.floor(p * sorted.length))
  return sorted[index]
}

// Same nearest-rank scheme as percentile() above, but over plain numbers —
// used by summarizeMetric, where the "run" a percentile picks out is really
// just that run's own average metric value, not a whole SimulationRun.
function numericPercentile(sorted: number[], p: number): number {
  const index = Math.min(sorted.length - 1, Math.floor(p * sorted.length))
  return sorted[index]
}

export interface MetricPercentilePoint {
  percentile: number
  value: number
}

export interface MetricSimulationDistribution {
  mean: number
  // Every 5th percentile from 0 (worst run) to 100 (best run), in order —
  // plotted as a curve rather than read as individual numbers. See
  // MetricPercentileChart.
  points: MetricPercentilePoint[]
}

// A Metric's distribution across a set of simulation runs: each run first
// collapses to its own average value (metricAverageInRun — the same figure
// the year-by-year projection reports for a single run), then this summarizes
// THAT population of per-run averages, worst to best. Runs where the metric
// never evaluated (metricAverageInRun returns null — e.g. every year errored)
// are left out entirely rather than treated as zero. Null if no run has a
// value to contribute.
export function summarizeMetricDistribution(
  metricId: string,
  runs: SimulationRun[],
): MetricSimulationDistribution | null {
  const values = runs
    .map((run) => metricAverageInRun(metricId, run.rows))
    .filter((value): value is number => value !== null)
    .sort((a, b) => a - b)

  if (values.length === 0) return null

  const points: MetricPercentilePoint[] = []
  for (let p = 0; p <= 100; p += 5) {
    points.push({ percentile: p, value: numericPercentile(values, p / 100) })
  }

  return {
    mean: values.reduce((sum, v) => sum + v, 0) / values.length,
    points,
  }
}

// Rounding 99.6% to "100%" would overstate a rate that wasn't actually
// perfect, so anything short of an exact 100 is capped at ">99%" instead.
export function formatSuccessRatePct(value: number): string {
  const rounded = Math.round(value)
  if (rounded >= 100 && value < 100) {
    return '>99%'
  }
  return `${rounded}%`
}

export function summarizeSimulations(runs: SimulationRun[]): SimulationSummary {
  const sorted = [...runs].sort((a, b) => a.finalNetWorth - b.finalNetWorth)
  const successCount = runs.filter((r) => !r.ranOutOfMoney).length

  return {
    successRatePct: (successCount / runs.length) * 100,
    worst: sorted[0],
    p10: percentile(sorted, 0.1),
    q1: percentile(sorted, 0.25),
    median: percentile(sorted, 0.5),
    q3: percentile(sorted, 0.75),
    p90: percentile(sorted, 0.9),
    best: sorted[sorted.length - 1],
  }
}
