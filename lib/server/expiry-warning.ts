import { and, eq, gt, gte, isNull } from 'drizzle-orm'
import { getDb } from '@/lib/server/db/client'
import {
  advertisingBudgets,
  campaigns,
  notificationOutbox,
  products,
} from '@/lib/server/db/schema'

export const EXPIRY_WARNING_WINDOW_SECONDS = 10 * 60

export function estimatedRemainingSeconds(
  activeCents: number,
  burnRateCentsPerHour: number,
): number {
  if (activeCents <= 0 || burnRateCentsPerHour <= 0) return 0
  return Math.floor((activeCents * 3600) / burnRateCentsPerHour)
}

/**
 * Idempotently claims campaigns that are projected to exhaust in <= 10 min.
 *
 * This function ENQUEUES a notification. It deliberately does not pretend an
 * email provider exists. Delivery is handled by a separate adapter/worker.
 */
export async function enqueueExpiryWarnings(now = new Date()) {
  const db = getDb()
  const rows = await db
    .select({
      campaignId: campaigns.id,
      burnRateCentsPerHour: campaigns.burnRateCentsPerHour,
      activeCents: advertisingBudgets.activeCents,
      productName: products.name,
      advertiserId: campaigns.advertiserId,
    })
    .from(campaigns)
    .innerJoin(
      advertisingBudgets,
      eq(advertisingBudgets.campaignId, campaigns.id),
    )
    .innerJoin(products, eq(products.id, campaigns.productId))
    .where(
      and(
        eq(campaigns.status, 'ACTIVE'),
        gt(advertisingBudgets.activeCents, 0),
        gte(campaigns.burnRateCentsPerHour, 100),
        isNull(campaigns.expiryWarningSentAt),
      ),
    )

  let enqueued = 0

  for (const row of rows) {
    const remainingSeconds = estimatedRemainingSeconds(
      row.activeCents,
      row.burnRateCentsPerHour,
    )

    if (
      remainingSeconds <= 0 ||
      remainingSeconds > EXPIRY_WARNING_WINDOW_SECONDS
    ) {
      continue
    }

    const claimed = await db.transaction(async (tx) => {
      const updated = await tx
        .update(campaigns)
        .set({
          expiryWarningSentAt: now,
        })
        .where(
          and(
            eq(campaigns.id, row.campaignId),
            eq(campaigns.status, 'ACTIVE'),
            isNull(campaigns.expiryWarningSentAt),
          ),
        )
        .returning({ id: campaigns.id })

      if (updated.length !== 1) return false

      await tx
        .insert(notificationOutbox)
        .values({
          id: crypto.randomUUID(),
          campaignId: row.campaignId,
          kind: 'CAMPAIGN_EXPIRY_10_MIN',
          recipient: row.advertiserId,
          payload: {
            campaignId: row.campaignId,
            productName: row.productName,
            remainingSeconds,
            activeCents: row.activeCents,
            burnRateCentsPerHour: row.burnRateCentsPerHour,
          },
          status: 'PENDING',
          createdAt: now,
        })
        .onConflictDoNothing()

      return true
    })

    if (claimed) enqueued += 1
  }

  return { enqueued }
}
