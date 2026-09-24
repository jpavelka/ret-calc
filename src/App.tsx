import { useEffect, useMemo, useState } from 'react'
import {
  deleteScenario,
  listScenarios,
  loadScenario,
  saveScenario,
} from './api'
import { CollapsibleSection } from './CollapsibleSection'
import { GoalPanel } from './GoalPanel'
import { InputsForm } from './InputsForm'
import { ProjectionSectionHeading, ProjectionTable } from './ProjectionTable'
import { runProjection } from './projection'
import { ScenarioBar } from './ScenarioBar'
import { runSimulations, summarizeSimulations, type SimulationRun } from './simulation'
import { SimulationPanel } from './SimulationPanel'
import { isReservedSpecialYearName } from './specialYearGraph'
import { resolveInputsSpecialYears } from './specialYearsSync'
import { TableOfContents } from './TableOfContents'
import { DEFAULT_INPUTS, type RetirementInputs, type ScenarioSummary } from './types'
import { findInvalidRangeIds, findOverlappingRangeIds } from './validation'

const LAST_SCENARIO_KEY = 'ret-calc:last-scenario'

type Status = { kind: 'idle' } | { kind: 'error'; message: string }

function App() {
  const [inputs, setInputs] = useState<RetirementInputs>(DEFAULT_INPUTS)
  const [savedSnapshot, setSavedSnapshot] = useState<string | null>(null)
  const [scenarios, setScenarios] = useState<ScenarioSummary[]>([])
  const [activeScenario, setActiveScenario] = useState<string | null>(null)
  const [ready, setReady] = useState(false)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<Status>({ kind: 'idle' })
  const [simulationRuns, setSimulationRuns] = useState<SimulationRun[] | null>(null)
  const [numSimulations, setNumSimulations] = useState(1000)
  const [blockLength, setBlockLength] = useState(20)
  const [simulationRunning, setSimulationRunning] = useState(false)

  const projectionRows = useMemo(() => runProjection(inputs), [inputs])
  const ranOutOfMoneyBaseline = useMemo(
    () => projectionRows.some((row) => row.withdrawals.unfunded > 0),
    [projectionRows],
  )
  const simulationSummary = useMemo(
    () => (simulationRuns ? summarizeSimulations(simulationRuns) : null),
    [simulationRuns],
  )

  // Any edit to the scenario — including loading a different one — makes
  // prior simulation runs stale, since they reflect the old inputs.
  useEffect(() => {
    setSimulationRuns(null)
  }, [inputs])

  const dirty = JSON.stringify(inputs) !== savedSnapshot
  const hasErrors =
    findInvalidRangeIds(inputs.incomeRanges).size > 0 ||
    findInvalidRangeIds(inputs.spendingRanges).size > 0 ||
    findInvalidRangeIds(inputs.savingsRanges).size > 0 ||
    findInvalidRangeIds(inputs.withdrawalRanges).size > 0 ||
    findInvalidRangeIds(inputs.rothConversionRanges).size > 0 ||
    findInvalidRangeIds(inputs.dividendPolicyRanges).size > 0 ||
    findOverlappingRangeIds(inputs.dividendPolicyRanges).size > 0 ||
    findOverlappingRangeIds(inputs.withdrawalRanges).size > 0 ||
    inputs.specialYears.some((s) => isReservedSpecialYearName(s.name))

  useEffect(() => {
    async function init() {
      const list = await listScenarios()
      setScenarios(list)

      const lastName = localStorage.getItem(LAST_SCENARIO_KEY)
      const initialName =
        lastName && list.some((s) => s.name === lastName)
          ? lastName
          : (list[0]?.name ?? null)

      if (initialName) {
        const loadedInputs = resolveInputsSpecialYears(await loadScenario(initialName))
        setInputs(loadedInputs)
        setSavedSnapshot(JSON.stringify(loadedInputs))
        setActiveScenario(initialName)
      } else {
        setSavedSnapshot(JSON.stringify(DEFAULT_INPUTS))
      }
      setReady(true)
    }
    init().catch((err) => {
      setStatus({ kind: 'error', message: err.message })
      setReady(true)
    })
  }, [])

  function handleRunSimulation() {
    setSimulationRunning(true)
    // Deferred so the "Running…" state actually paints before the
    // synchronous batch of projections (each with its own tax-solver loop)
    // blocks the main thread.
    setTimeout(() => {
      setSimulationRuns(runSimulations(inputs, numSimulations, undefined, blockLength))
      setSimulationRunning(false)
    }, 0)
  }

  async function refreshScenarios() {
    setScenarios(await listScenarios())
  }

  async function handleLoad(name: string) {
    setBusy(true)
    setStatus({ kind: 'idle' })
    try {
      const loadedInputs = resolveInputsSpecialYears(await loadScenario(name))
      setInputs(loadedInputs)
      setSavedSnapshot(JSON.stringify(loadedInputs))
      setActiveScenario(name)
      localStorage.setItem(LAST_SCENARIO_KEY, name)
    } catch (err) {
      setStatus({ kind: 'error', message: (err as Error).message })
    } finally {
      setBusy(false)
    }
  }

  async function handleSave() {
    if (!activeScenario) return
    setBusy(true)
    setStatus({ kind: 'idle' })
    try {
      await saveScenario(activeScenario, inputs)
      setSavedSnapshot(JSON.stringify(inputs))
      await refreshScenarios()
    } catch (err) {
      setStatus({ kind: 'error', message: (err as Error).message })
    } finally {
      setBusy(false)
    }
  }

  async function handleSaveAs(name: string) {
    setBusy(true)
    setStatus({ kind: 'idle' })
    try {
      await saveScenario(name, inputs)
      setSavedSnapshot(JSON.stringify(inputs))
      setActiveScenario(name)
      localStorage.setItem(LAST_SCENARIO_KEY, name)
      await refreshScenarios()
    } catch (err) {
      setStatus({ kind: 'error', message: (err as Error).message })
    } finally {
      setBusy(false)
    }
  }

  async function handleReload() {
    if (!activeScenario) return
    if (
      dirty &&
      !window.confirm('You have unsaved changes that will be lost. Reload anyway?')
    )
      return
    await handleLoad(activeScenario)
  }

  async function handleDelete() {
    if (!activeScenario) return
    if (
      !window.confirm(`Delete scenario "${activeScenario}"? This can't be undone.`)
    )
      return
    setBusy(true)
    setStatus({ kind: 'idle' })
    try {
      await deleteScenario(activeScenario)
      if (localStorage.getItem(LAST_SCENARIO_KEY) === activeScenario) {
        localStorage.removeItem(LAST_SCENARIO_KEY)
      }
      setActiveScenario(null)
      await refreshScenarios()
    } catch (err) {
      setStatus({ kind: 'error', message: (err as Error).message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-7xl px-4 py-10">
        <header className="mb-8">
          <h1 className="text-2xl font-bold text-slate-900">
            Retirement Calculator
          </h1>
          <p className="mt-1 text-slate-500">
            Enter your current balances, savings, and spending to get started.
          </p>
        </header>

        {ready ? (
          <div className="lg:grid lg:grid-cols-[200px_minmax(0,1fr)_260px] lg:items-start lg:gap-8">
            <nav className="hidden lg:sticky lg:top-10 lg:block lg:max-h-[calc(100vh-5rem)] lg:overflow-y-auto">
              <TableOfContents />
            </nav>

            <div className="flex min-w-0 flex-col gap-6">
              <ScenarioBar
                scenarios={scenarios}
                activeScenario={activeScenario}
                dirty={dirty}
                busy={busy}
                hasErrors={hasErrors}
                onLoad={handleLoad}
                onSave={handleSave}
                onSaveAs={handleSaveAs}
                onReload={handleReload}
                onDelete={handleDelete}
              />

              {status.kind === 'error' && (
                <p className="text-sm text-red-600">{status.message}</p>
              )}

              <CollapsibleSection id="projection" title={<ProjectionSectionHeading />} defaultOpen>
                <ProjectionTable rows={projectionRows} inputs={inputs} />
              </CollapsibleSection>

              <CollapsibleSection id="simulation" title="Simulation">
                <SimulationPanel
                  inputs={inputs}
                  runs={simulationRuns}
                  onRunsChange={setSimulationRuns}
                  numSimulations={numSimulations}
                  onNumSimulationsChange={setNumSimulations}
                  blockLength={blockLength}
                  onBlockLengthChange={setBlockLength}
                  running={simulationRunning}
                  onRun={handleRunSimulation}
                />
              </CollapsibleSection>

              <InputsForm
                inputs={inputs}
                onChange={setInputs}
                projectionRows={projectionRows}
                simulationRuns={simulationRuns}
              />
            </div>

            <aside className="hidden lg:sticky lg:top-10 lg:block lg:max-h-[calc(100vh-5rem)] lg:overflow-y-auto">
              <GoalPanel
                activeScenario={activeScenario}
                dirty={dirty}
                busy={busy}
                hasErrors={hasErrors}
                onSave={handleSave}
                onReload={handleReload}
                ranOutOfMoneyBaseline={ranOutOfMoneyBaseline}
                simulationSummary={simulationSummary}
                goals={inputs.goals}
                metrics={inputs.metrics}
                projectionRows={projectionRows}
                simulationRuns={simulationRuns}
                simulationRunning={simulationRunning}
                onRunSimulation={handleRunSimulation}
              />
            </aside>
          </div>
        ) : (
          <p className="text-slate-500">Loading…</p>
        )}
      </div>
    </div>
  )
}

export default App
