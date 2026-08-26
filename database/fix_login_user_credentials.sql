-- ==============================================================================
-- UNIVERSAL LOGIN & USER CREDENTIALS FIX
-- Run this in Supabase SQL Editor (https://supabase.com/dashboard)
-- ==============================================================================

-- 1. Ensure pgcrypto extension is installed (provides crypt, gen_salt, digest)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 2. Universal login_user function that supports:
--    - Bcrypt hashes ($2a$, $2b$)
--    - Plaintext passwords (e.g. 'sales123', 'admin123', etc.)
--    - SHA-256 hashes
--    - Case-insensitive usernames (e.g. 'Sales', 'sales', 'SALES')
--    - Automatic password upgrading to bcrypt on successful login
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
  v_is_legacy boolean := false;
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
    (
      u.password = p_password 
      OR u.password = trim(p_password)
      OR u.password = encode(digest(p_password, 'sha256'), 'hex')
      OR u.password = encode(digest(trim(p_password), 'sha256'), 'hex')
    )
  INTO v_user_id, v_user, v_is_legacy
  FROM public."user" u
  JOIN public.role r
    ON r.role_id = u.role_id
  WHERE lower(trim(u.username)) = lower(trim(p_username))
    AND lower(coalesce(u.status, 'active')) = 'active'
    AND (
      -- 1. If stored as bcrypt ($2a$... or $2b$...)
      (u.password LIKE '$2%' AND (u.password = crypt(p_password, u.password) OR u.password = crypt(trim(p_password), u.password)))
      -- 2. Plaintext comparison
      OR u.password = p_password
      OR u.password = trim(p_password)
      -- 3. SHA-256 comparison
      OR u.password = encode(digest(p_password, 'sha256'), 'hex')
      OR u.password = encode(digest(trim(p_password), 'sha256'), 'hex')
    )
  LIMIT 1;

  -- If user logged in using plaintext or legacy SHA256, upgrade to bcrypt on the fly
  IF v_is_legacy AND v_user_id IS NOT NULL THEN
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

-- 3. Reset standard accounts to known passwords with bcrypt
DO $$
DECLARE
  v_admin_role_id uuid;
  v_sales_role_id uuid;
  v_inventory_role_id uuid;
BEGIN
  -- Get or resolve role IDs
  SELECT role_id INTO v_admin_role_id FROM public.role WHERE lower(role_name) IN ('admin', 'administrator') LIMIT 1;
  SELECT role_id INTO v_sales_role_id FROM public.role WHERE lower(role_name) IN ('sales', 'sales staff', 'cashier') LIMIT 1;
  SELECT role_id INTO v_inventory_role_id FROM public.role WHERE lower(role_name) IN ('inventory', 'inventory staff') LIMIT 1;

  -- Ensure 'admin' password is 'admin123'
  IF EXISTS (SELECT 1 FROM public."user" WHERE lower(trim(username)) = 'admin') THEN
    UPDATE public."user"
    SET password = crypt('admin123', gen_salt('bf')), status = 'active', updated_at = now()
    WHERE lower(trim(username)) = 'admin';
  END IF;

  -- Ensure 'sales' password is 'sales123'
  IF EXISTS (SELECT 1 FROM public."user" WHERE lower(trim(username)) = 'sales') THEN
    UPDATE public."user"
    SET password = crypt('sales123', gen_salt('bf')), status = 'active', updated_at = now()
    WHERE lower(trim(username)) = 'sales';
  END IF;

  -- Ensure 'cashier1' password is 'sales123'
  IF EXISTS (SELECT 1 FROM public."user" WHERE lower(trim(username)) = 'cashier1') THEN
    UPDATE public."user"
    SET password = crypt('sales123', gen_salt('bf')), status = 'active', updated_at = now()
    WHERE lower(trim(username)) = 'cashier1';
  END IF;

  -- Ensure 'cashier2' password is 'sales123'
  IF EXISTS (SELECT 1 FROM public."user" WHERE lower(trim(username)) = 'cashier2') THEN
    UPDATE public."user"
    SET password = crypt('sales123', gen_salt('bf')), status = 'active', updated_at = now()
    WHERE lower(trim(username)) = 'cashier2';
  END IF;

  -- Ensure 'inventory' password is 'inv123'
  IF EXISTS (SELECT 1 FROM public."user" WHERE lower(trim(username)) = 'inventory') THEN
    UPDATE public."user"
    SET password = crypt('inv123', gen_salt('bf')), status = 'active', updated_at = now()
    WHERE lower(trim(username)) = 'inventory';
  END IF;
END;
$$;
