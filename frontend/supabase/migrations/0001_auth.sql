-- 0001_auth.sql
-- Custom table auth for Meryl Shoes (NOT supabase.auth)

create extension if not exists pgcrypto;

-- Login RPC:
-- - validates username + bcrypt hash in public.user.password
-- - rejects non-active users
-- - returns profile + role payload or null
create or replace function public.login_user(
  p_username text,
  p_password text
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user json;
begin
  select json_build_object(
    'user_id', u.user_id,
    'name', u.name,
    'username', u.username,
    'role_id', u.role_id,
    'role_name', r.role_name,
    'status', coalesce(u.status, 'Active')
  )
  into v_user
  from public."user" u
  join public.role r
    on r.role_id = u.role_id
  where u.username = p_username
    and coalesce(u.status, 'Active') = 'Active'
    and u.password = crypt(p_password, u.password)
  limit 1;

  return v_user;
end;
$$;

revoke all on function public.login_user(text, text) from public;
grant execute on function public.login_user(text, text) to anon, authenticated;

-- Admin upsert RPC:
-- - inserts/updates public.user
-- - hashes password with bcrypt
-- - allows password unchanged on update when p_password is null/empty
-- - validates actor is admin using p_actor_user_id
create or replace function public.upsert_user(
  p_actor_user_id uuid,
  p_user_id uuid default null,
  p_name text default null,
  p_username text default null,
  p_password text default null,
  p_role_id uuid default null,
  p_status text default null,
  p_email text default null
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_role text;
  v_target_id uuid;
begin
  select lower(r.role_name)
  into v_actor_role
  from public."user" u
  join public.role r
    on r.role_id = u.role_id
  where u.user_id = p_actor_user_id
  limit 1;

  if v_actor_role is distinct from 'admin' then
    raise exception 'Only admin can upsert users';
  end if;

  if p_user_id is null then
    insert into public."user" (
      user_id,
      name,
      username,
      password,
      role_id,
      status,
      email,
      created_at,
      updated_at
    )
    values (
      gen_random_uuid(),
      p_name,
      p_username,
      crypt(coalesce(p_password, ''), gen_salt('bf')),
      p_role_id,
      coalesce(p_status, 'Active'),
      p_email,
      now(),
      now()
    )
    returning user_id into v_target_id;
  else
    update public."user" u
    set
      name = coalesce(p_name, u.name),
      username = coalesce(p_username, u.username),
      password = case
        when p_password is null or btrim(p_password) = '' then u.password
        else crypt(p_password, gen_salt('bf'))
      end,
      role_id = coalesce(p_role_id, u.role_id),
      status = coalesce(p_status, u.status),
      email = coalesce(p_email, u.email),
      updated_at = now()
    where u.user_id = p_user_id
    returning u.user_id into v_target_id;
  end if;

  return (
    select json_build_object(
      'user_id', u.user_id,
      'name', u.name,
      'username', u.username,
      'role_id', u.role_id,
      'status', u.status,
      'email', u.email
    )
    from public."user" u
    where u.user_id = v_target_id
  );
end;
$$;

revoke all on function public.upsert_user(uuid, uuid, text, text, text, uuid, text, text) from public;
grant execute on function public.upsert_user(uuid, uuid, text, text, text, uuid, text, text) to anon, authenticated;

