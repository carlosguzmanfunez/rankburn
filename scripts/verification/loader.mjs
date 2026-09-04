/**
 * ESM resolution hooks for the offline verification harness.
 *
 * Three jobs, all of them compensating for things a bundler normally does:
 *   1. resolve the `@/` path alias, which comes from tsconfig `paths` and is a
 *      compiler concern Node knows nothing about;
 *   2. resolve extensionless relative imports (`./db/client`), which
 *      `moduleResolution: bundler` allows and Node does not;
 *   3. redirect the uninstalled runtime dependencies to inert stubs, so pure
 *      logic can be imported and exercised without a database.
 *
 * Registered via `--import ./scripts/verification/register.mjs`.
 */
import { existsSync } from 'node:fs'
import { dirname, join, resolve as resolvePath } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = join(here, '..', '..')

const STUBS = {
  'drizzle-orm': join(here, 'stubs', 'drizzle-orm.mjs'),
  'drizzle-orm/pg-core': join(here, 'stubs', 'drizzle-pg-core.mjs'),
  'drizzle-orm/postgres-js': join(here, 'stubs', 'drizzle-postgres-js.mjs'),
  postgres: join(here, 'stubs', 'postgres.mjs'),
}

const EXTENSIONS = ['.ts', '.tsx', '.mjs', '.js', '/index.ts', '/index.tsx']

/** Returns the first existing candidate for an extensionless path. */
function withExtension(basePath) {
  if (existsSync(basePath) && !basePath.endsWith('/')) return basePath
  for (const extension of EXTENSIONS) {
    const candidate = `${basePath}${extension}`
    if (existsSync(candidate)) return candidate
  }
  return null
}

export async function resolve(specifier, context, nextResolve) {
  if (STUBS[specifier]) {
    return { url: pathToFileURL(STUBS[specifier]).href, shortCircuit: true }
  }

  if (specifier.startsWith('@/')) {
    const found = withExtension(join(repoRoot, specifier.slice(2)))
    if (found) {
      return { url: pathToFileURL(found).href, shortCircuit: true }
    }
  }

  if (specifier.startsWith('.') && context.parentURL?.startsWith('file:')) {
    const parentDir = dirname(fileURLToPath(context.parentURL))
    const found = withExtension(resolvePath(parentDir, specifier))
    if (found) {
      return { url: pathToFileURL(found).href, shortCircuit: true }
    }
  }

  return nextResolve(specifier, context)
}
