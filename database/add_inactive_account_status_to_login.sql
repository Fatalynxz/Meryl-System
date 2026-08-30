-- Migration: Block inactive accounts and return explicit inactive message
-- Run this in Supabase SQL Editor

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
  v_status text;
  v_is_legacy boolean := false;
BEGIN
  SELECT 
    u.user_id,
    coalesce(u.status, 'active'),
    json_build_object(
      'user_id', u.user_id,
      'name', u.name,
      'username', lower(u.username),
      'role_id', u.role_id,
      'role_name', r.role_name,
      'status', u.status
    ),
    (
      u.password = p_password 
      OR u.password = trim(p_password)
      OR u.password = encode(digest(p_password, 'sha256'), 'hex')
      OR u.password = encode(digest(trim(p_password), 'sha256'), 'hex')
    )
  INTO v_user_id, v_status, v_user, v_is_legacy
  FROM public."user" u
  JOIN public.role r
    ON r.role_id = u.role_id
  WHERE lower(trim(u.username)) = lower(trim(p_username))
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

  -- Block inactive accounts and return explicit inactive status
  IF v_user_id IS NOT NULL AND lower(coalesce(v_status, 'active')) != 'active' THEN
    RETURN json_build_object(
      'error', 'inactive',
      'message', 'This account is inactive. Please contact the administrator.'
    );
  END IF;

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
