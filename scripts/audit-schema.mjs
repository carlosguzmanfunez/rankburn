/**
 * Schema consistency audit.
 *
 * Checks every Drizzle `.values({...})` and `.set({...})` object literal in
 * app/ and lib/ against the column names declared in schema.ts.
 *
 * Why this exists: a renamed column (hours_at_one -> minutes_at_one) left a
 * stale field name in an insert that nothing caught, because the failure is
 * only visible once the real Drizzle types are installed. This script catches
 * that class of mistake without needing dependencies or a database.
 *
 * `npm run typecheck` supersedes this once dependencies are installed. Keep it
 * or delete it - it is a development aid, not product code.
 *
 * Usage: npm run audit:schema
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

/** Returns the source slice of a balanced {...} block starting after `start`. */
function block(src, start) {
  let depth = 1, i = start
  while (i < src.length && depth > 0) {
    const c = src[i]
    if (c === '{') depth++
    else if (c === '}') depth--
    i++
  }
  return { body: src.slice(start, i - 1), end: i }
}

/** Top-level `key:` names of an object literal body, ignoring nested objects. */
function topLevelKeys(body) {
  const keys = []
  let depth = 0, i = 0, line = ''
  const lines = body.split('\n')
  for (line of lines) {
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

const schemaSrc = readFileSync('lib/server/db/schema.ts', 'utf8')
const tables = new Map()
const tableRe = /export const (\w+) = pgTable\(\s*'([^']+)',\s*\{/g
let m
while ((m = tableRe.exec(schemaSrc))) {
  const { body } = block(schemaSrc, m.index + m[0].length)
  tables.set(m[1], { sqlName: m[2], keys: new Set(topLevelKeys(body)) })
}

console.log('Schema tables and columns discovered:')
for (const [v, t] of tables) console.log(`  ${t.sqlName.padEnd(26)} ${[...t.keys].join(', ')}`)
console.log()

function walk(dir, out = []) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e)
    if (statSync(p).isDirectory()) { if (e !== 'node_modules') walk(p, out) }
    else if (p.endsWith('.ts') || p.endsWith('.tsx')) out.push(p)
  }
  return out
}

const files = [...walk('app'), ...walk('lib')]
let problems = 0, checked = 0

for (const file of files) {
  const src = readFileSync(file, 'utf8')
  const re = /\.(insert|update)\(\s*(\w+)\s*\)\s*(?:\r?\n\s*)?\.(values|set)\(\s*\{/g
  let mm
  while ((mm = re.exec(src))) {
    const table = tables.get(mm[2])
    if (!table) { console.log(`WARN   ${file}: unknown table symbol "${mm[2]}"`); continue }
    const { body } = block(src, mm.index + mm[0].length)
    const line = src.slice(0, mm.index).split('\n').length
    checked++
    for (const k of topLevelKeys(body)) {
      if (!table.keys.has(k)) {
        console.log(`STALE  ${file}:${line}  ${mm[2]}.${mm[3]}({ ${k} })  -> not a column of "${table.sqlName}"`)
        problems++
      }
    }
  }
}

console.log(`\nChecked ${checked} insert/update literals across ${files.length} files.`)
console.log(problems === 0 ? 'PASS: no stale field names.' : `FAIL: ${problems} stale field name(s).`)
