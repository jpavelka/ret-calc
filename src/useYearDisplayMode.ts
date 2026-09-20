import { useState } from 'react'

const MODE_KEY = 'ret-calc:range-display-mode'

export type YearDisplayMode = 'year' | 'age'

function loadMode(): YearDisplayMode {
  try {
    return localStorage.getItem(MODE_KEY) === 'age' ? 'age' : 'year'
  } catch {
    return 'year'
  }
}

function saveMode(mode: YearDisplayMode) {
  try {
    localStorage.setItem(MODE_KEY, mode)
  } catch {
    // localStorage unavailable (private browsing, etc.) — mode just won't persist.
  }
}

// Shared across every range editor (SpecialYearsEditor plus each domain's
// plan-range editor) so toggling in one place is reflected everywhere else
// within the same session.
export function useYearDisplayMode(): [YearDisplayMode, (mode: YearDisplayMode) => void] {
  const [mode, setModeState] = useState<YearDisplayMode>(loadMode)
  function setMode(next: YearDisplayMode) {
    setModeState(next)
    saveMode(next)
  }
  return [mode, setMode]
}
