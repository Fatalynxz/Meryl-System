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
