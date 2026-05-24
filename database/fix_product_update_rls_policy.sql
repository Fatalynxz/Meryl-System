-- Fix Product Master updates from frontend Supabase client.
-- Run this once in Supabase SQL Editor for the target project.
-- Symptom addressed: "No product row was updated for product_id=... Check RLS permissions and record id."

alter table public.product enable row level security;
alter table public.product add column if not exists gender varchar(30);

update public.product
set gender = coalesce(nullif(trim(gender), ''), 'N/A')
where gender is null
   or trim(gender) = '';

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'product'
      and policyname = 'product_select_for_app'
  ) then
    create policy product_select_for_app
      on public.product
      for select
      to anon, authenticated
      using (true);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'product'
      and policyname = 'product_update_for_app'
  ) then
    create policy product_update_for_app
      on public.product
      for update
      to anon, authenticated
      using (true)
      with check (true);
  end if;
end
$$;
