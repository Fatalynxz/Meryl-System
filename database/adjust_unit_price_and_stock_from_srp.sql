-- Use SRP as the real selling price, estimate unit price (cost_price), and set stock to 20.
-- Assumption: estimated unit price = 65% of SRP (roughly 35% gross margin).
-- You can change 0.65 below if you want a different estimate.

BEGIN;

-- 1) Ensure inventory rows are sellable and consistently stocked.
UPDATE public.inventory
SET
  stock_quantity = 20,
  reorder_level = COALESCE(reorder_level, 5),
  inventory_status = 'active',
  last_updated = NOW()
WHERE product_id IS NOT NULL;

-- 2) Estimate unit price (product.cost_price) from SRP.
UPDATE public.product p
SET
  cost_price = ROUND((i.srp * 0.65)::numeric, 2),
  updated_at = NOW()
FROM public.inventory i
WHERE i.product_id = p.product_id
  AND COALESCE(i.srp, 0) > 0;

COMMIT;

-- Optional verification
-- SELECT p.product_name, p.brand, p.size, p.cost_price AS unit_price, i.srp, i.stock_quantity
-- FROM public.product p
-- JOIN public.inventory i ON i.product_id = p.product_id
-- ORDER BY p.product_name, p.size;
