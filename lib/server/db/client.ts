/**
 * Database connection.
 *
 * A single pool is cached on `globalThis` so Next.js dev hot-reload and
 * serverless warm invocations reuse it instead of opening a new pool per
 * request.
 *
 * If `DATABASE_URL` is absent the application fails closed with a clear
 * message rather than silently falling back to non-durable storage. A
 * deployment without a database must not look like a working one.
 */

import { drizzle } from 'drizzle-orm/postgres-js'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'

export type Database = PostgresJsDatabase<typeof schema>

/**
 * The subset of the database surface that both a connection and a transaction
 * expose. Helpers take this so the same function works inside or outside a
 * transaction, without depending on Drizzle's internal transaction generics.
 */
export type Executor = Pick<Database, 'insert' | 'update' | 'select'>

const GLOBAL_KEY = '__rankburn_db__'

export class DatabaseNotConfiguredError extends Error {
  constructor() {
    super(
      'DATABASE_URL is not set. RankBurn requires a PostgreSQL database; ' +
        'see .env.example and RANKBURN_STATUS.md.',
    )
    this.name = 'DatabaseNotConfiguredError'
  }
}

function connectionString(): string {
  const url = process.env.DATABASE_URL?.trim()
  if (!url) throw new DatabaseNotConfiguredError()
  return url
}

function create(): Database {
  const client = postgres(connectionString(), {
    // Serverless platforms run many short-lived instances; a small pool per
    // instance avoids exhausting the database's connection limit.
    max: Number(process.env.DATABASE_POOL_MAX ?? 5),
    idle_timeout: 20,
    connect_timeout: 10,
    prepare: false,
  })
  return drizzle(client, { schema })
}

export function getDb(): Database {
  const holder = globalThis as unknown as Record<string, Database | undefined>
  if (!holder[GLOBAL_KEY]) {
    holder[GLOBAL_KEY] = create()
  }
  return holder[GLOBAL_KEY] as Database
}

/** True when a database URL is present. Used to report configuration state. */
export function databaseConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL?.trim())
}
