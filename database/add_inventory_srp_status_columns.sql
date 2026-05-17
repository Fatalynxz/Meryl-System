-- Separates sellable inventory pricing/status from product master unit price.
ALTER TABLE public.inventory
  ADD COLUMN IF NOT EXISTS srp numeric(10, 2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS inventory_status varchar(20) DEFAULT 'inactive';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'inventory_inventory_status_check'
      AND conrelid = 'public.inventory'::regclass
  ) THEN
    ALTER TABLE public.inventory
      ADD CONSTRAINT inventory_inventory_status_check
      CHECK (inventory_status IN ('active', 'inactive'));
  END IF;
END $$;

UPDATE public.inventory i
SET
  srp = COALESCE(NULLIF(i.srp, 0), p.cost_price, 0),
  inventory_status = COALESCE(i.inventory_status, p.status, 'inactive')
FROM public.product p
WHERE p.product_id = i.product_id;
