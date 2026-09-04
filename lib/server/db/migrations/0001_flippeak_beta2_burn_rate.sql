-- FlipPeak Beta 2.0 — Block B / Migration 0001
-- Adds Burn Rate history fields without changing existing RankBurn internal
-- migration infrastructure.

ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS burn_rate_changed_at timestamptz;

UPDATE campaigns
SET burn_rate_changed_at = COALESCE(burn_rate_changed_at, approved_at, created_at, now())
WHERE burn_rate_changed_at IS NULL;

ALTER TABLE campaigns
  ALTER COLUMN burn_rate_changed_at SET NOT NULL,
  ALTER COLUMN burn_rate_changed_at SET DEFAULT now();

ALTER TABLE rank_snapshots
  ADD COLUMN IF NOT EXISTS burn_rate_cents_per_hour integer;

UPDATE rank_snapshots rs
SET burn_rate_cents_per_hour = c.burn_rate_cents_per_hour
FROM campaigns c
WHERE rs.campaign_id = c.id
  AND rs.burn_rate_cents_per_hour IS NULL;

ALTER TABLE rank_snapshots
  ALTER COLUMN burn_rate_cents_per_hour SET NOT NULL;

CREATE INDEX IF NOT EXISTS campaigns_burn_rate_idx
  ON campaigns (burn_rate_cents_per_hour DESC);

CREATE INDEX IF NOT EXISTS rank_snapshots_campaign_created_idx
  ON rank_snapshots (campaign_id, created_at DESC);
