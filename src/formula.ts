// A small hand-written arithmetic expression language: + - * / with normal
// precedence, parentheses, unary minus, number literals, variable references
// (bare identifiers or [bracketed names] for names with spaces/punctuation),
// and a few named functions (min/max/round/if, plus the lookback functions —
// return_rate/inflation_rate/net_worth, per-account balance lookups like
// pretax_self/roth/taxable, previous_income/previous_spending, and
// previous_rmd_self/previous_rmd_spouse/previous_rmd — see AccountHistoryKey
// and FormulaHistoryContext below), plus their Goal-only
// net_worth_in_year()/net_worth_at_age()/net_worth_at_spouse_age() and
// per-account _in_year()/_at_age()/_at_spouse_age() counterparts
// (PROJECTION_LOOKUP_FUNCTIONS below), plus dollar_convert(amount, from_year,
// to_year) and rmd_in_year()/rmd_at_age()/rmd_at_spouse_age() — usable in ANY
// formula, not just a Goal's, but only for years already reached outside one
// (DOLLAR_CONVERT_FUNCTION/RMD_LOOKUP_FUNCTIONS below) — plus first_year_when
// (condition)/first_age_when(condition)/first_spouse_age_when(condition),
// also Goal/Metric-only (FIRST_WHEN_FUNCTIONS below), which scan the whole
// projection (via FormulaHistoryContext.projectionRows) and return the
// year/age/spouse age of the first row where the condition holds, or
// Infinity if it never does — plus any user-defined custom functions (see
// functions.ts). Deliberately not eval/Function — this
// runs on every projection year and needs predictable, sandboxed failure
// modes (unknown identifier, wrong arg count, etc.) rather than arbitrary JS
// execution.

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
  // first_year_when(condition)/first_age_when(condition)/
  // first_spouse_age_when(condition) — like 'if' above, the argument is
  // parsed via the condition grammar (parseOr) rather than plain arithmetic,
  // since it's a boolean, not a number. Unlike 'if', evaluating this doesn't
  // evaluate `condition` once against the current scope — it re-evaluates
  // the same condition tree once per row of the whole projection (see
  // FormulaHistoryContext.projectionRows) looking for the first one where it
  // holds, and reports that row's year/age/spouseAge per `target`. One node
  // kind for all three (rather than three near-identical ones) since they
  // differ only in which of a row's fields they report — see
  // FIRST_WHEN_FUNCTIONS and evaluateNode's 'first_when' case.
  | { kind: 'first_when'; target: 'year' | 'age' | 'spouseAge'; condition: Node }

// Keys for the account-balance lookback functions (pretax_self(), roth(),
// taxable(), ...) — one union covering both the owner-split accounts (self/
// spouse/combined variants) and the shared (household-level, no owner split)
// accounts. Lives here rather than projection.ts/types.ts so formula.ts stays
// import-free; projection.ts (which already imports FormulaHistoryContext
// from here) is the one that knows how to build a Record<AccountHistoryKey,
// number> snapshot from real Balances (see its accountBalanceSnapshot).
export type AccountHistoryKey =
  | 'pretaxSelf'
  | 'pretaxSpouse'
  | 'pretax'
  | 'rothSelf'
  | 'rothSpouse'
  | 'roth'
  | 'rothBasisSelf'
  | 'rothBasisSpouse'
  | 'rothBasis'
  | 'taxable'
  | 'taxableBasis'
  | 'hsa'
  | 'cash'
  | 'hysa'
  | 'college529'
  | 'college529Basis'

