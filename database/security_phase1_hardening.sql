-- Phase 1 hardening for security, data quality, and audit readiness.
-- Run in Supabase SQL Editor (target environment) once.

-- 1) Ensure pgcrypto exists so gen_salt()/crypt() are available for DB-side hashing.
create extension if not exists pgcrypto;

-- 2) Guard rails for inventory data quality.
alter table public.inventory
  add constraint chk_inventory_non_negative_stock
  check (stock_quantity >= 0) not valid;

alter table public.inventory
  validate constraint chk_inventory_non_negative_stock;

alter table public.inventory
  add constraint chk_inventory_non_negative_reorder
  check (coalesce(reorder_level, 0) >= 0) not valid;

alter table public.inventory
  validate constraint chk_inventory_non_negative_reorder;

-- 3) Admin audit trail foundation.
create table if not exists public.audit_log (
  audit_id uuid primary key default gen_random_uuid(),
  actor_user_id uuid null references public."user"(user_id) on delete set null,
  action_type varchar(60) not null,
  entity_type varchar(60) not null,
  entity_id text null,
  old_data jsonb null,
  new_data jsonb null,
  metadata jsonb null,
  created_at timestamptz not null default now()
);

create index if not exists idx_audit_log_actor_user_id on public.audit_log(actor_user_id);
create index if not exists idx_audit_log_entity_type on public.audit_log(entity_type);
create index if not exists idx_audit_log_created_at on public.audit_log(created_at desc);

alter table public.audit_log enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'audit_log'
      and policyname = 'audit_log_select_authenticated'
  ) then
    create policy audit_log_select_authenticated
      on public.audit_log
      for select
      to authenticated
      using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'audit_log'
      and policyname = 'audit_log_insert_authenticated'
  ) then
    create policy audit_log_insert_authenticated
      on public.audit_log
      for insert
      to authenticated
      with check (true);
  end if;
end
$$;

-- 4) Optional helper: consistent audit logger callable from app/RPC flows.
create or replace function public.write_audit_log(
  p_actor_user_id uuid,
  p_action_type text,
  p_entity_type text,
  p_entity_id text default null,
  p_old_data jsonb default null,
  p_new_data jsonb default null,
  p_metadata jsonb default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_audit_id uuid;
begin
  insert into public.audit_log (
    actor_user_id,
    action_type,
    entity_type,
    entity_id,
    old_data,
    new_data,
    metadata
  )
  values (
    p_actor_user_id,
    coalesce(nullif(trim(p_action_type), ''), 'unknown_action'),
    coalesce(nullif(trim(p_entity_type), ''), 'unknown_entity'),
    p_entity_id,
    p_old_data,
    p_new_data,
    p_metadata
  )
  returning audit_id into v_audit_id;

  return v_audit_id;
end;
$$;

grant execute on function public.write_audit_log(uuid, text, text, text, jsonb, jsonb, jsonb)
to authenticated;

