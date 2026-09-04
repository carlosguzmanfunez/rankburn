/** Runtime stub for `drizzle-orm/postgres-js`. */
export function drizzle() {
  throw new Error(
    'The verification harness cannot open a database connection. ' +
      'Database-backed steps belong to the integration runbook.',
  )
}
