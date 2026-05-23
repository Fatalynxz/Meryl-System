-- Normalize existing product.size values to numeric EU format (e.g., "36", "40-45")
-- Handles values like "EU 36", "EU 36-40", "US 8", "US 8-10".

BEGIN;

-- 1) Remove EU prefix if present
UPDATE public.product
SET size = regexp_replace(size, '^\s*EU\s*', '', 'i')
WHERE size ~* '^\s*EU\s*';

-- 2) Convert US single size to EU single size
-- Approximation:
-- - Men/Unisex: EU = US + 33
-- - Women: EU = US + 31
UPDATE public.product
SET size = (
  CASE
    WHEN lower(coalesce(gender, '')) LIKE 'women%' THEN ((regexp_replace(size, '[^0-9\.]', '', 'g'))::numeric + 31)::int::text
    ELSE ((regexp_replace(size, '[^0-9\.]', '', 'g'))::numeric + 33)::int::text
  END
)
WHERE size ~* '^\s*US\s*\d+(\.\d+)?\s*$';

-- 3) Convert US range to EU range
UPDATE public.product
SET size = (
  CASE
    WHEN lower(coalesce(gender, '')) LIKE 'women%' THEN
      (((regexp_match(size, 'US\s*(\d+(\.\d+)?)\s*-\s*(\d+(\.\d+)?)', 'i'))[1])::numeric + 31)::int::text
      || '-' ||
      (((regexp_match(size, 'US\s*(\d+(\.\d+)?)\s*-\s*(\d+(\.\d+)?)', 'i'))[3])::numeric + 31)::int::text
    ELSE
      (((regexp_match(size, 'US\s*(\d+(\.\d+)?)\s*-\s*(\d+(\.\d+)?)', 'i'))[1])::numeric + 33)::int::text
      || '-' ||
      (((regexp_match(size, 'US\s*(\d+(\.\d+)?)\s*-\s*(\d+(\.\d+)?)', 'i'))[3])::numeric + 33)::int::text
  END
)
WHERE size ~* '^\s*US\s*\d+(\.\d+)?\s*-\s*\d+(\.\d+)?\s*$';

COMMIT;

