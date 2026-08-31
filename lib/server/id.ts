import { randomUUID } from 'node:crypto'

/** Prefixed, collision-safe identifier for server-side records. */
export function newId(prefix: string): string {
  return `${prefix}_${randomUUID()}`
}

/** URL-safe slug derived from a product name. */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
}
