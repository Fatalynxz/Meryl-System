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

-- 4) Archive legacy range-size rows (e.g., "36-45") when single-size variants exist
--    for the same brand + product name.
WITH range_rows AS (
  SELECT p.product_id, p.product_name, p.brand
  FROM public.product p
  WHERE COALESCE(p.size, '') ~ '^\d+\s*-\s*\d+$'
),
single_rows AS (
  SELECT DISTINCT p.product_name, p.brand
  FROM public.product p
  WHERE COALESCE(p.size, '') ~ '^\d+$'
)
UPDATE public.product p
SET status = 'inactive'
FROM range_rows r
JOIN single_rows s
  ON LOWER(s.product_name) = LOWER(r.product_name)
 AND LOWER(s.brand) = LOWER(r.brand)
WHERE p.product_id = r.product_id;

-- Keep inventory consistent for archived legacy range rows.
UPDATE public.inventory i
SET inventory_status = 'inactive',
    stock_quantity = 0,
    last_updated = NOW()
FROM public.product p
WHERE i.product_id = p.product_id
  AND p.status = 'inactive'
  AND COALESCE(p.size, '') ~ '^\d+\s*-\s*\d+$';

COMMIT;