// Formula function name -> AccountHistoryKey, for the account-balance
// lookback functions. Single source of truth for both the parser-facing name
// and the FormulaHistoryContext-facing key.
const ACCOUNT_BALANCE_FUNCTIONS: Record<string, AccountHistoryKey> = {
  pretax_self: 'pretaxSelf',
  pretax_spouse: 'pretaxSpouse',
  pretax: 'pretax',
  roth_self: 'rothSelf',
  roth_spouse: 'rothSpouse',
  roth: 'roth',
  roth_basis_self: 'rothBasisSelf',
  roth_basis_spouse: 'rothBasisSpouse',
  roth_basis: 'rothBasis',
  taxable: 'taxable',
  taxable_basis: 'taxableBasis',
  hsa: 'hsa',
  cash: 'cash',
  hysa: 'hysa',
  college529: 'college529',
  college529_basis: 'college529Basis',
}

// return_rate/inflation_rate/net_worth, the account-balance functions above,
// and previous_income/previous_spending all share one contract: exactly 1
// argument, a non-negative whole number of years, and a history context to
// read it from. See the 'call' case in evaluateNode for the shared
// validation this backs.
const LOOKBACK_FUNCTIONS = new Set([
  'return_rate',
  'inflation_rate',
  'net_worth',
  'previous_income',
  'previous_spending',
  'previous_rmd_self',
  'previous_rmd_spouse',
  'previous_rmd',
  ...Object.keys(ACCOUNT_BALANCE_FUNCTIONS),
])

// Absolute-lookup counterparts to net_worth()/the account-balance functions
// above — net_worth_in_year(2040)/net_worth_at_age(65)/
// net_worth_at_spouse_age(65) and one _in_year()/_at_age()/_at_spouse_age()
// trio per ACCOUNT_BALANCE_FUNCTIONS entry (e.g. pretax_self_in_year(2040),
// roth_at_age(65), roth_at_spouse_age(65)). Only meaningful for a Goal
// formula (see FormulaHistoryContext.netWorthInYear and friends) — every
// other formula in the app is evaluated one projection-year at a time and so
// can't answer "what happens in/by some other year", including one still in
// its own future.
const NET_WORTH_IN_YEAR_FUNCTION = 'net_worth_in_year'
const NET_WORTH_AT_AGE_FUNCTION = 'net_worth_at_age'
const NET_WORTH_AT_SPOUSE_AGE_FUNCTION = 'net_worth_at_spouse_age'
const ACCOUNT_BALANCE_IN_YEAR_FUNCTIONS: Record<string, AccountHistoryKey> = Object.fromEntries(
  Object.entries(ACCOUNT_BALANCE_FUNCTIONS).map(([name, key]) => [`${name}_in_year`, key]),
)
const ACCOUNT_BALANCE_AT_AGE_FUNCTIONS: Record<string, AccountHistoryKey> = Object.fromEntries(
  Object.entries(ACCOUNT_BALANCE_FUNCTIONS).map(([name, key]) => [`${name}_at_age`, key]),
)
const ACCOUNT_BALANCE_AT_SPOUSE_AGE_FUNCTIONS: Record<string, AccountHistoryKey> = Object.fromEntries(
  Object.entries(ACCOUNT_BALANCE_FUNCTIONS).map(([name, key]) => [`${name}_at_spouse_age`, key]),
)
const PROJECTION_LOOKUP_FUNCTIONS = new Set([
  NET_WORTH_IN_YEAR_FUNCTION,
  NET_WORTH_AT_AGE_FUNCTION,
  NET_WORTH_AT_SPOUSE_AGE_FUNCTION,
  ...Object.keys(ACCOUNT_BALANCE_IN_YEAR_FUNCTIONS),
  ...Object.keys(ACCOUNT_BALANCE_AT_AGE_FUNCTIONS),
  ...Object.keys(ACCOUNT_BALANCE_AT_SPOUSE_AGE_FUNCTIONS),
])

