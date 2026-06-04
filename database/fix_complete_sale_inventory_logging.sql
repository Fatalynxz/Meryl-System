-- Fix POS sale completion so every sold item is written to inventory_log.
-- Run this once in Supabase SQL Editor.
--
-- Why this exists:
-- The frontend POS completes sales through public.complete_sale(...). If that
-- RPC only deducts inventory but does not insert inventory_log rows, the new
-- Inventory Stock Movement Log page cannot show recent sales. The backfill at
-- the bottom also logs past completed sales that are missing sale movements.

begin;

create or replace function public.complete_sale(
  p_user_id uuid,
  p_customer_id uuid,
  p_payment_method text,
  p_amount_paid numeric,
  p_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sales_id uuid := gen_random_uuid();
  v_payment_id uuid := gen_random_uuid();
  v_total numeric(12, 2);
  v_change numeric(12, 2);
  v_item jsonb;
  v_product_id uuid;
  v_qty integer;
  v_price numeric(12, 2);
  v_discount numeric(12, 2);
  v_subtotal numeric(12, 2);
  v_available integer;
begin
  if p_user_id is null then
    raise exception 'Cashier is required.';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Cart is empty.';
  end if;

  select coalesce(sum((item ->> 'subtotal')::numeric), 0)::numeric(12, 2)
  into v_total
  from jsonb_array_elements(p_items) as item;

  if v_total <= 0 then
    raise exception 'Sale total must be greater than zero.';
  end if;

  if coalesce(p_amount_paid, 0) < v_total then
    raise exception 'Insufficient payment amount.';
  end if;

  v_change := (coalesce(p_amount_paid, 0) - v_total)::numeric(12, 2);

  insert into public.sales_transaction (
    sales_id,
    customer_id,
    transaction_date,
    total_amount,
    user_id
  )
  values (
    v_sales_id,
    p_customer_id,
    now(),
    v_total,
    p_user_id
  );

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_product_id := (v_item ->> 'product_id')::uuid;
    v_qty := coalesce((v_item ->> 'quantity')::integer, 0);
    v_price := coalesce((v_item ->> 'price')::numeric, 0)::numeric(12, 2);
    v_discount := coalesce((v_item ->> 'discount_applied')::numeric, 0)::numeric(12, 2);
    v_subtotal := coalesce((v_item ->> 'subtotal')::numeric, 0)::numeric(12, 2);

    if v_product_id is null then
      raise exception 'Sale item is missing a product.';
    end if;

    if v_qty <= 0 then
      raise exception 'Sale quantity must be greater than zero.';
    end if;

    select stock_quantity - coalesce(reserved_quantity, 0)
    into v_available
    from public.inventory
    where product_id = v_product_id
    for update;

    if v_available is null then
      raise exception 'No inventory record found for product %.', v_product_id;
    end if;

    if v_available < v_qty then
      raise exception 'Insufficient available stock for product %. Available: %, requested: %.',
        v_product_id, v_available, v_qty;
    end if;

    insert into public.sales_details (
      sales_detail_id,
      sales_id,
      product_id,
      quantity,
      price,
      discount_applied,
      subtotal
    )
    values (
      gen_random_uuid(),
      v_sales_id,
      v_product_id,
      v_qty,
      v_price,
      v_discount,
      v_subtotal
    );

    update public.inventory
    set
      stock_quantity = stock_quantity - v_qty,
      last_updated = now()
    where product_id = v_product_id;

    insert into public.inventory_log (
      inventory_log_id,
      product_id,
      quantity_change,
      transaction_type,
      reference_id,
      date_updated
    )
    values (
      gen_random_uuid(),
      v_product_id,
      -v_qty,
      'sale',
      v_sales_id,
      now()
    );
  end loop;

  insert into public.payment (
    payment_id,
    sales_id,
    payment_method,
    amount_paid,
    change_amount,
    payment_status
  )
  values (
    v_payment_id,
    v_sales_id,
    lower(coalesce(nullif(trim(p_payment_method), ''), 'cash')),
    coalesce(p_amount_paid, 0)::numeric(12, 2),
    v_change,
    'completed'
  );

  return jsonb_build_object(
    'sales_id', v_sales_id,
    'payment_id', v_payment_id,
    'total_amount', v_total,
    'change_amount', v_change
  );
end;
$$;

grant execute on function public.complete_sale(uuid, uuid, text, numeric, jsonb) to anon, authenticated;

-- Backfill completed historical sale rows that are missing inventory_log sale movements.
-- This intentionally does not deduct stock again. It only creates missing log rows.
insert into public.inventory_log (
  inventory_log_id,
  product_id,
  quantity_change,
  transaction_type,
  reference_id,
  date_updated
)
select
  gen_random_uuid(),
  sd.product_id,
  -abs(coalesce(sd.quantity, 0)),
  'sale',
  sd.sales_id,
  coalesce(st.transaction_date, sd.created_at, now())
from public.sales_details sd
join public.sales_transaction st on st.sales_id = sd.sales_id
left join public.payment pay on pay.sales_id = st.sales_id
where coalesce(sd.quantity, 0) > 0
  and lower(coalesce(pay.payment_status, 'completed')) in ('completed', 'paid')
  and not exists (
    select 1
    from public.inventory_log il
    where il.reference_id = sd.sales_id
      and il.product_id = sd.product_id
      and lower(coalesce(il.transaction_type, '')) = 'sale'
  );

commit;
