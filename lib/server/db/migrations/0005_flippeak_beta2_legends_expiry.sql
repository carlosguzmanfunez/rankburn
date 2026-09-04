-- FlipPeak Beta 2.0 — Block F / Tramo 1
-- Expiry warning idempotency + Legends persistence + notification outbox.

ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS expiry_warning_sent_at timestamptz;

CREATE TABLE IF NOT EXISTS legend_entries (
  id text PRIMARY KEY,
  campaign_id text NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  qualified_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  peak_rank integer NOT NULL,
  peak_burn_rate_cents_per_hour integer NOT NULL,
  time_at_peak_seconds integer NOT NULL DEFAULT 0,
  qualification_reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS legend_entries_campaign_id_unique
  ON legend_entries(campaign_id);

CREATE INDEX IF NOT EXISTS legend_entries_expires_at_idx
  ON legend_entries(expires_at);

CREATE TABLE IF NOT EXISTS notification_outbox (
  id text PRIMARY KEY,
  campaign_id text REFERENCES campaigns(id) ON DELETE CASCADE,
  kind text NOT NULL,
  recipient text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'PENDING',
  created_at timestamptz NOT NULL DEFAULT now(),
  delivered_at timestamptz,
  failed_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS notification_outbox_campaign_kind_unique
  ON notification_outbox(campaign_id, kind);
