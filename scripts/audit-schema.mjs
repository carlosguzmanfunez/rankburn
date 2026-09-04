/**
 * Schema consistency audit.
 *
 * Drizzle insert/update payloads are only checked by the compiler when they
 * are written as inline object literals. Two very common shapes escape it:
 *
 *   1. a dynamic object built first and passed later
 *      (`const patch: Record<string, unknown> = {}` ... `.set(patch)`).
 *      That IS assignable to Drizzle's all-optional update type, so it is not
 *      a type error - the column names are simply never checked at all;
 *   2. `table.column` references in select/where/orderBy after a column has
 *      been renamed or removed.
 *
 * A renamed column (hours_at_one -> minutes_at_one) already shipped one such
 * bug. This script closes both gaps without needing dependencies or a
 * database, and it never claims something is correct when it cannot prove it:
 * anything it cannot resolve statically is reported as MANUAL REVIEW.
 *
 * This complements `npm run typecheck` and `npm run build`. It does not
 * replace either.
 *
 * Usage: npm run audit:schema
 *        npm run audit:schema -- --strict   (manual-review items also fail)
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const STRICT = process.argv.includes('--strict')

/** Returns the source slice of a balanced block starting after `start`. */
function block(src, start, open = '{', close = '}') {
  let depth = 1
  let i = start
  while (i < src.length && depth > 0) {
    const c = src[i]
    if (c === open) depth++
    else if (c === close) depth--
    i++
  }
  return { body: src.slice(start, i - 1), end: i }
}

/** Top-level `key:` names of an object literal body, ignoring nested objects. */
function topLevelKeys(body) {
  const keys = []
  let depth = 0
  for (const line of body.split('\n')) {
    const trimmed = line.trim()
    if (depth === 0) {
      const m = /^(\w+)\s*:/.exec(trimmed)
      if (m) keys.push(m[1])
    }
    for (const ch of line) {
      if ('{(['.includes(ch)) depth++
      else if ('})]'.includes(ch)) depth--
    }
  }
  return keys
}

const lineOf = (src, index) => src.slice(0, index).split('\n').length

/**
 * Blanks out comments and string/template contents, preserving both length and
 * newlines so every reported line number still matches the real file.
 *
 * Without this, a column name mentioned in a doc comment is indistinguishable
 * from a real reference, and a brace inside a string breaks the brace counter.
 */
function stripNonCode(src, { keepStrings = false } = {}) {
  const out = src.split('')
  let i = 0
  const blank = (from, to) => {
    for (let j = from; j < to && j < out.length; j++) {
      if (out[j] !== '\n') out[j] = ' '
    }
  }
  while (i < src.length) {
    const two = src.slice(i, i + 2)
    if (two === '//') {
      const end = src.indexOf('\n', i)
      blank(i, end === -1 ? src.length : end)
      i = end === -1 ? src.length : end
      continue
    }
    if (two === '/*') {
      const end = src.indexOf('*/', i + 2)
      const stop = end === -1 ? src.length : end + 2
      blank(i, stop)
      i = stop
      continue
    }
    const ch = src[i]
    if (ch === '"' || ch === "'" || ch === '`') {
      let j = i + 1
      while (j < src.length) {
        if (src[j] === '\\') {
          j += 2
          continue
        }
        if (src[j] === ch) break
        j++
      }
      // Blank the contents but keep the delimiters, so `.values('x')` still
      // parses as a call rather than collapsing.
      if (!keepStrings) blank(i + 1, j)
      i = j + 1
      continue
    }
    i++
  }
  return out.join('')
}

/* -------------------------------------------------------------------------- */
/* 1. Schema model                                                            */
/* -------------------------------------------------------------------------- */

const schemaSrc = stripNonCode(readFileSync('lib/server/db/schema.ts', 'utf8'), {
  keepStrings: true,
})
const tables = new Map()
const tableRe = /export const (\w+) = pgTable\(\s*'([^']+)',\s*\{/g
let m
while ((m = tableRe.exec(schemaSrc))) {
  const { body } = block(schemaSrc, m.index + m[0].length)
  tables.set(m[1], { sqlName: m[2], keys: new Set(topLevelKeys(body)) })
}

console.log('Schema tables and columns discovered:')
for (const [, t] of tables) {
  console.log(`  ${t.sqlName.padEnd(26)} ${[...t.keys].join(', ')}`)
}
console.log()

/* -------------------------------------------------------------------------- */
/* 2. File collection                                                         */
/* -------------------------------------------------------------------------- */

function walk(dir, out = []) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e)
    if (statSync(p).isDirectory()) {
      if (e !== 'node_modules') walk(p, out)
    } else if (p.endsWith('.ts') || p.endsWith('.tsx')) {
      out.push(p)
    }
  }
  return out
}

const files = [...walk('app'), ...walk('lib')]

const problems = []
const manual = []
let checkedPayloads = 0
let checkedRefs = 0

const fail = (file, line, message) =>
  problems.push(`STALE  ${file}:${line}  ${message}`)
const review = (file, line, message) =>
  manual.push(`MANUAL ${file}:${line}  ${message}`)

/* -------------------------------------------------------------------------- */
/* 3. Resolving a dynamic payload identifier                                  */
/* -------------------------------------------------------------------------- */

/**
 * Best-effort key extraction for `.set(patch)` / `.values(row)`.
 *
 * Collects keys from the declaring object literal and from every later
 * `name.key = ...` assignment. Returns null when nothing can be resolved, or
 * when the object is reshaped in a way this script does not model, so the
 * caller reports it for manual review instead of passing it silently.
 */
