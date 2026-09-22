// A small hand-written arithmetic expression language: + - * / with normal
// precedence, parentheses, unary minus, number literals, variable references
// (bare identifiers or [bracketed names] for names with spaces/punctuation),
// and a few named functions (min/max/round/if/return_rate/inflation_rate).
// Deliberately not eval/Function — this runs on every projection year and
// needs predictable, sandboxed failure modes (unknown identifier, wrong arg
// count, etc.) rather than arbitrary JS execution.

export class FormulaError extends Error {}

type TokenType = 'number' | 'identifier' | 'op' | 'lparen' | 'rparen' | 'comma'

interface Token {
  type: TokenType
  value: string
}

function tokenize(expression: string): Token[] {
  const tokens: Token[] = []
  let i = 0
  while (i < expression.length) {
    const c = expression[i]
    if (/\s/.test(c)) {
      i++
      continue
    }
    if (/[0-9.]/.test(c)) {
      let j = i + 1
      while (j < expression.length && /[0-9.]/.test(expression[j])) j++
      const text = expression.slice(i, j)
      if (!/^\d+(\.\d+)?$/.test(text)) {
        throw new FormulaError(`Invalid number "${text}"`)
      }
      tokens.push({ type: 'number', value: text })
      i = j
      continue
    }
    if (c === '[') {
      const close = expression.indexOf(']', i + 1)
      if (close === -1) throw new FormulaError('Unclosed "["')
      const name = expression.slice(i + 1, close).trim()
      if (!name) throw new FormulaError('Empty variable reference "[]"')
      tokens.push({ type: 'identifier', value: name })
      i = close + 1
      continue
    }
    if (/[A-Za-z_]/.test(c)) {
      let j = i + 1
      while (j < expression.length && /[A-Za-z0-9_]/.test(expression[j])) j++
      tokens.push({ type: 'identifier', value: expression.slice(i, j) })
      i = j
      continue
    }
    const twoChar = expression.slice(i, i + 2)
    if (twoChar === '<=' || twoChar === '>=' || twoChar === '==' || twoChar === '!=' || twoChar === '&&' || twoChar === '||') {
      tokens.push({ type: 'op', value: twoChar })
      i += 2
      continue
    }
    if ('+-*/<>!'.includes(c)) {
      tokens.push({ type: 'op', value: c })
      i++
      continue
    }
    if (c === '(') {
      tokens.push({ type: 'lparen', value: c })
      i++
      continue
    }
    if (c === ')') {
      tokens.push({ type: 'rparen', value: c })
      i++
      continue
    }
    if (c === ',') {
      tokens.push({ type: 'comma', value: c })
      i++
      continue
    }
    throw new FormulaError(`Unexpected character "${c}"`)
  }
  return tokens
}

type Node =
  | { kind: 'number'; value: number }
  | { kind: 'identifier'; name: string }
  | { kind: 'binary'; op: '+' | '-' | '*' | '/'; left: Node; right: Node }
  | { kind: 'negate'; operand: Node }
  | { kind: 'call'; name: string; args: Node[] }
  | { kind: 'compare'; op: '<' | '<=' | '>' | '>=' | '==' | '!='; left: Node; right: Node }
  | { kind: 'logical'; op: '&&' | '||'; left: Node; right: Node }
  | { kind: 'not'; operand: Node }
  | { kind: 'if'; condition: Node; then: Node; else: Node }

const FUNCTIONS = new Set(['min', 'max', 'round', 'return_rate', 'inflation_rate'])

class Parser {
  private pos = 0
  private tokens: Token[]
  // In 'condition' mode, a parenthesized sub-expression may itself be a
  // boolean expression (e.g. "!(year < 2040)"), not just arithmetic — see
  // parsePrimary's lparen case.
  private mode: 'arithmetic' | 'condition'
  constructor(tokens: Token[], mode: 'arithmetic' | 'condition' = 'arithmetic') {
    this.tokens = tokens
    this.mode = mode
  }

  private peek(): Token | undefined {
    return this.tokens[this.pos]
  }

