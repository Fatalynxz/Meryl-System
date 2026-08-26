-- ==============================================================================
-- FIX LOGIN USER & USER MANAGEMENT (UPSERT_USER) FUNCTIONS
-- Run this script in the Supabase SQL Editor (https://supabase.com/dashboard)
-- ==============================================================================

-- 1. Ensure pgcrypto extension is installed for bcrypt hashing
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 2. Update login_user function
CREATE OR REPLACE FUNCTION public.login_user(
  p_username text,
  p_password text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user json;
  v_user_id uuid;
  v_is_plaintext boolean := false;
BEGIN
  SELECT 
    u.user_id,
    json_build_object(
      'user_id', u.user_id,
      'name', u.name,
      'username', u.username,
      'role_id', u.role_id,
      'role_name', r.role_name,
      'status', 'Active'
    ),
    (u.password = p_password OR u.password = trim(p_password))
  INTO v_user_id, v_user, v_is_plaintext
  FROM public."user" u
  JOIN public.role r
    ON r.role_id = u.role_id
  WHERE lower(trim(u.username)) = lower(trim(p_username))
    AND lower(coalesce(u.status, 'active')) = 'active'
    AND (
      u.password = crypt(p_password, u.password)
      OR u.password = crypt(trim(p_password), u.password)
      OR u.password = p_password
      OR u.password = trim(p_password)
    )
  LIMIT 1;

  -- Automatically upgrade plaintext password to bcrypt hash upon login
  IF v_is_plaintext AND v_user_id IS NOT NULL THEN
    UPDATE public."user"
    SET password = crypt(trim(p_password), gen_salt('bf')),
        updated_at = now()
    WHERE user_id = v_user_id;
  END IF;

  RETURN v_user;
END;
$$;

REVOKE ALL ON FUNCTION public.login_user(text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.login_user(text, text) TO anon, authenticated;

-- 3. Update upsert_user function (Used by User Management Edit/Add modal)
-- - Hashes passwords with bcrypt if provided
-- - Keeps existing password if blank/empty
-- - Enforces lowercase 'active' / 'inactive' to respect check constraint
-- - Allows admin users to create & edit accounts seamlessly
CREATE OR REPLACE FUNCTION public.upsert_user(
  p_actor_user_id uuid,
  p_user_id uuid default null,
  p_name text default null,
  p_username text default null,
  p_password text default null,
  p_role_id uuid default null,
  p_status text default null,
  p_email text default null
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_role text;
  v_target_id uuid;
  v_clean_status text;
BEGIN
  -- Validate actor is admin
  SELECT lower(r.role_name)
  INTO v_actor_role
  FROM public."user" u
  JOIN public.role r
    ON r.role_id = u.role_id
  WHERE u.user_id = p_actor_user_id
  LIMIT 1;

  IF v_actor_role IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Only admin can manage users';
  END IF;

  -- Clean status for check constraint ('active' or 'inactive')
  v_clean_status := CASE 
    WHEN lower(trim(coalesce(p_status, 'active'))) = 'inactive' THEN 'inactive'
    ELSE 'active'
  END;

  IF p_user_id IS NULL THEN
    -- INSERT NEW USER
    INSERT INTO public."user" (
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
    VALUES (
      gen_random_uuid(),
      trim(p_name),
      trim(p_username),
      crypt(coalesce(trim(p_password), ''), gen_salt('bf')),
      p_role_id,
      v_clean_status,
      nullif(trim(p_email), ''),
      now(),
      now()
    )
    RETURNING user_id INTO v_target_id;
  ELSE
    -- UPDATE EXISTING USER
    UPDATE public."user" u
    SET
      name = coalesce(nullif(trim(p_name), ''), u.name),
      username = coalesce(nullif(trim(p_username), ''), u.username),
      password = CASE
        WHEN p_password IS NULL OR btrim(p_password) = '' THEN u.password
        ELSE crypt(btrim(p_password), gen_salt('bf'))
      END,
      role_id = coalesce(p_role_id, u.role_id),
      status = v_clean_status,
      email = nullif(trim(p_email), ''),
      updated_at = now()
    WHERE u.user_id = p_user_id
    RETURNING u.user_id INTO v_target_id;
  END IF;

  RETURN (
    SELECT json_build_object(
      'user_id', u.user_id,
      'name', u.name,
      'username', u.username,
      'role_id', u.role_id,
      'status', CASE WHEN lower(u.status) = 'inactive' THEN 'Inactive' ELSE 'Active' END,
      'email', u.email
    )
    FROM public."user" u
    WHERE u.user_id = v_target_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_user(uuid, uuid, text, text, text, uuid, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.upsert_user(uuid, uuid, text, text, text, uuid, text, text) TO anon, authenticated;

-- 4. Ensure cashier2 is set up with 'sales123'
DO $$
DECLARE
  v_sales_role_id uuid;
BEGIN
  SELECT role_id INTO v_sales_role_id 
  FROM public.role 
  WHERE lower(role_name) IN ('sales', 'sales staff', 'cashier') 
  LIMIT 1;

  IF v_sales_role_id IS NULL THEN
    SELECT role_id INTO v_sales_role_id FROM public.role LIMIT 1;
  END IF;

  IF EXISTS (SELECT 1 FROM public."user" WHERE lower(trim(username)) = 'cashier2') THEN
    UPDATE public."user"
    SET password = crypt('sales123', gen_salt('bf')),
        status = 'active',
        role_id = coalesce(role_id, v_sales_role_id),
        updated_at = now()
    WHERE lower(trim(username)) = 'cashier2';
  ELSE
    INSERT INTO public."user" (user_id, name, username, password, role_id, status)
    VALUES (gen_random_uuid(), 'Mongmong barcos', 'cashier2', crypt('sales123', gen_salt('bf')), v_sales_role_id, 'active');
  END IF;
END;
$$;
