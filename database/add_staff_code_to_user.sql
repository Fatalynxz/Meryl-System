-- Add editable staff code for user identification (cashier/inventory/admin).
-- Run once in Supabase SQL Editor.

alter table public."user"
  add column if not exists staff_code varchar(30);

create unique index if not exists ux_user_staff_code
  on public."user"(staff_code)
  where staff_code is not null;

-- Normalize blank strings to NULL so uniqueness behaves correctly.
update public."user"
set staff_code = null
where trim(coalesce(staff_code, '')) = '';

-- Backfill missing staff codes by role:
-- Admin       -> ADM-001, ADM-002, ...
-- Sales Staff -> CSH-001, CSH-002, ...
-- Inventory   -> INV-001, INV-002, ...
with role_base as (
  select
    u.user_id,
    case
      when lower(trim(coalesce(r.role_name, ''))) like '%admin%' then 'ADM'
      when lower(trim(coalesce(r.role_name, ''))) like '%inventory%' then 'INV'
      else 'CSH'
    end as prefix,
    row_number() over (
      partition by
        case
          when lower(trim(coalesce(r.role_name, ''))) like '%admin%' then 'ADM'
          when lower(trim(coalesce(r.role_name, ''))) like '%inventory%' then 'INV'
          else 'CSH'
        end
      order by coalesce(u.created_at, now()), u.user_id
    ) as seq
  from public."user" u
  left join public.role r on r.role_id = u.role_id
  where u.staff_code is null
),
generated as (
  select
    user_id,
    prefix || '-' || lpad(seq::text, 3, '0') as generated_code
  from role_base
)
update public."user" u
set staff_code = g.generated_code
from generated g
where u.user_id = g.user_id;
