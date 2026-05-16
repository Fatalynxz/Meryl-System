-- Return Management ERD alignment
-- Run this once in Supabase SQL Editor before relying on advanced return fields.

-- Preserve original sales while allowing adjusted/net sales reporting.
ALTER TABLE public.sales_transaction
  ADD COLUMN IF NOT EXISTS original_total_amount DECIMAL(12, 2),
  ADD COLUMN IF NOT EXISTS adjusted_total_amount DECIMAL(12, 2),
  ADD COLUMN IF NOT EXISTS sales_status VARCHAR(30) DEFAULT 'Completed',
  ADD COLUMN IF NOT EXISTS return_status VARCHAR(30) DEFAULT 'None';

UPDATE public.sales_transaction
SET
  original_total_amount = COALESCE(original_total_amount, total_amount),
  adjusted_total_amount = COALESCE(adjusted_total_amount, total_amount),
  sales_status = COALESCE(sales_status, 'Completed'),
  return_status = COALESCE(return_status, 'None');

-- Track returned/replaced quantities per sold item without deleting sale details.
ALTER TABLE public.sales_details
  ADD COLUMN IF NOT EXISTS returned_quantity INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS replacement_product_id UUID REFERENCES public.product(product_id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS item_status VARCHAR(30) DEFAULT 'Sold';

UPDATE public.sales_details
SET
  returned_quantity = COALESCE(returned_quantity, 0),
  item_status = COALESCE(item_status, 'Sold');

-- Store return/replacement metadata at the return header level.
ALTER TABLE public.returns
  ADD COLUMN IF NOT EXISTS return_type VARCHAR(40) DEFAULT 'Replacement',
  ADD COLUMN IF NOT EXISTS return_status VARCHAR(30) DEFAULT 'Completed',
  ADD COLUMN IF NOT EXISTS additional_payment DECIMAL(12, 2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS adjustment_amount DECIMAL(12, 2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS remarks TEXT;

UPDATE public.returns
SET
  return_type = COALESCE(return_type, 'Replacement'),
  return_status = COALESCE(return_status, 'Completed'),
  additional_payment = COALESCE(additional_payment, 0),
  adjustment_amount = COALESCE(adjustment_amount, 0);

-- Store item-level replacement/refund/inventory handling details.
ALTER TABLE public.return_details
  ADD COLUMN IF NOT EXISTS replacement_product_id UUID REFERENCES public.product(product_id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS replacement_quantity INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS price_difference DECIMAL(12, 2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS inventory_action VARCHAR(40) DEFAULT 'Defective / Not Sellable';

UPDATE public.return_details
SET
  replacement_quantity = COALESCE(replacement_quantity, 0),
  price_difference = COALESCE(price_difference, 0),
  inventory_action = COALESCE(inventory_action, 'Defective / Not Sellable');

-- Allow payment adjustment rows if the business later wants separate payment records.
-- Existing app code can also update the existing payment amount when only one row exists.
ALTER TABLE public.payment
  DROP CONSTRAINT IF EXISTS payment_sales_id_key;

CREATE INDEX IF NOT EXISTS idx_sales_transaction_sales_status ON public.sales_transaction(sales_status);
CREATE INDEX IF NOT EXISTS idx_sales_transaction_return_status ON public.sales_transaction(return_status);
CREATE INDEX IF NOT EXISTS idx_sales_details_replacement_product_id ON public.sales_details(replacement_product_id);
CREATE INDEX IF NOT EXISTS idx_return_details_replacement_product_id ON public.return_details(replacement_product_id);
