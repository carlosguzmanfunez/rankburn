import type { Config } from 'drizzle-kit'

/**
 * Used by drizzle-kit to generate future migrations from `schema.ts`.
 *
 * The initial schema ships as hand-written SQL in
 * `lib/server/db/migrations/0000_init.sql`, applied with `npm run db:setup`.
 * For later changes, run `npx drizzle-kit generate` and apply the generated
 * SQL the same way.
 */
export default {
  schema: './lib/server/db/schema.ts',
  out: './lib/server/db/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? '',
  },
} satisfies Config