// Converts an amount from one projected year's dollars to another's, using
// that run's own year-by-year inflation — the actual drawn rates in a Monte
// Carlo run, not the flat scenario assumption (see YearProjectionRow.
// inflationFactor and buildGoalProjectionLookups' dollarConvert). Takes 3
// arguments rather than the 1-argument year/age lookback shape every other
// PROJECTION_LOOKUP_FUNCTIONS member has, so it's validated and dispatched
// separately below instead of joining that set. Unlike net_worth_in_year()
// and friends, this (and the RMD lookups below it) is NOT Goal-only — every
// formula in the app can call it. What differs by context is which years it
// can answer: a Goal formula runs after the whole projection is known, so it
// can ask about any year, forward or back (see FormulaHistoryContext.
// dollarConvert), while an ordinary formula runs inline, one projection-year
// at a time, so it can only ask about years already reached by that point —
// asking about a year still in that formula's own future throws, since the
// answer doesn't exist yet (see runProjection's inflationFactorByYear).
const DOLLAR_CONVERT_FUNCTION = 'dollar_convert'

// Absolute-lookup counterparts to previous_rmd() — rmd_in_year(2040)/
// rmd_at_age(65)/rmd_at_spouse_age(65) ask for the household's TOTAL (self +
// spouse) required minimum distribution in a specific year/age, anywhere in
// the projection, rather than previous_rmd()'s "n years before now" shape.
// Same "not Goal-only, but bounded to years already reached outside a Goal
// formula" contract as dollar_convert() above — see
// FormulaHistoryContext.rmdInYear and runProjection's rmdByYear/rmdByAge/
// rmdBySpouseAge.
const RMD_IN_YEAR_FUNCTION = 'rmd_in_year'
const RMD_AT_AGE_FUNCTION = 'rmd_at_age'
const RMD_AT_SPOUSE_AGE_FUNCTION = 'rmd_at_spouse_age'
const RMD_LOOKUP_FUNCTIONS = new Set([RMD_IN_YEAR_FUNCTION, RMD_AT_AGE_FUNCTION, RMD_AT_SPOUSE_AGE_FUNCTION])

// first_year_when(condition)/first_age_when(condition)/
// first_spouse_age_when(condition) — function name -> which field of the
// first matching row (see FormulaHistoryContext.projectionRows) to report.
// Parsed to a single 'first_when' Node kind (see parsePrimary/evaluateNode)
// rather than joining BUILTIN_FUNCTIONS, same reasoning as 'if': the
// argument is a condition, not a plain arithmetic expression.
const FIRST_WHEN_FUNCTIONS: Record<string, 'year' | 'age' | 'spouseAge'> = {
  first_year_when: 'year',
  first_age_when: 'age',
  first_spouse_age_when: 'spouseAge',
}

const BUILTIN_FUNCTIONS = new Set([
  'min',
  'max',
  'round',
  DOLLAR_CONVERT_FUNCTION,
  ...RMD_LOOKUP_FUNCTIONS,
  ...LOOKBACK_FUNCTIONS,
  ...PROJECTION_LOOKUP_FUNCTIONS,
])

