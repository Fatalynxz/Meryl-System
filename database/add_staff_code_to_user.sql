-- Add editable staff code for user identification (cashier/inventory/admin).
-- Run once in Supabase SQL Editor.

alter table public."user"
  add column if not exists staff_code varchar(30);

create unique index if not exists ux_user_staff_code
  on public."user"(staff_code)
  where staff_code is not null;

-- Backfill missing staff codes using current user sequence.
with numbered as (
  select
    user_id,
    row_number() over (order by coalesce(created_at, now()), user_id) as rn
  from public."user"
  where coalesce(nullif(trim(staff_code), ''), '') = ''
)
update public."user" u
set staff_code = 'STF-' || lpad(numbered.rn::text, 3, '0')
from numbered
where u.user_id = numbered.user_id;

