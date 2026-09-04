-- FlipPeak Beta 2.0 — payment refund bookkeeping
--
-- A payment whose campaign run closed before the verified webhook arrived is
-- refunded to the original payment method. It is never credited to the closed
-- run, and it is never reassigned to another run without the payer's explicit
-- consent.
--
-- Idempotent: safe to run more than once.

ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS provider_refund_id text;

ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS refunded_at timestamptz;

ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS refund_failure_reason text;

-- Operators need to find payments stuck awaiting or failing a refund.
CREATE INDEX IF NOT EXISTS payments_status_idx
  ON payments (status);

-- Defence in depth: a payment can never be both credited and refunded.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'payments_not_credited_and_refunded'
  ) THEN
    ALTER TABLE payments
      ADD CONSTRAINT payments_not_credited_and_refunded
      CHECK (credited_at IS NULL OR refunded_at IS NULL);
  END IF;
END $$;
