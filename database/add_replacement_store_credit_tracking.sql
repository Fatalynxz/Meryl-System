-- Replacement-only and store-credit tracking adjustments
-- Business rules:
-- 1) No cash refunds
-- 2) Replacement can be equal/higher/lower in value
--    - higher: customer pays difference
--    - equal: no payment
--    - lower: issue store credit (never cash)

-- ============================================
-- A) Add replacement transaction fields to returns
-- ============================================
ALTER TABLE public.returns
  ADD COLUMN IF NOT EXISTS original_sales_id UUID REFERENCES public.sales_transaction(sales_id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS mode_of_payment VARCHAR(20) CHECK (mode_of_payment IN ('gcash', 'cash')),
  ADD COLUMN IF NOT EXISTS payment_date TIMESTAMP,
  ADD COLUMN IF NOT EXISTS fulfilled_date TIMESTAMP,
  ADD COLUMN IF NOT EXISTS notes TEXT,
  ADD COLUMN IF NOT EXISTS replacement_count INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_replacement_payments DECIMAL(12, 2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_credits_issued DECIMAL(12, 2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS net_amount DECIMAL(12, 2),
  ADD COLUMN IF NOT EXISTS last_activity_date TIMESTAMP;

-- Backfill helpers for existing rows
UPDATE public.returns
SET
  original_sales_id = COALESCE(original_sales_id, sales_id),
  replacement_count = COALESCE(replacement_count, 0),
  total_replacement_payments = COALESCE(total_replacement_payments, 0),
  total_credits_issued = COALESCE(total_credits_issued, 0),
  net_amount = COALESCE(net_amount, 0),
  last_activity_date = COALESCE(last_activity_date, return_date);

-- ============================================
-- B) Add item-level replacement details to return_details
-- ============================================
ALTER TABLE public.return_details
  ADD COLUMN IF NOT EXISTS returned_product_id UUID REFERENCES public.product(product_id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS returned_quantity INT,
  ADD COLUMN IF NOT EXISTS returned_price_unit DECIMAL(12, 2),
  ADD COLUMN IF NOT EXISTS new_product_id UUID REFERENCES public.product(product_id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS new_quantity INT,
  ADD COLUMN IF NOT EXISTS new_price_unit DECIMAL(12, 2),
  ADD COLUMN IF NOT EXISTS net_difference DECIMAL(12, 2),
  ADD COLUMN IF NOT EXISTS replacement_status VARCHAR(30) DEFAULT 'Completed';

-- Backfill from legacy columns where possible
UPDATE public.return_details
SET
  returned_product_id = COALESCE(returned_product_id, product_id),
  returned_quantity = COALESCE(returned_quantity, quantity_returned),
  returned_price_unit = COALESCE(returned_price_unit, NULLIF(refund_amount, 0)),
  new_quantity = COALESCE(new_quantity, replacement_quantity, quantity_returned),
  new_product_id = COALESCE(new_product_id, replacement_product_id),
  net_difference = COALESCE(net_difference, price_difference);

-- Business-rule integrity checks
ALTER TABLE public.return_details
  DROP CONSTRAINT IF EXISTS chk_return_details_positive_qty;
ALTER TABLE public.return_details
  ADD CONSTRAINT chk_return_details_positive_qty
  CHECK (
    COALESCE(returned_quantity, 0) > 0
    AND COALESCE(new_quantity, 0) > 0
  );

-- For replacement records with explicit unit prices, keep math consistent.
ALTER TABLE public.return_details
  DROP CONSTRAINT IF EXISTS chk_return_details_net_difference_formula;
ALTER TABLE public.return_details
  ADD CONSTRAINT chk_return_details_net_difference_formula
  CHECK (
    net_difference IS NULL
    OR returned_price_unit IS NULL
    OR new_price_unit IS NULL
    OR net_difference = ROUND(((new_price_unit * new_quantity) - (returned_price_unit * returned_quantity))::numeric, 2)
  );

-- Higher/equal/lower outcomes map to paid/credited states (no refund state).
ALTER TABLE public.returns
  DROP CONSTRAINT IF EXISTS chk_returns_mode_of_payment_with_amount;
ALTER TABLE public.returns
  ADD CONSTRAINT chk_returns_mode_of_payment_with_amount
  CHECK (
    mode_of_payment IS NULL
    OR (mode_of_payment IN ('gcash', 'cash') AND COALESCE(total_replacement_payments, 0) >= 0)
  );

-- ============================================
-- C) Customer store-credit tracking
-- ============================================
CREATE TABLE IF NOT EXISTS public.customer_credits (
  customer_credit_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL UNIQUE REFERENCES public.customer(customer_id) ON DELETE CASCADE,
  total_issued DECIMAL(12, 2) NOT NULL DEFAULT 0,
  total_used DECIMAL(12, 2) NOT NULL DEFAULT 0,
  available_credit DECIMAL(12, 2) NOT NULL DEFAULT 0,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_customer_credits_non_negative
    CHECK (total_issued >= 0 AND total_used >= 0 AND available_credit >= 0)
);

CREATE TABLE IF NOT EXISTS public.customer_credit_transactions (
  customer_credit_txn_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES public.customer(customer_id) ON DELETE CASCADE,
  return_id UUID REFERENCES public.returns(return_id) ON DELETE SET NULL,
  txn_type VARCHAR(20) NOT NULL CHECK (txn_type IN ('issue', 'use', 'adjustment')),
  amount DECIMAL(12, 2) NOT NULL CHECK (amount > 0),
  notes TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_customer_credit_transactions_customer_id
  ON public.customer_credit_transactions(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_credit_transactions_return_id
  ON public.customer_credit_transactions(return_id);

-- ============================================
-- D) Helpful indexes for replacement history lookups
-- ============================================
CREATE INDEX IF NOT EXISTS idx_returns_original_sales_id ON public.returns(original_sales_id);
CREATE INDEX IF NOT EXISTS idx_returns_mode_of_payment ON public.returns(mode_of_payment);
CREATE INDEX IF NOT EXISTS idx_return_details_new_product_id ON public.return_details(new_product_id);
CREATE INDEX IF NOT EXISTS idx_return_details_returned_product_id ON public.return_details(returned_product_id);
