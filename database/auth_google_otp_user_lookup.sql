-- Helper for Google sign-in and email OTP.
-- Run this once in Supabase SQL Editor.
-- It maps a verified Supabase Auth email to an active staff account in public."user".
-- Google is only identity verification; authorization and role always come
-- from public."user" joined to public.role by the matched email.
-- In Supabase Auth settings, set Email OTP expiry to 300 seconds to match
-- the app's 5-minute OTP gate.

create or replace function public.login_user_by_email(p_email text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user jsonb;
begin
  select jsonb_build_object(
    'user_id', u.user_id,
    'name', u.name,
    'username', u.username,
    'email', u.email,
    'role_id', u.role_id,
    'role_name', r.role_name,
    'status', coalesce(u.status, 'active')
  )
  into v_user
  from public."user" u
  join public.role r on r.role_id = u.role_id
  where lower(coalesce(u.email, '')) = lower(trim(p_email))
    and lower(coalesce(u.status, 'active')) = 'active'
    and coalesce(trim(r.role_name), '') <> ''
  limit 1;

  return v_user;
end;
$$;

grant execute on function public.login_user_by_email(text) to anon, authenticated;

-- Password reset helper for User Management accounts.
-- Supabase Auth verifies the recovery email first. This function then updates
-- only the active public."user" row whose email matches the authenticated
-- recovery session email.
create extension if not exists pgcrypto;

create or replace function public.reset_user_password_by_email(p_new_password text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
  v_user jsonb;
begin
  v_email := lower(trim(coalesce(auth.jwt() ->> 'email', '')));

  if v_email = '' then
    raise exception 'Password reset session is missing an email.';
  end if;

  if length(coalesce(p_new_password, '')) < 8 then
    raise exception 'Password must be at least 8 characters.';
  end if;

  update public."user" u
  set
    password = crypt(p_new_password, gen_salt('bf')),
    updated_at = now()
  where lower(coalesce(u.email, '')) = v_email
    and lower(coalesce(u.status, 'active')) = 'active'
  returning jsonb_build_object(
    'user_id', u.user_id,
    'email', u.email,
    'status', u.status
  )
  into v_user;

  if v_user is null then
    raise exception 'No active User Management account matches this email.';
  end if;

  return v_user;
end;
$$;

revoke all on function public.reset_user_password_by_email(text) from public;
grant execute on function public.reset_user_password_by_email(text) to authenticated;
