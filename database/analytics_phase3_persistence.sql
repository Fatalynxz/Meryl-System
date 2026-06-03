-- Phase 3: Persisted analytics snapshots for product analytics cards/charts/recommendations.
-- Run once in Supabase SQL Editor.

create extension if not exists pgcrypto;

create table if not exists public.analytics_product_snapshot (
  snapshot_id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.product(product_id) on delete cascade,
  period_key varchar(20) not null,
  period_start date not null,
  period_end date not null,
  units_sold int not null default 0,
  revenue numeric(12,2) not null default 0,
  average_unit_price numeric(12,2) not null default 0,
  stock_quantity int not null default 0,
  turnover_ratio numeric(10,4) not null default 0,
  movement_label varchar(20) not null default 'dead_stock',
  brand varchar(120) null,
  size_label varchar(30) null,
  category_name varchar(120) null,
  rank_position int null,
  computed_at timestamptz not null default now()
);

create index if not exists idx_aps_period_key on public.analytics_product_snapshot(period_key);
create index if not exists idx_aps_product_id on public.analytics_product_snapshot(product_id);
create index if not exists idx_aps_rank on public.analytics_product_snapshot(period_key, rank_position);

create table if not exists public.analytics_dimension_snapshot (
  dimension_snapshot_id uuid primary key default gen_random_uuid(),
  period_key varchar(20) not null,
  period_start date not null default current_date,
  period_end date not null default current_date,
  window_scope varchar(80) null,
  dimension_type varchar(20) not null, -- brand | size | category
  dimension_value varchar(120) not null,
  units int not null default 0,
  revenue numeric(12,2) not null default 0,
  share_percent numeric(6,2) not null default 0,
  rank_position int not null default 1,
  computed_at timestamptz not null default now()
);

create index if not exists idx_ads_period_type_rank
  on public.analytics_dimension_snapshot(period_key, dimension_type, rank_position);

create table if not exists public.analytics_recommendation (
  recommendation_id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.product(product_id) on delete cascade,
  period_key varchar(20) not null,
  period_start date not null default current_date,
  period_end date not null default current_date,
  window_scope varchar(80) null,
  recommendation_type varchar(40) not null, -- markdown | bundle_or_bogo | restock_before_promoting
  title varchar(200) not null,
  message text not null,
  severity varchar(20) not null default 'medium',
  suggested_discount_min numeric(6,2) null,
  suggested_discount_max numeric(6,2) null,
  status varchar(20) not null default 'open',
  computed_at timestamptz not null default now()
);

create index if not exists idx_ar_period on public.analytics_recommendation(period_key);
create index if not exists idx_ar_product on public.analytics_recommendation(product_id);

alter table public.analytics_product_snapshot
  add column if not exists window_scope varchar(80);

alter table public.analytics_dimension_snapshot
  add column if not exists period_start date not null default current_date;
alter table public.analytics_dimension_snapshot
  add column if not exists period_end date not null default current_date;
alter table public.analytics_dimension_snapshot
  add column if not exists window_scope varchar(80);

alter table public.analytics_recommendation
  add column if not exists period_start date not null default current_date;
alter table public.analytics_recommendation
  add column if not exists period_end date not null default current_date;
alter table public.analytics_recommendation
  add column if not exists window_scope varchar(80);

alter table public.analytics_product_snapshot enable row level security;
alter table public.analytics_dimension_snapshot enable row level security;
alter table public.analytics_recommendation enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='analytics_product_snapshot' and policyname='analytics_product_snapshot_select_app'
  ) then
    create policy analytics_product_snapshot_select_app
      on public.analytics_product_snapshot
      for select
      to anon, authenticated
      using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='analytics_product_snapshot' and policyname='analytics_product_snapshot_write_app'
  ) then
    create policy analytics_product_snapshot_write_app
      on public.analytics_product_snapshot
      for all
      to authenticated
      using (true)
      with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='analytics_dimension_snapshot' and policyname='analytics_dimension_snapshot_select_app'
  ) then
    create policy analytics_dimension_snapshot_select_app
      on public.analytics_dimension_snapshot
      for select
      to anon, authenticated
      using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='analytics_dimension_snapshot' and policyname='analytics_dimension_snapshot_write_app'
  ) then
    create policy analytics_dimension_snapshot_write_app
      on public.analytics_dimension_snapshot
      for all
      to authenticated
      using (true)
      with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='analytics_recommendation' and policyname='analytics_recommendation_select_app'
  ) then
    create policy analytics_recommendation_select_app
      on public.analytics_recommendation
      for select
      to anon, authenticated
      using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='analytics_recommendation' and policyname='analytics_recommendation_write_app'
  ) then
    create policy analytics_recommendation_write_app
      on public.analytics_recommendation
      for all
      to authenticated
      using (true)
      with check (true);
  end if;
end
$$;