function resolvePayloadKeys(src, name) {
  const opaque = new RegExp(
    `Object\\.assign\\(\\s*${name}\\b` +
      `|\\.\\.\\.\\s*${name}\\b` +
      `|\\b${name}\\s*=\\s*(?!\\{)` +
      `|\\b${name}\\[`,
  )
  if (opaque.test(src)) return null

  const keys = new Set()
  let resolved = false

  const declRe = new RegExp(
    `\\b(?:const|let|var)\\s+${name}\\b[^=\\n]*=\\s*\\{`,
    'g',
  )
  let d
  while ((d = declRe.exec(src))) {
    resolved = true
    const { body } = block(src, d.index + d[0].length)
    for (const k of topLevelKeys(body)) keys.add(k)
  }

  const assignRe = new RegExp(`\\b${name}\\.(\\w+)\\s*=(?!=)`, 'g')
  let a
  while ((a = assignRe.exec(src))) {
    resolved = true
    keys.add(a[1])
  }

  return resolved ? keys : null
}

/* -------------------------------------------------------------------------- */
/* 4. Insert / update payload check (literal AND dynamic)                     */
/* -------------------------------------------------------------------------- */

for (const file of files) {
  const src = stripNonCode(readFileSync(file, 'utf8'))
  const re =
    /\.(insert|update)\(\s*(\w+)\s*\)\s*(?:\r?\n\s*)?\.(values|set)\(\s*/g
  let mm
  while ((mm = re.exec(src))) {
    const [, , tableSymbol, method] = mm
    const table = tables.get(tableSymbol)
    const line = lineOf(src, mm.index)

    if (!table) {
      review(file, line, `unknown table symbol "${tableSymbol}"`)
      continue
    }

    const argStart = re.lastIndex

    // Inline object literal: fully checkable.
    if (src[argStart] === '{') {
      checkedPayloads++
      const { body } = block(src, argStart + 1)
      for (const k of topLevelKeys(body)) {
        if (!table.keys.has(k)) {
          fail(
            file,
            line,
            `${tableSymbol}.${method}({ ${k} })  -> not a column of "${table.sqlName}"`,
          )
        }
      }
      continue
    }

    // Anything else: an identifier, a call, a spread. Try to resolve it.
    const { body: argBody } = block(src, argStart, '(', ')')
    const arg = argBody.trim()
    const identifier = /^(\w+)$/.exec(arg)

    if (!identifier) {
      review(
        file,
        line,
        `${tableSymbol}.${method}(${arg.slice(0, 40).replace(/\s+/g, ' ')}) -> payload is not a literal or a plain identifier`,
      )
      continue
    }

    const keys = resolvePayloadKeys(src, identifier[1])
    if (!keys) {
      review(
        file,
        line,
        `${tableSymbol}.${method}(${identifier[1]}) -> keys of "${identifier[1]}" could not be resolved statically`,
      )
      continue
    }

    checkedPayloads++
    for (const k of keys) {
      if (!table.keys.has(k)) {
        fail(
          file,
          line,
          `${tableSymbol}.${method}(${identifier[1]}) sets "${k}" -> not a column of "${table.sqlName}"`,
        )
      }
    }
  }
}

/* -------------------------------------------------------------------------- */
/* 5. `table.column` reference check (catches renamed/removed columns)        */
/* -------------------------------------------------------------------------- */

// Properties Drizzle exposes on a table object that are not columns.
const NON_COLUMN_PROPS = new Set([
  '$inferSelect',
  '$inferInsert',
  '_',
  'enableRLS',
])

for (const file of files) {
  const raw = readFileSync(file, 'utf8')
  // Import paths are string literals, so that check needs them intact.
  const withStrings = stripNonCode(raw, { keepStrings: true })
  // Column references must not be matched inside strings.
  const src = stripNonCode(raw)

  for (const [symbol, table] of tables) {
    // Only trust files that actually import the symbol from the schema.
    const importsSymbol = new RegExp(
      `import[^;]*\\b${symbol}\\b[^;]*from\\s*'[^']*schema'`,
      's',
    ).test(withStrings)
    if (!importsSymbol) continue

    // If the same name is also declared locally, references are ambiguous.
    const shadow = new RegExp(
      `\\b(?:const|let|var|function)\\s+${symbol}\\b`,
    ).exec(src)
    if (shadow) {
      review(
        file,
        lineOf(src, shadow.index),
        `"${symbol}" is imported from the schema and also declared locally -> ${symbol}.* references not verified`,
      )
      continue
    }

    const refRe = new RegExp(`\\b${symbol}\\.(\\w+)`, 'g')
    let r
    while ((r = refRe.exec(src))) {
      const prop = r[1]
      if (NON_COLUMN_PROPS.has(prop)) continue
      checkedRefs++
      if (!table.keys.has(prop)) {
        fail(
          file,
          lineOf(src, r.index),
          `${symbol}.${prop} -> not a column of "${table.sqlName}"`,
        )
      }
    }
  }
}

/* -------------------------------------------------------------------------- */
/* 6. Report                                                                  */
/* -------------------------------------------------------------------------- */

for (const line of problems) console.log(line)
if (problems.length && manual.length) console.log()
for (const line of manual) console.log(line)

console.log(
  `\nChecked ${checkedPayloads} insert/update payload(s) and ${checkedRefs} table.column reference(s) across ${files.length} files.`,
)

if (manual.length > 0) {
  console.log(
    `${manual.length} item(s) need MANUAL REVIEW: not verifiable statically, and NOT assumed correct.`,
  )
}

console.log(
  problems.length === 0
    ? 'PASS: no stale database field names.'
    : `FAIL: ${problems.length} stale field name(s).`,
)

process.exit(problems.length > 0 || (STRICT && manual.length > 0) ? 1 : 0)
