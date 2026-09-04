-- FlipPeak Beta 2.0 — advertiser identity and ownership
--
-- Reuses the existing `users` table and the existing `campaigns.advertiser_id`
-- / `products.owner_id` relationships. No duplicate identity tables: ownership
-- was already modelled, it simply had no authentication behind it.
--
-- What this adds:
--   1. credentials on `users`, so an advertiser can actually be authenticated;
--   2. a case-insensitive unique email, so one address is one account;
--   3. indexes for the ownership-scoped lookups `/api/me/*` performs.
--
-- Idempotent: safe to run more than once.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS password_hash text;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS last_sign_in_at timestamptz;

-- Emails are compared lowercased everywhere in the application, so uniqueness
-- has to be enforced the same way. A plain UNIQUE(email) would let
-- "A@b.com" and "a@b.com" coexist as two accounts.
CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_unique
  ON users (lower(email));

-- Every ownership-scoped read filters by advertiser, and My Campaigns orders
-- by recency.
CREATE INDEX IF NOT EXISTS campaigns_advertiser_created_idx
  ON campaigns (advertiser_id, created_at DESC);

CREATE INDEX IF NOT EXISTS products_owner_idx
  ON products (owner_id);

CREATE INDEX IF NOT EXISTS payments_advertiser_idx
  ON payments (advertiser_id);

-- The demo advertiser stays for seeds and local development, but it must never
-- be an account anyone can sign in to: no password hash means no credential
-- path can ever match it.
UPDATE users
SET password_hash = NULL
WHERE id = 'user-demo-advertiser';
