-- ==============================================================================
-- FIX LOGIN USER FUNCTION & CREDENTIALS
-- Run this script in the Supabase SQL Editor (https://supabase.com/dashboard)
-- ==============================================================================

-- 1. Ensure pgcrypto extension is installed for bcrypt hashing
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 2. Update login_user function to support:
--    - Case-insensitive username match: lower(trim(username))
--    - Bcrypt hashed passwords (crypt(p_password, u.password))
--    - Plaintext passwords (e.g. if manually updated in Table Editor or without salt)
--    - Automatic password migration: automatically upgrades plaintext password to bcrypt upon successful login
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
      'status', coalesce(u.status, 'Active')
    ),
    (u.password = p_password OR u.password = trim(p_password))
  INTO v_user_id, v_user, v_is_plaintext
  FROM public."user" u
  JOIN public.role r
    ON r.role_id = u.role_id
  WHERE lower(trim(u.username)) = lower(trim(p_username))
    AND coalesce(u.status, 'Active') = 'Active'
    AND (
      u.password = crypt(p_password, u.password)
      OR u.password = crypt(trim(p_password), u.password)
      OR u.password = p_password
      OR u.password = trim(p_password)
    )
  LIMIT 1;

  -- If user logged in using plaintext, automatically upgrade their password to bcrypt
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

-- 3. Ensure 'cashier2' account exists, is Active, and has the password properly hashed
-- (Replace 'sales123' if you use a different password)
DO $$
DECLARE
  v_sales_role_id uuid;
BEGIN
  -- Get the role_id for Sales Staff / Cashier
  SELECT role_id INTO v_sales_role_id 
  FROM public.role 
  WHERE lower(role_name) IN ('sales', 'sales staff', 'cashier') 
  LIMIT 1;

  -- If role doesn't exist, pick any non-admin role or first role
  IF v_sales_role_id IS NULL THEN
    SELECT role_id INTO v_sales_role_id FROM public.role LIMIT 1;
  END IF;

  -- Update or insert cashier2
  IF EXISTS (SELECT 1 FROM public."user" WHERE lower(trim(username)) = 'cashier2') THEN
    UPDATE public."user"
    SET password = crypt('sales123', gen_salt('bf')),
        status = 'Active',
        role_id = coalesce(role_id, v_sales_role_id),
        updated_at = now()
    WHERE lower(trim(username)) = 'cashier2';
  ELSE
    INSERT INTO public."user" (
      user_id,
      name,
      username,
      password,
      role_id,
      status,
      created_at,
      updated_at
    )
    VALUES (
      gen_random_uuid(),
      'Cashier Two',
      'cashier2',
      crypt('sales123', gen_salt('bf')),
      v_sales_role_id,
      'Active',
      now(),
      now()
    );
  END IF;
END;
$$;
