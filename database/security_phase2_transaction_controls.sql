-- Phase 2 controls: transactional data checks and stricter validation constraints.
-- Run in Supabase SQL Editor once (after phase1 script).

-- Normalize legacy rows first so validation won't fail.
update public.sales_details
set quantity = 1
where quantity is null or quantity <= 0;

update public.sales_details
set price = 0
where price is null or price < 0;

update public.sales_details
set discount_applied = greatest(0, least(100, coalesce(discount_applied, 0)));

update public.sales_details
set subtotal = greatest(
  0,
  (
    coalesce(price, 0) * coalesce(quantity, 0)
    - (coalesce(price, 0) * coalesce(quantity, 0) * (greatest(0, least(100, coalesce(discount_applied, 0))) / 100.0))
  )
)
where subtotal is null or subtotal < 0;

update public.payment
set amount_paid = greatest(0, coalesce(amount_paid, 0))
where amount_paid is null or amount_paid < 0;

update public.payment
set change_amount = greatest(0, coalesce(change_amount, 0))
where change_amount is null or change_amount < 0;

-- 1) Sales line quality constraints.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'chk_sales_details_positive_quantity'
      and conrelid = 'public.sales_details'::regclass
  ) then
    alter table public.sales_details
      add constraint chk_sales_details_positive_quantity
      check (quantity > 0) not valid;
  end if;
end
$$;

alter table public.sales_details
  validate constraint chk_sales_details_positive_quantity;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'chk_sales_details_non_negative_price'
      and conrelid = 'public.sales_details'::regclass
  ) then
    alter table public.sales_details
      add constraint chk_sales_details_non_negative_price
      check (price >= 0) not valid;
  end if;
end
$$;

alter table public.sales_details
  validate constraint chk_sales_details_non_negative_price;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'chk_sales_details_discount_range'
      and conrelid = 'public.sales_details'::regclass
  ) then
    alter table public.sales_details
      add constraint chk_sales_details_discount_range
      check (coalesce(discount_applied, 0) >= 0 and coalesce(discount_applied, 0) <= 100) not valid;
  end if;
end
$$;

alter table public.sales_details
  validate constraint chk_sales_details_discount_range;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'chk_sales_details_non_negative_subtotal'
      and conrelid = 'public.sales_details'::regclass
  ) then
    alter table public.sales_details
      add constraint chk_sales_details_non_negative_subtotal
      check (subtotal >= 0) not valid;
  end if;
end
$$;

alter table public.sales_details
  validate constraint chk_sales_details_non_negative_subtotal;

-- 2) Payment quality constraints.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'chk_payment_non_negative_amount_paid'
      and conrelid = 'public.payment'::regclass
  ) then
    alter table public.payment
      add constraint chk_payment_non_negative_amount_paid
      check (amount_paid >= 0) not valid;
  end if;
end
$$;

alter table public.payment
  validate constraint chk_payment_non_negative_amount_paid;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'chk_payment_non_negative_change'
      and conrelid = 'public.payment'::regclass
  ) then
    alter table public.payment
      add constraint chk_payment_non_negative_change
      check (coalesce(change_amount, 0) >= 0) not valid;
  end if;
end
$$;

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
