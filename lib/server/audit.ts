/**
 * Audit + moderation event recording.
 *
 * Every moderation decision writes two durable records: a `ModerationEvent`
 * (what happened to the campaign) and an `AuditLog` entry (who did it, when,
 * and why). The reason is mandatory for rejections and carried through to the
 * log so a decision can always be explained after the fact.
 */

import { desc } from 'drizzle-orm'
import { getDb, type Executor } from './db/client'
import { auditLogs, moderationEvents } from './db/schema'
import { newId } from './id'
import type { AuditLog, ModerationAction, ModerationEvent } from './types'

export async function recordAudit(
  entry: {
    action: string
    entityType: AuditLog['entityType']
    entityId: string
    entityLabel: string
    actorId: string
    actorLabel: string
    reason?: string
  },
  tx?: Executor,
): Promise<void> {
  const db = tx ?? getDb()
  await db.insert(auditLogs).values({
    id: newId('audit'),
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId,
    entityLabel: entry.entityLabel,
    actorId: entry.actorId,
    actorLabel: entry.actorLabel,
    reason: entry.reason ?? null,
    createdAt: new Date(),
  })
}

export async function recordModeration(
  entry: {
    campaignId: string
    campaignLabel: string
    action: ModerationAction
    moderatorId: string
    moderatorLabel: string
    reason?: string
  },
  tx?: Executor,
): Promise<void> {
  const db = tx ?? getDb()
  const now = new Date()

  await db.insert(moderationEvents).values({
    id: newId('mod'),
    campaignId: entry.campaignId,
    action: entry.action,
    reason: entry.reason ?? null,
    moderatorId: entry.moderatorId,
    createdAt: now,
  })

  await recordAudit(
    {
      action: entry.action,
      entityType: 'campaign',
      entityId: entry.campaignId,
      entityLabel: entry.campaignLabel,
      actorId: entry.moderatorId,
      actorLabel: entry.moderatorLabel,
      reason: entry.reason,
    },
    tx,
  )
}

/** Newest first, for the admin audit view. */
export async function listAuditLogs(limit = 100): Promise<AuditLog[]> {
  const db = getDb()
  const rows = await db
    .select()
    .from(auditLogs)
    .orderBy(desc(auditLogs.createdAt))
    .limit(limit)

  return rows.map((row) => ({
    id: row.id,
    action: row.action,
    entityType: row.entityType as AuditLog['entityType'],
    entityId: row.entityId,
    entityLabel: row.entityLabel,
    actorId: row.actorId,
    actorLabel: row.actorLabel,
    reason: row.reason ?? undefined,
    createdAt: new Date(row.createdAt).toISOString(),
  }))
}

export async function listModerationEvents(
  limit = 100,
): Promise<ModerationEvent[]> {
  const db = getDb()
  const rows = await db
    .select()
    .from(moderationEvents)
    .orderBy(desc(moderationEvents.createdAt))
    .limit(limit)

  return rows.map((row) => ({
    id: row.id,
    campaignId: row.campaignId,
    action: row.action as ModerationAction,
    reason: row.reason ?? undefined,
    moderatorId: row.moderatorId,
    createdAt: new Date(row.createdAt).toISOString(),
  }))
}
