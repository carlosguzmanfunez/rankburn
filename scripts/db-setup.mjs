/**
 * Applies the SQL migrations in lib/server/db/migrations, in filename order.
 *
 * Deliberately plain Node with no TypeScript runtime: schema setup should not
 * depend on the application build. Each file is applied inside a transaction
 * and recorded, so re-running is safe and already-applied files are skipped.
 *
 * Usage: npm run db:setup
 */

import { readdir, readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import postgres from 'postgres'

const here = dirname(fileURLToPath(import.meta.url))
const migrationsDir = join(here, '..', 'lib', 'server', 'db', 'migrations')

const url = process.env.DATABASE_URL?.trim()
if (!url) {
  console.error(
    'DATABASE_URL is not set. Copy .env.example to .env.local and set it first.',
  )
  process.exit(1)
}

const sql = postgres(url, { max: 1, onnotice: () => {} })

try {
  await sql`
    CREATE TABLE IF NOT EXISTS _rankburn_migrations (
      name text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `

  const applied = await sql`SELECT name FROM _rankburn_migrations`
  const done = new Set(applied.map((row) => row.name))

  const files = (await readdir(migrationsDir))
    .filter((name) => name.endsWith('.sql'))
    .sort()

  if (files.length === 0) {
    console.warn('No migration files found in', migrationsDir)
  }

  let count = 0
  for (const file of files) {
    if (done.has(file)) {
      console.log(`skip   ${file} (already applied)`)
      continue
    }
    const contents = await readFile(join(migrationsDir, file), 'utf8')
    await sql.begin(async (tx) => {
      await tx.unsafe(contents)
      await tx`INSERT INTO _rankburn_migrations (name) VALUES (${file})`
    })
    console.log(`apply  ${file}`)
    count += 1
  }

  console.log(
    count === 0
      ? 'Schema already up to date.'
      : `Applied ${count} migration(s).`,
  )
} catch (error) {
  console.error('Migration failed:', error)
  process.exitCode = 1
} finally {
  await sql.end({ timeout: 5 })
}
