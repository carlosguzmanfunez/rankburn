-- FlipPeak Beta 2.0
-- Run Again creates a new campaign/run and links it to the exhausted run.

ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS previous_campaign_id text;

ALTER TABLE campaigns
  ADD CONSTRAINT campaigns_previous_campaign_id_fk
  FOREIGN KEY (previous_campaign_id)
  REFERENCES campaigns(id)
  ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS campaigns_previous_campaign_id_idx
  ON campaigns(previous_campaign_id);
