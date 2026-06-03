-- Add sellable stock hold/reservation and expiry controls for inventory records.
-- Run once in Supabase SQL Editor before deploying the frontend that uses these fields.

begin;

alter table public.inventory
  add column if not exists reserved_quantity integer not null default 0,
  add column if not exists manufacturer_date date,
  add column if not exists expiration_date date;

update public.inventory
set reserved_quantity = greatest(0, least(coalesce(reserved_quantity, 0), coalesce(stock_quantity, 0)));

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'inventory_reserved_quantity_check'
      and conrelid = 'public.inventory'::regclass
  ) then
    alter table public.inventory
      add constraint inventory_reserved_quantity_check
      check (reserved_quantity >= 0 and reserved_quantity <= stock_quantity);
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'inventory_date_order_check'
      and conrelid = 'public.inventory'::regclass
  ) then
    alter table public.inventory
      add constraint inventory_date_order_check
      check (
        expiration_date is null
        or manufacturer_date is null
        or expiration_date >= manufacturer_date
      );
  end if;
end
$$;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'inventory_log_transaction_type_check'
      and conrelid = 'public.inventory_log'::regclass
  ) then
    alter table public.inventory_log
      drop constraint inventory_log_transaction_type_check;
  end if;

  alter table public.inventory_log
    add constraint inventory_log_transaction_type_check
    check (
      transaction_type is null
      or lower(replace(transaction_type, '_', ' ')) in (
        'sale',
        'return',
        'adjustment',
        'restock',
        'stock in',
        'stock out',
        'hold',
        'release hold',
        'expired',
        'damage',
        'replacement'
      )
    );
end
$$;

commit;
