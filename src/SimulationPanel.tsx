import { useState } from 'react'
import { HelpTooltip } from './HelpTooltip'
import { NumberField } from './NumberField'
import { ProjectionTable } from './ProjectionTable'
import { runSimulations, summarizeSimulations, type SimulationSummary } from './simulation'
import type { RetirementInputs } from './types'

interface SimulationPanelProps {
  inputs: RetirementInputs
}

type Band = 'worst' | 'p10' | 'q1' | 'median' | 'q3' | 'p90' | 'best'

const BANDS: { id: Band; label: string; buttonLabel: string }[] = [
  { id: 'worst', label: 'Worst', buttonLabel: 'Worst' },
  { id: 'p10', label: '10th percentile', buttonLabel: '10th %tile' },
  { id: 'q1', label: '25th percentile', buttonLabel: '25th %tile' },
  { id: 'median', label: 'Median', buttonLabel: 'Median' },
  { id: 'q3', label: '75th percentile', buttonLabel: '75th %tile' },
  { id: 'p90', label: '90th percentile', buttonLabel: '90th %tile' },
  { id: 'best', label: 'Best', buttonLabel: 'Best' },
]

// Mirrors ProjectionTable's ageLabel: shows both ages side by side when
// spouse mode is on, since a depletion year alone doesn't say how old either
// spouse was at the time.
function depletionAgeLabel(run: { depletionAgeSelf: number | null; depletionAgeSpouse: number | null }, spouseEnabled: boolean): string {
  const self = run.depletionAgeSelf ?? '–'
  return spouseEnabled && run.depletionAgeSpouse !== null ? `${self} / ${run.depletionAgeSpouse}` : String(self)
}

function fmt(value: number): string {
  return Math.round(value).toLocaleString('en-US')
}

function Money({ value }: { value: number }) {
  return (
    <span className={value < 0 ? 'text-red-600' : undefined}>
      {value < 0 ? '-' : ''}${fmt(Math.abs(value))}
    </span>
  )
}

export function SimulationPanel({ inputs }: SimulationPanelProps) {
  const [numSimulations, setNumSimulations] = useState(100)
  const [blockLength, setBlockLength] = useState(10)
  const [summary, setSummary] = useState<SimulationSummary | null>(null)
  const [band, setBand] = useState<Band>('median')
  const [running, setRunning] = useState(false)

  function handleRun() {
    setRunning(true)
    // Deferred so the "Running…" state actually paints before the
    // synchronous batch of projections (each with its own tax-solver loop)
    // blocks the main thread.
    setTimeout(() => {
      const runs = runSimulations(inputs, numSimulations, undefined, blockLength)
      setSummary(summarizeSimulations(runs))
      setRunning(false)
    }, 0)
  }

  const selectedRun = summary?.[band] ?? null

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-slate-500">
        Runs the projection {numSimulations} times, each drawing a different sequence of
        investment returns and inflation from historical data, instead of the single flat rate
        used above. Every {blockLength} simulated year{blockLength === 1 ? '' : 's'}, a random
        historical year is picked and its actual multi-year run (that year, then the next,
        and so on) is used, so consecutive years keep their real historical relationship
        instead of being shuffled independently. Shows how sequence-of-returns risk — bad years
        landing early in retirement versus late — can change the same average return's outcome.
      </p>

      <div className="flex flex-wrap items-end gap-3">
        <div className="w-40">
          <NumberField
            label="Number of simulations"
            value={numSimulations}
            onChange={setNumSimulations}
            min={1}
            step={1}
          />
        </div>
        <div className="w-40">
          <NumberField
            label="Block length (years)"
            value={blockLength}
            onChange={setBlockLength}
            min={1}
            step={1}
          />
        </div>
        <button
          type="button"
          onClick={handleRun}
          disabled={running || numSimulations < 1 || blockLength < 1}
          className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          {running ? 'Running…' : 'Run simulation'}
        </button>
      </div>

      {summary && (
        <>
          <p className="flex items-center gap-1 text-sm font-medium text-slate-900">
            Succeeded in {fmt(summary.successRatePct)}% of {numSimulations} simulations
            <HelpTooltip
              text={
                'A run "succeeds" if it never has an unfunded withdrawal — every account ran ' +
                'dry and spending still couldn’t be covered — before the end of the horizon.'
              }
            />
          </p>

          <div className="overflow-x-auto">
            <table className="w-max min-w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-slate-500">
                  <th className="py-2 pr-6 font-medium">Outcome</th>
                  <th className="py-2 pr-6 font-medium">Final net worth</th>
                  <th className="py-2 pr-6 font-medium">Ran out of money</th>
                </tr>
              </thead>
              <tbody>
                {BANDS.map(({ id, label }) => {
                  const run = summary[id]
                  return (
                    <tr key={id} className="border-b border-slate-100">
                      <td className="py-2 pr-6 text-slate-700">{label}</td>
                      <td className="py-2 pr-6">
                        <Money value={run.finalNetWorth} />
                      </td>
                      <td className="py-2 pr-6 text-slate-700">
                        {run.ranOutOfMoney
                          ? `Yes, in ${run.depletionYear} (age ${depletionAgeLabel(run, inputs.spouseEnabled)})`
                          : 'No'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div>
            <div className="flex flex-wrap items-center gap-1">
              {BANDS.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => setBand(b.id)}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                    b.id === band
                      ? 'bg-emerald-600 text-white'
                      : 'border border-slate-300 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {b.buttonLabel}
                </button>
              ))}
            </div>
            {selectedRun && (
              <div className="mt-4">
                <ProjectionTable rows={selectedRun.rows} inputs={inputs} rates={selectedRun.rates} />
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
