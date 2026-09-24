import { useState } from 'react'
import type { ScenarioSummary } from './types'

interface ScenarioBarProps {
  scenarios: ScenarioSummary[]
  activeScenario: string | null
  dirty: boolean
  busy: boolean
  hasErrors: boolean
  onLoad: (name: string) => void
  onSave: () => void
  onSaveAs: (name: string) => void
  onReload: () => void
  onDelete: () => void
}

export function ScenarioBar({
  scenarios,
  activeScenario,
  dirty,
  busy,
  hasErrors,
  onLoad,
  onSave,
  onSaveAs,
  onReload,
  onDelete,
}: ScenarioBarProps) {
  const [newName, setNewName] = useState('')

  function handleSaveAs() {
    const name = newName.trim()
    if (!name || hasErrors) return
    onSaveAs(name)
    setNewName('')
  }

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <label className="flex flex-1 flex-col gap-1">
          <span className="text-sm font-medium text-slate-700">Scenario</span>
          <select
            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500"
            value={activeScenario ?? ''}
            disabled={busy}
            onChange={(e) => {
              if (!e.target.value) return
              if (
                dirty &&
                !window.confirm(
                  'You have unsaved changes that will be lost. Load anyway?',
                )
              ) {
                e.target.value = activeScenario ?? ''
                return
              }
              onLoad(e.target.value)
            }}
          >
            <option value="" disabled>
              {scenarios.length ? 'Select a scenario…' : 'No saved scenarios yet'}
            </option>
            {scenarios.map((s) => (
              <option key={s.name} value={s.name}>
                {s.name}
              </option>
            ))}
          </select>
        </label>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={onSave}
            disabled={busy || !activeScenario || !dirty || hasErrors}
            className="rounded-md bg-emerald-600 px-4 py-2 font-medium text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
          >
            Save
          </button>
          <button
            type="button"
            onClick={onReload}
            disabled={busy || !activeScenario}
            className="rounded-md border border-slate-300 px-4 py-2 font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            Reload
          </button>
          <button
            type="button"
            onClick={onDelete}
            disabled={busy || !activeScenario}
            className="rounded-md border border-red-300 px-4 py-2 font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
          >
            Delete
          </button>
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-2 border-t border-slate-100 pt-4 sm:flex-row sm:items-end">
        <label className="flex flex-1 flex-col gap-1">
          <span className="text-sm font-medium text-slate-700">
            Save as new scenario
          </span>
          <input
            type="text"
            placeholder="e.g. Retire at 62"
            className="rounded-md border border-slate-300 px-3 py-2 text-slate-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500"
            value={newName}
            disabled={busy}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSaveAs()
            }}
          />
        </label>
        <button
          type="button"
          onClick={handleSaveAs}
          disabled={busy || !newName.trim() || hasErrors}
          className="rounded-md border border-emerald-600 px-4 py-2 font-medium text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
        >
          Save as new
        </button>
      </div>

      <p className="mt-3 text-sm text-slate-500">
        {activeScenario ? (
          <>
            Editing <span className="font-medium text-slate-700">{activeScenario}</span>
            {dirty ? ' — unsaved changes' : ' — saved'}
          </>
        ) : (
          'Not editing a saved scenario — use "Save as new" to keep these inputs.'
        )}
      </p>
      {hasErrors && (
        <p className="mt-1 text-sm text-red-600">
          Fix the highlighted savings ranges below before saving.
        </p>
      )}
    </section>
  )
}
