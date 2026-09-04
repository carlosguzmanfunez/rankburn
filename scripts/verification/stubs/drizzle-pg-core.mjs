/** Runtime stub for `drizzle-orm/pg-core`. See ./drizzle-orm.mjs. */
const column = (name) => ({
  name,
  notNull() { return this },
  default() { return this },
  defaultNow() { return this },
  primaryKey() { return this },
  unique() { return this },
  references() { return this },
})

export const text = column
export const integer = column
export const boolean = column
export const jsonb = column
export const json = column
export const bigint = (name) => column(name)
export const timestamp = (name) => column(name)
export const index = (name) => ({ on: () => ({ name }) })
export const uniqueIndex = (name) => ({ on: () => ({ name }) })
export const primaryKey = (config) => config

/** Returns the column map so `table.column` references still resolve. */
export const pgTable = (name, columns) => ({ ...columns, __table: name })