  private next(): Token {
    const t = this.tokens[this.pos]
    if (!t) throw new FormulaError('Unexpected end of expression')
    this.pos++
    return t
  }

  parse(): Node {
    if (this.tokens.length === 0) throw new FormulaError('Empty expression')
    const node = this.parseExpression()
    if (this.pos !== this.tokens.length) {
      throw new FormulaError(`Unexpected token "${this.peek()?.value}"`)
    }
    return node
  }

  // Entry point for boolean condition formulas (e.g. "year < 2040 && income
  // > 50000") — a superset grammar layered above the arithmetic one: || binds
  // loosest, then &&, then unary !, then a single (non-chaining) comparison,
  // whose two sides are ordinary arithmetic expressions from the existing
  // chain below.
  parseCondition(): Node {
    if (this.tokens.length === 0) throw new FormulaError('Empty expression')
    const node = this.parseOr()
    if (this.pos !== this.tokens.length) {
      throw new FormulaError(`Unexpected token "${this.peek()?.value}"`)
    }
    return node
  }

  private parseOr(): Node {
    let node = this.parseAnd()
    while (this.peek()?.type === 'op' && this.peek()?.value === '||') {
      this.next()
      node = { kind: 'logical', op: '||', left: node, right: this.parseAnd() }
    }
    return node
  }

  private parseAnd(): Node {
    let node = this.parseNot()
    while (this.peek()?.type === 'op' && this.peek()?.value === '&&') {
      this.next()
      node = { kind: 'logical', op: '&&', left: node, right: this.parseNot() }
    }
    return node
  }

  private parseNot(): Node {
    if (this.peek()?.type === 'op' && this.peek()?.value === '!') {
      this.next()
      return { kind: 'not', operand: this.parseNot() }
    }
    return this.parseComparison()
  }

  private parseComparison(): Node {
    const left = this.parseExpression()
    const cmpOps = ['<', '<=', '>', '>=', '==', '!=']
    const opToken = this.peek()
    if (opToken?.type === 'op' && cmpOps.includes(opToken.value)) {
      this.next()
      const op = opToken.value as '<' | '<=' | '>' | '>=' | '==' | '!='
      return { kind: 'compare', op, left, right: this.parseExpression() }
    }
    return left
  }

  private parseExpression(): Node {
    let node = this.parseTerm()
    while (this.peek()?.type === 'op' && (this.peek()?.value === '+' || this.peek()?.value === '-')) {
      const op = this.next().value as '+' | '-'
      node = { kind: 'binary', op, left: node, right: this.parseTerm() }
    }
    return node
  }

  private parseTerm(): Node {
    let node = this.parseFactor()
    while (this.peek()?.type === 'op' && (this.peek()?.value === '*' || this.peek()?.value === '/')) {
      const op = this.next().value as '*' | '/'
      node = { kind: 'binary', op, left: node, right: this.parseFactor() }
    }
    return node
  }

  private parseFactor(): Node {
    const t = this.peek()
    if (t?.type === 'op' && t.value === '-') {
      this.next()
      return { kind: 'negate', operand: this.parseFactor() }
    }
    if (t?.type === 'op' && t.value === '+') {
      this.next()
      return this.parseFactor()
    }
    return this.parsePrimary()
  }