// Identifiers that resolve to a fixed value in every formula, without the
// user having to define a Variable for them — checked only after the
// caller's own scope, so a user-defined variable of the same name still
// wins. `infinity` mirrors what first_year_when()/first_age_when()/
// first_spouse_age_when() already return when a condition never holds (see
// 'first_when' below), giving formulas a way to compare against or produce
// that same value directly, e.g. "[infinity]" or "first_year_when(...) ==
// [infinity]". Written bracketed like a Variable reference (ExpressionInput's
// "[" quick-select offers it alongside the variable catalog, always inserted
// bracketed so it reads as "this is a named value" rather than a keyword) —
// but since "[name]" and a bare identifier both just tokenize to the same
// identifier node (see tokenize's "[" case), a bare "infinity" still
// resolves too.
export const BUILTIN_CONSTANT_NAMES = ['infinity']
const BUILTIN_CONSTANTS: Record<string, number> = {
  infinity: Infinity,
}

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
      // first_year_when(condition)/first_age_when(condition)/
      // first_spouse_age_when(condition) — same "condition argument needs
      // its own boolean grammar" reasoning as IF above, but with a single
      // argument and no comma to look for.
      if (t.value in FIRST_WHEN_FUNCTIONS && this.peek()?.type === 'lparen') {
        this.next()
        const savedMode = this.mode
        this.mode = 'condition'
        const condition = this.parseOr()
        this.mode = savedMode
        if (this.peek()?.type !== 'rparen') throw new FormulaError('Expected ")"')
        this.next()
        return { kind: 'first_when', target: FIRST_WHEN_FUNCTIONS[t.value], condition }
      }
      // A custom function's name isn't known at parse time (it's data, defined
      // by the user elsewhere) — so any identifier(...) is parsed as a call
      // node here, built-in or not, and an unknown name is only caught at
      // evaluation time (see evaluateNode's 'call' case), same as an unknown
      // bare identifier already is.
      if (this.peek()?.type === 'lparen') {
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

// A source of prior years' rate/net-worth data for the return_rate()/
// inflation_rate()/net_worth() functions — accessor functions rather than
// raw arrays so a caller with no real per-year history (Variable resolution,
// live-preview editors) can supply a flat fallback without formula.ts
// needing to know about that policy. Optional everywhere it's threaded
// through: callers that never wire one up simply can't use these functions.
export interface FormulaHistoryContext {
  returnRate: (yearsAgo: number) => number
  inflationRate: (yearsAgo: number) => number
  // Total net worth as of yearsAgo years before the year currently being
  // evaluated (0 = this year). A lookback past the start of the simulation
  // falls back to the earliest known (i.e. current) net worth rather than
  // erroring — see runProjection's netWorthHistory.
  netWorth: (yearsAgo: number) => number
  // Start-of-year balance (or self+spouse combined total) for a single
  // account, keyed by AccountHistoryKey — same "captured before this year's
  // activity" timing and lookback-fallback policy as netWorth above. See
  // runProjection's accountBalanceSnapshot/accountBalanceHistory.
  accountBalance: (key: AccountHistoryKey, yearsAgo: number) => number
  // Total income/expense for a *prior* year. Unlike the fields above, this
  // year's own incomeTotal/expenseTotal aren't known until partway through
  // runProjection's loop body (after this year's own income/spending
  // formulas already ran using this same history context), so
  // previousIncome(0)/previousSpending(0) mean "last year", not "this year"
  // — and in the first projected year there is no prior year, so both fall
  // back to 0.
  previousIncome: (yearsAgo: number) => number
  previousSpending: (yearsAgo: number) => number
  // A *prior* year's required minimum distribution, by owner (previousRmd is
  // self+spouse combined) — same "yearsAgo(0) means last year, falls back to
  // 0 with no prior year" timing as previousIncome/previousSpending above,
  // and populated the same way (see runProjection's rmdSelfHistory/
  // rmdSpouseHistory).
  previousRmdSelf: (yearsAgo: number) => number
  previousRmdSpouse: (yearsAgo: number) => number
  previousRmd: (yearsAgo: number) => number
  // Absolute (year/age-keyed, not "yearsAgo") lookups for dollar_convert()/
  // rmd_in_year()/rmd_at_age()/rmd_at_spouse_age() — required, unlike
  // netWorthInYear and friends below, since every formula in the app can
  // call these, not just a Goal's. What differs is the range of years each
  // implementation can actually answer: runProjection's inline historyContext
  // (built fresh each loop iteration) only knows years up to and including
  // the one currently being evaluated, and throws for a year still in that
  // formula's own future (see rmdByYear/rmdByAge/rmdBySpouseAge/
  // inflationFactorByYear); a Goal's goalHistoryContext instead gets these
  // overridden with buildGoalProjectionLookups' unrestricted, whole-projection
  // versions, matching netWorthInYear's own reach. flatRateHistoryContext
  // (no real per-year loop at all) falls back to 0 for the RMD lookups and a
  // closed-form flat-rate estimate for dollarConvert.
  rmdInYear: (year: number) => number
  rmdAtAge: (age: number) => number
  rmdAtSpouseAge: (age: number) => number
  dollarConvert: (amount: number, fromYear: number, toYear: number) => number
  // Absolute-lookup counterparts to netWorth/accountBalance above — ANY
  // year/age in the whole projection, forward or back, rather than a
  // "yearsAgo" offset behind the year currently being evaluated. Unlike
  // every other member of this interface, these can only be answered once
  // the entire projection is known, so they're optional and populated only
  // by runProjection's Goals pass (see net_worth_in_year()/net_worth_at_age()
  // and PROJECTION_LOOKUP_FUNCTIONS below) — undefined everywhere else
  // (income/spending/savings/withdrawal/roth-conversion formulas, live
  // preview editors), where calling one of these throws a clear "isn't
  // available here" instead of silently misbehaving. Both throw (via
  // FormulaError) rather than falling back to a nearby value when the given
  // year/age never occurs in the projection, since — unlike a "too far back"
  // lookback — there's no reasonable nearby value to guess at.
  netWorthInYear?: (year: number) => number
  netWorthAtAge?: (age: number) => number
  accountBalanceInYear?: (key: AccountHistoryKey, year: number) => number
  accountBalanceAtAge?: (key: AccountHistoryKey, age: number) => number
  // Same as netWorthAtAge/accountBalanceAtAge, but keyed by the SPOUSE's age
  // that year (row.ageSpouse) instead of the primary owner's — only
  // meaningful, and only populated, when spouse mode is on (see
  // runProjection's Goals pass); undefined otherwise, same "isn't available
  // here" treatment as every other optional member above.
  netWorthAtSpouseAge?: (age: number) => number
  accountBalanceAtSpouseAge?: (key: AccountHistoryKey, age: number) => number
  // Whole-projection data for first_year_when(condition)/first_age_when(
  // condition)/first_spouse_age_when(condition) — one entry per projected
  // year, in chronological order, each carrying that year's own scope (the
  // same year/age/spouseAge/netWorth/unfunded/variable/special-year names a
  // Goal/Metric formula sees), its own per-year history context (so a
  // lookback function inside the condition — previous_income(), return_rate(),
  // taxable(), etc. — means exactly what it would mean if that year's own
  // formula had called it directly, not relative to the year first_year_when()
  // and friends are evaluated from), and that row's own age/spouseAge — kept
  // alongside `scope` rather than read out of it, since `scope` simply omits
  // the key on a row where it isn't defined (age when no birth date is set,
  // spouseAge when spouse mode is off), and first_age_when()/
  // first_spouse_age_when() need to tell "not this row" apart from "no such
  // row at all" to skip it rather than mis-set on an absent key. Same "only
  // available once the whole projection is known" restriction as
  // netWorthInYear and friends above — optional, populated only by
  // runProjection's Goals pass (and, best-effort against the real baseline
  // projection, by GoalsEditor/MetricsEditor's live preview).
  projectionRows?: () => {
    year: number
    age: number | null
    spouseAge: number | null
    scope: Record<string, number>
    history: FormulaHistoryContext
  }[]
}

// A history context that ignores yearsAgo and always returns the flat
// scenario assumption (or, for net worth/account balances, today's snapshot)
// — for callers with no real per-year projection loop to look back through.
// previous_income/previous_spending (and previous_rmd_self/
// previous_rmd_spouse/previous_rmd alongside them) have no "today" equivalent
// to fall back to, so they always return 0 here. rmd_in_year()/_at_age()/
// _at_spouse_age() have no balances to size an RMD off, so they fall back to
// 0 the same way; dollar_convert() instead has a real (if approximate)
// answer even with no per-year loop — the closed-form flat-rate compounding
// realDollarFactor uses elsewhere, generalized to arbitrary from/to years.
export function flatRateHistoryContext(
  expectedReturnRatePct: number,
  inflationRatePct: number,
  currentNetWorth = 0,
  currentAccountBalances: Record<AccountHistoryKey, number> = {} as Record<AccountHistoryKey, number>,
): FormulaHistoryContext {
  return {
    returnRate: () => expectedReturnRatePct,
    inflationRate: () => inflationRatePct,
    netWorth: () => currentNetWorth,
    accountBalance: (key) => currentAccountBalances[key] ?? 0,
    previousIncome: () => 0,
    previousSpending: () => 0,
    previousRmdSelf: () => 0,
    previousRmdSpouse: () => 0,
    previousRmd: () => 0,
    rmdInYear: () => 0,
    rmdAtAge: () => 0,
    rmdAtSpouseAge: () => 0,
    dollarConvert: (amount, fromYear, toYear) => amount * (1 + inflationRatePct / 100) ** (toYear - fromYear),
  }
}

// A user-defined function's own shape: named parameters plus a body formula
// evaluated with those parameters as its *entire* scope (not the caller's
// variables/params — see FunctionsEditor's "params only" scoping decision).
export interface CustomFunctionDef {
  params: string[]
  expression: string
}

// Looked up by name at call sites, same threading pattern as
// FormulaHistoryContext (built once from the user's function list, passed
// down through every formula-evaluating component/call).
export type FormulaFunctionsContext = Map<string, CustomFunctionDef>

function evaluateNode(
  node: Node,
  scope: Record<string, number>,
  history?: FormulaHistoryContext,
  functions?: FormulaFunctionsContext,
  callStack: string[] = [],
): number {
  switch (node.kind) {
    case 'number':
      return node.value
    case 'identifier': {
      const value = scope[node.name]
      if (value !== undefined) return value
      const builtin = BUILTIN_CONSTANTS[node.name]
      if (builtin !== undefined) return builtin
      throw new FormulaError(`Unknown variable "${node.name}"`)
    }
    case 'negate':
      return -evaluateNode(node.operand, scope, history, functions, callStack)
    case 'binary': {
      const left = evaluateNode(node.left, scope, history, functions, callStack)
      const right = evaluateNode(node.right, scope, history, functions, callStack)
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
      return evaluateConditionNode(node.condition, scope, history, functions, callStack)
        ? evaluateNode(node.then, scope, history, functions, callStack)
        : evaluateNode(node.else, scope, history, functions, callStack)
    case 'first_when': {
      const fnName =
        node.target === 'year' ? 'first_year_when' : node.target === 'age' ? 'first_age_when' : 'first_spouse_age_when'
      if (!history?.projectionRows) {
        throw new FormulaError(`${fnName}() isn't available here — only a Goal or Metric formula can look up the whole projection`)
      }
      for (const row of history.projectionRows()) {
        if (node.target === 'age' && row.age === null) continue
        if (node.target === 'spouseAge' && row.spouseAge === null) continue
        if (evaluateConditionNode(node.condition, row.scope, row.history, functions, callStack)) {
          if (node.target === 'year') return row.year
          return node.target === 'age' ? row.age! : row.spouseAge!
        }
      }
      return Infinity
    }
    case 'call': {
      if (LOOKBACK_FUNCTIONS.has(node.name)) {
        if (node.args.length !== 1) throw new FormulaError(`${node.name}() needs exactly 1 argument`)
        const n = evaluateNode(node.args[0], scope, history, functions, callStack)
        if (!Number.isInteger(n) || n < 0) {
          throw new FormulaError(`${node.name}() argument must be a non-negative whole number of years`)
        }
        if (!history) throw new FormulaError(`${node.name}() isn't available here`)
        if (node.name === 'return_rate') return history.returnRate(n)
        if (node.name === 'inflation_rate') return history.inflationRate(n)
        if (node.name === 'net_worth') return history.netWorth(n)
        if (node.name === 'previous_income') return history.previousIncome(n)
        if (node.name === 'previous_spending') return history.previousSpending(n)
        if (node.name === 'previous_rmd_self') return history.previousRmdSelf(n)
        if (node.name === 'previous_rmd_spouse') return history.previousRmdSpouse(n)
        if (node.name === 'previous_rmd') return history.previousRmd(n)
        return history.accountBalance(ACCOUNT_BALANCE_FUNCTIONS[node.name], n)
      }
      if (PROJECTION_LOOKUP_FUNCTIONS.has(node.name)) {
        if (node.args.length !== 1) throw new FormulaError(`${node.name}() needs exactly 1 argument`)
        const n = evaluateNode(node.args[0], scope, history, functions, callStack)
        if (!Number.isInteger(n) || n < 0) {
          throw new FormulaError(`${node.name}() argument must be a non-negative whole number`)
        }
        if (node.name === NET_WORTH_IN_YEAR_FUNCTION) {
          if (!history?.netWorthInYear) throw new FormulaError(`${node.name}() isn't available here — only a Goal's formula can look up the whole projection`)
          return history.netWorthInYear(n)
        }
        if (node.name === NET_WORTH_AT_AGE_FUNCTION) {
          if (!history?.netWorthAtAge) throw new FormulaError(`${node.name}() isn't available here — only a Goal's formula can look up the whole projection`)
          return history.netWorthAtAge(n)
        }
        if (node.name === NET_WORTH_AT_SPOUSE_AGE_FUNCTION) {
          if (!history?.netWorthAtSpouseAge) throw new FormulaError(`${node.name}() isn't available here — only a Goal's formula can look up the whole projection`)
          return history.netWorthAtSpouseAge(n)
        }
        if (node.name in ACCOUNT_BALANCE_IN_YEAR_FUNCTIONS) {
          if (!history?.accountBalanceInYear) throw new FormulaError(`${node.name}() isn't available here — only a Goal's formula can look up the whole projection`)
          return history.accountBalanceInYear(ACCOUNT_BALANCE_IN_YEAR_FUNCTIONS[node.name], n)
        }
        if (node.name in ACCOUNT_BALANCE_AT_AGE_FUNCTIONS) {
          if (!history?.accountBalanceAtAge) throw new FormulaError(`${node.name}() isn't available here — only a Goal's formula can look up the whole projection`)
          return history.accountBalanceAtAge(ACCOUNT_BALANCE_AT_AGE_FUNCTIONS[node.name], n)
        }
        if (!history?.accountBalanceAtSpouseAge) throw new FormulaError(`${node.name}() isn't available here — only a Goal's formula can look up the whole projection`)
        return history.accountBalanceAtSpouseAge(ACCOUNT_BALANCE_AT_SPOUSE_AGE_FUNCTIONS[node.name], n)
      }
      if (node.name === DOLLAR_CONVERT_FUNCTION) {
        if (node.args.length !== 3) throw new FormulaError(`${node.name}() needs exactly 3 arguments: amount, from_year, to_year`)
        const [amount, fromYear, toYear] = node.args.map((a) => evaluateNode(a, scope, history, functions, callStack))
        if (!Number.isInteger(fromYear) || !Number.isInteger(toYear)) {
          throw new FormulaError(`${node.name}()'s from_year/to_year must be whole numbers`)
        }
        if (!history) throw new FormulaError(`${node.name}() isn't available here`)
        return history.dollarConvert(amount, fromYear, toYear)
      }
      if (RMD_LOOKUP_FUNCTIONS.has(node.name)) {
        if (node.args.length !== 1) throw new FormulaError(`${node.name}() needs exactly 1 argument`)
        const n = evaluateNode(node.args[0], scope, history, functions, callStack)
        if (!Number.isInteger(n) || n < 0) {
          throw new FormulaError(`${node.name}() argument must be a non-negative whole number`)
        }
        if (!history) throw new FormulaError(`${node.name}() isn't available here`)
        if (node.name === RMD_IN_YEAR_FUNCTION) return history.rmdInYear(n)
        if (node.name === RMD_AT_AGE_FUNCTION) return history.rmdAtAge(n)
        return history.rmdAtSpouseAge(n)
      }
      if (BUILTIN_FUNCTIONS.has(node.name)) {
        const args = node.args.map((a) => evaluateNode(a, scope, history, functions, callStack))
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
        }
      }
      const fn = functions?.get(node.name)
      if (!fn) throw new FormulaError(`Unknown function "${node.name}"`)
      if (node.args.length !== fn.params.length) {
        throw new FormulaError(
          `${node.name}() needs exactly ${fn.params.length} argument${fn.params.length === 1 ? '' : 's'}`,
        )
      }
      if (callStack.includes(node.name)) {
        throw new FormulaError(`Circular function call: ${[...callStack, node.name].join(' → ')}`)
      }
      const argValues = node.args.map((a) => evaluateNode(a, scope, history, functions, callStack))
      const fnScope: Record<string, number> = {}
      fn.params.forEach((p, i) => {
        fnScope[p] = argValues[i]
      })
      return evaluateNode(parseFormula(fn.expression), fnScope, history, functions, [...callStack, node.name])
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
  functions?: FormulaFunctionsContext,
): number {
  return evaluateNode(parseFormula(expression), scope, history, functions)
}

export type FormulaResult = { ok: true; value: number } | { ok: false; error: string }

// Same as evaluateFormula, but never throws — for callers (projection,
// live-preview UI) that need to treat a bad formula as "no value" rather
// than crash.
export function tryEvaluateFormula(
  expression: string,
  scope: Record<string, number>,
  history?: FormulaHistoryContext,
  functions?: FormulaFunctionsContext,
): FormulaResult {
  try {
    return { ok: true, value: evaluateFormula(expression, scope, history, functions) }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

// Evaluates only compare/logical/not nodes to a boolean — deliberately no
// implicit number->boolean coercion (a bare arithmetic formula is rejected,
// not treated as truthy), so a condition field always says what it means.
function evaluateConditionNode(
  node: Node,
  scope: Record<string, number>,
  history?: FormulaHistoryContext,
  functions?: FormulaFunctionsContext,
  callStack: string[] = [],
): boolean {
  switch (node.kind) {
    case 'compare': {
      const left = evaluateNode(node.left, scope, history, functions, callStack)
      const right = evaluateNode(node.right, scope, history, functions, callStack)
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
      const left = evaluateConditionNode(node.left, scope, history, functions, callStack)
      if (node.op === '&&') return left && evaluateConditionNode(node.right, scope, history, functions, callStack)
      return left || evaluateConditionNode(node.right, scope, history, functions, callStack)
    }
    case 'not':
      return !evaluateConditionNode(node.operand, scope, history, functions, callStack)
  }
  throw new FormulaError('Expected a boolean expression (e.g. "year < 2040")')
}

// Throws FormulaError on any parse/evaluation failure.
export function evaluateCondition(
  expression: string,
  scope: Record<string, number>,
  history?: FormulaHistoryContext,
  functions?: FormulaFunctionsContext,
): boolean {
  return evaluateConditionNode(parseConditionFormula(expression), scope, history, functions)
}

export type ConditionResult = { ok: true; value: boolean } | { ok: false; error: string }

// Same as evaluateCondition, but never throws — for callers (projection,
// live-preview UI) that need to treat a bad condition without crashing.
export function tryEvaluateCondition(
  expression: string,
  scope: Record<string, number>,
  history?: FormulaHistoryContext,
  functions?: FormulaFunctionsContext,
): ConditionResult {
  try {
    return { ok: true, value: evaluateCondition(expression, scope, history, functions) }
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
    case 'first_when':
      collectIdentifiers(node.condition, out)
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
