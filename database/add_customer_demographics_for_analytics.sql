-- Add customer demographics for Customer Analytics (age range + gender insights).
-- Run once in Supabase SQL Editor.

alter table public.customer
  add column if not exists gender varchar(20),
  add column if not exists age int,
  add column if not exists birth_date date;

update public.customer
set age = null
where age is not null and (age < 0 or age > 120);

-- Normalize existing dirty values to NULL first.
update public.customer
set gender = null
where trim(coalesce(gender, '')) = '';

-- Optional normalization for common legacy values.
update public.customer
set gender = case
  when lower(trim(gender)) in ('m', 'male', 'man', 'men') then 'Male'
  when lower(trim(gender)) in ('f', 'female', 'woman', 'women') then 'Female'
  when lower(trim(gender)) in ('boy', 'kid-boy', 'kids-boy', 'kids (boy)') then 'Kids (Boy)'
  when lower(trim(gender)) in ('girl', 'kid-girl', 'kids-girl', 'kids (girl)') then 'Kids (Girl)'
  when lower(trim(gender)) in ('kid', 'kids', 'child', 'prefer not to say', 'unknown', 'n/a', 'na') then null
  else nullif(gender, '')
end
where gender is not null;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'chk_customer_gender_allowed'
      and conrelid = 'public.customer'::regclass
  ) then
    alter table public.customer
      drop constraint chk_customer_gender_allowed;
  end if;

  alter table public.customer
    add constraint chk_customer_gender_allowed
    check (
      gender is null
      or gender in ('Male', 'Female', 'Kids (Boy)', 'Kids (Girl)')
    ) not valid;
end
$$;

alter table public.customer
  validate constraint chk_customer_gender_allowed;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'chk_customer_age_range'
      and conrelid = 'public.customer'::regclass
  ) then
    alter table public.customer
      add constraint chk_customer_age_range
      check (age is null or (age >= 0 and age <= 120)) not valid;
  end if;
end
$$;

alter table public.customer
  validate constraint chk_customer_age_range;