  private parsePrimary(): Node {
    const t = this.next()
    if (t.type === 'number') return { kind: 'number', value: Number(t.value) }
    if (t.type === 'lparen') {
      const node = this.mode === 'condition' ? this.parseOr() : this.parseExpression()
      if (this.peek()?.type !== 'rparen') throw new FormulaError('Expected ")"')
      this.next()
      return node
    }
    if (t.type === 'identifier') {
      // IF(condition, then, else) is parsed to its own node rather than a
      // generic 'call': its first argument is boolean (parsed via the
      // condition grammar's entry point, parseOr) while the other two are
      // ordinary numeric expressions, unlike every other function which is
      // all-numeric-args.
      if (t.value === 'if' && this.peek()?.type === 'lparen') {
        this.next()
        // Temporarily switch to 'condition' mode so a parenthesized
        // sub-expression *inside* the condition argument (e.g. the
        // "(x > 0)" in "if(!(x > 0), 1, 0)") is itself allowed to be
        // boolean — otherwise parsePrimary's lparen case would parse it as
        // arithmetic-only whenever IF appears inside a plain (non-condition)
        // formula, since that's this parser's own mode.
        const savedMode = this.mode
        this.mode = 'condition'
        const condition = this.parseOr()
        this.mode = savedMode
        if (this.peek()?.type !== 'comma') throw new FormulaError('Expected ","')
        this.next()
        const thenBranch = this.parseExpression()
        if (this.peek()?.type !== 'comma') throw new FormulaError('Expected ","')
        this.next()
        const elseBranch = this.parseExpression()
        if (this.peek()?.type !== 'rparen') throw new FormulaError('Expected ")"')
        this.next()
        return { kind: 'if', condition, then: thenBranch, else: elseBranch }
      }
      if (this.peek()?.type === 'lparen' && FUNCTIONS.has(t.value)) {
        this.next()
        const args: Node[] = []
        if (this.peek()?.type !== 'rparen') {
          args.push(this.parseExpression())
          while (this.peek()?.type === 'comma') {
            this.next()
            args.push(this.parseExpression())
          }
        }
        if (this.peek()?.type !== 'rparen') throw new FormulaError('Expected ")"')
        this.next()
        return { kind: 'call', name: t.value, args }
      }
      return { kind: 'identifier', name: t.value }
    }
    throw new FormulaError(`Unexpected token "${t.value}"`)
  }
}

function parseFormula(expression: string): Node {
  return new Parser(tokenize(expression)).parse()
}

function parseConditionFormula(expression: string): Node {
  return new Parser(tokenize(expression), 'condition').parseCondition()
}

// A source of prior years' rate data for the return_rate()/inflation_rate()
// functions — accessor functions rather than raw arrays so a caller with no
// real per-year history (Variable resolution, live-preview editors) can
// supply a flat fallback without formula.ts needing to know about that
// policy. Optional everywhere it's threaded through: callers that never
// wire one up simply can't use return_rate()/inflation_rate().
export interface FormulaHistoryContext {
  returnRate: (yearsAgo: number) => number
  inflationRate: (yearsAgo: number) => number
}

// A history context that ignores yearsAgo and always returns the flat
// scenario assumption — for callers with no real per-year projection loop
// to look back through.
export function flatRateHistoryContext(
  expectedReturnRatePct: number,
  inflationRatePct: number,
): FormulaHistoryContext {
  return {
    returnRate: () => expectedReturnRatePct,
    inflationRate: () => inflationRatePct,
  }
}

function evaluateNode(node: Node, scope: Record<string, number>, history?: FormulaHistoryContext): number {
  switch (node.kind) {
    case 'number':
      return node.value
    case 'identifier': {
      const value = scope[node.name]
      if (value === undefined) throw new FormulaError(`Unknown variable "${node.name}"`)
      return value
    }
    case 'negate':
      return -evaluateNode(node.operand, scope, history)
    case 'binary': {
      const left = evaluateNode(node.left, scope, history)
      const right = evaluateNode(node.right, scope, history)
      switch (node.op) {
        case '+':
          return left + right
        case '-':
          return left - right
        case '*':
          return left * right
        case '/':
          if (right === 0) throw new FormulaError('Division by zero')
          return left / right
      }
      break
    }
    case 'if':
      return evaluateConditionNode(node.condition, scope, history)
        ? evaluateNode(node.then, scope, history)
        : evaluateNode(node.else, scope, history)
    case 'call': {
      if (node.name === 'return_rate' || node.name === 'inflation_rate') {
        if (node.args.length !== 1) throw new FormulaError(`${node.name}() needs exactly 1 argument`)
        const n = evaluateNode(node.args[0], scope, history)
        if (!Number.isInteger(n) || n < 0) {
          throw new FormulaError(`${node.name}() argument must be a non-negative whole number of years`)
        }
        if (!history) throw new FormulaError(`${node.name}() isn't available here`)
        return node.name === 'return_rate' ? history.returnRate(n) : history.inflationRate(n)
      }
      const args = node.args.map((a) => evaluateNode(a, scope, history))
      switch (node.name) {
        case 'min':
          if (args.length < 2) throw new FormulaError('min() needs at least 2 arguments')
          return Math.min(...args)
        case 'max':
          if (args.length < 2) throw new FormulaError('max() needs at least 2 arguments')
          return Math.max(...args)
        case 'round':
          if (args.length !== 1) throw new FormulaError('round() needs exactly 1 argument')
          return Math.round(args[0])
        default:
          throw new FormulaError(`Unknown function "${node.name}"`)
      }
    }
  }
  // compare/logical/not nodes only ever come from parseConditionFormula,
  // which is evaluated through evaluateConditionNode, never here — reachable
  // only if something mis-routes a condition tree into the numeric evaluator.
  throw new FormulaError(`"${node.kind}" is a boolean expression, not a number`)
}

