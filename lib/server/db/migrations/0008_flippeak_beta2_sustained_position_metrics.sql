-- FlipPeak Beta 2.0 — sustained position metrics
--
-- Legends qualification is based on POSITION HELD OVER TIME, never on how much
-- an advertiser could spend per hour. That needs two counters the schema did
-- not track: time at Category Rank #1, and time inside the global Top 3.
--
-- `campaign_stats.minutes_at_one` already tracks Global Rank #1 and keeps its
-- meaning unchanged.
--
-- Idempotent: safe to run more than once.

ALTER TABLE campaign_stats
  ADD COLUMN IF NOT EXISTS minutes_at_category_one integer NOT NULL DEFAULT 0;

ALTER TABLE campaign_stats
  ADD COLUMN IF NOT EXISTS minutes_in_top_three integer NOT NULL DEFAULT 0;

-- Backfill: a campaign that held Global Rank #1 was, by definition, also at
-- Category Rank #1 and inside the global Top 3 for at least that long. This is
-- a floor, not a reconstruction of history, and it never over-credits.
UPDATE campaign_stats
SET minutes_at_category_one = GREATEST(minutes_at_category_one, minutes_at_one),
    minutes_in_top_three = GREATEST(minutes_in_top_three, minutes_at_one)
WHERE minutes_at_one > 0;
