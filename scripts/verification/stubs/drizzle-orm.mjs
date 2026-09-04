/**
 * Runtime stub for `drizzle-orm`.
 *
 * Exists so the verification harness can import the real server modules and
 * exercise their PURE logic (settlement arithmetic, ranking rules, policy
 * decisions) without installing dependencies or reaching a database.
 *
 * Every query-building export is a inert placeholder. Anything that actually
 * touches the database will fail loudly rather than silently returning
 * plausible data, which is the point: this harness must never be mistaken for
 * an integration test.
 */
const marker = (name) => (...args) => ({ __stub: name, args })

export const eq = marker('eq')
export const ne = marker('ne')
export const gt = marker('gt')
export const gte = marker('gte')
export const lt = marker('lt')
export const lte = marker('lte')
export const and = marker('and')
export const or = marker('or')
export const not = marker('not')
export const isNull = marker('isNull')
export const isNotNull = marker('isNotNull')
export const inArray = marker('inArray')
export const notInArray = marker('notInArray')
export const desc = marker('desc')
export const asc = marker('asc')
export const count = marker('count')
export const sum = marker('sum')

export const sql = Object.assign(
  (...args) => ({ __stub: 'sql', args }),
  { raw: (query) => ({ __stub: 'sql.raw', query }) },
)
