-- Pre-Beta 2.0 data fixture (integration runbook, step 6).
--
-- Apply ONLY `0000_init.sql`, then this file, then migrations 0001-0009. This
-- reproduces a database that predates Beta 2.0 and proves the migration chain
-- upgrades real rows rather than only working on an empty schema.
--
-- Every row here is chosen to exercise something a migration must handle:
--
--   legacy-ai         legacy category 'ai'          -> 0006 keeps the id, sets a subtype
--   legacy-devtools   legacy category 'devtools'    -> 0006 maps to 'tech'
--   legacy-marketing  legacy category 'marketing'   -> 0006 maps to 'startups'
--   legacy-seo        legacy category 'seo'         -> 0006 maps to 'tech'
--   legacy-productivity legacy category 'productivity' -> 0006 maps to 'apps'
--   legacy-sales      legacy category 'sales'       -> 0006 maps to 'startups'
--
--   legacy-exhausted  a campaign wrongly left EXHAUSTED with no budget, which
--                     0003 must reclassify as APPROVED
--   legacy-champion   minutes_at_one > 0, which 0008 must backfill into the
--                     category and top-three counters
--   legacy-paid       a credited payment, which 0007 must leave untouched
--                     while adding the refund columns
--
-- Assertions to run afterwards are in docs/INTEGRATION_VERIFICATION.md.

INSERT INTO users (id, email, display_name, role, created_at) VALUES
  ('legacy-user', 'legacy@example.test', 'Legacy Advertiser', 'ADVERTISER', now())
ON CONFLICT (id) DO NOTHING;

INSERT INTO products (id, owner_id, slug, name, tagline, description, category, website, hue, created_at) VALUES
  ('legacy-ai',          'legacy-user', 'legacy-ai',          'Legacy AI',      'Legacy tagline', 'Legacy description', 'ai',           'legacyai.test',      10, now()),
  ('legacy-devtools',    'legacy-user', 'legacy-devtools',    'Legacy Dev',     'Legacy tagline', 'Legacy description', 'devtools',     'legacydev.test',     20, now()),
  ('legacy-marketing',   'legacy-user', 'legacy-marketing',   'Legacy Mkt',     'Legacy tagline', 'Legacy description', 'marketing',    'legacymkt.test',     30, now()),
  ('legacy-seo',         'legacy-user', 'legacy-seo',         'Legacy SEO',     'Legacy tagline', 'Legacy description', 'seo',          'legacyseo.test',     40, now()),
  ('legacy-productivity','legacy-user', 'legacy-productivity','Legacy Prod',    'Legacy tagline', 'Legacy description', 'productivity', 'legacyprod.test',    50, now()),
  ('legacy-sales',       'legacy-user', 'legacy-sales',       'Legacy Sales',   'Legacy tagline', 'Legacy description', 'sales',        'legacysales.test',   60, now())
ON CONFLICT (id) DO NOTHING;

-- One campaign per product. `legacy-exhausted` is the 0003 repair case.
INSERT INTO campaigns (id, advertiser_id, product_id, status, flagged, created_at, last_settled_at, balance_changed_at) VALUES
  ('legacy-ai',           'legacy-user', 'legacy-ai',           'ACTIVE',    false, now(), now(), now()),
  ('legacy-devtools',     'legacy-user', 'legacy-devtools',     'ACTIVE',    false, now(), now(), now()),
  ('legacy-marketing',    'legacy-user', 'legacy-marketing',    'PAUSED',    false, now(), now(), now()),
  ('legacy-seo',          'legacy-user', 'legacy-seo',          'ACTIVE',    false, now(), now(), now()),
  ('legacy-productivity', 'legacy-user', 'legacy-productivity', 'EXHAUSTED', false, now(), now(), now()),
  ('legacy-sales',        'legacy-user', 'legacy-sales',        'ACTIVE',    false, now(), now(), now())
ON CONFLICT (id) DO NOTHING;

-- `legacy-productivity` is EXHAUSTED with zero lifetime funding: it never ran,
-- so migration 0003 must reclassify it as APPROVED rather than leave it
-- stranded in a terminal state.
INSERT INTO advertising_budgets (campaign_id, active_cents, used_today_cents, used_today_date, lifetime_used_cents, lifetime_funded_cents, updated_at) VALUES
  ('legacy-ai',           50000, 1200, to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD'), 12000, 62000, now()),
  ('legacy-devtools',     30000,  800, to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD'),  9000, 39000, now()),
  ('legacy-marketing',    20000,    0, to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD'),  5000, 25000, now()),
  ('legacy-seo',          15000,  400, to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD'),  3000, 18000, now()),
  ('legacy-productivity',     0,    0, to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD'),     0,     0, now()),
  ('legacy-sales',        10000,  200, to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD'),  2000, 12000, now())
ON CONFLICT (campaign_id) DO NOTHING;

-- `legacy-ai` held rank #1 for 90 minutes. Migration 0008 must backfill that
-- into the category and top-three counters as a floor.
INSERT INTO campaign_stats (campaign_id, impressions, visitors, outbound_clicks, verified_outbound_clicks, peak_rank, minutes_at_one, joined_label, rank_history) VALUES
  ('legacy-ai',           900, 300, 40, 10, 1,  90, 'Jan 2025', '[1,1,2]'),
  ('legacy-devtools',     600, 200, 25,  5, 2,   0, 'Feb 2025', '[2,3,3]'),
  ('legacy-marketing',    300, 100, 10,  2, 4,   0, 'Mar 2025', '[4,4,5]'),
  ('legacy-seo',          200,  80,  8,  1, 5,   0, 'Apr 2025', '[5,5,6]'),
  ('legacy-productivity',   0,   0,  0,  0, 99,  0, 'May 2025', '[99]'),
  ('legacy-sales',        150,  60,  6,  1, 6,   0, 'Jun 2025', '[6,6,7]')
ON CONFLICT (campaign_id) DO NOTHING;

-- A credited payment predating the refund columns. Migration 0007 must add the
-- columns without disturbing it, and its CHECK constraint must accept a row
-- that is credited and not refunded.
INSERT INTO payments (id, campaign_id, advertiser_id, provider, provider_order_id, provider_capture_id, amount_cents, currency, status, description, created_at, completed_at, credited_at) VALUES
  ('legacy-payment', 'legacy-ai', 'legacy-user', 'paypal', 'LEGACY-ORDER', 'LEGACY-CAPTURE', 62000, 'USD', 'COMPLETED', 'Legacy advertising budget', now(), now(), now())
ON CONFLICT (id) DO NOTHING;