// Throws FormulaError on any parse/evaluation failure.
export function evaluateFormula(
  expression: string,
  scope: Record<string, number>,
  history?: FormulaHistoryContext,
): number {
  return evaluateNode(parseFormula(expression), scope, history)
}

export type FormulaResult = { ok: true; value: number } | { ok: false; error: string }

// Same as evaluateFormula, but never throws — for callers (projection,
// live-preview UI) that need to treat a bad formula as "no value" rather
// than crash.
export function tryEvaluateFormula(
  expression: string,
  scope: Record<string, number>,
  history?: FormulaHistoryContext,
): FormulaResult {
  try {
    return { ok: true, value: evaluateFormula(expression, scope, history) }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

// Evaluates only compare/logical/not nodes to a boolean — deliberately no
// implicit number->boolean coercion (a bare arithmetic formula is rejected,
// not treated as truthy), so a condition field always says what it means.
function evaluateConditionNode(node: Node, scope: Record<string, number>, history?: FormulaHistoryContext): boolean {
  switch (node.kind) {
    case 'compare': {
      const left = evaluateNode(node.left, scope, history)
      const right = evaluateNode(node.right, scope, history)
      switch (node.op) {
        case '<':
          return left < right
        case '<=':
          return left <= right
        case '>':
          return left > right
        case '>=':
          return left >= right
        case '==':
          return left === right
        case '!=':
          return left !== right
      }
      break
    }
    case 'logical': {
      const left = evaluateConditionNode(node.left, scope, history)
      if (node.op === '&&') return left && evaluateConditionNode(node.right, scope, history)
      return left || evaluateConditionNode(node.right, scope, history)
    }
    case 'not':
      return !evaluateConditionNode(node.operand, scope, history)
  }
  throw new FormulaError('Expected a boolean expression (e.g. "year < 2040")')
}

// Throws FormulaError on any parse/evaluation failure.
export function evaluateCondition(
  expression: string,
  scope: Record<string, number>,
  history?: FormulaHistoryContext,
): boolean {
  return evaluateConditionNode(parseConditionFormula(expression), scope, history)
}

export type ConditionResult = { ok: true; value: boolean } | { ok: false; error: string }

// Same as evaluateCondition, but never throws — for callers (projection,
// live-preview UI) that need to treat a bad condition without crashing.
export function tryEvaluateCondition(
  expression: string,
  scope: Record<string, number>,
  history?: FormulaHistoryContext,
): ConditionResult {
  try {
    return { ok: true, value: evaluateCondition(expression, scope, history) }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

function collectIdentifiers(node: Node, out: Set<string>): void {
  switch (node.kind) {
    case 'number':
      return
    case 'identifier':
      out.add(node.name)
      return
    case 'negate':
      collectIdentifiers(node.operand, out)
      return
    case 'binary':
      collectIdentifiers(node.left, out)
      collectIdentifiers(node.right, out)
      return
    case 'call':
      for (const arg of node.args) collectIdentifiers(arg, out)
      return
    case 'if':
      collectIdentifiers(node.condition, out)
      collectIdentifiers(node.then, out)
      collectIdentifiers(node.else, out)
      return
    case 'compare':
      collectIdentifiers(node.left, out)
      collectIdentifiers(node.right, out)
      return
    case 'logical':
      collectIdentifiers(node.left, out)
      collectIdentifiers(node.right, out)
      return
    case 'not':
      collectIdentifiers(node.operand, out)
  }
}

// The variable-name tokens a formula (or condition) references (bare or
// bracket-quoted), e.g. "0.1 * salary + [401k Match]" -> ["salary", "401k
// Match"], or "year < 2040 && income > 50000" -> ["income"] (plus "year",
// unless the caller filters it — "year" is never a real Variable unless the
// user happens to name one that, an edge case left to the caller). Parsed
// through the condition grammar, a strict superset of the arithmetic one, so
// this works for both AmountSource/Variable formulas and SavingsLine
// conditions alike. Returns [] for an expression that fails to parse, rather
// than throwing — callers use this for best-effort rename/cycle bookkeeping,
// not evaluation.
export function extractIdentifiers(expression: string): string[] {
  try {
    const out = new Set<string>()
    collectIdentifiers(parseConditionFormula(expression), out)
    return [...out]
  } catch {
    return []
  }
}

// True if `name` can be written bare in a formula (no brackets needed).
export function isBareIdentifier(name: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(name)
}

// How to reference `name` from formula text: bare if possible, otherwise
// bracket-quoted. Used by "insert variable" UI affordances.
export function formulaReference(name: string): string {
  return isBareIdentifier(name) ? name : `[${name}]`
}

// Word-boundary-safe replacement of every reference to `oldName` with
// `newName` in a formula's text, preserving whichever form (bare/bracketed)
// was used. Used to keep formulas correct when a variable is renamed.
export function renameIdentifierInExpression(expression: string, oldName: string, newName: string): string {
  const tokens = tokenize2WithPositions(expression)
  let result = ''
  let cursor = 0
  for (const t of tokens) {
    if (t.type === 'identifier' && t.name === oldName) {
      result += expression.slice(cursor, t.start) + formulaReference(newName)
      cursor = t.end
    }
  }
  result += expression.slice(cursor)
  return result
}

interface PositionedIdentifier {
  type: 'identifier'
  name: string
  start: number
  end: number
}

// Re-tokenizes purely to find identifier spans by source position — kept
// separate from the main tokenizer (which discards positions) since only
// rename/freeze need them.
function tokenize2WithPositions(expression: string): PositionedIdentifier[] {
  const out: PositionedIdentifier[] = []
  let i = 0
  while (i < expression.length) {
    const c = expression[i]
    if (/\s/.test(c)) {
      i++
      continue
    }
    if (/[0-9.]/.test(c)) {
      let j = i + 1
      while (j < expression.length && /[0-9.]/.test(expression[j])) j++
      i = j
      continue
    }
    if (c === '[') {
      const close = expression.indexOf(']', i + 1)
      if (close === -1) break
      out.push({ type: 'identifier', name: expression.slice(i + 1, close).trim(), start: i, end: close + 1 })
      i = close + 1
      continue
    }
    if (/[A-Za-z_]/.test(c)) {
      let j = i + 1
      while (j < expression.length && /[A-Za-z0-9_]/.test(expression[j])) j++
      out.push({ type: 'identifier', name: expression.slice(i, j), start: i, end: j })
      i = j
      continue
    }
    i++
  }
  return out
}

// Word-boundary-safe replacement of every reference to `name` in a formula's
// text with a numeric literal — used to freeze a formula against a variable
// that's being deleted, so the formula keeps evaluating with that variable's
// last-known value baked in instead of breaking.
export function freezeIdentifierInExpression(expression: string, name: string, value: number): string {
  const tokens = tokenize2WithPositions(expression)
  let result = ''
  let cursor = 0
  for (const t of tokens) {
    if (t.name === name) {
      result += expression.slice(cursor, t.start) + String(value)
      cursor = t.end
    }
  }
  result += expression.slice(cursor)
  return result
}
