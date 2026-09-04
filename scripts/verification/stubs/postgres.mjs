/** Runtime stub for `postgres`. Connecting is not possible in this harness. */
export default function postgres() {
  throw new Error(
    'The verification harness cannot open a database connection. ' +
      'Database-backed steps belong to the integration runbook.',
  )
}
