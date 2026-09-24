import { useEffect, useMemo, useRef, useState } from 'react'
import { FormulaHelp } from './FormulaHelp'
import { BUILTIN_CONSTANT_NAMES } from './formula'
import type { Variable } from './types'

interface ExpressionInputProps {
  expression: string
  onChange: (expression: string) => void
  placeholder: string
  // Candidate variables for the bracket quick-select below.
  variables: Variable[]
  // Special year names (including the built-in "Current year"/"Death year"/"Death age")
  // offered alongside "year" and the variable catalog.
  specialYearNames?: string[]
  // Other synthetic (non-Variable) bare names offered alongside "year" —
  // currently "age"/"spouseAge" (see age.ts's ageFormulaNames), offered only
  // when the caller has a birth year to compute them from.
  extraNames?: string[]
}

interface BracketQuery {
  // Index of the "[" that opened the bracket the cursor is currently inside.
  openIndex: number
  // Text typed since the "[" — the in-progress name to filter candidates by.
  query: string
  // True if a "]" immediately follows the cursor already, so selecting a
  // candidate shouldn't insert a second one.
  hasClosingBracket: boolean
}

// Finds the bracket the cursor is currently positioned inside, if any — the
// nearest unclosed "[" before the cursor with no "]" between it and the
// cursor.
function findOpenBracket(expression: string, cursor: number): BracketQuery | null {
  const openIndex = expression.lastIndexOf('[', cursor - 1)
  if (openIndex === -1) return null
  const closeIndex = expression.lastIndexOf(']', cursor - 1)
  if (closeIndex > openIndex) return null
  return {
    openIndex,
    query: expression.slice(openIndex + 1, cursor),
    hasClosingBracket: expression[cursor] === ']',
  }
}

// Shared text-input core for FormulaField/ConditionField: the raw <input>,
// a quick-select popup that appears while typing inside "[...]" and filters
// as you type — offering "year", extra synthetic names (age/spouseAge),
// special years, and variables, bracket-wrapping any of them regardless of
// whether the name is a bare identifier (see formula.ts's tokenize), so this
// is the only affordance needed to insert one — and a "?" button opening the
// full formula/function reference (FormulaHelp). Both fields wrap this with
// their own label/live-preview line.
export function ExpressionInput({
  expression,
  onChange,
  placeholder,
  variables,
  specialYearNames = [],
  extraNames = [],
}: ExpressionInputProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [bracketQuery, setBracketQuery] = useState<BracketQuery | null>(null)
  const [highlighted, setHighlighted] = useState(0)

  const allNames = useMemo(
    () => [
      'year',
      ...extraNames,
      ...specialYearNames,
      ...BUILTIN_CONSTANT_NAMES,
      ...variables.map((v) => v.name || 'Untitled'),
    ],
    [extraNames, specialYearNames, variables],
  )

  const matches = useMemo(() => {
    if (!bracketQuery) return []
    const q = bracketQuery.query.trim().toLowerCase()
    if (!q) return allNames
    return allNames.filter((name) => name.toLowerCase().includes(q))
  }, [bracketQuery, allNames])

  useEffect(() => {
    setHighlighted(0)
  }, [bracketQuery?.query])

  function updateBracketQuery(input: HTMLInputElement | null) {
    if (!input) {
      setBracketQuery(null)
      return
    }
    const cursor = input.selectionStart ?? input.value.length
    setBracketQuery(findOpenBracket(input.value, cursor))
  }

  function selectCandidate(name: string) {
    if (!bracketQuery) return
    const input = inputRef.current
    const cursor = input?.selectionStart ?? expression.length
    const before = expression.slice(0, bracketQuery.openIndex + 1)
    const after = expression.slice(cursor)
    const next = before + name + (bracketQuery.hasClosingBracket ? after : `]${after}`)
    onChange(next)
    setBracketQuery(null)
    requestAnimationFrame(() => {
      input?.focus()
      const newCursor = before.length + name.length + 1
      input?.setSelectionRange(newCursor, newCursor)
    })
  }

  return (
    <div className="relative flex min-w-0 flex-1 items-center gap-1">
      <input
        ref={inputRef}
        type="text"
        placeholder={placeholder}
        className="min-w-0 flex-1 rounded-md border border-slate-300 px-2 py-1.5 font-mono text-sm text-slate-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500"
        value={expression}
        onChange={(e) => {
          onChange(e.target.value)
          updateBracketQuery(e.target)
        }}
        onKeyUp={(e) => {
          if (e.key !== 'Escape') updateBracketQuery(e.currentTarget)
        }}
        onClick={(e) => updateBracketQuery(e.currentTarget)}
        onKeyDown={(e) => {
          if (!bracketQuery || matches.length === 0) return
          if (e.key === 'ArrowDown') {
            e.preventDefault()
            setHighlighted((h) => (h + 1) % matches.length)
          } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            setHighlighted((h) => (h - 1 + matches.length) % matches.length)
          } else if (e.key === 'Enter') {
            e.preventDefault()
            selectCandidate(matches[highlighted])
          } else if (e.key === 'Escape') {
            e.preventDefault()
            setBracketQuery(null)
          }
        }}
        onBlur={() => {
          // Delayed so a click on a popup option (below) still registers —
          // that handler runs on mousedown and calls preventDefault, but
          // this is a harmless-if-redundant backstop for e.g. Tab-away.
          setTimeout(() => setBracketQuery(null), 150)
        }}
      />
      <FormulaHelp />

      {bracketQuery && matches.length > 0 && (
        <ul
          role="listbox"
          className="absolute top-full left-0 z-10 mt-1 max-h-40 w-56 overflow-auto rounded-md border border-slate-300 bg-white py-1 text-sm shadow-lg"
        >
          {matches.map((name, index) => (
            <li key={name} role="option" aria-selected={index === highlighted}>
              <button
                type="button"
                onMouseDown={(e) => {
                  // Fires before the input's blur, so the popup's own click
                  // doesn't get pre-empted by the blur handler closing it.
                  e.preventDefault()
                  selectCandidate(name)
                }}
                className={`block w-full px-2 py-1 text-left ${
                  index === highlighted ? 'bg-emerald-50 text-emerald-900' : 'text-slate-700 hover:bg-slate-50'
                }`}
              >
                {name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
