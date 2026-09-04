-- FlipPeak Beta 2.0 — Block C / campaign lifecycle refinement
-- APPROVED means moderation passed but budget is not yet available.
--
-- The existing schema stores campaign status as text, so no SQL enum change
-- is needed. This migration normalizes any legacy campaign that was approved
-- with zero budget and incorrectly marked EXHAUSTED before it ever ran.

UPDATE campaigns c
SET status = 'APPROVED'
FROM advertising_budgets b
WHERE b.campaign_id = c.id
  AND c.status = 'EXHAUSTED'
  AND c.approved_at IS NOT NULL
  AND b.lifetime_funded_cents = 0
  AND b.lifetime_used_cents = 0
  AND b.active_cents = 0;
