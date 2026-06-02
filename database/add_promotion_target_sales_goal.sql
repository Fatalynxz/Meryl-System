-- Add a revenue goal per promotion so effectiveness can be measured
-- as generated promo sales divided by the campaign target.

ALTER TABLE public.promotion
  ADD COLUMN IF NOT EXISTS target_sales_goal NUMERIC(12, 2) NOT NULL DEFAULT 10000;

UPDATE public.promotion
SET target_sales_goal = 10000
WHERE target_sales_goal IS NULL OR target_sales_goal <= 0;

ALTER TABLE public.promotion
  ADD CONSTRAINT chk_promotion_target_sales_goal_positive
  CHECK (target_sales_goal > 0) NOT VALID;

ALTER TABLE public.promotion
  VALIDATE CONSTRAINT chk_promotion_target_sales_goal_positive;
