-- RankBurn initial schema
-- Apply with: npm run db:setup
-- Idempotent: safe to run more than once.

CREATE TABLE IF NOT EXISTS users (
  id            text PRIMARY KEY,
  email         text NOT NULL UNIQUE,
  display_name  text NOT NULL,
  role          text NOT NULL DEFAULT 'ADVERTISER',
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS products (
  id           text PRIMARY KEY,
  owner_id     text NOT NULL REFERENCES users(id),
  slug         text NOT NULL UNIQUE,
  name         text NOT NULL,
  tagline      text NOT NULL,
  description  text NOT NULL,
  category     text NOT NULL,
  website      text NOT NULL,
  hue          integer NOT NULL DEFAULT 42,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS products_owner_idx ON products (owner_id);

CREATE TABLE IF NOT EXISTS campaigns (
  id                        text PRIMARY KEY,
  product_id                text NOT NULL REFERENCES products(id),
  advertiser_id             text NOT NULL REFERENCES users(id),
  status                    text NOT NULL DEFAULT 'PENDING',
  flagged                   boolean NOT NULL DEFAULT false,
  flag_reason               text,
  rejection_reason          text,
  burn_rate_cents_per_hour  integer NOT NULL DEFAULT 3500,
  created_at                timestamptz NOT NULL DEFAULT now(),
  approved_at               timestamptz,
  last_settled_at           timestamptz NOT NULL DEFAULT now(),
  balance_changed_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS campaigns_status_idx ON campaigns (status);
CREATE INDEX IF NOT EXISTS campaigns_product_idx ON campaigns (product_id);

CREATE TABLE IF NOT EXISTS advertising_budgets (
  campaign_id             text PRIMARY KEY REFERENCES campaigns(id) ON DELETE CASCADE,
  active_cents            bigint NOT NULL DEFAULT 0,
  lifetime_funded_cents   bigint NOT NULL DEFAULT 0,
  lifetime_used_cents     bigint NOT NULL DEFAULT 0,
  used_today_cents        bigint NOT NULL DEFAULT 0,
  used_today_date         text NOT NULL,
  updated_at              timestamptz NOT NULL DEFAULT now(),
  -- A balance can never go negative. This is the last line of defence for the
  -- one number in the system that real money funds.
  CONSTRAINT active_cents_non_negative CHECK (active_cents >= 0)
);
CREATE INDEX IF NOT EXISTS budgets_active_idx ON advertising_budgets (active_cents);

CREATE TABLE IF NOT EXISTS campaign_stats (
  campaign_id               text PRIMARY KEY REFERENCES campaigns(id) ON DELETE CASCADE,
  impressions               bigint NOT NULL DEFAULT 0,
  visitors                  bigint NOT NULL DEFAULT 0,
  outbound_clicks           bigint NOT NULL DEFAULT 0,
  verified_outbound_clicks  bigint NOT NULL DEFAULT 0,
  peak_rank                 integer NOT NULL DEFAULT 99,
  minutes_at_one            integer NOT NULL DEFAULT 0,
  joined_label              text NOT NULL DEFAULT 'Today',
  rank_history              text NOT NULL DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS payments (
  id                   text PRIMARY KEY,
  campaign_id          text NOT NULL REFERENCES campaigns(id),
  advertiser_id        text NOT NULL REFERENCES users(id),
  provider             text NOT NULL,
  provider_order_id    text,
  provider_capture_id  text,
  amount_cents         bigint NOT NULL,
  currency             text NOT NULL DEFAULT 'USD',
  status               text NOT NULL DEFAULT 'CREATED',
  description          text NOT NULL,
  created_at           timestamptz NOT NULL DEFAULT now(),
  completed_at         timestamptz,
  credited_at          timestamptz,
  CONSTRAINT amount_cents_positive CHECK (amount_cents > 0)
);
CREATE INDEX IF NOT EXISTS payments_campaign_idx ON payments (campaign_id);
CREATE INDEX IF NOT EXISTS payments_order_idx ON payments (provider_order_id);

CREATE TABLE IF NOT EXISTS budget_usage_events (
  id           text PRIMARY KEY,
  campaign_id  text NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  amount_cents bigint NOT NULL,
  from_at      timestamptz NOT NULL,
  to_at        timestamptz NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS usage_campaign_idx ON budget_usage_events (campaign_id);

CREATE TABLE IF NOT EXISTS impressions (
  id           text PRIMARY KEY,
  campaign_id  text NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  visitor_key  text NOT NULL,
  surface      text NOT NULL DEFAULT 'unknown',
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS impressions_campaign_idx ON impressions (campaign_id);

CREATE TABLE IF NOT EXISTS visitor_events (
  id           text PRIMARY KEY,
  visitor_key  text NOT NULL,
  path         text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS visitors_key_idx ON visitor_events (visitor_key);

CREATE TABLE IF NOT EXISTS outbound_clicks (
  id           text PRIMARY KEY,
  campaign_id  text NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  visitor_key  text NOT NULL,
  verified     boolean NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS clicks_campaign_idx ON outbound_clicks (campaign_id);
CREATE INDEX IF NOT EXISTS clicks_created_idx ON outbound_clicks (created_at);

CREATE TABLE IF NOT EXISTS rank_snapshots (
  id             text PRIMARY KEY,
  campaign_id    text NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  rank           integer NOT NULL,
  category_rank  integer NOT NULL,
  active_cents   bigint NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS snapshots_created_idx ON rank_snapshots (created_at);

CREATE TABLE IF NOT EXISTS moderation_events (
  id            text PRIMARY KEY,
  campaign_id   text NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  action        text NOT NULL,
  reason        text,
  moderator_id  text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS moderation_campaign_idx ON moderation_events (campaign_id);

CREATE TABLE IF NOT EXISTS audit_logs (
  id            text PRIMARY KEY,
  action        text NOT NULL,
  entity_type   text NOT NULL,
  entity_id     text NOT NULL,
  entity_label  text NOT NULL,
  actor_id      text NOT NULL,
  actor_label   text NOT NULL,
  reason        text,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_created_idx ON audit_logs (created_at);

CREATE TABLE IF NOT EXISTS processed_webhook_events (
  event_id    text PRIMARY KEY,
  provider    text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
