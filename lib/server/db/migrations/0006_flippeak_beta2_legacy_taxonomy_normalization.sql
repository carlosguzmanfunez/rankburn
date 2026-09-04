-- FlipPeak Beta 2.0 — legacy demo taxonomy normalization
-- These mappings are migration choices for existing demo data, not semantic
-- inference rules for future advertiser content.

UPDATE products
SET category = 'ai',
    subtype = CASE
      WHEN subtype IS NULL OR subtype = '' OR subtype = 'other'
      THEN 'ai-tool'
      ELSE subtype
    END
WHERE category = 'ai';

UPDATE products
SET category = 'tech',
    subtype = 'developer-tool'
WHERE category = 'devtools';

UPDATE products
SET category = 'apps',
    subtype = 'productivity-app'
WHERE category = 'productivity';

UPDATE products
SET category = 'startups',
    subtype = 'startup'
WHERE category IN ('marketing', 'sales');

UPDATE products
SET category = 'tech',
    subtype = 'saas'
WHERE category = 'seo';
