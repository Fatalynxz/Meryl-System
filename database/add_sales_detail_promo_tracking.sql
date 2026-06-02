-- Track the exact promotion used by each sale line.
-- This makes promotion analytics reliable instead of inferring usage only
-- from product/date/discount matches.

ALTER TABLE public.sales_details
  ADD COLUMN IF NOT EXISTS promo_id UUID NULL REFERENCES public.promotion(promo_id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_sales_details_promo_id
  ON public.sales_details(promo_id);

-- Backfill obvious historical promo usage from linked products, promo window,
-- and discounted sale lines.
UPDATE public.sales_details sd
SET promo_id = pp.promo_id
FROM public.sales_transaction st,
     public.payment pay,
     public.promo_product pp,
     public.promotion promo
WHERE sd.sales_id = st.sales_id
  AND pay.sales_id = st.sales_id
  AND pp.product_id = sd.product_id
  AND promo.promo_id = pp.promo_id
  AND sd.promo_id IS NULL
  AND COALESCE(sd.discount_applied, 0) > 0
  AND LOWER(COALESCE(pay.payment_status, '')) IN ('completed', 'paid')
  AND st.transaction_date >= promo.start_date
  AND st.transaction_date <= promo.end_date;
