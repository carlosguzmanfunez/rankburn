-- FlipPeak Beta 2.0 — Block C / taxonomy support
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS subtype text;

-- Existing records predate the subtype model. Keep them valid and visible.
UPDATE products
SET subtype = 'other'
WHERE subtype IS NULL OR btrim(subtype) = '';

ALTER TABLE products
  ALTER COLUMN subtype SET NOT NULL,
  ALTER COLUMN subtype SET DEFAULT 'other';

CREATE INDEX IF NOT EXISTS products_category_subtype_idx
  ON products (category, subtype);
