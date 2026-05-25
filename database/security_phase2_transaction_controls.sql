-- Phase 2 controls: transactional data checks and stricter validation constraints.
-- Run in Supabase SQL Editor once (after phase1 script).

-- 1) Sales line quality constraints.
alter table public.sales_details
  add constraint chk_sales_details_positive_quantity
  check (quantity > 0) not valid;

alter table public.sales_details
  validate constraint chk_sales_details_positive_quantity;

alter table public.sales_details
  add constraint chk_sales_details_non_negative_price
  check (price >= 0) not valid;

alter table public.sales_details
  validate constraint chk_sales_details_non_negative_price;

alter table public.sales_details
  add constraint chk_sales_details_discount_range
  check (coalesce(discount_applied, 0) >= 0 and coalesce(discount_applied, 0) <= 100) not valid;

alter table public.sales_details
  validate constraint chk_sales_details_discount_range;

alter table public.sales_details
  add constraint chk_sales_details_non_negative_subtotal
  check (subtotal >= 0) not valid;

alter table public.sales_details
  validate constraint chk_sales_details_non_negative_subtotal;

-- 2) Payment quality constraints.
alter table public.payment
  add constraint chk_payment_non_negative_amount_paid
  check (amount_paid >= 0) not valid;

alter table public.payment
  validate constraint chk_payment_non_negative_amount_paid;

alter table public.payment
  add constraint chk_payment_non_negative_change
  check (coalesce(change_amount, 0) >= 0) not valid;

alter table public.payment
  validate constraint chk_payment_non_negative_change;

-- 3) Inventory logs: keep movement reason constrained (schema already has check in baseline;
--    this guard ensures legacy environments are aligned).
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'inventory_log_transaction_type_check'
  ) then
    alter table public.inventory_log
      add constraint inventory_log_transaction_type_check
      check (transaction_type in ('sale', 'return', 'adjustment', 'restock'));
  end if;
end
$$;

